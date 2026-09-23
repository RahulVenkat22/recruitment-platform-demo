"""Support tickets: a staff member raises one, an HR admin (the support team)
works it, and every step lands on the ticket's own timeline (``TicketEvent``).
``support.services.TicketService`` is the only writer."""

from __future__ import annotations

from django.conf import settings
from django.db import models
from django.utils import timezone

from common import enums
from common.models import UUIDTimestampedModel


class Ticket(UUIDTimestampedModel):
    # Human-readable, unique, never reused: "SUP-1042" from a database sequence.
    number = models.CharField(max_length=16, unique=True, editable=False)
    subject = models.CharField(max_length=200)
    description = models.TextField()
    category = models.CharField(
        max_length=20, choices=enums.TicketCategory.choices, default=enums.TicketCategory.OTHER
    )
    priority = models.CharField(
        max_length=10, choices=enums.TicketPriority.choices, default=enums.TicketPriority.MEDIUM
    )
    status = models.CharField(
        max_length=20, choices=enums.TicketStatus.choices, default=enums.TicketStatus.OPEN
    )
    requester = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="support_tickets"
    )
    assignee = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="assigned_tickets",
    )
    # The job description the ticket is about, when there is one.
    job_description = models.ForeignKey(
        "jobs.JobDescription",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="support_tickets",
    )
    # The answer, written when the ticket is resolved.
    resolution = models.TextField(blank=True)
    last_activity_at = models.DateTimeField(default=timezone.now)
    resolved_at = models.DateTimeField(null=True, blank=True)
    closed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-last_activity_at"]
        indexes = [
            models.Index(fields=["status", "-last_activity_at"], name="support_ticket_status_idx"),
        ]

    def __str__(self) -> str:
        return f"{self.number} {self.subject} ({self.get_status_display()})"


class TicketEvent(UUIDTimestampedModel):
    """One line of a ticket's timeline, with a ready-to-render title."""

    ticket = models.ForeignKey(Ticket, on_delete=models.CASCADE, related_name="events")
    kind = models.CharField(max_length=20, choices=enums.TicketEventKind.choices)
    # Null means the system acted.
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="support_events",
    )
    title = models.CharField(max_length=200)
    # A comment, a resolution, the reason for a change.
    message = models.TextField(blank=True)
    # e.g. {"from": "open", "to": "in_progress"} or {"assignee": {id, name, avatar_url}}
    metadata = models.JSONField(default=dict, blank=True)
    occurred_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["occurred_at", "created_at"]
        indexes = [
            models.Index(fields=["ticket", "occurred_at"], name="support_event_ticket_idx"),
        ]

    def __str__(self) -> str:
        return self.title
