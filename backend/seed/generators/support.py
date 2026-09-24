"""A handful of support tickets so the Support page has a history to show:
open, in progress, resolved and closed, raised by different people and worked
by the admins (the support desk), replayed through ``TicketService`` with backdated moments so
the timelines and notifications read like a real few weeks.

Idempotent: when any seeded ticket already exists nothing is written, so the
generator can also be run on its own against an existing database.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, time, timedelta

from accounts.models import User
from common.enums import TicketCategory, TicketPriority, TicketStatus
from seed.context import SeedContext
from support.models import Ticket
from support.services import TicketService

# Notifications only for the last ten days, like the pipeline history.
NOTIFY_WINDOW = timedelta(days=10)


@dataclass(frozen=True)
class Step:
    """One later moment on a ticket: a comment, an assignment or a status move."""

    hours_later: float
    by: str  # email
    comment: str = ""
    assign_to: str | None = None
    status: str | None = None
    note: str = ""


@dataclass(frozen=True)
class TicketSpec:
    days_ago: int
    at: time
    requester: str
    subject: str
    description: str
    category: str
    priority: str
    steps: tuple[Step, ...] = field(default_factory=tuple)


RAHUL = "rahul@aimious.demo"
PRIYA = "priya@aimious.demo"
KARTHIK = "karthik@aimious.demo"
ANITHA = "anitha@aimious.demo"
ARUN = "arun@aimious.demo"
DIVYA = "divya@aimious.demo"
SURESH = "suresh@aimious.demo"
NISHA = "nisha@aimious.demo"
VIKRAM = "vikram@aimious.demo"
LAKSHMI = "lakshmi@aimious.demo"
MEERA = "meera@aimious.demo"
ARJUN = "arjun@aimious.demo"

TICKETS: tuple[TicketSpec, ...] = (
    TicketSpec(
        days_ago=24,
        at=time(10, 5),
        requester=DIVYA,
        subject="Cannot open the interview feedback form",
        description=(
            "When I open my Technical interview for the Senior Python Developer role and press "
            "Submit feedback, the page shows a permission error. I am the assigned interviewer."
        ),
        category=TicketCategory.ACCESS,
        priority=TicketPriority.HIGH,
        steps=(
            Step(1.5, MEERA, assign_to=MEERA),
            Step(1.6, MEERA, status=TicketStatus.IN_PROGRESS),
            Step(3, MEERA, comment="Checking the participant list on the JD, one moment."),
            Step(
                5,
                MEERA,
                status=TicketStatus.RESOLVED,
                note=(
                    "You were listed on the role as an Observer, not an Interviewer. "
                    "Changed your role in the recruitment; the form opens now."
                ),
            ),
            Step(26, DIVYA, comment="Works now, thank you."),
            Step(26.2, DIVYA, status=TicketStatus.CLOSED),
        ),
    ),
    TicketSpec(
        days_ago=19,
        at=time(15, 40),
        requester=KARTHIK,
        subject="Duplicate candidate records after the last resume upload",
        description=(
            "Two of the resumes I uploaded yesterday created a second profile for people who "
            "were already in the internal database (different email spelling). Can they be merged?"
        ),
        category=TicketCategory.CANDIDATE_DATA,
        priority=TicketPriority.MEDIUM,
        steps=(
            Step(2, ARJUN, assign_to=ARJUN),
            Step(2.1, ARJUN, status=TicketStatus.IN_PROGRESS),
            Step(
                20,
                ARJUN,
                status=TicketStatus.RESOLVED,
                note=(
                    "Merged both pairs into the original profiles and kept the newer resumes. "
                    "The upload page now warns when an email differs only by case."
                ),
            ),
            Step(44, KARTHIK, status=TicketStatus.CLOSED),
        ),
    ),
    TicketSpec(
        days_ago=12,
        at=time(9, 20),
        requester=ARUN,
        subject="Add a System Design round to the DevOps Engineer pipeline",
        description=(
            "We agreed with Platform that DevOps candidates get a system design round before "
            "the managerial one. Please add it to the interview rounds for the open role."
        ),
        category=TicketCategory.INTERVIEWS,
        priority=TicketPriority.MEDIUM,
        steps=(
            Step(4, MEERA, assign_to=PRIYA),
            Step(6, PRIYA, status=TicketStatus.IN_PROGRESS),
            Step(
                7,
                PRIYA,
                comment=(
                    "Added System Design as round 2 for everyone still in screening. "
                    "The three candidates already past technical keep their sequence."
                ),
            ),
            Step(
                7.5,
                PRIYA,
                status=TicketStatus.RESOLVED,
                note="System Design round added to the DevOps Engineer pipeline.",
            ),
        ),
    ),
    TicketSpec(
        days_ago=8,
        at=time(11, 10),
        requester=VIKRAM,
        subject="Request access to the AI Engineer job description",
        description=(
            "I am the product owner for the AI features and would like to see the AI Engineer "
            "pipeline and leave comments on the timeline."
        ),
        category=TicketCategory.ACCESS,
        priority=TicketPriority.LOW,
        steps=(
            Step(3, MEERA, assign_to=MEERA),
            Step(3.2, MEERA, status=TicketStatus.IN_PROGRESS),
            Step(
                5,
                MEERA,
                comment="Added you as an Observer on the role. Comments need HR access, though.",
            ),
            Step(
                5.1,
                MEERA,
                status=TicketStatus.RESOLVED,
                note="Added as Observer on AI Engineer; comments stay with HR staff.",
            ),
        ),
    ),
    TicketSpec(
        days_ago=5,
        at=time(16, 30),
        requester=ANITHA,
        subject="Offer letter shows the wrong joining date",
        description=(
            "The offer sent to the Data Scientist candidate shows a joining date of the 1st "
            "but we agreed the 15th on the call. The candidate has asked for a corrected letter."
        ),
        category=TicketCategory.OFFERS,
        priority=TicketPriority.URGENT,
        steps=(
            Step(0.5, ARJUN, assign_to=ARJUN),
            Step(0.6, ARJUN, status=TicketStatus.IN_PROGRESS),
            Step(
                2,
                ARJUN,
                comment=(
                    "Corrected the joining date on the offer. Please re-send it from the "
                    "candidate's page so the timeline records the new version."
                ),
            ),
            Step(3, ANITHA, comment="Re-sent, the candidate has confirmed. Thanks!"),
        ),
    ),
    TicketSpec(
        days_ago=3,
        at=time(13, 15),
        requester=NISHA,
        subject="Search results are slow for the DevOps role",
        description=(
            "Search Candidates takes over a minute for the DevOps Engineer role and sometimes "
            "shows the busy-model message. Other roles come back in a few seconds."
        ),
        category=TicketCategory.TECHNICAL,
        priority=TicketPriority.HIGH,
        steps=(
            Step(2, MEERA, assign_to=MEERA),
            Step(2.1, MEERA, status=TicketStatus.IN_PROGRESS),
            Step(
                4,
                MEERA,
                comment=(
                    "The role lists 14 required skills, so the AI evaluation runs on a much "
                    "larger pool. Trimming to the eight that matter should bring it back down; "
                    "I have asked the model provider about the busy responses too."
                ),
            ),
        ),
    ),
    TicketSpec(
        days_ago=1,
        at=time(10, 45),
        requester=LAKSHMI,
        subject="Export a candidate list for the frontend hiring review",
        description=(
            "For Thursday's review I need the React Developer II shortlist as a spreadsheet: "
            "name, current company, experience, match percentage and stage."
        ),
        category=TicketCategory.FEATURE_REQUEST,
        priority=TicketPriority.MEDIUM,
    ),
    TicketSpec(
        days_ago=0,
        at=time(9, 30),
        requester=SURESH,
        subject="Two interviews booked at the same time on Friday",
        description=(
            "I have a Data Scientist technical round and an AI Engineer system design round "
            "both at 11:00 on Friday. Could one of them move to the afternoon?"
        ),
        category=TicketCategory.INTERVIEWS,
        priority=TicketPriority.HIGH,
    ),
)


def seed_support_tickets(ctx: SeedContext, users: dict[str, User]) -> list[Ticket]:
    if Ticket.objects.filter(subject__in=[spec.subject for spec in TICKETS]).exists():
        return list(Ticket.objects.filter(subject__in=[spec.subject for spec in TICKETS]))
    rows: list[Ticket] = []
    for spec in TICKETS:
        raised_at = ctx.days_before_anchor(spec.days_ago, spec.at)
        ticket = TicketService.create(
            requester=users[spec.requester],
            subject=spec.subject,
            description=spec.description,
            category=spec.category,
            priority=spec.priority,
            occurred_at=raised_at,
            notify=_notify(ctx, raised_at),
        )
        for step in spec.steps:
            when = _clamp(ctx, raised_at + timedelta(hours=step.hours_later))
            actor = users[step.by]
            if step.assign_to:
                TicketService.assign(
                    ticket,
                    users[step.assign_to],
                    actor,
                    occurred_at=when,
                    notify=_notify(ctx, when),
                )
            if step.comment:
                TicketService.comment(
                    ticket, actor, step.comment, occurred_at=when, notify=_notify(ctx, when)
                )
            if step.status:
                TicketService.transition(
                    ticket,
                    step.status,
                    actor,
                    step.note,
                    occurred_at=when,
                    notify=_notify(ctx, when),
                )
        rows.append(ticket)
    return rows


def _notify(ctx: SeedContext, when: datetime) -> bool:
    return when >= ctx.anchor - NOTIFY_WINDOW


def _clamp(ctx: SeedContext, when: datetime) -> datetime:
    """Nothing seeded happens after the demo day ends."""
    return min(when, ctx.anchor)
