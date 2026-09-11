"""Bookkeeping for ``manage.py seed_demo`` (plan.md section 10)."""

from __future__ import annotations

from django.db import models

from common.models import UUIDTimestampedModel


class SeedMarker(UUIDTimestampedModel):
    """Written once per successful seed run.

    Its presence makes the command a no-op until ``--reset`` is passed; ``version``
    is the seed schema version so later phases can detect an outdated dataset and
    ``counts`` keeps the summary table of that run.
    """

    version = models.PositiveIntegerField()
    counts = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"Seed v{self.version} at {self.created_at:%Y-%m-%d %H:%M}"
