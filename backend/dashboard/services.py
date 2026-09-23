"""Read-only aggregates served by the dashboard app: the enum catalogue behind
``GET /api/v1/meta/enums/`` (plan.md 6.4, 7.2) and the HR dashboard behind
``GET /api/v1/dashboard/*``.

Every dashboard aggregate takes a ``Scope``: the job descriptions the viewer may
see, narrowed to the ones the chosen people are involved in, over the last ``days``
days or a custom date range (the *window*) compared with the same span before it
(the *previous* window).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from django.db.models import Avg, Count, Max, Q, QuerySet, Sum
from django.db.models.functions import Coalesce, TruncDate
from django.utils import timezone

from accounts.models import User
from activity.models import Activity
from common import enums
from common.enums import ActivityCategory, ApplicationStatus, InterviewStatus, OfferStatus
from common.permissions import visible_job_descriptions_for
from jobs.models import JobDescription
from jobs.services import (
    CONTACTED_STATUSES,
    INTERVIEWED_STATUSES,
    ONBOARDED_STATUSES,
    PENDING_OFFER_STATUSES,
    SELECTED_STATUSES,
    SHORTLISTED_STATUSES,
)
from pipeline.models import Application, Communication, Interview, Offer, Onboarding
from pipeline.services.interviews import OPEN_STATUSES as OPEN_INTERVIEW_STATUSES


def build_enum_catalogue() -> dict:
    """Everything the SPA needs so it never hard-codes an enum (plan.md 6.4, 7.2).

    ``enums``: every choice set as ``[{key, label}]`` in declaration order.
    ``colors``: badge tokens ``{bg, text, name}`` for statuses, sources and categories.
    ``status_order`` / ``status_groups``: the 18 statuses in pipeline order and the
    active / tray / terminal partition used by the transition rules.
    ``status_entry_category``: timeline category recorded when a status is entered.
    ``kanban``: the eight board columns, the tray and the status -> column lookup.
    """
    return {
        "enums": {
            name: [{"key": member.value, "label": member.label} for member in choices]
            for name, choices in enums.ALL_ENUMS.items()
        },
        "colors": {
            "application_status": _color_tokens(enums.STATUS_COLORS),
            "candidate_source": _color_tokens(enums.SOURCE_COLORS),
            "activity_category": _color_tokens(enums.CATEGORY_COLORS),
            "ticket_status": _color_tokens(enums.TICKET_STATUS_COLORS),
            "ticket_priority": _color_tokens(enums.TICKET_PRIORITY_COLORS),
        },
        "status_order": list(enums.ApplicationStatus.ORDER),
        "status_groups": {
            "active": list(enums.ApplicationStatus.ACTIVE),
            "tray": [s for s in enums.ApplicationStatus.ORDER if s in enums.ApplicationStatus.TRAY],
            "terminal": [
                s for s in enums.ApplicationStatus.ORDER if s in enums.ApplicationStatus.TERMINAL
            ],
        },
        "status_entry_category": {
            str(status): str(category) for status, category in enums.STATUS_ENTRY_CATEGORY.items()
        },
        "kanban": {
            "columns": [
                {
                    "key": column.key,
                    "label": column.label,
                    "statuses": [str(s) for s in column.statuses],
                    "entry_status": str(column.entry_status),
                }
                for column in enums.KANBAN_COLUMNS.values()
            ],
            "tray": {
                "label": enums.KANBAN_TRAY_LABEL,
                "statuses": [
                    str(s)
                    for s in enums.ApplicationStatus.ORDER
                    if s in enums.ApplicationStatus.TRAY
                ],
            },
            "status_to_column": {
                str(status): column for status, column in enums.STATUS_TO_KANBAN_COLUMN.items()
            },
        },
    }


def _color_tokens(colors: dict[str, enums.ColorPair]) -> dict[str, dict[str, str]]:
    return {str(key): pair._asdict() for key, pair in colors.items()}


# ------------------------------------------------------------------ dashboard scope


RANGE_CHOICES: tuple[int, ...] = (7, 30, 90)
DEFAULT_RANGE = 30
MAX_CUSTOM_DAYS = 366
UPCOMING_INTERVIEWS_LIMIT = 5
TEAM_LIMIT = 8
INTERVIEWERS_LIMIT = 6
STALE_AFTER = timedelta(days=7)
OFFER_EXPIRY_SOON = timedelta(days=3)


@dataclass(frozen=True)
class Scope:
    """One dashboard request: whose job descriptions, over which days.

    ``viewer`` is the signed-in HR user; ``user_ids`` narrows the JDs to those any
    of the chosen people created or is listed on (the "view other people" control).
    ``dates`` are the last ``days`` local days ending today, or the custom
    ``start``..``end`` local days (inclusive, ``end`` clamped to today); ``window``
    is the span they cover, ``previous`` the same number of days before that.
    """

    viewer: Any
    days: int = DEFAULT_RANGE
    user_ids: tuple[str, ...] = ()
    start: date | None = None
    end: date | None = None
    now: datetime = field(default_factory=timezone.now)

    @property
    def tz(self) -> ZoneInfo:
        try:
            return ZoneInfo(getattr(self.viewer, "timezone", "") or "")
        except Exception:  # noqa: BLE001 - any unusable zone name falls back to the server's
            return timezone.get_default_timezone()  # type: ignore[return-value]

    @property
    def dates(self) -> list[date]:
        today = self.now.astimezone(self.tz).date()
        if self.start and self.end:
            last = min(self.end, today)
            first = min(self.start, last)
            return [first + timedelta(days=offset) for offset in range((last - first).days + 1)]
        return [today - timedelta(days=offset) for offset in range(self.days - 1, -1, -1)]

    @property
    def span(self) -> int:
        """How many local days the window covers."""
        return len(self.dates)

    @property
    def window(self) -> tuple[datetime, datetime]:
        dates = self.dates
        start = datetime.combine(dates[0], time.min, tzinfo=self.tz)
        end = datetime.combine(dates[-1] + timedelta(days=1), time.min, tzinfo=self.tz)
        return start, min(end, self.now)

    @property
    def previous(self) -> tuple[datetime, datetime]:
        start, _ = self.window
        return start - timedelta(days=self.span), start

    def job_descriptions(self) -> QuerySet[JobDescription]:
        jds = visible_job_descriptions_for(self.viewer)
        if self.user_ids:
            jds = jds.filter(
                Q(created_by_id__in=self.user_ids) | Q(participants__user_id__in=self.user_ids)
            ).distinct()
        return jds

    def jd_ids(self):
        return self.job_descriptions().values("pk")

    def applications(self) -> QuerySet[Application]:
        return Application.objects.filter(job_description_id__in=self.jd_ids())

    def activities(self) -> QuerySet[Activity]:
        return Activity.objects.filter(job_description_id__in=self.jd_ids())

    def interviews(self) -> QuerySet[Interview]:
        return Interview.objects.filter(application__job_description_id__in=self.jd_ids())

    def offers(self) -> QuerySet[Offer]:
        return Offer.objects.filter(application__job_description_id__in=self.jd_ids())


def _between(qs: QuerySet, field_name: str, span: tuple[datetime, datetime]) -> QuerySet:
    start, end = span
    return qs.filter(**{f"{field_name}__gte": start, f"{field_name}__lt": end})


def _delta(qs: QuerySet, field_name: str, scope: Scope) -> int:
    """Rows stamped in the window minus rows stamped in the previous window."""
    return (
        _between(qs, field_name, scope.window).count()
        - _between(qs, field_name, scope.previous).count()
    )


def _daily(qs: QuerySet, field_name: str, scope: Scope) -> list[int]:
    """Rows per local day across the window, oldest first, zero-filled."""
    rows = (
        _between(qs, field_name, scope.window)
        .annotate(day=TruncDate(field_name, tzinfo=scope.tz))
        .values("day")
        .annotate(n=Count("id"))
        .order_by()
    )
    counts = {row["day"]: row["n"] for row in rows}
    return [counts.get(day, 0) for day in scope.dates]


def _percent(part: int, whole: int) -> float | None:
    return round(part / whole * 100, 1) if whole else None


def _metric(
    value: float | None,
    delta: float | None,
    *,
    unit: str = "count",
    detail: str | None = None,
    series: list[int] | None = None,
) -> dict[str, Any]:
    return {"value": value, "delta": delta, "unit": unit, "detail": detail, "series": series}


def _plural(count: int, noun: str) -> str:
    return f"{count} {noun}" if count == 1 else f"{count} {noun}s"


# ------------------------------------------------------------------ stage partition
# Where a candidate stands right now, as one bucket per current status. Unlike the
# funnel's "reached" counts these never overlap, so they stack.


def _statuses(first: str, last: str) -> tuple[str, ...]:
    order = ApplicationStatus.ORDER
    return tuple(order[order.index(str(first)) : order.index(str(last)) + 1])


AWAITING_STATUSES: tuple[str, ...] = (str(ApplicationStatus.NEW),)
STAGE_PARTITION: dict[str, tuple[str, ...]] = {
    "shortlisted": _statuses(ApplicationStatus.AI_SHORTLISTED, ApplicationStatus.HR_REVIEW),
    "contacted": _statuses(ApplicationStatus.CONTACT_PENDING, ApplicationStatus.PHONE_SCREENING),
    "interviewed": _statuses(
        ApplicationStatus.INTERVIEW_SCHEDULED, ApplicationStatus.FINAL_INTERVIEW
    ),
    "selected": _statuses(ApplicationStatus.SELECTED, ApplicationStatus.OFFER_ACCEPTED),
    "onboarded": _statuses(ApplicationStatus.ONBOARDING, ApplicationStatus.ONBOARDED),
}
STAGE_LABELS: dict[str, str] = {
    "awaiting": "Awaiting review",
    "shortlisted": "Shortlisted",
    "contacted": "Contacted",
    "interviewed": "Interviewing",
    "selected": "Selected",
    "onboarded": "Onboarding",
    "parked": "Rejected / on hold",
}
PARKED_STATUSES: tuple[str, ...] = tuple(
    s for s in ApplicationStatus.ORDER if s in ApplicationStatus.TRAY
)
# Everything between "found" and "hired": the candidates someone is actively working.
IN_PROCESS_STATUSES: tuple[str, ...] = tuple(
    status for key, statuses in STAGE_PARTITION.items() if key != "onboarded" for status in statuses
) + (str(ApplicationStatus.ONBOARDING),)

FUNNEL_STAGES: tuple[tuple[str, str, tuple[str, ...] | None], ...] = (
    ("found", "Found", None),
    ("shortlisted", "Shortlisted", SHORTLISTED_STATUSES),
    ("contacted", "Contacted", CONTACTED_STATUSES),
    ("interviewed", "Interviewed", INTERVIEWED_STATUSES),
    ("selected", "Selected", SELECTED_STATUSES),
    ("onboarded", "Onboarded", ONBOARDED_STATUSES),
)

TEAM_GROUPS: dict[str, tuple[str, ...]] = {
    "sourcing": (ActivityCategory.CANDIDATE_SEARCH, ActivityCategory.CANDIDATE_SHORTLISTED),
    "outreach": (ActivityCategory.CANDIDATE_CONTACT,),
    "interviews": (ActivityCategory.INTERVIEW, ActivityCategory.INTERVIEW_FEEDBACK),
    "closing": (
        ActivityCategory.CANDIDATE_SELECTED,
        ActivityCategory.OFFER,
        ActivityCategory.ONBOARDING,
        ActivityCategory.DECISION,
    ),
}


# ------------------------------------------------------------------ aggregates


def summary(scope: Scope) -> dict[str, Any]:
    """The eight headline figures, each with its change against the previous
    window and, where it is a flow, its daily series for a sparkline."""
    now = scope.now
    jds = scope.job_descriptions()
    apps = scope.applications()
    acts = scope.activities()
    interviews = scope.interviews().exclude(status=InterviewStatus.CANCELLED)
    offers = scope.offers()
    hires = acts.filter(event_type="onboarding.completed")
    offers_sent = acts.filter(event_type="offer.sent")

    open_roles = jds.filter(status=enums.JDStatus.OPEN).aggregate(
        n=Count("id"), openings=Coalesce(Sum("openings"), 0)
    )
    active = apps.filter(status__in=ApplicationStatus.ACTIVE).exclude(
        status=ApplicationStatus.ONBOARDED
    )
    awaiting = apps.filter(status__in=AWAITING_STATUSES).count()
    upcoming = interviews.filter(status__in=OPEN_INTERVIEW_STATUSES, scheduled_at__gte=now).count()
    pending = offers.filter(status__in=PENDING_OFFER_STATUSES)
    expired = pending.filter(expires_at__lt=now).count()
    expiring = pending.filter(expires_at__gte=now, expires_at__lt=now + OFFER_EXPIRY_SOON).count()

    responded = offers.filter(status__in=(OfferStatus.ACCEPTED, OfferStatus.DECLINED))
    acceptance_now = _acceptance(_between(responded, "responded_at", scope.window))
    acceptance_before = _acceptance(_between(responded, "responded_at", scope.previous))
    completed = Onboarding.objects.filter(
        application__job_description_id__in=scope.jd_ids(), completed_at__isnull=False
    )
    time_now = _time_to_hire(_between(completed, "completed_at", scope.window))
    time_before = _time_to_hire(_between(completed, "completed_at", scope.previous))

    return {
        "range_days": scope.span,
        "open_roles": _metric(
            open_roles["n"], None, detail=_plural(open_roles["openings"] or 0, "opening")
        ),
        "in_pipeline": _metric(active.count(), None, detail=f"{awaiting} awaiting review"),
        "new_candidates": _metric(
            _between(apps, "created_at", scope.window).count(),
            _delta(apps, "created_at", scope),
            series=_daily(apps, "created_at", scope),
        ),
        "interviews": _metric(
            _between(interviews, "scheduled_at", scope.window).count(),
            _delta(interviews, "scheduled_at", scope),
            detail=f"{upcoming} upcoming",
            series=_daily(interviews, "scheduled_at", scope),
        ),
        "offers_pending": _metric(
            pending.count(),
            None,
            detail=(
                f"{expired} past expiry"
                if expired
                else f"{expiring} expiring soon"
                if expiring
                else None
            ),
            series=_daily(offers_sent, "occurred_at", scope),
        ),
        "hires": _metric(
            _between(hires, "occurred_at", scope.window).count(),
            _delta(hires, "occurred_at", scope),
            series=_daily(hires, "occurred_at", scope),
        ),
        "offer_acceptance": _metric(
            acceptance_now,
            _diff(acceptance_now, acceptance_before),
            unit="percent",
            detail=f"{_between(responded, 'responded_at', scope.window).count()} responses",
        ),
        "time_to_hire": _metric(
            time_now,
            _diff(time_now, time_before),
            unit="days",
            detail=_plural(_between(completed, "completed_at", scope.window).count(), "hire"),
        ),
    }


def _acceptance(responded: QuerySet[Offer]) -> float | None:
    row = responded.aggregate(
        total=Count("id"), accepted=Count("id", filter=Q(status=OfferStatus.ACCEPTED))
    )
    return _percent(row["accepted"], row["total"])


def _time_to_hire(completed: QuerySet[Onboarding]) -> float | None:
    """Average days from the candidate being found to onboarding completed."""
    spans = [
        (done - found).total_seconds() / 86400
        for done, found in completed.values_list("completed_at", "application__created_at")
    ]
    return round(sum(spans) / len(spans), 1) if spans else None


def _diff(current: float | None, before: float | None) -> float | None:
    if current is None or before is None:
        return None
    return round(current - before, 1)


def trends(scope: Scope) -> dict[str, Any]:
    """Daily counts across the window for the activity chart: candidates found,
    shortlisted, interviews held, offers sent and hires completed."""
    apps = scope.applications()
    acts = scope.activities()
    interviews = scope.interviews().exclude(status=InterviewStatus.CANCELLED)
    series = {
        "candidates": _daily(apps, "created_at", scope),
        "shortlisted": _daily(
            acts.filter(category=ActivityCategory.CANDIDATE_SHORTLISTED), "occurred_at", scope
        ),
        "interviews": _daily(interviews, "scheduled_at", scope),
        "offers": _daily(acts.filter(event_type="offer.sent"), "occurred_at", scope),
        "hires": _daily(acts.filter(event_type="onboarding.completed"), "occurred_at", scope),
    }
    points = [
        {"date": day, **{key: values[index] for key, values in series.items()}}
        for index, day in enumerate(scope.dates)
    ]
    return {"range_days": scope.span, "points": points}


def pipeline(scope: Scope) -> dict[str, Any]:
    """Where every candidate stands right now: the stage partition for the whole
    scope, the split by source, and one row per job description."""
    apps = scope.applications()
    buckets = {"awaiting": AWAITING_STATUSES, **STAGE_PARTITION, "parked": PARKED_STATUSES}
    counts = apps.aggregate(
        **{key: Count("id", filter=Q(status__in=statuses)) for key, statuses in buckets.items()}
    )
    stages = [
        {"key": key, "label": STAGE_LABELS[key], "statuses": list(statuses), "value": counts[key]}
        for key, statuses in buckets.items()
    ]
    by_source = dict(
        apps.values_list("entry_source").annotate(n=Count("id")).values_list("entry_source", "n")
    )
    sources = [
        {"key": source.value, "label": source.label, "value": by_source.get(source.value, 0)}
        for source in enums.CandidateSource
    ]
    jobs = (
        scope.job_descriptions()
        .exclude(status=enums.JDStatus.ARCHIVED)
        .annotate(
            total=Count("applications", distinct=True),
            **{
                key: Count(
                    "applications", filter=Q(applications__status__in=statuses), distinct=True
                )
                for key, statuses in buckets.items()
            },
            last_activity_at=Max("activities__occurred_at"),
        )
        .order_by("-total", "title")
    )
    return {"stages": stages, "sources": sources, "jobs": list(jobs)}


def funnel(scope: Scope, job_description: str | None = None) -> dict[str, Any]:
    """Found -> shortlisted -> contacted -> interviewed -> selected -> onboarded,
    with the conversion from the previous stage (plan.md 9.3)."""
    apps = scope.applications()
    if job_description:
        apps = apps.filter(job_description_id=job_description)
    aggregates = {
        key: Count("id", filter=Q(status__in=statuses))
        for key, _label, statuses in FUNNEL_STAGES
        if statuses is not None
    }
    row = apps.aggregate(found=Count("id"), **aggregates)
    stages = []
    previous: int | None = None
    for key, label, statuses in FUNNEL_STAGES:
        value = int(row[key] or 0)
        conversion = round(value / previous * 100) if previous else None
        stages.append(
            {
                "key": key,
                "label": label,
                "statuses": list(statuses or ()),
                "value": value,
                "conversion_pct": conversion,
            }
        )
        previous = value
    return {"job_description": job_description, "stages": stages}


def interview_insights(scope: Scope) -> dict[str, Any]:
    """How interviewing went across the window, plus what is still open now."""
    now = scope.now
    all_interviews = scope.interviews()
    held = _between(all_interviews, "scheduled_at", scope.window)
    done = Q(status=InterviewStatus.COMPLETED)
    totals = held.aggregate(
        total=Count("id"),
        completed=Count("id", filter=done),
        cancelled=Count("id", filter=Q(status=InterviewStatus.CANCELLED)),
        no_show=Count("id", filter=Q(status=InterviewStatus.NO_SHOW)),
        avg_score=Avg("score", filter=done),
    )
    by_recommendation = dict(
        held.filter(recommendation__isnull=False)
        .values_list("recommendation")
        .annotate(n=Count("id"))
        .values_list("recommendation", "n")
    )
    recommendations = [
        {
            "key": member.value,
            "label": member.label,
            "value": by_recommendation.get(member.value, 0),
        }
        for member in enums.Recommendation
    ]
    load = list(
        held.values("interviewer")
        .annotate(
            total=Count("id"),
            completed=Count("id", filter=done),
            avg_score=Avg("score", filter=done),
        )
        .order_by("-total", "-completed")[:INTERVIEWERS_LIMIT]
    )
    users = User.objects.in_bulk([row["interviewer"] for row in load])
    interviewers = [
        {
            "user": users[row["interviewer"]],
            "total": row["total"],
            "completed": row["completed"],
            "avg_score": _rounded(row["avg_score"]),
        }
        for row in load
        if row["interviewer"] in users
    ]
    return {
        "range_days": scope.span,
        "total": totals["total"],
        "completed": totals["completed"],
        "cancelled": totals["cancelled"],
        "no_show": totals["no_show"],
        "avg_score": _rounded(totals["avg_score"]),
        "upcoming": all_interviews.filter(
            status__in=OPEN_INTERVIEW_STATUSES, scheduled_at__gte=now
        ).count(),
        "feedback_pending": all_interviews.filter(
            status__in=OPEN_INTERVIEW_STATUSES, scheduled_at__lt=now
        ).count(),
        "recommendations": recommendations,
        "interviewers": interviewers,
    }


def _rounded(value: Any) -> float | None:
    return round(float(value), 1) if value is not None else None


def attention(scope: Scope) -> dict[str, int]:
    """Counts of things waiting on someone right now."""
    now = scope.now
    jd_ids = scope.jd_ids()
    apps = scope.applications()
    in_process = apps.filter(status__in=IN_PROCESS_STATUSES)
    in_contact = apps.filter(status__in=STAGE_PARTITION["contacted"])
    return {
        "overdue_follow_ups": Communication.objects.filter(
            application__in=in_contact, next_action_at__lt=now
        )
        .values("application_id")
        .distinct()
        .count(),
        "feedback_pending": scope.interviews()
        .filter(status__in=OPEN_INTERVIEW_STATUSES, scheduled_at__lt=now)
        .count(),
        "offers_expiring": scope.offers()
        .filter(
            status__in=(OfferStatus.SENT, OfferStatus.NEGOTIATING),
            expires_at__lt=now + OFFER_EXPIRY_SOON,
        )
        .count(),
        "stale_candidates": in_process.filter(stage_entered_at__lt=now - STALE_AFTER).count(),
        "quiet_roles": JobDescription.objects.filter(pk__in=jd_ids, status=enums.JDStatus.OPEN)
        .exclude(activities__occurred_at__gte=now - STALE_AFTER)
        .count(),
    }


def team(scope: Scope) -> list[dict[str, Any]]:
    """Who did what across the window, over everything the viewer may see (the
    person filter does not apply: this is the control that drives it)."""
    visible = visible_job_descriptions_for(scope.viewer)
    jd_ids = visible.values("pk")
    grouped = {category: key for key, categories in TEAM_GROUPS.items() for category in categories}
    rows = list(
        _between(
            Activity.objects.filter(
                job_description_id__in=jd_ids,
                actor__isnull=False,
                category__in=list(grouped),
            ),
            "occurred_at",
            scope.window,
        )
        .values("actor")
        .annotate(
            total=Count("id"),
            **{
                key: Count("id", filter=Q(category__in=categories))
                for key, categories in TEAM_GROUPS.items()
            },
        )
        .order_by("-total")[:TEAM_LIMIT]
    )
    users = User.objects.in_bulk([row["actor"] for row in rows])
    return [
        {
            "user": users[row["actor"]],
            "roles": visible.filter(
                Q(created_by_id=row["actor"]) | Q(participants__user_id=row["actor"])
            )
            .distinct()
            .count(),
            **{key: row[key] for key in TEAM_GROUPS},
            "total": row["total"],
        }
        for row in rows
        if row["actor"] in users
    ]


def upcoming_interviews(scope: Scope, limit: int = UPCOMING_INTERVIEWS_LIMIT) -> list[Interview]:
    on_scope = Q(application__job_description_id__in=scope.jd_ids())
    if scope.user_ids:
        on_scope |= Q(interviewer_id__in=scope.user_ids)
    return list(
        Interview.objects.filter(
            on_scope, status__in=OPEN_INTERVIEW_STATUSES, scheduled_at__gte=scope.now
        )
        .select_related(
            "application__candidate",
            "application__owner",
            "application__job_description__created_by",
            "interviewer",
            "created_by",
        )
        .prefetch_related("application__job_description__participants")
        .order_by("scheduled_at")[:limit]
    )
