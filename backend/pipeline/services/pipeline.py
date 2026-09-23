"""``PipelineService``: every status move of an application (plan.md 6.2, 6.5).

``transition`` is the single writer of ``Application.status``. It checks the
move against the rules table, stores the previous status for holds, stamps the
stage timestamps, writes the timeline row under the right category, notifies
the owner and the JD owner, all in one transaction.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from django.db import transaction
from django.utils import timezone

from activity.services import record_activity
from common.enums import (
    STATUS_ENTRY_CATEGORY,
    ActivityCategory,
    ApplicationStatus,
    NotificationType,
)
from common.permissions import is_hr_admin, is_hr_staff
from matching.services import compute_match
from notifications.services import notify_all
from pipeline.exceptions import (
    ApplicationExists,
    InvalidTransition,
    NoteRequired,
    ReasonRequired,
    ReopenNotAllowed,
)
from pipeline.models import Application

DECISIONS: frozenset[str] = frozenset(
    {ApplicationStatus.REJECTED, ApplicationStatus.WITHDRAWN, ApplicationStatus.ON_HOLD}
)
SHORTLIST_FROM: frozenset[str] = frozenset(
    {ApplicationStatus.NEW, ApplicationStatus.AI_SHORTLISTED}
)


@dataclass(frozen=True)
class Move:
    status: str
    label: str
    kind: str  # forward | back | reset | decision | resume | reopen
    requires: str | None  # "note" | "reason" | None


def _label(status: str) -> str:
    return str(ApplicationStatus(status).label)


def _actor_name(actor: Any) -> str:
    return getattr(actor, "full_name", None) or "System"


def _join_names(names: Sequence[str]) -> str:
    if len(names) <= 1:
        return "".join(names)
    return ", ".join(names[:-1]) + " and " + names[-1]


def allowed_moves(application: Application, actor: Any) -> list[Move]:
    """The moves plan.md 6.5 permits from the application's current status."""
    current = str(application.status)
    moves: list[Move] = []
    if current == ApplicationStatus.ONBOARDED:
        return moves
    if current == ApplicationStatus.ON_HOLD:
        previous = str(application.previous_status or ApplicationStatus.HR_REVIEW)
        moves.append(Move(previous, f"Resume ({_label(previous)})", "resume", None))
        moves.append(
            Move(
                ApplicationStatus.REJECTED, _label(ApplicationStatus.REJECTED), "decision", "reason"
            )
        )
        moves.append(
            Move(
                ApplicationStatus.WITHDRAWN,
                _label(ApplicationStatus.WITHDRAWN),
                "decision",
                "reason",
            )
        )
        return moves
    if current in (ApplicationStatus.REJECTED, ApplicationStatus.WITHDRAWN):
        if is_hr_admin(actor):
            moves.append(Move(ApplicationStatus.HR_REVIEW, "Reopen (HR Review)", "reopen", None))
        return moves
    active = list(ApplicationStatus.ACTIVE)
    index = active.index(current)
    for status in active[index + 1 :]:
        moves.append(Move(str(status), _label(status), "forward", None))
    if index > 0:
        moves.append(Move(str(active[index - 1]), _label(active[index - 1]), "back", "note"))
    if current != ApplicationStatus.HR_REVIEW and index > active.index(ApplicationStatus.HR_REVIEW):
        moves.append(Move(ApplicationStatus.HR_REVIEW, "Reset to HR Review", "reset", "note"))
    for status in (
        ApplicationStatus.REJECTED,
        ApplicationStatus.WITHDRAWN,
        ApplicationStatus.ON_HOLD,
    ):
        moves.append(Move(str(status), _label(status), "decision", "reason"))
    return moves


def find_move(application: Application, target: str, actor: Any) -> Move:
    for move in allowed_moves(application, actor):
        if move.status == str(target):
            return move
    current = str(application.status)
    if (
        current in (ApplicationStatus.REJECTED, ApplicationStatus.WITHDRAWN)
        and str(target) == ApplicationStatus.HR_REVIEW
    ):
        raise ReopenNotAllowed
    raise InvalidTransition(
        f"Cannot move from {_label(current)} to "
        f"{_label(target) if str(target) in ApplicationStatus.values else target!r}."
    )


def _event_for(application: Application, move: Move, previous: str) -> tuple[str, str]:
    """``(event_type, category)`` for a move (plan.md 6.4 event types)."""
    target = move.status
    if move.kind == "resume":
        return "application.resumed", ActivityCategory.DECISION
    if target == ApplicationStatus.REJECTED:
        return "application.rejected", ActivityCategory.DECISION
    if target == ApplicationStatus.WITHDRAWN:
        return "application.withdrawn", ActivityCategory.DECISION
    if target == ApplicationStatus.ON_HOLD:
        return "application.on_hold", ActivityCategory.DECISION
    if target == ApplicationStatus.HR_REVIEW and previous in SHORTLIST_FROM:
        return "application.shortlisted", ActivityCategory.CANDIDATE_SHORTLISTED
    return "application.status_changed", str(STATUS_ENTRY_CATEGORY[str(target)])


def _title_for(actor: Any, candidate_name: str, move: Move, previous: str) -> str:
    who = _actor_name(actor)
    target = move.status
    if move.kind == "resume":
        return f"{who} resumed {candidate_name} (back to {_label(target)})"
    if move.kind == "reopen":
        return f"{who} reopened {candidate_name} into HR Review"
    if target == ApplicationStatus.REJECTED:
        return f"{who} rejected {candidate_name}"
    if target == ApplicationStatus.WITHDRAWN:
        return f"{who} marked {candidate_name} as withdrawn"
    if target == ApplicationStatus.ON_HOLD:
        return f"{who} put {candidate_name} on hold"
    if target == ApplicationStatus.HR_REVIEW and previous in SHORTLIST_FROM:
        return f"{who} shortlisted {candidate_name}"
    if target == ApplicationStatus.SELECTED:
        return f"{candidate_name} selected for the position by {who}"
    return f"{who} moved {candidate_name} from {_label(previous)} to {_label(target)}"


def _notify_owners(
    application: Application,
    actor: Any,
    title: str,
    message: str,
    occurred_at: datetime | None = None,
) -> None:
    jd = application.job_description
    notify_all(
        [application.owner, jd.created_by],
        NotificationType.STATUS_CHANGE,
        title,
        message,
        f"/candidates/{application.candidate_id}?jd={jd.pk}",
        actor,
        occurred_at=occurred_at,
    )


class PipelineService:
    @staticmethod
    @transaction.atomic
    def transition(
        application: Application,
        status: str,
        actor: Any,
        *,
        note: str = "",
        reason: str = "",
        occurred_at: datetime | None = None,
        notify: bool = True,
        record: bool = True,
    ):
        """Move one application; returns ``(application, activity)``.

        ``record=False`` skips the timeline row (and the notification): used by
        the domain services whose own event (``interview.scheduled``,
        ``offer.sent``, ...) already documents the move.
        """
        move = find_move(application, status, actor)
        note = (note or "").strip()
        reason = (reason or "").strip()
        if move.requires == "note" and not (note or reason):
            raise NoteRequired
        if move.requires == "reason" and not (reason or note):
            raise ReasonRequired
        previous = str(application.status)
        when = occurred_at or timezone.now()
        target = move.status

        if target == ApplicationStatus.ON_HOLD:
            application.previous_status = previous
            application.hold_reason = reason or note
        elif target == ApplicationStatus.REJECTED or target == ApplicationStatus.WITHDRAWN:
            application.rejection_reason = reason or note
        if previous == ApplicationStatus.ON_HOLD and move.kind == "resume":
            application.previous_status = None
        application.status = target
        application.stage_entered_at = when
        application.last_activity_at = when
        application.save()
        if not record:
            return application, None

        event_type, category = _event_for(application, move, previous)
        candidate = application.candidate
        title = _title_for(actor, candidate.full_name, move, previous)
        text = reason or note
        activity = record_activity(
            job_description=application.job_description,
            category=category,
            event_type=event_type,
            title=title,
            description=text,
            actor=actor,
            application=application,
            candidate=candidate,
            metadata={
                "from": previous,
                "to": target,
                "kind": move.kind,
                "note": note,
                "reason": reason,
            },
            occurred_at=when,
        )
        if notify:
            _notify_owners(
                application,
                actor,
                f"{candidate.full_name}: {_label(previous)} → {_label(target)}",
                text,
                occurred_at,
            )
        return application, activity

    @staticmethod
    @transaction.atomic
    def bulk_transition(
        applications: Sequence[Application],
        status: str,
        actor: Any,
        *,
        note: str = "",
        occurred_at: datetime | None = None,
        notify: bool = True,
    ):
        """Move several applications and write one grouped activity per JD
        ("Rahul shortlisted John Doe, Jane Smith and Alex Kumar")."""
        note = (note or "").strip()
        moved: list[Application] = []
        skipped: dict[Any, str] = {}
        groups: dict[Any, list[Application]] = {}
        for application in applications:
            try:
                move = find_move(application, status, actor)
            except (InvalidTransition, ReopenNotAllowed) as exc:
                skipped[application.pk] = str(exc.detail)
                continue
            if move.requires and not note:
                raise (ReasonRequired if move.requires == "reason" else NoteRequired)
            previous = str(application.status)
            when = occurred_at or timezone.now()
            if move.status == ApplicationStatus.ON_HOLD:
                application.previous_status = previous
                application.hold_reason = note
            elif move.status in (ApplicationStatus.REJECTED, ApplicationStatus.WITHDRAWN):
                application.rejection_reason = note
            if previous == ApplicationStatus.ON_HOLD and move.kind == "resume":
                application.previous_status = None
            application.status = move.status
            application.stage_entered_at = when
            application.last_activity_at = when
            application.save()
            application._bulk_previous = previous  # noqa: SLF001 - transient, same transaction
            application._bulk_move = move  # noqa: SLF001
            moved.append(application)
            groups.setdefault(application.job_description_id, []).append(application)

        activities = []
        for group in groups.values():
            first = group[0]
            move = first._bulk_move  # noqa: SLF001
            previous = first._bulk_previous  # noqa: SLF001
            names = [app.candidate.full_name for app in group]
            event_type, category = _event_for(first, move, previous)
            who = _actor_name(actor)
            if move.status == ApplicationStatus.HR_REVIEW and previous in SHORTLIST_FROM:
                title = f"{who} shortlisted {_join_names(names)}"
            elif move.status == ApplicationStatus.REJECTED:
                title = f"{who} rejected {_join_names(names)}"
            else:
                title = f"{who} moved {_join_names(names)} to {_label(move.status)}"
            activities.append(
                record_activity(
                    job_description=first.job_description,
                    category=category,
                    event_type=event_type,
                    title=title,
                    description=note,
                    actor=actor,
                    metadata={
                        "to": move.status,
                        "count": len(group),
                        "note": note,
                        "candidates": [
                            {
                                "id": str(app.candidate_id),
                                "name": app.candidate.full_name,
                                "avatar_url": app.candidate.display_avatar_url,
                            }
                            for app in group
                        ],
                        "candidate_ids": [str(app.candidate_id) for app in group],
                        "application_ids": [str(app.pk) for app in group],
                    },
                    occurred_at=occurred_at,
                )
            )
            if not notify:
                continue
            for app in group:
                _notify_owners(
                    app,
                    actor,
                    f"{app.candidate.full_name}: {_label(app._bulk_previous)} "  # noqa: SLF001
                    f"→ {_label(move.status)}",
                    note,
                    occurred_at,
                )
        return moved, skipped, activities

    @staticmethod
    @transaction.atomic
    def update(application: Application, data: dict[str, Any], actor: Any) -> Application:
        """Owner, star and notes (``PATCH /applications/{id}``)."""
        changed: list[str] = []
        if "owner" in data and data["owner"] != application.owner:
            application.owner = data["owner"]
            changed.append("owner")
            if data["owner"] is not None:
                notify_all(
                    [data["owner"]],
                    NotificationType.ASSIGNMENT,
                    f"You now own {application.candidate.full_name} on "
                    f"{application.job_description.title}",
                    "",
                    f"/candidates/{application.candidate_id}?jd={application.job_description_id}",
                    actor,
                )
        if "is_starred" in data and data["is_starred"] != application.is_starred:
            application.is_starred = bool(data["is_starred"])
            changed.append("is_starred")
        if "notes" in data and (data["notes"] or "") != application.notes:
            application.notes = data["notes"] or ""
            changed.append("notes")
        if changed:
            application.save(update_fields=[*changed, "updated_at"])
        return application

    @staticmethod
    def rematch(application: Application):
        """Recompute the match without touching the status (plan.md 6.6)."""
        return compute_match(application)

    @staticmethod
    @transaction.atomic
    def add_manually(
        candidate: Any, jd: Any, actor: Any, *, occurred_at: datetime | None = None
    ) -> Application:
        """``POST /applications``: attach a known candidate to a JD by hand
        (plan.md 6.10). Scored immediately; the timeline gets
        ``application.added_manually``."""
        if Application.objects.filter(candidate=candidate, job_description=jd).exists():
            raise ApplicationExists
        first_source = (
            candidate.sources.order_by("discovered_at").values_list("source", flat=True).first()
        )
        now = occurred_at or timezone.now()
        application = Application.objects.create(
            candidate=candidate,
            job_description=jd,
            status=ApplicationStatus.NEW,
            entry_source=first_source or "internal",
            owner=actor if is_hr_staff(actor) else None,
            stage_entered_at=now,
            last_activity_at=now,
        )
        match = compute_match(application, computed_at=now)
        record_activity(
            job_description=jd,
            category=ActivityCategory.CANDIDATE_SEARCH,
            event_type="application.added_manually",
            title=f"{_actor_name(actor)} added {candidate.full_name} to {jd.title}",
            description=f"{float(match.overall_pct):.0f}% match",
            actor=actor,
            application=application,
            candidate=candidate,
            metadata={"match_pct": float(match.overall_pct), "to": str(ApplicationStatus.NEW)},
            occurred_at=now,
        )
        return application
