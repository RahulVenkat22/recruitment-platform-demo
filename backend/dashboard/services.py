"""Read-only aggregates served by the dashboard app: the enum catalogue behind
``GET /api/v1/meta/enums/`` (plan.md 6.4, 7.2) and the HR dashboard behind
``GET /api/v1/dashboard/*``.

Every dashboard aggregate takes a ``Scope``: the job descriptions the viewer may
see, narrowed to the ones the chosen people are involved in, over the last ``days``
days or a custom date range (the *window*) compared with the same span before it
(the *previous* window).
"""

from __future__ import annotations

from collections import Counter
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from django.db.models import (
    Avg,
    Count,
    DurationField,
    ExpressionWrapper,
    F,
    Max,
    Q,
    QuerySet,
    Sum,
    Value,
)
from django.db.models.functions import Coalesce, ExtractHour, ExtractIsoWeekDay, TruncDate
from django.utils import timezone

from accounts.models import User
from activity.models import Activity
from candidates.models import Candidate
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
from matching.skills import display_name
from pipeline.models import Application, Communication, Interview, Offer, Onboarding, SearchRun
from pipeline.services.interviews import OPEN_STATUSES as OPEN_INTERVIEW_STATUSES
from pipeline.services.offers import format_ctc


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


# ------------------------------------------------------------------ insights
# The rest of what the database knows, for the dashboard's second screen.

STAGE_BUCKETS: dict[str, tuple[str, ...]] = {"awaiting": AWAITING_STATUSES, **STAGE_PARTITION}
MATCH_BANDS: tuple[tuple[str, str, int, int], ...] = (
    ("weak", "Below 40%", 0, 40),
    ("fair", "40 to 59%", 40, 60),
    ("good", "60 to 79%", 60, 80),
    ("strong", "80% and up", 80, 101),
)
EXPERIENCE_BANDS: tuple[tuple[str, str, float, float], ...] = (
    ("junior", "0 to 2 years", 0, 2),
    ("mid", "2 to 5 years", 2, 5),
    ("senior", "5 to 10 years", 5, 10),
    ("lead", "10 years and up", 10, 1000),
)
SKILLS_LIMIT = 10
DEPARTMENTS_LIMIT = 8


def _days(delta: timedelta | None) -> float | None:
    return round(delta.total_seconds() / 86400, 1) if delta is not None else None


def _key_counts(qs: QuerySet, field_name: str, choices: Any) -> list[dict[str, Any]]:
    """One row per member of ``choices``, in declaration order, with its count in ``qs``."""
    counts = dict(
        qs.order_by().values_list(field_name).annotate(n=Count("id")).values_list(field_name, "n")
    )
    return [
        {"key": member.value, "label": member.label, "value": counts.get(member.value, 0)}
        for member in choices
    ]


def insights(scope: Scope) -> dict[str, Any]:
    """Where the active pipeline stands and for how long, match quality, the
    skills open roles ask for against the candidates who have them, departments,
    experience, outreach, offers, when the team works and what the searches
    brought in."""
    now = scope.now
    apps = scope.applications()
    open_jds = scope.job_descriptions().filter(status=enums.JDStatus.OPEN)

    age = ExpressionWrapper(Value(now) - F("stage_entered_at"), output_field=DurationField())
    stages = []
    for key, statuses in STAGE_BUCKETS.items():
        row = apps.filter(status__in=statuses).aggregate(
            n=Count("id"),
            avg_age=Avg(age),
            stuck=Count("id", filter=Q(stage_entered_at__lt=now - STALE_AFTER)),
        )
        stages.append(
            {
                "key": key,
                "label": STAGE_LABELS[key],
                "statuses": list(statuses),
                "value": row["n"],
                "avg_days": _days(row["avg_age"]),
                "stuck": row["stuck"],
            }
        )

    scored = apps.filter(match__isnull=False)
    bands = scored.aggregate(
        avg=Avg("match__overall_pct"),
        **{
            key: Count("id", filter=Q(match__overall_pct__gte=low, match__overall_pct__lt=high))
            for key, _label, low, high in MATCH_BANDS
        },
    )

    demand: Counter[str] = Counter()
    for keys in open_jds.values_list("required_skills", flat=True):
        demand.update(keys)
    skills = [
        {
            "key": key,
            "label": display_name(key),
            "roles": roles,
            "candidates": apps.filter(candidate__skills__skill=key)
            .values("candidate_id")
            .distinct()
            .count(),
        }
        for key, roles in demand.most_common(SKILLS_LIMIT)
    ]

    departments = [
        {
            "key": row["department"],
            "label": row["department"],
            "roles": row["roles"],
            "openings": row["openings"],
            "candidates": apps.filter(job_description__in=open_jds)
            .filter(job_description__department=row["department"])
            .values("candidate_id")
            .distinct()
            .count(),
        }
        for row in open_jds.values("department")
        .annotate(roles=Count("id"), openings=Coalesce(Sum("openings"), 0))
        .order_by("-roles", "department")[:DEPARTMENTS_LIMIT]
    ]

    experience = [
        {
            "key": key,
            "label": label,
            "value": apps.filter(
                candidate__total_experience_years__gte=low,
                candidate__total_experience_years__lt=high,
            )
            .values("candidate_id")
            .distinct()
            .count(),
        }
        for key, label, low, high in EXPERIENCE_BANDS
    ]

    comms = _between(
        Communication.objects.filter(application__in=apps), "occurred_at", scope.window
    )
    offers = scope.offers()
    responded = _between(offers.filter(sent_at__isnull=False), "responded_at", scope.window)
    response = responded.aggregate(
        avg=Avg(ExpressionWrapper(F("responded_at") - F("sent_at"), output_field=DurationField()))
    )

    cells = (
        _between(scope.activities(), "occurred_at", scope.window)
        .annotate(
            weekday=ExtractIsoWeekDay("occurred_at", tzinfo=scope.tz),
            hour=ExtractHour("occurred_at", tzinfo=scope.tz),
        )
        .order_by()
        .values("weekday", "hour")
        .annotate(n=Count("id"))
    )
    heatmap = [[0] * 24 for _ in range(7)]
    for cell in cells:
        heatmap[cell["weekday"] - 1][cell["hour"]] = cell["n"]

    searches = _between(
        SearchRun.objects.filter(job_description_id__in=scope.jd_ids()), "started_at", scope.window
    ).aggregate(
        runs=Count("id"),
        found=Coalesce(Sum("total_found"), 0),
        shortlisted=Coalesce(Sum("shortlisted"), 0),
        new=Coalesce(Sum("new_candidates"), 0),
        avg_duration_ms=Avg("duration_ms"),
    )
    if searches["avg_duration_ms"] is not None:
        searches["avg_duration_ms"] = round(searches["avg_duration_ms"])

    return {
        "range_days": scope.span,
        "stages": stages,
        "match": {
            "avg_pct": _rounded(bands["avg"]),
            "scored": scored.count(),
            "bands": [
                {"key": key, "label": label, "value": bands[key]}
                for key, label, _low, _high in MATCH_BANDS
            ],
        },
        "skills": skills,
        "departments": departments,
        "experience": experience,
        "outreach": {
            "total": comms.count(),
            "channels": _key_counts(comms, "channel", enums.CommunicationChannel),
            "outcomes": _key_counts(comms, "outcome", enums.CommunicationOutcome),
        },
        "offers": {
            "statuses": _key_counts(offers, "status", enums.OfferStatus),
            "responded": responded.count(),
            "avg_response_days": _days(response["avg"]),
        },
        "heatmap": heatmap,
        "searches": searches,
    }


# ------------------------------------------------------------------ details
# The rows behind any dashboard figure, in one shape whatever they are, so the
# dashboard can show them in place instead of sending the reader to a list page.

DETAILS_LIMIT = 200


@dataclass(frozen=True)
class DetailQuery:
    """Which figure, plus the one narrowing some figures take."""

    metric: str
    statuses: tuple[str, ...] = ()
    job_description: str | None = None
    key: str | None = None


def _person(obj: Any) -> dict[str, Any] | None:
    if obj is None:
        return None
    avatar = obj.display_avatar_url if isinstance(obj, Candidate) else obj.avatar_url
    return {"full_name": obj.full_name, "avatar_url": avatar}


def _item(
    obj: Any,
    kind: str,
    *,
    title: str,
    subtitle: str,
    href: str,
    at: datetime | None,
    at_label: str,
    status: str | None = None,
    status_label: str | None = None,
    status_kind: str | None = None,
    person: dict[str, Any] | None = None,
    value: str | None = None,
    note: str | None = None,
) -> dict[str, Any]:
    return {
        "id": str(obj.pk),
        "kind": kind,
        "title": title,
        "subtitle": subtitle,
        "status": status,
        "status_label": status_label,
        "status_kind": status_kind,
        "href": href,
        "at": at,
        "at_label": at_label,
        "person": person,
        "value": value,
        "note": note,
    }


def _application_item(
    app: Application,
    *,
    at: datetime | None = None,
    at_label: str = "In stage since",
    value: str | None = None,
    note: str | None = None,
) -> dict[str, Any]:
    match = getattr(app, "match", None)
    candidate = app.candidate
    return _item(
        app,
        "application",
        title=candidate.full_name,
        subtitle=" · ".join(
            part
            for part in (candidate.current_title or candidate.headline, app.job_description.title)
            if part
        ),
        href=f"/candidates/{app.candidate_id}?jd={app.job_description_id}",
        at=at or app.stage_entered_at,
        at_label=at_label,
        status=app.status,
        status_label=app.get_status_display(),
        status_kind="status",
        person=_person(candidate),
        value=value or (f"{round(float(match.overall_pct))}% match" if match is not None else None),
        note=note,
    )


def _job_item(jd: JobDescription, *, value: str | None = None, note: str | None = None) -> dict:
    return _item(
        jd,
        "job",
        title=jd.title,
        subtitle=" · ".join(
            part for part in (jd.department, jd.location, _plural(jd.openings, "opening")) if part
        ),
        href=f"/jobs/{jd.pk}",
        at=jd.published_at or jd.created_at,
        at_label="Published" if jd.published_at else "Created",
        status=jd.status,
        status_label=jd.get_status_display(),
        status_kind="jd_status",
        person=_person(jd.created_by),
        value=value,
        note=note,
    )


def _interview_item(interview: Interview, *, at_label: str = "Scheduled") -> dict[str, Any]:
    app = interview.application
    if interview.score is not None:
        value = f"Scored {interview.score}"
    elif interview.recommendation:
        value = interview.get_recommendation_display()
    else:
        value = None
    return _item(
        interview,
        "interview",
        title=app.candidate.full_name,
        subtitle=f"{interview.get_round_display()} · {app.job_description.title} · "
        f"with {interview.interviewer.full_name}",
        href=f"/candidates/{app.candidate_id}?jd={app.job_description_id}&tab=interviews",
        at=interview.scheduled_at,
        at_label=at_label,
        status=interview.status,
        status_label=interview.get_status_display(),
        person=_person(app.candidate),
        value=value,
    )


def _offer_item(offer: Offer) -> dict[str, Any]:
    app = offer.application
    if offer.responded_at:
        at, at_label = offer.responded_at, "Responded"
    elif offer.expires_at and offer.status in PENDING_OFFER_STATUSES:
        at, at_label = offer.expires_at, "Expires"
    else:
        at, at_label = offer.sent_at or offer.created_at, "Sent" if offer.sent_at else "Drafted"
    return _item(
        offer,
        "offer",
        title=app.candidate.full_name,
        subtitle=f"{offer.designation} · {app.job_description.title}",
        href=f"/candidates/{app.candidate_id}?jd={app.job_description_id}",
        at=at,
        at_label=at_label,
        status=offer.status,
        status_label=offer.get_status_display(),
        person=_person(app.candidate),
        value=format_ctc(offer.annual_ctc, offer.currency),
    )


def _hire_item(onboarding: Onboarding) -> dict[str, Any]:
    app = onboarding.application
    days = (onboarding.completed_at - app.created_at).days
    return _application_item(
        app,
        at=onboarding.completed_at,
        at_label="Onboarded",
        value=f"{days} days from found to hired",
    )


def _communication_item(comm: Communication) -> dict[str, Any]:
    app = comm.application
    return _item(
        comm,
        "communication",
        title=app.candidate.full_name,
        subtitle=f"{comm.summary} · {app.job_description.title}",
        href=f"/candidates/{app.candidate_id}?jd={app.job_description_id}&tab=communications",
        at=comm.occurred_at,
        at_label="Logged",
        status=comm.outcome,
        status_label=comm.get_outcome_display(),
        person=_person(comm.performed_by),
        value=comm.get_channel_display(),
        note=comm.next_action,
    )


def _search_item(run: SearchRun) -> dict[str, Any]:
    return _item(
        run,
        "search",
        title=run.job_description.title,
        subtitle=f"{run.total_found} found · {run.shortlisted} AI shortlisted · "
        f"{run.new_candidates} new",
        href=f"/search?jd={run.job_description_id}",
        at=run.started_at,
        at_label="Searched",
        status=run.status,
        status_label=run.get_status_display(),
        person=_person(run.requested_by),
        value=f"{run.duration_ms / 1000:.1f} s" if run.duration_ms else None,
        note=", ".join(run.sources),
    )


Details = tuple[int, list[dict[str, Any]]]


def _apps(qs: QuerySet[Application], scope: Scope, **kwargs: Any) -> Details:
    rows = qs.select_related("candidate", "job_description", "match")[:DETAILS_LIMIT]
    return qs.count(), [
        _application_item(app, note=_stage_note(app, scope.now), **kwargs) for app in rows
    ]


def _stage_note(app: Application, now: datetime) -> str:
    days = (now - app.stage_entered_at).days
    return f"{_plural(days, 'day')} in this stage" if days else "Moved today"


def _jobs(qs: QuerySet[JobDescription]) -> Details:
    rows = (
        qs.annotate(candidates=Count("applications", distinct=True))
        .select_related("created_by")
        .order_by("-candidates", "title")[:DETAILS_LIMIT]
    )
    return qs.count(), [_job_item(jd, value=_plural(jd.candidates, "candidate")) for jd in rows]


def _interviews(qs: QuerySet[Interview], **kwargs: Any) -> Details:
    rows = qs.select_related(
        "application__candidate", "application__job_description", "interviewer"
    )[:DETAILS_LIMIT]
    return qs.count(), [_interview_item(row, **kwargs) for row in rows]


def _offers(qs: QuerySet[Offer]) -> Details:
    rows = qs.select_related("application__candidate", "application__job_description")[
        :DETAILS_LIMIT
    ]
    return qs.count(), [_offer_item(row) for row in rows]


def _communications(qs: QuerySet[Communication]) -> Details:
    rows = qs.select_related(
        "application__candidate", "application__job_description", "performed_by"
    )[:DETAILS_LIMIT]
    return qs.count(), [_communication_item(comm) for comm in rows]


def _hires(scope: Scope, _query: DetailQuery) -> Details:
    rows = _between(
        Onboarding.objects.filter(application__job_description_id__in=scope.jd_ids()),
        "completed_at",
        scope.window,
    ).select_related("application__candidate", "application__job_description", "application__match")
    return rows.count(), [_hire_item(row) for row in rows.order_by("-completed_at")[:DETAILS_LIMIT]]


def _overdue_follow_ups(scope: Scope, _query: DetailQuery) -> Details:
    in_contact = scope.applications().filter(status__in=STAGE_PARTITION["contacted"])
    comms = (
        Communication.objects.filter(application__in=in_contact, next_action_at__lt=scope.now)
        .order_by("application_id", "-next_action_at")
        .distinct("application_id")
        .select_related("application__candidate", "application__job_description")
    )
    rows = sorted(comms, key=lambda comm: comm.next_action_at)
    return len(rows), [
        _application_item(
            comm.application,
            at=comm.next_action_at,
            at_label="Follow-up due",
            note=comm.next_action or comm.summary,
        )
        for comm in rows[:DETAILS_LIMIT]
    ]


def _quiet_roles(scope: Scope, _query: DetailQuery) -> Details:
    rows = (
        scope.job_descriptions()
        .filter(status=enums.JDStatus.OPEN)
        .exclude(activities__occurred_at__gte=scope.now - STALE_AFTER)
        .annotate(
            candidates=Count("applications", distinct=True),
            last_activity=Max("activities__occurred_at"),
        )
        .select_related("created_by")
        .order_by("last_activity", "title")
    )
    return rows.count(), [
        _job_item(
            jd,
            value=_plural(jd.candidates, "candidate"),
            note=(
                f"Last activity {_plural((scope.now - jd.last_activity).days, 'day')} ago"
                if jd.last_activity
                else "No activity yet"
            ),
        )
        for jd in rows[:DETAILS_LIMIT]
    ]


def _band(bands: tuple, key: str | None) -> tuple[float, float]:
    for band_key, _label, low, high in bands:
        if band_key == key:
            return low, high
    raise ValueError(f"Unknown band {key!r}.")


def _match_band(scope: Scope, query: DetailQuery) -> Details:
    low, high = _band(MATCH_BANDS, query.key)
    return _apps(
        scope.applications()
        .filter(match__overall_pct__gte=low, match__overall_pct__lt=high)
        .order_by("-match__overall_pct"),
        scope,
    )


def _experience(scope: Scope, query: DetailQuery) -> Details:
    low, high = _band(EXPERIENCE_BANDS, query.key)
    return _apps(
        scope.applications()
        .filter(
            candidate__total_experience_years__gte=low,
            candidate__total_experience_years__lt=high,
        )
        .order_by("-candidate__total_experience_years"),
        scope,
    )


def _stage(scope: Scope, query: DetailQuery) -> Details:
    """Candidates at some statuses (all of them when none is given), on one role or every role."""
    apps = scope.applications()
    if query.statuses:
        apps = apps.filter(status__in=query.statuses)
    if query.job_description:
        apps = apps.filter(job_description_id=query.job_description)
    return _apps(apps, scope)


def _searches(scope: Scope, _query: DetailQuery) -> Details:
    rows = (
        _between(
            SearchRun.objects.filter(job_description_id__in=scope.jd_ids()),
            "started_at",
            scope.window,
        )
        .select_related("job_description", "requested_by")
        .order_by("-started_at")
    )
    return rows.count(), [_search_item(run) for run in rows[:DETAILS_LIMIT]]


DETAIL_BUILDERS: dict[str, Callable[[Scope, DetailQuery], Details]] = {
    "open_roles": lambda scope, _q: _jobs(
        scope.job_descriptions().filter(status=enums.JDStatus.OPEN)
    ),
    "in_pipeline": lambda scope, _q: _apps(
        scope.applications()
        .filter(status__in=ApplicationStatus.ACTIVE)
        .exclude(status=ApplicationStatus.ONBOARDED),
        scope,
    ),
    "new_candidates": lambda scope, _q: _apps(
        _between(scope.applications(), "created_at", scope.window).order_by("-created_at"),
        scope,
        at_label="Found",
    ),
    "interviews": lambda scope, _q: _interviews(
        _between(
            scope.interviews().exclude(status=InterviewStatus.CANCELLED),
            "scheduled_at",
            scope.window,
        ).order_by("-scheduled_at")
    ),
    "offers_pending": lambda scope, _q: _offers(
        scope.offers().filter(status__in=PENDING_OFFER_STATUSES).order_by("expires_at")
    ),
    "hires": _hires,
    "time_to_hire": _hires,
    "offer_acceptance": lambda scope, _q: _offers(
        _between(
            scope.offers().filter(status__in=(OfferStatus.ACCEPTED, OfferStatus.DECLINED)),
            "responded_at",
            scope.window,
        ).order_by("-responded_at")
    ),
    "overdue_follow_ups": _overdue_follow_ups,
    "feedback_pending": lambda scope, _q: _interviews(
        scope.interviews()
        .filter(status__in=OPEN_INTERVIEW_STATUSES, scheduled_at__lt=scope.now)
        .order_by("scheduled_at"),
        at_label="Held",
    ),
    "offers_expiring": lambda scope, _q: _offers(
        scope.offers()
        .filter(
            status__in=(OfferStatus.SENT, OfferStatus.NEGOTIATING),
            expires_at__lt=scope.now + OFFER_EXPIRY_SOON,
        )
        .order_by("expires_at")
    ),
    "stale_candidates": lambda scope, _q: _apps(
        scope.applications()
        .filter(status__in=IN_PROCESS_STATUSES, stage_entered_at__lt=scope.now - STALE_AFTER)
        .order_by("stage_entered_at"),
        scope,
    ),
    "quiet_roles": _quiet_roles,
    "stage": _stage,
    "source": lambda scope, q: _apps(scope.applications().filter(entry_source=q.key), scope),
    "role": lambda scope, q: _apps(
        scope.applications().filter(job_description_id=q.job_description), scope
    ),
    "skill": lambda scope, q: _apps(
        scope.applications().filter(candidate__skills__skill=q.key).distinct(), scope
    ),
    "match_band": _match_band,
    "department": lambda scope, q: _jobs(
        scope.job_descriptions().filter(status=enums.JDStatus.OPEN, department=q.key)
    ),
    "experience": _experience,
    "channel": lambda scope, q: _communications(
        _between(
            Communication.objects.filter(application__in=scope.applications(), channel=q.key),
            "occurred_at",
            scope.window,
        )
    ),
    "offer_status": lambda scope, q: _offers(scope.offers().filter(status=q.key)),
    "searches": _searches,
}
# The figures that take a ``key``: which source, skill, band, department, channel or status.
KEYED_METRICS: frozenset[str] = frozenset(
    {"source", "skill", "match_band", "department", "experience", "channel", "offer_status"}
)


def details(scope: Scope, query: DetailQuery) -> dict[str, Any]:
    """The rows behind one dashboard figure (the total, and at most ``DETAILS_LIMIT`` of them)."""
    count, items = DETAIL_BUILDERS[query.metric](scope, query)
    return {"metric": query.metric, "count": count, "items": items}
