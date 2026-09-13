"""``OfferService``: draft, send, accept, decline and withdraw offers
(plan.md 6.3 pipeline.Offer, 6.5 triggers, 6.8 notifications)."""

from __future__ import annotations

from datetime import date, datetime
from typing import Any

from django.db import transaction
from django.utils import timezone

from activity.services import record_activity
from common.enums import ActivityCategory, ApplicationStatus, NotificationType, OfferStatus
from notifications.services import notify_all
from pipeline.exceptions import InvalidTransition
from pipeline.models import Application, Offer
from pipeline.services._common import (
    actor_name,
    advance,
    candidate_link,
    owners_of,
    require_active,
    stamp,
    status_label,
    touch,
)
from pipeline.services.pipeline import PipelineService

EDITABLE_STATUSES: frozenset[str] = frozenset(
    {OfferStatus.DRAFT, OfferStatus.SENT, OfferStatus.NEGOTIATING}
)
OPEN_STATUSES: frozenset[str] = frozenset({OfferStatus.SENT, OfferStatus.NEGOTIATING})
EDITABLE_FIELDS = (
    "designation",
    "annual_ctc",
    "currency",
    "joining_date",
    "expires_at",
    "notes",
)


def format_ctc(amount: int, currency: str = "INR") -> str:
    """``2600000`` -> ``₹26,00,000`` (Indian grouping) for INR, plain grouping otherwise."""
    if currency != "INR":
        return f"{currency} {amount:,}"
    text = str(int(amount))
    if len(text) <= 3:
        return f"₹{text}"
    head, tail = text[:-3], text[-3:]
    groups = []
    while len(head) > 2:
        groups.insert(0, head[-2:])
        head = head[:-2]
    if head:
        groups.insert(0, head)
    return "₹" + ",".join([*groups, tail])


def _metadata(offer: Offer, **extra: Any) -> dict[str, Any]:
    return {
        "offer_id": str(offer.pk),
        "status": str(offer.status),
        "designation": offer.designation,
        "annual_ctc": offer.annual_ctc,
        "currency": offer.currency,
        "joining_date": offer.joining_date.isoformat(),
        "expires_at": offer.expires_at.isoformat() if offer.expires_at else "",
        **extra,
    }


def _record(offer: Offer, event_type: str, title: str, actor: Any, when, **kwargs: Any):
    application = offer.application
    row = record_activity(
        job_description=application.job_description,
        category=ActivityCategory.OFFER,
        event_type=event_type,
        title=title,
        actor=actor,
        application=application,
        candidate=application.candidate,
        occurred_at=when,
        **kwargs,
    )
    return row


class OfferService:
    @staticmethod
    @transaction.atomic
    def create(
        application: Application,
        *,
        designation: str,
        annual_ctc: int,
        joining_date: date,
        actor: Any,
        currency: str = "INR",
        expires_at: datetime | None = None,
        notes: str = "",
        send: bool = False,
        occurred_at: datetime | None = None,
        notify: bool = True,
    ) -> Offer:
        """``POST /offers``: a draft for a selected candidate; ``send`` releases it at once."""
        require_active(application, "Making an offer")
        if ApplicationStatus.order_index(str(application.status)) < ApplicationStatus.order_index(
            ApplicationStatus.SELECTED
        ):
            raise InvalidTransition(
                f"{application.candidate.full_name} must be Selected before an offer is made "
                f"(currently {status_label(str(application.status))})."
            )
        if Offer.objects.filter(application=application).exists():
            raise InvalidTransition("This candidate already has an offer on this job description.")
        when = occurred_at or timezone.now()
        offer = Offer.objects.create(
            application=application,
            status=OfferStatus.DRAFT,
            designation=designation.strip(),
            annual_ctc=annual_ctc,
            currency=currency or "INR",
            joining_date=joining_date,
            expires_at=expires_at,
            notes=notes or "",
            created_by=actor,
        )
        stamp(offer, occurred_at)
        touch(application, when)
        if send:
            # One "Offer sent" event tells the story; the draft step is implicit.
            OfferService.send(offer, actor=actor, occurred_at=occurred_at, notify=notify)
            return offer
        candidate = application.candidate
        activity = _record(
            offer,
            "offer.created",
            f"{actor_name(actor)} drafted an offer for {candidate.full_name}",
            actor,
            when,
            description=f"{offer.designation}, {format_ctc(annual_ctc, offer.currency)} per year.",
            metadata=_metadata(offer, to=str(application.status)),
        )
        stamp(activity, occurred_at)
        return offer

    @staticmethod
    @transaction.atomic
    def send(
        offer: Offer,
        *,
        actor: Any,
        occurred_at: datetime | None = None,
        notify: bool = True,
    ) -> Offer:
        if str(offer.status) != OfferStatus.DRAFT:
            raise InvalidTransition("Only a draft offer can be sent.")
        when = occurred_at or timezone.now()
        application = offer.application
        previous = str(application.status)
        offer.status = OfferStatus.SENT
        offer.sent_at = when
        offer.save(update_fields=["status", "sent_at", "updated_at"])
        advance(application, ApplicationStatus.OFFER_SENT, actor, when=when, notify=False)
        candidate = application.candidate
        joining = offer.joining_date.strftime("%d %b %Y")
        activity = _record(
            offer,
            "offer.sent",
            f"Offer sent to {candidate.full_name}",
            actor,
            when,
            description=(
                f"{offer.designation}, {format_ctc(offer.annual_ctc, offer.currency)} per year, "
                f"joining {joining}."
            ),
            metadata=_metadata(offer, **{"from": previous, "to": str(application.status)}),
        )
        stamp(activity, occurred_at)
        if notify:
            notify_all(
                owners_of(application),
                NotificationType.OFFER,
                f"Offer sent to {candidate.full_name}",
                f"{offer.designation}, {format_ctc(offer.annual_ctc, offer.currency)}.",
                candidate_link(application) + "&tab=timeline",
                actor,
                occurred_at=occurred_at,
            )
        return offer

    @staticmethod
    @transaction.atomic
    def accept(
        offer: Offer,
        *,
        actor: Any,
        note: str = "",
        occurred_at: datetime | None = None,
        notify: bool = True,
    ) -> Offer:
        if str(offer.status) not in OPEN_STATUSES:
            raise InvalidTransition("Only a sent offer can be accepted.")
        when = occurred_at or timezone.now()
        application = offer.application
        previous = str(application.status)
        offer.status = OfferStatus.ACCEPTED
        offer.responded_at = when
        offer.save(update_fields=["status", "responded_at", "updated_at"])
        advance(application, ApplicationStatus.OFFER_ACCEPTED, actor, when=when, notify=False)
        candidate = application.candidate
        activity = _record(
            offer,
            "offer.accepted",
            f"{candidate.full_name} accepted the offer",
            actor,
            when,
            description=note or "Signed offer letter received.",
            metadata=_metadata(
                offer, note=note, **{"from": previous, "to": str(application.status)}
            ),
        )
        stamp(activity, occurred_at)
        if notify:
            notify_all(
                owners_of(application),
                NotificationType.OFFER,
                f"{candidate.full_name} accepted the offer",
                f"Joining {offer.joining_date.strftime('%d %b %Y')} as {offer.designation}.",
                candidate_link(application) + "&tab=timeline",
                actor,
                occurred_at=occurred_at,
            )
        return offer

    @staticmethod
    @transaction.atomic
    def decline(
        offer: Offer,
        *,
        actor: Any,
        reason: str = "",
        occurred_at: datetime | None = None,
        notify: bool = True,
    ) -> Offer:
        """The candidate turned the offer down: the application is withdrawn
        with the reason "Offer declined" (plan.md 6.5)."""
        if str(offer.status) not in OPEN_STATUSES:
            raise InvalidTransition("Only a sent offer can be declined.")
        when = occurred_at or timezone.now()
        application = offer.application
        previous = str(application.status)
        offer.status = OfferStatus.DECLINED
        offer.responded_at = when
        offer.save(update_fields=["status", "responded_at", "updated_at"])
        full_reason = "Offer declined" + (f": {reason}" if reason else "")
        PipelineService.transition(
            application,
            ApplicationStatus.WITHDRAWN,
            actor,
            reason=full_reason,
            occurred_at=when,
            notify=False,
            record=False,
        )
        candidate = application.candidate
        activity = _record(
            offer,
            "offer.declined",
            f"{candidate.full_name} declined the offer",
            actor,
            when,
            description=reason,
            metadata=_metadata(
                offer, reason=reason, **{"from": previous, "to": str(application.status)}
            ),
        )
        stamp(activity, occurred_at)
        if notify:
            notify_all(
                owners_of(application),
                NotificationType.OFFER,
                f"{candidate.full_name} declined the offer",
                reason,
                candidate_link(application) + "&tab=timeline",
                actor,
                occurred_at=occurred_at,
            )
        return offer

    @staticmethod
    @transaction.atomic
    def withdraw(
        offer: Offer,
        *,
        actor: Any,
        reason: str = "",
        occurred_at: datetime | None = None,
        notify: bool = True,
    ) -> Offer:
        """The company pulled the offer; the application stays where it is so HR
        can decide what happens next."""
        if str(offer.status) not in EDITABLE_STATUSES:
            raise InvalidTransition("This offer can no longer be withdrawn.")
        when = occurred_at or timezone.now()
        application = offer.application
        offer.status = OfferStatus.WITHDRAWN
        offer.responded_at = when
        offer.save(update_fields=["status", "responded_at", "updated_at"])
        touch(application, when)
        candidate = application.candidate
        activity = _record(
            offer,
            "offer.withdrawn",
            f"{actor_name(actor)} withdrew the offer to {candidate.full_name}",
            actor,
            when,
            description=reason,
            metadata=_metadata(offer, reason=reason, to=str(application.status)),
        )
        stamp(activity, occurred_at)
        if notify:
            notify_all(
                owners_of(application),
                NotificationType.OFFER,
                f"Offer to {candidate.full_name} withdrawn",
                reason,
                candidate_link(application) + "&tab=timeline",
                actor,
                occurred_at=occurred_at,
            )
        return offer

    @staticmethod
    @transaction.atomic
    def update(offer: Offer, data: dict[str, Any], actor: Any) -> Offer:
        """``PATCH /offers/{id}``: terms while the offer is still open; ``status``
        may only flip between sent and negotiating."""
        if str(offer.status) not in EDITABLE_STATUSES:
            raise InvalidTransition("A closed offer cannot be edited.")
        changed: list[str] = []
        for name in EDITABLE_FIELDS:
            if name in data and data[name] != getattr(offer, name):
                setattr(offer, name, data[name])
                changed.append(name)
        status = data.get("status")
        if status and status != str(offer.status):
            if str(offer.status) == OfferStatus.DRAFT or status not in OPEN_STATUSES:
                raise InvalidTransition(
                    "Use send, accept, decline or withdraw to change the status."
                )
            offer.status = status
            changed.append("status")
        if changed:
            offer.save(update_fields=[*changed, "updated_at"])
            touch(offer.application)
        return offer
