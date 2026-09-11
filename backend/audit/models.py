"""Audit trail (plan.md 6.3 audit.AuditLog): one row per mutating request and per
auth event, written by ``AuditMiddleware``. Retained indefinitely in the MVP."""

from __future__ import annotations

from django.conf import settings
from django.db import models

from common import enums
from common.models import UUIDTimestampedModel


class AuditLog(UUIDTimestampedModel):
    # Null for anonymous requests (failed logins) and system actions.
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="audit_logs",
    )
    action = models.CharField(max_length=40, choices=enums.AuditAction.choices)
    # e.g. "jobs.JobDescription"
    entity_type = models.CharField(max_length=60, blank=True)
    entity_id = models.CharField(max_length=64, blank=True)
    # Field -> [old, new] for PATCH/PUT; empty otherwise.
    changes = models.JSONField(default=dict, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True)
    request_id = models.UUIDField(null=True, blank=True)
    path = models.TextField(blank=True)
    status_code = models.PositiveSmallIntegerField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["entity_type", "entity_id"], name="audit_entity_idx"),
        ]

    def __str__(self) -> str:
        actor = self.actor.full_name if self.actor else "system"
        target = f" {self.entity_type} {self.entity_id}".rstrip()
        return f"{self.get_action_display()}{target} by {actor}"
