"""``JobService``: every workflow behind the job description endpoints
(plan.md 6.1 jobs row, 6.3 jobs.*, 6.10 "Job descriptions").

Views validate and call in here; nothing below the service touches the
timeline except through ``activity.services.record_activity``. Every mutation
runs in one ``transaction.atomic()`` so a JD, its version, its participants and
its activities appear together or not at all.

Rules implemented here
----------------------
* The creator is inserted as the ``owner`` participant before anyone else and
  keeps that role: they cannot be removed or demoted (plan.md 6.3, 9.5).
* A version is written on create (v1) and on every update that changes one of
  ``CONTENT_FIELDS``; participant changes never bump the version.
* Skills pass through ``matching.skills.normalize_skills`` before they are
  compared or stored, so "Postgres" and "postgresql" are the same skill; a
  skill listed as required is dropped from preferred.
* Status moves: draft -> open only through ``publish`` (sets ``published_at``);
  open / on_hold / closed move between themselves; ``archive`` works from any
  status and ``unarchive`` restores open (or draft when never published).
  ``force_close`` ends a draft, open or on-hold JD early (Enhancement.md 3); an
  HR admin can reopen it the way a closed JD is reopened.
* Delete is destructive (applications, versions and activities cascade) and
  needs an explicit ``confirm=True``.
"""

from __future__ import annotations

from collections import Counter
from collections.abc import Iterable, Mapping, Sequence
from typing import Any

from django.db import transaction
from django.db.models import Count, OuterRef, Prefetch, Q, QuerySet, Subquery
from django.utils import timezone

from activity.models import Activity
from activity.services import record_activity
from candidates.models import CandidateSkill
from common.enums import (
    KANBAN_COLUMNS,
    ActivityCategory,
    ApplicationStatus,
    JDStatus,
    OfferStatus,
    ParticipantRole,
)
from common.permissions import visible_job_descriptions_for
from jobs.exceptions import (
    ConfirmationRequired,
    CreatorProtected,
    InvalidStatusTransition,
    ParticipantExists,
)
from jobs.models import JobDescription, JobDescriptionVersion, RecruitmentParticipant
from matching.skills import display_name, normalize_skill, normalize_skills
from pipeline.models import Application

# JobDescription columns captured in a version snapshot (plan.md 6.3 "all content
# fields"); a change to any of them bumps ``current_version``.
CONTENT_FIELDS: tuple[str, ...] = (
    "title",
    "department",
    "location",
    "work_mode",
    "employment_type",
    "experience_min_years",
    "experience_max_years",
    "salary_min",
    "salary_max",
    "salary_currency",
    "required_skills",
    "preferred_skills",
    "education_requirements",
    "responsibilities",
    "qualifications",
    "additional_requirements",
    "description",
    "domain",
    "openings",
)
SKILL_FIELDS: tuple[str, ...] = ("required_skills", "preferred_skills")

# Statuses a JD may move to with ``set_status`` (plus archive from anywhere and
# publish for draft -> open).
STATUS_TRANSITIONS: dict[str, frozenset[str]] = {
    JDStatus.DRAFT: frozenset({JDStatus.OPEN}),
    JDStatus.OPEN: frozenset({JDStatus.ON_HOLD, JDStatus.CLOSED}),
    JDStatus.ON_HOLD: frozenset({JDStatus.OPEN, JDStatus.CLOSED}),
    JDStatus.CLOSED: frozenset({JDStatus.OPEN}),
    JDStatus.FORCE_CLOSED: frozenset({JDStatus.OPEN}),
    JDStatus.ARCHIVED: frozenset(),
}
# Statuses a JD can be force closed from: anything still in play.
FORCE_CLOSABLE: frozenset[str] = frozenset({JDStatus.DRAFT, JDStatus.OPEN, JDStatus.ON_HOLD})
# Content fields whose old and new values are too long to show on the timeline;
# the ``jd.updated`` event lists them as changed without the before / after text.
LONG_TEXT_FIELDS: frozenset[str] = frozenset(
    {
        "description",
        "responsibilities",
        "qualifications",
        "additional_requirements",
        "education_requirements",
    }
)
# ``onboarded`` is the last pipeline stage, so it scores 100% (Enhancement.md 3).
COMPLETION_MAX_INDEX = ApplicationStatus.order_index(ApplicationStatus.ONBOARDED)

CREATED_SUMMARY = "Created"
DUPLICATE_PREFIX = "Copy of "
SKILL_SUGGESTION_LIMIT = 20


# ------------------------------------------------------------- status groups
# Pipeline stages counted by the list columns (plan.md 9.4) and the metric row
# (plan.md 6.10 metrics). "Reached" stages count every application whose
# current status is at or beyond the stage and still on the board, so the
# funnel found -> shortlisted -> contacted -> interviewed -> selected ->
# onboarded never goes up. Tray statuses (rejected, withdrawn, on_hold) only
# count in their own metrics.


def _statuses_from(first: str) -> tuple[str, ...]:
    start = ApplicationStatus.order_index(first)
    return tuple(
        str(status)
        for status in ApplicationStatus.ACTIVE
        if ApplicationStatus.order_index(status) >= start
    )


SHORTLISTED_STATUSES: tuple[str, ...] = _statuses_from(ApplicationStatus.AI_SHORTLISTED)
CONTACTED_STATUSES: tuple[str, ...] = _statuses_from(ApplicationStatus.CONTACTED)
INTERVIEWED_STATUSES: tuple[str, ...] = _statuses_from(ApplicationStatus.INTERVIEW_SCHEDULED)
IN_INTERVIEW_STATUSES: tuple[str, ...] = tuple(
    str(status) for status in KANBAN_COLUMNS["interview"].statuses
)
SELECTED_STATUSES: tuple[str, ...] = _statuses_from(ApplicationStatus.SELECTED)
ONBOARDED_STATUSES: tuple[str, ...] = (str(ApplicationStatus.ONBOARDED),)
REJECTED_STATUSES: tuple[str, ...] = (str(ApplicationStatus.REJECTED),)
# Offers still waiting on someone: not yet sent, sent, or being negotiated.
PENDING_OFFER_STATUSES: tuple[str, ...] = (
    str(OfferStatus.DRAFT),
    str(OfferStatus.SENT),
    str(OfferStatus.NEGOTIATING),
)

# Annotation name -> statuses, for the list counts (plan.md 9.4 "Pipeline" column).
LIST_COUNT_STATUSES: dict[str, tuple[str, ...]] = {
    "count_shortlisted": SHORTLISTED_STATUSES,
    "count_interviewed": INTERVIEWED_STATUSES,
    "count_selected": SELECTED_STATUSES,
    "count_onboarded": ONBOARDED_STATUSES,
}
# Response key -> statuses, for GET .../metrics/ (plan.md 6.10).
METRIC_STATUSES: dict[str, tuple[str, ...]] = {
    "shortlisted": SHORTLISTED_STATUSES,
    "contacted": CONTACTED_STATUSES,
    "in_interview": IN_INTERVIEW_STATUSES,
    "selected": SELECTED_STATUSES,
    "rejected": REJECTED_STATUSES,
    "onboarded": ONBOARDED_STATUSES,
}
METRIC_KEYS: tuple[str, ...] = (
    "total_found",
    "shortlisted",
    "contacted",
    "in_interview",
    "selected",
    "rejected",
    "offers_pending",
    "onboarded",
)


# ------------------------------------------------------------------ helpers


def _actor_name(actor: Any) -> str:
    if actor is None:
        return "System"
    return getattr(actor, "full_name", None) or str(actor)


def _join_names(names: Sequence[str]) -> str:
    if len(names) <= 1:
        return "".join(names)
    return ", ".join(names[:-1]) + " and " + names[-1]


def _role_label(role: str) -> str:
    return str(ParticipantRole(role).label)


def _status_label(status: str) -> str:
    return str(JDStatus(status).label)


def _participant_entry(participant: RecruitmentParticipant) -> dict[str, str]:
    return {
        "user_id": str(participant.user_id),
        "name": participant.user.full_name,
        "role": str(participant.role_in_recruitment),
    }


def _clean_content(data: Mapping[str, Any]) -> dict[str, Any]:
    """The content fields present in ``data``, normalised the way they are stored."""
    content = {name: data[name] for name in CONTENT_FIELDS if name in data}
    if "required_skills" in content:
        content["required_skills"] = normalize_skills(content["required_skills"] or [])
    if "preferred_skills" in content:
        content["preferred_skills"] = normalize_skills(content["preferred_skills"] or [])
    if "salary_currency" in content and content["salary_currency"]:
        content["salary_currency"] = str(content["salary_currency"]).strip().upper()
    if "domain" in content:
        domain = (content["domain"] or "").strip().lower()
        content["domain"] = domain or None
    return content


def _drop_required_from_preferred(content: dict[str, Any], current: JobDescription | None) -> None:
    """A skill cannot be both required and preferred; required wins."""
    if "preferred_skills" not in content:
        return
    required = content.get("required_skills")
    if required is None:
        required = list(current.required_skills) if current is not None else []
    required_set = set(required)
    content["preferred_skills"] = [s for s in content["preferred_skills"] if s not in required_set]


def _humanise(field: str) -> str:
    return field.replace("_", " ")


def _json_ready(value: Any) -> Any:
    """Snapshot values for ``metadata`` (a JSONField): lists copy, scalars pass through."""
    return list(value) if isinstance(value, list | tuple) else value


def _unchanged(jd: JobDescription, name: str, value: Any) -> bool:
    """Skill lists compare as sets (order and spelling never make a version);
    every other content field compares as stored."""
    current = getattr(jd, name)
    if name in SKILL_FIELDS:
        return set(current or []) == set(value or [])
    return current == value


def _record_jd(jd: JobDescription, event_type: str, title: str, actor: Any, **kwargs: Any):
    return record_activity(
        job_description=jd,
        category=ActivityCategory.JOB_DESCRIPTION,
        event_type=event_type,
        title=title,
        actor=actor,
        **kwargs,
    )


def _record_participants_added(
    jd: JobDescription, added: Sequence[RecruitmentParticipant], actor: Any
) -> None:
    if not added:
        return
    names = [f"{p.user.full_name} ({_role_label(p.role_in_recruitment)})" for p in added]
    _record_jd(
        jd,
        "jd.participant_added",
        f"{_actor_name(actor)} added {_join_names(names)} to the recruitment",
        actor,
        metadata={"participants": [_participant_entry(p) for p in added]},
    )


def _record_participants_removed(
    jd: JobDescription, removed: Sequence[RecruitmentParticipant], actor: Any
) -> None:
    if not removed:
        return
    names = [p.user.full_name for p in removed]
    _record_jd(
        jd,
        "jd.participant_removed",
        f"{_actor_name(actor)} removed {_join_names(names)} from the recruitment",
        actor,
        metadata={"participants": [_participant_entry(p) for p in removed]},
    )


def _record_participant_updated(
    participant: RecruitmentParticipant, previous_role: str, actor: Any
) -> None:
    name = participant.user.full_name
    _record_jd(
        participant.job_description,
        "jd.participant_updated",
        f"{_actor_name(actor)} changed {name}'s role to "
        f"{_role_label(participant.role_in_recruitment)}",
        actor,
        metadata={
            "user_id": str(participant.user_id),
            "name": name,
            "from": str(previous_role),
            "to": str(participant.role_in_recruitment),
        },
    )


def _insert_participants(
    jd: JobDescription,
    entries: Iterable[Mapping[str, Any]],
    actor: Any,
    *,
    skip_user_ids: set[Any],
) -> list[RecruitmentParticipant]:
    """Create one row per new user in ``entries`` (first mention of a user wins)."""
    created: list[RecruitmentParticipant] = []
    seen = set(skip_user_ids)
    for entry in entries:
        user = entry["user"]
        if user.id in seen:
            continue
        seen.add(user.id)
        row = RecruitmentParticipant.objects.create(
            job_description=jd,
            user=user,
            role_in_recruitment=entry.get("role_in_recruitment") or ParticipantRole.INTERVIEWER,
            added_by=actor,
        )
        created.append(row)
    return created


class JobService:
    """Stateless workflows; every method takes the acting user."""

    # ---------------------------------------------------------------- reads

    @staticmethod
    def snapshot(jd: JobDescription) -> dict[str, Any]:
        """The content fields as a JSON-ready dict (what a version stores)."""
        snapshot: dict[str, Any] = {}
        for name in CONTENT_FIELDS:
            value = getattr(jd, name)
            snapshot[name] = list(value) if isinstance(value, list | tuple) else value
        return snapshot

    @staticmethod
    def base_queryset() -> QuerySet[JobDescription]:
        """JDs with their creator, editor and ordered participants loaded."""
        participants = RecruitmentParticipant.objects.select_related("user", "added_by").order_by(
            "created_at"
        )
        return JobDescription.objects.select_related("created_by", "updated_by").prefetch_related(
            Prefetch("participants", queryset=participants)
        )

    @staticmethod
    def list_queryset(user: Any) -> QuerySet[JobDescription]:
        """Visible JDs (plan.md 6.9 "See all JDs"), newest update first, with the
        five pipeline counts of plan.md 9.4 from one aggregated join, the time of
        the latest timeline event and the application stages behind
        ``completion_pct`` (Enhancement.md 3)."""
        visible = visible_job_descriptions_for(user).values("pk")
        counts = {
            name: Count("applications", filter=Q(applications__status__in=statuses), distinct=True)
            for name, statuses in LIST_COUNT_STATUSES.items()
        }
        latest_activity = (
            Activity.objects.filter(job_description=OuterRef("pk"))
            .order_by("-occurred_at")
            .values("occurred_at")[:1]
        )
        progress_rows = Application.objects.only(
            "id", "status", "previous_status", "job_description_id"
        )
        return (
            JobService.base_queryset()
            .filter(pk__in=visible)
            .prefetch_related(
                Prefetch("applications", queryset=progress_rows, to_attr="progress_rows")
            )
            .annotate(
                count_candidates=Count("applications", distinct=True),
                last_activity_at=Subquery(latest_activity),
                **counts,
            )
            .order_by("-updated_at", "-created_at")
        )

    @staticmethod
    def completion_pct(jd: JobDescription) -> int:
        """How far the recruitment has progressed, 0 to 100 (Enhancement.md 3 "% Completed").

        A closed JD is complete. Otherwise every application scores by how far it
        has moved along the pipeline (new = 0 ... onboarded = 100; on hold keeps the
        stage it paused at; rejected and withdrawn score nothing) and the JD takes
        the mean of its best ``openings`` scores, so a role with two openings and
        one hire sits at 50%. Uses the ``progress_rows`` prefetch of
        ``list_queryset`` when present.
        """
        if str(jd.status) == JDStatus.CLOSED:
            return 100
        rows = getattr(jd, "progress_rows", None)
        if rows is None:
            rows = list(jd.applications.only("status", "previous_status"))
        scores: list[float] = []
        for application in rows:
            stage = str(application.status)
            if stage == ApplicationStatus.ON_HOLD:
                stage = str(application.previous_status or "")
            if stage not in ApplicationStatus.ACTIVE:
                continue
            scores.append(ApplicationStatus.order_index(stage) / COMPLETION_MAX_INDEX)
        openings = max(int(jd.openings or 1), 1)
        best = sorted(scores, reverse=True)[:openings]
        if not best:
            return 0
        return round(100 * sum(best) / openings)

    @staticmethod
    def metrics(jd: JobDescription) -> dict[str, int]:
        """The plan.md 6.10 metrics row, from one aggregate over applications and offers."""
        aggregates = {
            key: Count("id", filter=Q(status__in=statuses))
            for key, statuses in METRIC_STATUSES.items()
        }
        row = Application.objects.filter(job_description=jd).aggregate(
            total_found=Count("id"),
            offers_pending=Count("offer", filter=Q(offer__status__in=PENDING_OFFER_STATUSES)),
            **aggregates,
        )
        return {key: int(row[key] or 0) for key in METRIC_KEYS}

    # -------------------------------------------------------------- create

    @staticmethod
    @transaction.atomic
    def create(
        data: Mapping[str, Any], participants: Sequence[Mapping[str, Any]], actor: Any
    ) -> JobDescription:
        """New JD with the creator as owner, version 1, ``jd.created`` and one
        ``jd.participant_added`` listing everyone else."""
        content = _clean_content(data)
        _drop_required_from_preferred(content, None)
        status = str(data.get("status") or JDStatus.DRAFT)
        if status not in (JDStatus.DRAFT, JDStatus.OPEN):
            raise InvalidStatusTransition("A job description starts as draft or open.")
        now = timezone.now()
        jd = JobDescription.objects.create(
            **content,
            status=status,
            published_at=now if status == JDStatus.OPEN else None,
            created_by=actor,
            updated_by=actor,
            current_version=1,
        )
        RecruitmentParticipant.objects.create(
            job_description=jd,
            user=actor,
            role_in_recruitment=ParticipantRole.OWNER,
            added_by=actor,
        )
        added = _insert_participants(jd, participants, actor, skip_user_ids={actor.id})
        JobDescriptionVersion.objects.create(
            job_description=jd,
            version=1,
            snapshot=JobService.snapshot(jd),
            change_summary=CREATED_SUMMARY,
            created_by=actor,
        )
        _record_jd(
            jd,
            "jd.created",
            f'{_actor_name(actor)} created the job description "{jd.title}"',
            actor,
            metadata={"version": 1, "status": status},
        )
        _record_participants_added(jd, added, actor)
        return jd

    # -------------------------------------------------------------- update

    @staticmethod
    @transaction.atomic
    def update(
        jd: JobDescription, data: Mapping[str, Any], actor: Any, change_summary: str = ""
    ) -> JobDescription:
        """Apply content changes (new version + ``jd.updated`` only when something
        changed) and, when ``data`` carries ``participants``, sync the people."""
        content = _clean_content(data)
        _drop_required_from_preferred(content, jd)
        changed = [name for name, value in content.items() if not _unchanged(jd, name, value)]
        if changed:
            # Before / after per field for the timeline (Enhancement.md 5); long text
            # fields are listed as changed without their bodies.
            changes = {
                name: {"from": _json_ready(getattr(jd, name)), "to": _json_ready(content[name])}
                for name in changed
                if name not in LONG_TEXT_FIELDS
            }
            for name in changed:
                setattr(jd, name, content[name])
            jd.current_version += 1
            jd.updated_by = actor
            jd.save()
            summary = (change_summary or "").strip() or (
                "Updated " + ", ".join(_humanise(name) for name in changed)
            )
            JobDescriptionVersion.objects.create(
                job_description=jd,
                version=jd.current_version,
                snapshot=JobService.snapshot(jd),
                change_summary=summary[:300],
                created_by=actor,
            )
            _record_jd(
                jd,
                "jd.updated",
                f"{_actor_name(actor)} updated the job description (v{jd.current_version})",
                actor,
                description=summary,
                metadata={
                    "changed_fields": changed,
                    "changes": changes,
                    "version": jd.current_version,
                    "change_summary": summary,
                },
            )
        if data.get("participants") is not None:
            JobService.sync_participants(jd, data["participants"], actor)
        return jd

    # ----------------------------------------------------------- statuses

    @staticmethod
    @transaction.atomic
    def publish(jd: JobDescription, actor: Any) -> JobDescription:
        """draft -> open, stamping ``published_at`` (plan.md 6.3)."""
        if jd.status != JDStatus.DRAFT:
            raise InvalidStatusTransition("Only a draft job description can be published.")
        previous = str(jd.status)
        jd.status = JDStatus.OPEN
        jd.published_at = timezone.now()
        jd.updated_by = actor
        jd.save(update_fields=["status", "published_at", "updated_by", "updated_at"])
        _record_jd(
            jd,
            "jd.published",
            f'{_actor_name(actor)} published the job description "{jd.title}"',
            actor,
            metadata={"from": previous, "to": str(JDStatus.OPEN)},
        )
        return jd

    @staticmethod
    @transaction.atomic
    def set_status(jd: JobDescription, status: str, actor: Any, note: str = "") -> JobDescription:
        """Move between open / on_hold / closed; ``open`` on a draft publishes and
        ``archived`` archives, so callers can treat this as the one entry point."""
        target = str(status)
        if target == JDStatus.ARCHIVED:
            return JobService.archive(jd, actor)
        if target == JDStatus.OPEN and jd.status == JDStatus.DRAFT:
            return JobService.publish(jd, actor)
        if target not in STATUS_TRANSITIONS.get(str(jd.status), frozenset()):
            raise InvalidStatusTransition(
                f"Cannot change the status from {_status_label(jd.status)} to "
                f"{_status_label(target) if target in JDStatus.values else target!r}."
            )
        previous = str(jd.status)
        jd.status = target
        jd.updated_by = actor
        jd.save(update_fields=["status", "updated_by", "updated_at"])
        note = (note or "").strip()
        _record_jd(
            jd,
            "jd.status_changed",
            f"{_actor_name(actor)} changed the status from {_status_label(previous)} to "
            f"{_status_label(target)}",
            actor,
            description=note,
            metadata={"from": previous, "to": target, "note": note},
        )
        return jd

    @staticmethod
    @transaction.atomic
    def force_close(jd: JobDescription, actor: Any, reason: str = "") -> JobDescription:
        """End the recruitment early (Enhancement.md 3 "Force Close"): draft, open or
        on-hold JDs become ``force_closed``; the reason goes on the timeline."""
        if str(jd.status) not in FORCE_CLOSABLE:
            raise InvalidStatusTransition(
                f"A {_status_label(jd.status).lower()} job description cannot be force closed."
            )
        previous = str(jd.status)
        jd.status = JDStatus.FORCE_CLOSED
        jd.updated_by = actor
        jd.save(update_fields=["status", "updated_by", "updated_at"])
        reason = (reason or "").strip()
        _record_jd(
            jd,
            "jd.force_closed",
            f'{_actor_name(actor)} force closed the job description "{jd.title}"',
            actor,
            description=reason,
            metadata={"from": previous, "to": str(JDStatus.FORCE_CLOSED), "reason": reason},
        )
        return jd

    @staticmethod
    @transaction.atomic
    def add_comment(jd: JobDescription, text: str, actor: Any):
        """A free-text remark on the JD timeline (Enhancement.md 3 "Add Comment");
        returns the activity row so the caller can render it straight away."""
        text = (text or "").strip()
        return _record_jd(
            jd,
            "jd.comment_added",
            f'{_actor_name(actor)} commented on "{jd.title}"',
            actor,
            description=text,
            metadata={"comment": text},
        )

    @staticmethod
    @transaction.atomic
    def archive(jd: JobDescription, actor: Any) -> JobDescription:
        if jd.status == JDStatus.ARCHIVED:
            raise InvalidStatusTransition("This job description is already archived.")
        previous = str(jd.status)
        jd.status = JDStatus.ARCHIVED
        jd.updated_by = actor
        jd.save(update_fields=["status", "updated_by", "updated_at"])
        _record_jd(
            jd,
            "jd.archived",
            f'{_actor_name(actor)} archived the job description "{jd.title}"',
            actor,
            metadata={"from": previous, "to": str(JDStatus.ARCHIVED)},
        )
        return jd

    @staticmethod
    @transaction.atomic
    def unarchive(jd: JobDescription, actor: Any) -> JobDescription:
        """Back to open, or to draft when the JD was never published."""
        if jd.status != JDStatus.ARCHIVED:
            raise InvalidStatusTransition("Only an archived job description can be unarchived.")
        target = JDStatus.OPEN if jd.published_at else JDStatus.DRAFT
        jd.status = target
        jd.updated_by = actor
        jd.save(update_fields=["status", "updated_by", "updated_at"])
        _record_jd(
            jd,
            "jd.status_changed",
            f"{_actor_name(actor)} changed the status from {_status_label(JDStatus.ARCHIVED)} "
            f"to {_status_label(target)}",
            actor,
            metadata={"from": str(JDStatus.ARCHIVED), "to": str(target), "note": ""},
        )
        return jd

    # ----------------------------------------------------------- duplicate

    @staticmethod
    @transaction.atomic
    def duplicate(jd: JobDescription, actor: Any) -> JobDescription:
        """A new draft "Copy of {title}" with the same content; the actor becomes
        owner and the source's participants are copied with their roles."""
        content = JobService.snapshot(jd)
        content["title"] = f"{DUPLICATE_PREFIX}{jd.title}"[:200]
        copy = JobDescription.objects.create(
            **content,
            status=JDStatus.DRAFT,
            published_at=None,
            created_by=actor,
            updated_by=actor,
            current_version=1,
        )
        RecruitmentParticipant.objects.create(
            job_description=copy,
            user=actor,
            role_in_recruitment=ParticipantRole.OWNER,
            added_by=actor,
        )
        source_participants = jd.participants.select_related("user").order_by("created_at")
        added = _insert_participants(
            copy,
            [
                {"user": p.user, "role_in_recruitment": p.role_in_recruitment}
                for p in source_participants
            ],
            actor,
            skip_user_ids={actor.id},
        )
        JobDescriptionVersion.objects.create(
            job_description=copy,
            version=1,
            snapshot=JobService.snapshot(copy),
            change_summary=f'Duplicated from "{jd.title}"'[:300],
            created_by=actor,
        )
        _record_jd(
            copy,
            "jd.duplicated",
            f'{_actor_name(actor)} duplicated "{jd.title}" as "{copy.title}"',
            actor,
            metadata={"source_id": str(jd.id), "source_title": jd.title, "version": 1},
        )
        _record_participants_added(copy, added, actor)
        return copy

    # -------------------------------------------------------------- delete

    @staticmethod
    @transaction.atomic
    def delete(jd: JobDescription, actor: Any, *, confirm: bool) -> None:
        """Hard delete; applications, versions, participants and activities cascade."""
        if not confirm:
            raise ConfirmationRequired
        jd.delete()

    # -------------------------------------------------------- participants

    @staticmethod
    @transaction.atomic
    def add_participant(
        jd: JobDescription, user: Any, role: str, actor: Any
    ) -> RecruitmentParticipant:
        return JobService.add_participants(
            jd, [{"user": user, "role_in_recruitment": role}], actor
        )[0]

    @staticmethod
    @transaction.atomic
    def add_participants(
        jd: JobDescription, entries: Sequence[Mapping[str, Any]], actor: Any
    ) -> list[RecruitmentParticipant]:
        """Add several people with one ``jd.participant_added`` activity."""
        existing = set(jd.participants.values_list("user_id", flat=True))
        for entry in entries:
            if entry["user"].id in existing:
                raise ParticipantExists(
                    f"{entry['user'].full_name} is already involved in this recruitment."
                )
        added = _insert_participants(jd, entries, actor, skip_user_ids=existing)
        _record_participants_added(jd, added, actor)
        return added

    @staticmethod
    @transaction.atomic
    def update_participant(
        participant: RecruitmentParticipant, role: str, actor: Any
    ) -> RecruitmentParticipant:
        role = str(role)
        if participant.role_in_recruitment == role:
            return participant
        jd = participant.job_description
        if participant.user_id == jd.created_by_id:
            raise CreatorProtected
        previous = str(participant.role_in_recruitment)
        participant.role_in_recruitment = role
        participant.save(update_fields=["role_in_recruitment", "updated_at"])
        _record_participant_updated(participant, previous, actor)
        return participant

    @staticmethod
    @transaction.atomic
    def remove_participant(participant: RecruitmentParticipant, actor: Any) -> None:
        jd = participant.job_description
        if participant.user_id == jd.created_by_id:
            raise CreatorProtected
        participant.delete()
        _record_participants_removed(jd, [participant], actor)

    @staticmethod
    @transaction.atomic
    def sync_participants(
        jd: JobDescription, entries: Sequence[Mapping[str, Any]], actor: Any
    ) -> None:
        """Make the participant list equal ``entries`` (the JD form's PeoplePicker):
        add the new people, change roles, remove the rest. The creator stays owner."""
        wanted: dict[Any, str] = {}
        for entry in entries:
            user = entry["user"]
            if user.id == jd.created_by_id or user.id in wanted:
                continue
            wanted[user.id] = str(entry.get("role_in_recruitment") or ParticipantRole.INTERVIEWER)
        current = {
            p.user_id: p for p in jd.participants.select_related("user").order_by("created_at")
        }
        to_add = [
            {"user": entry["user"], "role_in_recruitment": wanted[entry["user"].id]}
            for entry in entries
            if entry["user"].id in wanted and entry["user"].id not in current
        ]
        added = _insert_participants(jd, to_add, actor, skip_user_ids=set(current))
        _record_participants_added(jd, added, actor)
        for user_id, role in wanted.items():
            participant = current.get(user_id)
            if participant is not None and participant.role_in_recruitment != role:
                JobService.update_participant(participant, role, actor)
        removed = [
            participant
            for user_id, participant in current.items()
            if user_id != jd.created_by_id and user_id not in wanted
        ]
        for participant in removed:
            participant.delete()
        _record_participants_removed(jd, removed, actor)


# ------------------------------------------------------------ skill dictionary


def search_skills(query: str, limit: int = SKILL_SUGGESTION_LIMIT) -> list[dict[str, Any]]:
    """Autocomplete rows ``{key, display_name, count}`` for the JD form's tag inputs
    (plan.md 9.5): the union of candidate skills and JD required / preferred
    skills, most common first. ``count`` is candidates with the skill plus JDs
    listing it. The query matches raw or through the synonym map ("k8s" finds
    kubernetes); an empty query returns the most common skills.
    """
    raw = (query or "").strip().lower()
    needles = {needle for needle in (raw, normalize_skill(raw)) if needle}

    def matches(key: str) -> bool:
        return not needles or any(needle in key for needle in needles)

    counts: Counter[str] = Counter()
    candidate_rows = CandidateSkill.objects.values("skill").annotate(n=Count("id"))
    if needles:
        condition = Q()
        for needle in needles:
            condition |= Q(skill__icontains=needle)
        candidate_rows = candidate_rows.filter(condition)
    for row in candidate_rows:
        counts[row["skill"]] += row["n"]
    for required, preferred in JobDescription.objects.values_list(*SKILL_FIELDS):
        for key in set(required or ()) | set(preferred or ()):
            if matches(key):
                counts[key] += 1
    ranked = sorted(counts.items(), key=lambda item: (-item[1], item[0]))[: max(limit, 0)]
    return [{"key": key, "display_name": display_name(key), "count": n} for key, n in ranked]
