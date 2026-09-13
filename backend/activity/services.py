"""``record_activity()``: the only writer of timeline rows (plan.md 6.3
activity.Activity, 6.4 event types).

Every service that does something worth showing on a timeline calls this with
a ready-to-render ``title`` ("Priya contacted John Doe"), the timeline
``category`` the filter chips toggle, and a fine-grained ``event_type``. The
pair is validated against ``EVENT_TYPE_CATEGORY`` so a row can never land under
a chip it does not belong to.

``application.status_changed`` is the one event type that spans categories: it
is recorded under the entry category of the status the application moved
*into* (``common.enums.STATUS_ENTRY_CATEGORY``); ``category_for`` resolves it.
"""

from __future__ import annotations

from collections.abc import Mapping
from datetime import datetime
from typing import Any

from activity.models import Activity
from common.enums import STATUS_ENTRY_CATEGORY, ActivityCategory

TITLE_MAX_LENGTH = Activity._meta.get_field("title").max_length
_ELLIPSIS = "…"


class InvalidActivity(ValueError):
    """The caller asked for an event type / category pair the plan does not define."""


def _single(category: str) -> frozenset[str]:
    return frozenset({str(category)})


# event_type -> categories it may be recorded under (plan.md 6.4, all ten categories).
EVENT_TYPE_CATEGORY: dict[str, frozenset[str]] = {
    # job_description
    "jd.created": _single(ActivityCategory.JOB_DESCRIPTION),
    "jd.updated": _single(ActivityCategory.JOB_DESCRIPTION),
    "jd.published": _single(ActivityCategory.JOB_DESCRIPTION),
    "jd.status_changed": _single(ActivityCategory.JOB_DESCRIPTION),
    "jd.participant_added": _single(ActivityCategory.JOB_DESCRIPTION),
    "jd.participant_updated": _single(ActivityCategory.JOB_DESCRIPTION),
    "jd.participant_removed": _single(ActivityCategory.JOB_DESCRIPTION),
    "jd.duplicated": _single(ActivityCategory.JOB_DESCRIPTION),
    "jd.archived": _single(ActivityCategory.JOB_DESCRIPTION),
    # candidate_search
    "search.completed": _single(ActivityCategory.CANDIDATE_SEARCH),
    "application.added_manually": _single(ActivityCategory.CANDIDATE_SEARCH),
    # candidate_shortlisted
    "application.ai_shortlisted": _single(ActivityCategory.CANDIDATE_SHORTLISTED),
    "application.shortlisted": _single(ActivityCategory.CANDIDATE_SHORTLISTED),
    # candidate_shortlisted (into hr_review), candidate_contact (into contact_pending,
    # contacted, phone_screening), interview (into any interview status),
    # candidate_selected (into selected), and the other entry categories.
    "application.status_changed": frozenset(str(c) for c in STATUS_ENTRY_CATEGORY.values()),
    # candidate_contact
    "communication.logged": _single(ActivityCategory.CANDIDATE_CONTACT),
    # interview
    "interview.scheduled": _single(ActivityCategory.INTERVIEW),
    "interview.rescheduled": _single(ActivityCategory.INTERVIEW),
    "interview.cancelled": _single(ActivityCategory.INTERVIEW),
    # interview_feedback
    "interview.feedback_submitted": _single(ActivityCategory.INTERVIEW_FEEDBACK),
    # offer
    "offer.created": _single(ActivityCategory.OFFER),
    "offer.sent": _single(ActivityCategory.OFFER),
    "offer.accepted": _single(ActivityCategory.OFFER),
    "offer.declined": _single(ActivityCategory.OFFER),
    "offer.withdrawn": _single(ActivityCategory.OFFER),
    # onboarding
    "onboarding.started": _single(ActivityCategory.ONBOARDING),
    "onboarding.checklist_updated": _single(ActivityCategory.ONBOARDING),
    "onboarding.completed": _single(ActivityCategory.ONBOARDING),
    # decision
    "application.rejected": _single(ActivityCategory.DECISION),
    "application.withdrawn": _single(ActivityCategory.DECISION),
    "application.on_hold": _single(ActivityCategory.DECISION),
    "application.resumed": _single(ActivityCategory.DECISION),
}

_KNOWN_CATEGORIES: frozenset[str] = frozenset(ActivityCategory.values)


def event_types_for(category: str) -> frozenset[str]:
    """Every event type that may be recorded under ``category``."""
    return frozenset(
        event for event, categories in EVENT_TYPE_CATEGORY.items() if str(category) in categories
    )


def category_for(event_type: str, *, status: str | None = None) -> str:
    """The category an event type is recorded under.

    Unambiguous for every event type except ``application.status_changed``,
    which needs the target ``status`` to pick the entry category.
    """
    categories = EVENT_TYPE_CATEGORY.get(event_type)
    if categories is None:
        raise InvalidActivity(f"unknown event type {event_type!r}")
    if len(categories) == 1:
        return next(iter(categories))
    if status is None or str(status) not in STATUS_ENTRY_CATEGORY:
        raise InvalidActivity(f"{event_type!r} needs the target status to pick its category")
    return str(STATUS_ENTRY_CATEGORY[str(status)])


def _validate(category: str, event_type: str, title: str, metadata: Any) -> None:
    if str(category) not in _KNOWN_CATEGORIES:
        raise InvalidActivity(f"unknown category {category!r}")
    allowed = EVENT_TYPE_CATEGORY.get(event_type)
    if allowed is None:
        raise InvalidActivity(f"unknown event type {event_type!r}")
    if str(category) not in allowed:
        raise InvalidActivity(
            f"event type {event_type!r} cannot be recorded under category {category!r} "
            f"(allowed: {', '.join(sorted(allowed))})"
        )
    if not title or not title.strip():
        raise InvalidActivity("title is required")
    if metadata is not None and not isinstance(metadata, Mapping):
        raise InvalidActivity("metadata must be a mapping")


def _shorten(title: str) -> str:
    title = title.strip()
    if len(title) <= TITLE_MAX_LENGTH:
        return title
    return title[: TITLE_MAX_LENGTH - len(_ELLIPSIS)].rstrip() + _ELLIPSIS


def record_activity(
    *,
    job_description: Any,
    category: str,
    event_type: str,
    title: str,
    actor: Any = None,
    application: Any = None,
    candidate: Any = None,
    description: str = "",
    metadata: Mapping[str, Any] | None = None,
    occurred_at: datetime | None = None,
) -> Activity:
    """Write one timeline row and return it.

    ``candidate`` is denormalised from ``application`` when not given, so the
    candidate timeline survives application deletion. ``actor`` ``None`` means
    the system acted. ``occurred_at`` defaults to now (seeders backdate it).
    """
    _validate(category, event_type, title, metadata)
    if candidate is None and application is not None:
        candidate = application.candidate
    fields: dict[str, Any] = {
        "job_description": job_description,
        "application": application,
        "candidate": candidate,
        "category": str(category),
        "event_type": event_type,
        "title": _shorten(title),
        "description": description or "",
        "actor": actor,
        "metadata": dict(metadata) if metadata else {},
    }
    if occurred_at is not None:
        fields["occurred_at"] = occurred_at
    return Activity.objects.create(**fields)
