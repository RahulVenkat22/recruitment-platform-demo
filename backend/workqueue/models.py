"""Transactional work records. PostgreSQL is the source of truth, not SQS."""

from django.db import models
from django.utils import timezone

from common.models import UUIDTimestampedModel


class WorkItem(UUIDTimestampedModel):
    class Status(models.TextChoices):
        PENDING = "pending"
        RUNNING = "running"
        SUCCEEDED = "succeeded"
        DEAD = "dead"

    kind = models.CharField(max_length=40)
    key = models.CharField(max_length=200, unique=True)
    payload = models.JSONField(default=dict)
    status = models.CharField(max_length=12, choices=Status, default=Status.PENDING)
    attempts = models.PositiveIntegerField(default=0)
    available_at = models.DateTimeField(default=timezone.now)
    lease_until = models.DateTimeField(null=True)
    lease_token = models.UUIDField(null=True)
    published_at = models.DateTimeField(null=True)
    error = models.CharField(max_length=200, blank=True)

    class Meta:
        indexes = [models.Index(fields=["status", "available_at"])]
