"""Read-only aggregates served by the dashboard app. Phase 1 ships the enum
catalogue behind ``GET /api/v1/meta/enums/`` (plan.md 6.4, 7.2); the summary,
funnel and top-candidate aggregates follow in phase 9."""

from __future__ import annotations

from datetime import timedelta
from typing import Any

from django.db.models import Count, Q
from django.utils import timezone

from activity.models import Activity
from candidates.models import Candidate
from common import enums
from common.permissions import is_hr_staff, visible_job_descriptions_for
from jobs.models import JobDescription
from jobs.services import (
    CONTACTED_STATUSES,
    INTERVIEWED_STATUSES,
    ONBOARDED_STATUSES,
    PENDING_OFFER_STATUSES,
    SELECTED_STATUSES,
    SHORTLISTED_STATUSES,
)
from pipeline.models import Application, Interview, Offer
from pipeline.services.interviews import OPEN_STATUSES as OPEN_INTERVIEW_STATUSES
from pipeline.services.queries import application_queryset


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


# ------------------------------------------------------------------ dashboard aggregates
# (plan.md 6.10 Dashboard rows, 9.3). Everything is scoped to the JDs the user
# may see; an HR admin sees the whole tenant.


WINDOW = timedelta(days=7)
RECENT_ACTIVITY_LIMIT = 15
TOP_CANDIDATES_LIMIT = 8
UPCOMING_INTERVIEWS_LIMIT = 5

FUNNEL_STAGES: tuple[tuple[str, str, tuple[str, ...] | None], ...] = (
    ("found", "Found", None),
    ("shortlisted", "Shortlisted", SHORTLISTED_STATUSES),
    ("contacted", "Contacted", CONTACTED_STATUSES),
    ("interviewed", "Interviewed", INTERVIEWED_STATUSES),
    ("selected", "Selected", SELECTED_STATUSES),
    ("onboarded", "Onboarded", ONBOARDED_STATUSES),
)


def _window_delta(qs, field: str, now) -> int:
    """Rows stamped in the last 7 days minus rows stamped in the 7 days before."""
    recent = qs.filter(**{f"{field}__gte": now - WINDOW, f"{field}__lt": now}).count()
    earlier = qs.filter(**{f"{field}__gte": now - 2 * WINDOW, f"{field}__lt": now - WINDOW}).count()
    return recent - earlier


def _visible_candidates(user: Any, visible_jds):
    if is_hr_staff(user):
        return Candidate.objects.all()
    return Candidate.objects.filter(applications__job_description_id__in=visible_jds).distinct()


def summary(user: Any) -> dict[str, dict[str, int]]:
    """Eight metric cards, each ``{value, delta}`` with the delta against the
    previous seven days (plan.md 9.3)."""
    now = timezone.now()
    jds = visible_job_descriptions_for(user)
    jd_ids = jds.values("pk")
    apps = Application.objects.filter(job_description_id__in=jd_ids)
    acts = Activity.objects.filter(job_description_id__in=jd_ids)
    candidates = _visible_candidates(user, jd_ids)
    interviews = Interview.objects.filter(
        application__job_description_id__in=jd_ids, status__in=OPEN_INTERVIEW_STATUSES
    )
    offers = Offer.objects.filter(application__job_description_id__in=jd_ids)

    def card(value: int, delta: int) -> dict[str, int]:
        return {"value": int(value), "delta": int(delta)}

    return {
        "active_jds": card(
            jds.filter(status="open").count(),
            _window_delta(jds.filter(published_at__isnull=False), "published_at", now),
        ),
        "total_candidates": card(candidates.count(), _window_delta(candidates, "created_at", now)),
        "new_candidates": card(
            candidates.filter(created_at__gte=now - WINDOW).count(),
            _window_delta(candidates, "created_at", now),
        ),
        "shortlisted": card(
            apps.filter(status__in=SHORTLISTED_STATUSES).count(),
            _window_delta(acts.filter(category="candidate_shortlisted"), "occurred_at", now),
        ),
        "interviews_scheduled": card(
            interviews.filter(scheduled_at__gte=now, scheduled_at__lt=now + WINDOW).count(),
            interviews.filter(scheduled_at__gte=now, scheduled_at__lt=now + WINDOW).count()
            - interviews.filter(scheduled_at__gte=now - WINDOW, scheduled_at__lt=now).count(),
        ),
        "selected": card(
            apps.filter(status__in=SELECTED_STATUSES).count(),
            _window_delta(acts.filter(category="candidate_selected"), "occurred_at", now),
        ),
        "offers_pending": card(
            offers.filter(status__in=PENDING_OFFER_STATUSES).count(),
            _window_delta(acts.filter(event_type="offer.sent"), "occurred_at", now),
        ),
        "onboarded": card(
            apps.filter(status__in=ONBOARDED_STATUSES).count(),
            _window_delta(acts.filter(event_type="onboarding.completed"), "occurred_at", now),
        ),
    }


def funnel(user: Any, job_description: str | None = None) -> dict[str, Any]:
    """Found -> shortlisted -> contacted -> interviewed -> selected -> onboarded,
    with the conversion from the previous stage (plan.md 9.3)."""
    jd_ids = visible_job_descriptions_for(user).values("pk")
    apps = Application.objects.filter(job_description_id__in=jd_ids)
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
    for key, label, _statuses in FUNNEL_STAGES:
        value = int(row[key] or 0)
        conversion = round(value / previous * 100) if previous else None
        stages.append({"key": key, "label": label, "value": value, "conversion_pct": conversion})
        previous = value
    return {"job_description": job_description, "stages": stages}


def recent_activity(user: Any, limit: int = RECENT_ACTIVITY_LIMIT):
    jd_ids = visible_job_descriptions_for(user).values("pk")
    return list(
        Activity.objects.filter(job_description_id__in=jd_ids)
        .select_related("actor", "candidate")
        .order_by("-occurred_at", "-created_at")[:limit]
    )


def top_candidates(user: Any, limit: int = TOP_CANDIDATES_LIMIT):
    """Best matches across open JDs that are still in play (not parked or done)."""
    return list(
        application_queryset(user)
        .filter(job_description__status="open", match__isnull=False)
        .exclude(status__in=("rejected", "withdrawn", "onboarded"))
        .order_by("-match__overall_pct", "-last_activity_at")[:limit]
    )


def upcoming_interviews(user: Any, limit: int = UPCOMING_INTERVIEWS_LIMIT):
    jd_ids = visible_job_descriptions_for(user).values("pk")
    return list(
        Interview.objects.filter(
            Q(application__job_description_id__in=jd_ids) | Q(interviewer_id=user.pk),
            status__in=OPEN_INTERVIEW_STATUSES,
            scheduled_at__gte=timezone.now(),
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


# Keep the JobDescription import used for type checkers and future aggregates.
_ = JobDescription
