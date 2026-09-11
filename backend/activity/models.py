"""The timeline (plan.md 6.3 activity.Activity). Every important action becomes
one row with a ready-to-render title, so the JD and candidate timelines are a
single query each. Written only through ``record_activity()``."""

from __future__ import annotations

from django.conf import settings
from django.db import models
from django.utils import timezone

from common import enums
from common.models import UUIDTimestampedModel


class Activity(UUIDTimestampedModel):
    # Always set, so the JD timeline is one query.
    job_description = models.ForeignKey(
        "jobs.JobDescription", on_delete=models.CASCADE, related_name="activities"
    )
    # Set for candidate-level events.
    application = models.ForeignKey(
        "pipeline.Application",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="activities",
    )
    # Denormalised so the candidate timeline survives application deletion.
    candidate = models.ForeignKey(
        "candidates.Candidate",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="activities",
    )
    # What the timeline filter chips toggle.
    category = models.CharField(max_length=32, choices=enums.ActivityCategory.choices)
    # Fine-grained, e.g. "jd.created", "application.status_changed" (plan.md 6.4).
    event_type = models.CharField(max_length=60)
    # Ready-to-render sentence, e.g. "Priya contacted John Doe".
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    # Null means the system acted.
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="activities",
    )
    # e.g. {"from": "hr_review", "to": "interview_scheduled", "count": 127, "score": 8.5}
    metadata = models.JSONField(default=dict, blank=True)
    # Seedable; defaults to now.
    occurred_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["-occurred_at", "-created_at"]
        indexes = [
            models.Index(
                fields=["job_description", "-occurred_at"], name="activity_jd_occurred_idx"
            ),
            models.Index(fields=["application", "-occurred_at"], name="activity_app_occurred_idx"),
            models.Index(fields=["candidate", "-occurred_at"], name="activity_cand_occurred_idx"),
            models.Index(fields=["category"], name="activity_category_idx"),
        ]
        verbose_name_plural = "activities"

    def __str__(self) -> str:
        return self.title
