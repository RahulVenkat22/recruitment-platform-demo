"""The TalentOS assistant: one conversation per user with the agent that works
the application on their behalf (creates job descriptions, moves candidates,
sends mail, notifies people).

An assistant turn is stored as ordered ``steps``: the text it wrote and the
actions it took, in the order they happened, so the interface can replay a turn
exactly as it streamed. An action step is::

    {"type": "action", "id": "<uuid>", "name": "send_email", "label": "Email 3 candidates",
     "status": "done" | "failed" | "pending" | "cancelled", "args": {...},
     "details": [{"label": "Subject", "value": "..."}], "body": "...",
     "result": {"summary": "...", "link": "/jobs/<id>", "link_label": "Open", "changed": true},
     "error": ""}

``pending`` actions wait for the user to confirm them in the interface (sending
mail, closing a job, rejecting candidates); confirming runs the action and
rewrites the step in place.
"""

from __future__ import annotations

from django.conf import settings
from django.db import models

from common.models import UUIDTimestampedModel

ROLES = (("user", "User"), ("assistant", "Assistant"))


class AssistantMessage(UUIDTimestampedModel):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="assistant_messages"
    )
    role = models.CharField(max_length=10, choices=ROLES)
    # The text of the turn; for the assistant, every text step joined.
    content = models.TextField(blank=True)
    steps = models.JSONField(default=list, blank=True)
    model = models.CharField(max_length=80, blank=True)

    class Meta:
        ordering = ["created_at"]
        indexes = [models.Index(fields=["user", "created_at"], name="assistant_msg_user_idx")]

    def __str__(self) -> str:
        return f"{self.role}: {self.content[:60]}"
