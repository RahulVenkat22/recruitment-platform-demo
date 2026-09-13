"""``CommunicationService``: log a contact with the candidate; a connection
moves early applications to ``contacted`` (plan.md 6.5)."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from django.db import transaction
from django.utils import timezone

from activity.services import record_activity
from common.enums import (
    ActivityCategory,
    ApplicationStatus,
    CommunicationChannel,
    CommunicationDirection,
    CommunicationOutcome,
)
from pipeline.models import Application, Communication
from pipeline.services._common import actor_name, advance, require_active, stamp, touch

CONNECTED_OUTCOMES: frozenset[str] = frozenset(
    {CommunicationOutcome.CONNECTED, CommunicationOutcome.REPLIED}
)
PRE_CONTACT: frozenset[str] = frozenset(
    {
        ApplicationStatus.NEW,
        ApplicationStatus.AI_SHORTLISTED,
        ApplicationStatus.HR_REVIEW,
        ApplicationStatus.CONTACT_PENDING,
    }
)


def _outcome_label(outcome: str) -> str:
    return str(CommunicationOutcome(outcome).label)


class CommunicationService:
    @staticmethod
    @transaction.atomic
    def log(
        application: Application,
        *,
        channel: str,
        outcome: str,
        summary: str,
        actor: Any,
        direction: str = CommunicationDirection.OUTBOUND,
        notes: str = "",
        next_action: str | None = None,
        next_action_at: datetime | None = None,
        occurred_at: datetime | None = None,
        notify: bool = True,
    ) -> Communication:
        require_active(application, "Logging a contact")
        when = occurred_at or timezone.now()
        previous = str(application.status)
        row = Communication.objects.create(
            application=application,
            channel=channel,
            direction=direction,
            outcome=outcome,
            summary=(summary or "").strip()[:300],
            notes=notes or "",
            next_action=(next_action or "").strip()[:200] or None,
            next_action_at=next_action_at,
            performed_by=actor,
            occurred_at=when,
        )
        stamp(row, occurred_at)
        if outcome in CONNECTED_OUTCOMES and previous in PRE_CONTACT:
            advance(application, ApplicationStatus.CONTACTED, actor, when=when, notify=notify)
        else:
            touch(application, when)
        candidate = application.candidate
        verb = "contacted" if direction == CommunicationDirection.OUTBOUND else "heard from"
        description = f"Status: {_outcome_label(outcome)}."
        if row.next_action:
            description += f" Next: {row.next_action}."
        activity = record_activity(
            job_description=application.job_description,
            category=ActivityCategory.CANDIDATE_CONTACT,
            event_type="communication.logged",
            title=f"{actor_name(actor)} {verb} {candidate.full_name}",
            description=description,
            actor=actor,
            application=application,
            candidate=candidate,
            metadata={
                "communication_id": str(row.pk),
                "channel": str(channel),
                "channel_label": str(CommunicationChannel(channel).label),
                "direction": str(direction),
                "outcome": str(outcome),
                "summary": row.summary,
                "notes": row.notes,
                "next_action": row.next_action or "",
                "next_action_at": next_action_at.isoformat() if next_action_at else "",
                "from": previous,
                "to": str(application.status),
            },
            occurred_at=when,
        )
        stamp(activity, occurred_at)
        return row
