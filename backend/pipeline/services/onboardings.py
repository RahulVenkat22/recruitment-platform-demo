"""``OnboardingService``: start onboarding, tick the checklist, complete it
(plan.md 6.3 pipeline.Onboarding, 6.5 triggers, 6.8 notifications)."""

from __future__ import annotations

from datetime import date, datetime
from typing import Any

from django.db import transaction
from django.utils import timezone

from activity.services import record_activity
from common.enums import ActivityCategory, ApplicationStatus, NotificationType, OnboardingStatus
from notifications.services import notify_all
from pipeline.exceptions import InvalidTransition
from pipeline.models import Application, Onboarding, default_onboarding_checklist
from pipeline.services._common import (
    actor_name,
    advance,
    candidate_link,
    join_names,
    owners_of,
    participants_of,
    person_ref,
    require_active,
    stamp,
    status_label,
    touch,
)

DOCUMENTS_KEY = "documents_collected"


def checklist_progress(checklist: list[dict[str, Any]]) -> tuple[int, int]:
    done = sum(1 for item in checklist if item.get("done"))
    return done, len(checklist)


def _derive_status(onboarding: Onboarding) -> str:
    if str(onboarding.status) in (OnboardingStatus.COMPLETED, OnboardingStatus.DROPPED):
        return str(onboarding.status)
    documents_done = any(
        item.get("key") == DOCUMENTS_KEY and item.get("done") for item in onboarding.checklist
    )
    return OnboardingStatus.IN_PROGRESS if documents_done else OnboardingStatus.DOCUMENTS_PENDING


def _metadata(onboarding: Onboarding, **extra: Any) -> dict[str, Any]:
    done, total = checklist_progress(onboarding.checklist)
    return {
        "onboarding_id": str(onboarding.pk),
        "status": str(onboarding.status),
        "start_date": onboarding.start_date.isoformat(),
        "buddy": person_ref(onboarding.buddy),
        "hr_contact": person_ref(onboarding.hr_contact),
        "checklist_done": done,
        "checklist_total": total,
        "checklist": [item["key"] for item in onboarding.checklist if item.get("done")],
        **extra,
    }


def _record(onboarding: Onboarding, event_type: str, title: str, actor: Any, when, **kwargs):
    application = onboarding.application
    return record_activity(
        job_description=application.job_description,
        category=ActivityCategory.ONBOARDING,
        event_type=event_type,
        title=title,
        actor=actor,
        application=application,
        candidate=application.candidate,
        occurred_at=when,
        **kwargs,
    )


class OnboardingService:
    @staticmethod
    @transaction.atomic
    def start(
        application: Application,
        *,
        start_date: date,
        actor: Any,
        buddy: Any = None,
        hr_contact: Any = None,
        notes: str = "",
        occurred_at: datetime | None = None,
        notify: bool = True,
    ) -> Onboarding:
        """``POST /onboardings``: the candidate accepted; the application moves
        to ``onboarding``."""
        require_active(application, "Starting onboarding")
        if ApplicationStatus.order_index(str(application.status)) < ApplicationStatus.order_index(
            ApplicationStatus.OFFER_ACCEPTED
        ):
            raise InvalidTransition(
                f"{application.candidate.full_name} must have accepted an offer before onboarding "
                f"starts (currently {status_label(str(application.status))})."
            )
        if Onboarding.objects.filter(application=application).exists():
            raise InvalidTransition("Onboarding has already started for this candidate.")
        when = occurred_at or timezone.now()
        previous = str(application.status)
        onboarding = Onboarding.objects.create(
            application=application,
            status=OnboardingStatus.DOCUMENTS_PENDING,
            start_date=start_date,
            buddy=buddy,
            hr_contact=hr_contact or (actor if getattr(actor, "pk", None) else None),
            checklist=default_onboarding_checklist(),
            notes=notes or "",
        )
        stamp(onboarding, occurred_at)
        advance(application, ApplicationStatus.ONBOARDING, actor, when=when, notify=False)
        candidate = application.candidate
        parts = [f"Starts {start_date.strftime('%d %b %Y')}."]
        if buddy is not None:
            parts.append(f"Buddy: {buddy.full_name}.")
        if onboarding.hr_contact is not None:
            parts.append(f"HR contact: {onboarding.hr_contact.full_name}.")
        activity = _record(
            onboarding,
            "onboarding.started",
            f"Onboarding started for {candidate.full_name}",
            actor,
            when,
            description=" ".join(parts),
            metadata=_metadata(onboarding, **{"from": previous, "to": str(application.status)}),
        )
        stamp(activity, occurred_at)
        if notify:
            notify_all(
                [*owners_of(application), buddy],
                NotificationType.ONBOARDING,
                f"Onboarding started: {candidate.full_name}",
                f"Starts {start_date.strftime('%d %b %Y')} on {application.job_description.title}.",
                candidate_link(application) + "&tab=timeline",
                actor,
                occurred_at=occurred_at,
            )
        return onboarding

    @staticmethod
    @transaction.atomic
    def update(
        onboarding: Onboarding,
        data: dict[str, Any],
        actor: Any,
        *,
        occurred_at: datetime | None = None,
    ) -> Onboarding:
        """``PATCH /onboardings/{id}``: checklist toggles (``[{key, done}]``), notes,
        buddy, HR contact, start date. Toggles write one grouped activity."""
        if str(onboarding.status) in (OnboardingStatus.COMPLETED, OnboardingStatus.DROPPED):
            raise InvalidTransition("This onboarding is closed.")
        when = occurred_at or timezone.now()
        changed: list[str] = []
        ticked: list[str] = []
        unticked: list[str] = []
        toggles = {
            entry["key"]: bool(entry.get("done", True)) for entry in data.get("checklist") or []
        }
        if toggles:
            checklist = []
            for item in onboarding.checklist:
                key = item.get("key")
                if key in toggles and bool(item.get("done")) != toggles[key]:
                    item = {**item, "done": toggles[key]}
                    item["done_at"] = when.isoformat() if toggles[key] else None
                    (ticked if toggles[key] else unticked).append(str(item.get("label", key)))
                checklist.append(item)
            if ticked or unticked:
                onboarding.checklist = checklist
                changed.append("checklist")
        for name in ("notes", "buddy", "hr_contact", "start_date"):
            if name in data and data[name] != getattr(onboarding, name):
                setattr(onboarding, name, data[name])
                changed.append(name)
        if data.get("status") == OnboardingStatus.DROPPED:
            onboarding.status = OnboardingStatus.DROPPED
            changed.append("status")
        elif changed:
            derived = _derive_status(onboarding)
            if derived != str(onboarding.status):
                onboarding.status = derived
                changed.append("status")
        if not changed:
            return onboarding
        onboarding.save(update_fields=[*dict.fromkeys(changed), "updated_at"])
        application = onboarding.application
        touch(application, when)
        if ticked or unticked:
            done, total = checklist_progress(onboarding.checklist)
            bits = []
            if ticked:
                bits.append(f"completed {join_names(ticked)}")
            if unticked:
                bits.append(f"reopened {join_names(unticked)}")
            activity = _record(
                onboarding,
                "onboarding.checklist_updated",
                f"{actor_name(actor)} {' and '.join(bits)} for {application.candidate.full_name}",
                actor,
                when,
                description=f"{done} of {total} checklist items done.",
                metadata=_metadata(onboarding, ticked=ticked, unticked=unticked),
            )
            stamp(activity, occurred_at)
        return onboarding

    @staticmethod
    @transaction.atomic
    def complete(
        onboarding: Onboarding,
        *,
        actor: Any,
        occurred_at: datetime | None = None,
        notify: bool = True,
    ) -> Onboarding:
        """``POST /onboardings/{id}/complete``: ticks whatever is left, moves the
        application to ``onboarded`` and tells every participant (plan.md 6.8)."""
        if str(onboarding.status) == OnboardingStatus.COMPLETED:
            raise InvalidTransition("Onboarding is already complete.")
        if str(onboarding.status) == OnboardingStatus.DROPPED:
            raise InvalidTransition("A dropped onboarding cannot be completed.")
        when = occurred_at or timezone.now()
        application = onboarding.application
        previous = str(application.status)
        onboarding.checklist = [
            {**item, "done": True, "done_at": item.get("done_at") or when.isoformat()}
            for item in onboarding.checklist
        ]
        onboarding.status = OnboardingStatus.COMPLETED
        onboarding.completed_at = when
        onboarding.save(update_fields=["checklist", "status", "completed_at", "updated_at"])
        advance(application, ApplicationStatus.ONBOARDED, actor, when=when, notify=False)
        candidate = application.candidate
        activity = _record(
            onboarding,
            "onboarding.completed",
            f"{candidate.full_name} successfully onboarded",
            actor,
            when,
            description="All checklist items complete; day-one orientation done.",
            metadata=_metadata(onboarding, **{"from": previous, "to": str(application.status)}),
        )
        stamp(activity, occurred_at)
        if notify:
            notify_all(
                [*participants_of(application), application.owner, onboarding.buddy],
                NotificationType.ONBOARDING,
                f"{candidate.full_name} is onboarded",
                f"Joined as {application.job_description.title}.",
                candidate_link(application) + "&tab=timeline",
                actor,
                occurred_at=occurred_at,
            )
        return onboarding
