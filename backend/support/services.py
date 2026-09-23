"""``TicketService``: raise, edit, assign, comment on and move support tickets.
Every change writes one ``TicketEvent`` (the ticket's timeline) and tells the
people involved through ``notifications.services.notify_all``."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from django.db import connection, transaction
from django.utils import timezone

from accounts.models import User
from common.enums import (
    NotificationType,
    TicketCategory,
    TicketEventKind,
    TicketPriority,
    TicketStatus,
    UserRole,
)
from notifications.services import notify_all
from support.exceptions import InvalidTicketMove
from support.models import Ticket, TicketEvent
from support.permissions import allowed_moves, note_required

# Roles that make up the support team; they hear about every new ticket.
AGENT_ROLES: tuple[str, ...] = (UserRole.HR_ADMIN,)
NUMBER_SEQUENCE = "support_ticket_number_seq"
NUMBER_PREFIX = "SUP"
PREVIEW_CHARS = 140

STATUS_TITLES: dict[str, str] = {
    TicketStatus.IN_PROGRESS: "{name} started work on the ticket",
    TicketStatus.RESOLVED: "{name} resolved the ticket",
    TicketStatus.CLOSED: "{name} closed the ticket",
}
EDITABLE_FIELDS: tuple[str, ...] = ("subject", "description", "category", "job_description")


def next_number() -> str:
    """``SUP-1042``: one step of the database sequence, so two tickets raised at
    the same moment never share a number and a number is never reused."""
    with connection.cursor() as cursor:
        cursor.execute(f"SELECT nextval('{NUMBER_SEQUENCE}')")
        (value,) = cursor.fetchone()
    return f"{NUMBER_PREFIX}-{value}"


def ticket_link(ticket: Ticket) -> str:
    return f"/support/{ticket.pk}"


def agents() -> list[User]:
    return list(User.objects.filter(role__in=AGENT_ROLES, is_active=True))


def actor_name(actor: Any) -> str:
    return getattr(actor, "full_name", None) or "System"


def person_ref(user: Any) -> dict[str, Any] | None:
    if user is None:
        return None
    return {"id": str(user.pk), "name": user.full_name, "avatar_url": user.avatar_url}


def status_label(status: str) -> str:
    return str(TicketStatus(status).label)


def priority_label(priority: str) -> str:
    return str(TicketPriority(priority).label)


def _preview(text: str) -> str:
    text = " ".join(text.split())
    return text if len(text) <= PREVIEW_CHARS else text[: PREVIEW_CHARS - 1] + "…"


def _stamp(row: Any, when: datetime | None) -> None:
    """Backdate ``created_at``/``updated_at`` (seeded history only)."""
    if when is None:
        return
    type(row).objects.filter(pk=row.pk).update(created_at=when, updated_at=when)
    row.created_at = row.updated_at = when


def _event(
    ticket: Ticket,
    kind: str,
    actor: Any,
    title: str,
    *,
    message: str = "",
    metadata: dict[str, Any] | None = None,
    when: datetime | None = None,
) -> TicketEvent:
    moment = when or timezone.now()
    row = TicketEvent.objects.create(
        ticket=ticket,
        kind=kind,
        actor=actor if getattr(actor, "pk", None) else None,
        title=title[:200],
        message=message or "",
        metadata=metadata or {},
        occurred_at=moment,
    )
    _stamp(row, when)
    ticket.last_activity_at = moment
    ticket.save(update_fields=["last_activity_at", "updated_at"])
    return row


def _watchers(ticket: Ticket) -> list[Any]:
    """Who hears about a change: the requester, the assignee, and the support
    team while nobody has picked the ticket up."""
    people = [ticket.requester, ticket.assignee]
    if ticket.assignee_id is None:
        people.extend(agents())
    return people


class TicketService:
    @staticmethod
    @transaction.atomic
    def create(
        *,
        requester: Any,
        subject: str,
        description: str,
        category: str = TicketCategory.OTHER,
        priority: str = TicketPriority.MEDIUM,
        job_description: Any = None,
        occurred_at: datetime | None = None,
        notify: bool = True,
    ) -> Ticket:
        """``POST /support/tickets``: a new ticket with a fresh number, an
        opening timeline entry, and a heads-up to the support team."""
        ticket = Ticket.objects.create(
            number=next_number(),
            subject=subject.strip(),
            description=description.strip(),
            category=category,
            priority=priority,
            requester=requester,
            job_description=job_description,
            last_activity_at=occurred_at or timezone.now(),
        )
        _stamp(ticket, occurred_at)
        _event(
            ticket,
            TicketEventKind.CREATED,
            requester,
            f"{actor_name(requester)} raised {ticket.number}",
            metadata={"priority": str(priority), "category": str(category)},
            when=occurred_at,
        )
        if notify:
            notify_all(
                agents(),
                NotificationType.SUPPORT,
                f"New ticket {ticket.number}: {ticket.subject}",
                f"{priority_label(priority)} priority · {TicketCategory(category).label} · "
                f"raised by {actor_name(requester)}",
                ticket_link(ticket),
                actor=requester,
                occurred_at=occurred_at,
            )
        return ticket

    @staticmethod
    @transaction.atomic
    def update(ticket: Ticket, data: dict[str, Any], actor: Any) -> Ticket:
        """``PATCH /support/tickets/{id}``: the details, with a priority change
        recorded as its own timeline entry."""
        changes: dict[str, dict[str, Any]] = {}
        for field_name in EDITABLE_FIELDS:
            if field_name not in data:
                continue
            new = data[field_name]
            if isinstance(new, str):
                new = new.strip()
            old = getattr(ticket, field_name)
            if old == new:
                continue
            changes[field_name] = {
                "from": _plain(old),
                "to": _plain(new),
            }
            setattr(ticket, field_name, new)
        priority = data.get("priority")
        priority_changed = priority is not None and str(priority) != str(ticket.priority)
        if not changes and not priority_changed:
            return ticket
        previous_priority = str(ticket.priority)
        if priority_changed:
            ticket.priority = priority
        ticket.save()
        if changes:
            _event(
                ticket,
                TicketEventKind.EDIT,
                actor,
                f"{actor_name(actor)} edited the ticket",
                metadata={"changes": changes},
            )
        if priority_changed:
            _event(
                ticket,
                TicketEventKind.PRIORITY,
                actor,
                f"{actor_name(actor)} changed the priority from "
                f"{priority_label(previous_priority)} to {priority_label(str(priority))}",
                metadata={"from": previous_priority, "to": str(priority)},
            )
            notify_all(
                _watchers(ticket),
                NotificationType.SUPPORT,
                f"{ticket.number} is now {priority_label(str(priority))} priority",
                ticket.subject,
                ticket_link(ticket),
                actor=actor,
            )
        elif ticket.assignee_id is not None:
            notify_all(
                [ticket.assignee],
                NotificationType.SUPPORT,
                f"{ticket.number} was updated by {actor_name(actor)}",
                ticket.subject,
                ticket_link(ticket),
                actor=actor,
            )
        return ticket

    @staticmethod
    @transaction.atomic
    def assign(
        ticket: Ticket,
        assignee: Any,
        actor: Any,
        *,
        occurred_at: datetime | None = None,
        notify: bool = True,
    ) -> Ticket:
        """``POST /support/tickets/{id}/assign``: hand the ticket to someone (or
        to nobody). A closed ticket stays as it is."""
        if str(ticket.status) == TicketStatus.CLOSED:
            raise InvalidTicketMove("A closed ticket cannot be reassigned; reopen it first.")
        previous = ticket.assignee
        if (previous.pk if previous else None) == (assignee.pk if assignee else None):
            return ticket
        ticket.assignee = assignee
        ticket.save(update_fields=["assignee", "updated_at"])
        name = actor_name(actor)
        if assignee is None:
            title = f"{name} removed the assignee"
        elif getattr(actor, "pk", None) == assignee.pk:
            title = f"{name} took the ticket"
        else:
            title = f"{name} assigned the ticket to {assignee.full_name}"
        _event(
            ticket,
            TicketEventKind.ASSIGNMENT,
            actor,
            title,
            metadata={"from": person_ref(previous), "to": person_ref(assignee)},
            when=occurred_at,
        )
        if notify and assignee is not None:
            notify_all(
                [assignee],
                NotificationType.SUPPORT,
                f"{ticket.number} assigned to you: {ticket.subject}",
                f"{priority_label(str(ticket.priority))} priority · "
                f"raised by {ticket.requester.full_name}",
                ticket_link(ticket),
                actor=actor,
                occurred_at=occurred_at,
            )
            notify_all(
                [ticket.requester],
                NotificationType.SUPPORT,
                f"{ticket.number} is being handled by {assignee.full_name}",
                ticket.subject,
                ticket_link(ticket),
                actor=actor,
                occurred_at=occurred_at,
            )
        return ticket

    @staticmethod
    @transaction.atomic
    def comment(
        ticket: Ticket,
        actor: Any,
        message: str,
        *,
        occurred_at: datetime | None = None,
        notify: bool = True,
    ) -> TicketEvent:
        """``POST /support/tickets/{id}/comments``."""
        if str(ticket.status) == TicketStatus.CLOSED:
            raise InvalidTicketMove("The ticket is closed; reopen it to add to the conversation.")
        row = _event(
            ticket,
            TicketEventKind.COMMENT,
            actor,
            f"{actor_name(actor)} commented",
            message=message.strip(),
            when=occurred_at,
        )
        if notify:
            notify_all(
                _watchers(ticket),
                NotificationType.SUPPORT,
                f"{actor_name(actor)} commented on {ticket.number}",
                _preview(message),
                ticket_link(ticket),
                actor=actor,
                occurred_at=occurred_at,
            )
        return row

    @staticmethod
    @transaction.atomic
    def transition(
        ticket: Ticket,
        to_status: str,
        actor: Any,
        note: str = "",
        *,
        occurred_at: datetime | None = None,
        notify: bool = True,
    ) -> Ticket:
        """``POST /support/tickets/{id}/transition``: open -> in progress ->
        resolved -> closed, with reopening from resolved or closed. Resolving
        stores the note as the ticket's resolution; starting work on an
        unassigned ticket assigns it to the actor."""
        from_status = str(ticket.status)
        note = (note or "").strip()
        if to_status not in allowed_moves(actor, ticket):
            raise InvalidTicketMove(
                f"You cannot move this ticket from {status_label(from_status)} "
                f"to {status_label(to_status)}."
            )
        if note_required(from_status, to_status) and not note:
            what = "resolution" if to_status == TicketStatus.RESOLVED else "reason"
            raise InvalidTicketMove(
                f"Add a {what} before marking the ticket {status_label(to_status)}."
            )
        moment = occurred_at or timezone.now()
        ticket.status = to_status
        if to_status == TicketStatus.RESOLVED:
            ticket.resolution = note
            ticket.resolved_at = moment
            ticket.closed_at = None
        elif to_status == TicketStatus.CLOSED:
            ticket.closed_at = moment
        elif to_status == TicketStatus.OPEN:
            ticket.resolved_at = None
            ticket.closed_at = None
        if to_status == TicketStatus.IN_PROGRESS and ticket.assignee_id is None:
            ticket.assignee = actor if getattr(actor, "pk", None) else None
        ticket.save()

        name = actor_name(actor)
        if to_status == TicketStatus.OPEN:
            title = (
                f"{name} reopened the ticket"
                if from_status in (TicketStatus.RESOLVED, TicketStatus.CLOSED)
                else f"{name} put the ticket back to Open"
            )
        else:
            title = STATUS_TITLES[to_status].format(name=name)
        _event(
            ticket,
            TicketEventKind.STATUS,
            actor,
            title,
            message=note,
            metadata={"from": from_status, "to": to_status},
            when=occurred_at,
        )
        if notify:
            headline = {
                TicketStatus.IN_PROGRESS: f"{ticket.number} is being worked on",
                TicketStatus.RESOLVED: f"{ticket.number} has been resolved",
                TicketStatus.CLOSED: f"{ticket.number} was closed",
                TicketStatus.OPEN: f"{ticket.number} was reopened",
            }[to_status]
            notify_all(
                _watchers(ticket),
                NotificationType.SUPPORT,
                headline,
                _preview(note) if note else ticket.subject,
                ticket_link(ticket),
                actor=actor,
                occurred_at=occurred_at,
            )
        return ticket


def _plain(value: Any) -> Any:
    """A JSON-friendly copy of a field value for the change record."""
    if value is None or isinstance(value, str | int | float | bool):
        return value
    if hasattr(value, "title"):  # a job description
        return {"id": str(value.pk), "title": value.title}
    return str(value)
