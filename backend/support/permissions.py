"""Who may do what with a support ticket, as pure predicates.

Capability                    hr_admin (support team)   requester         assignee
See a ticket                  all                       own               assigned
Raise a ticket                yes                       everyone          -
Edit subject / description    yes (until closed)        yes (until closed) no
Comment                       yes (until closed)        yes (until closed) yes (until closed)
Assign                        yes                       no                no
Start work (open -> in progress)  yes                   no                yes
Resolve                       yes                       no                yes
Close                         yes                       yes               no
Reopen (resolved / closed)    yes                       yes               no
"""

from __future__ import annotations

from typing import Any

from common.enums import TicketStatus
from common.permissions import is_hr_admin, role_of
from support.models import Ticket


def is_agent(user: Any) -> bool:
    """The support team: HR admins."""
    return is_hr_admin(user)


def is_requester(user: Any, ticket: Ticket) -> bool:
    return role_of(user) is not None and ticket.requester_id == user.id


def is_assignee(user: Any, ticket: Ticket) -> bool:
    return role_of(user) is not None and ticket.assignee_id == user.id


def can_view_ticket(user: Any, ticket: Ticket) -> bool:
    return is_agent(user) or is_requester(user, ticket) or is_assignee(user, ticket)


def _is_closed(ticket: Ticket) -> bool:
    return str(ticket.status) == TicketStatus.CLOSED


def can_edit_ticket(user: Any, ticket: Ticket) -> bool:
    """Subject, description, category, priority and the related job description."""
    return (is_agent(user) or is_requester(user, ticket)) and not _is_closed(ticket)


def can_comment_ticket(user: Any, ticket: Ticket) -> bool:
    return can_view_ticket(user, ticket) and not _is_closed(ticket)


def can_assign_ticket(user: Any, ticket: Ticket) -> bool:
    return is_agent(user) and not _is_closed(ticket)


def allowed_moves(user: Any, ticket: Ticket) -> list[str]:
    """The statuses ``user`` may move ``ticket`` into, in the order the buttons show."""
    status = str(ticket.status)
    agent = is_agent(user)
    requester = is_requester(user, ticket)
    assignee = is_assignee(user, ticket)
    moves: list[str] = []
    if status == TicketStatus.OPEN:
        if agent or assignee:
            moves += [TicketStatus.IN_PROGRESS, TicketStatus.RESOLVED]
        if agent or requester:
            moves.append(TicketStatus.CLOSED)
    elif status == TicketStatus.IN_PROGRESS:
        if agent or assignee:
            moves += [TicketStatus.RESOLVED, TicketStatus.OPEN]
        if agent or requester:
            moves.append(TicketStatus.CLOSED)
    elif status == TicketStatus.RESOLVED:
        if agent or requester:
            moves += [TicketStatus.CLOSED, TicketStatus.OPEN]
        elif assignee:
            moves.append(TicketStatus.OPEN)
    elif status == TicketStatus.CLOSED:
        if agent or requester:
            moves.append(TicketStatus.OPEN)
    return list(dict.fromkeys(moves))


def note_required(from_status: str, to_status: str) -> bool:
    """A resolution, a reason to reopen, and a reason to close something unanswered."""
    if to_status == TicketStatus.RESOLVED:
        return True
    if to_status == TicketStatus.OPEN:
        return from_status in (TicketStatus.RESOLVED, TicketStatus.CLOSED)
    if to_status == TicketStatus.CLOSED:
        return from_status != TicketStatus.RESOLVED
    return False
