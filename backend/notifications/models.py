"""In-app notifications (plan.md 6.3 notifications.Notification), written by
``notify()`` and polled by the bell every 60 seconds."""

from __future__ import annotations

from django.conf import settings
from django.db import models

from common import enums
from common.models import UUIDTimestampedModel


class Notification(UUIDTimestampedModel):
    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notifications"
    )
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="sent_notifications",
    )
    type = models.CharField(max_length=20, choices=enums.NotificationType.choices)
    title = models.CharField(max_length=200)
    message = models.TextField(blank=True)
    # SPA route to open when clicked, e.g. "/jobs/<id>?tab=timeline".
    link_url = models.TextField(blank=True)
    is_read = models.BooleanField(default=False)
    read_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(
                fields=["recipient", "is_read", "-created_at"], name="notif_recipient_read_idx"
            ),
        ]

    def __str__(self) -> str:
        return f"{self.get_type_display()} for {self.recipient.full_name}: {self.title}"
