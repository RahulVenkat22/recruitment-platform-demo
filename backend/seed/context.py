"""Deterministic randomness and the time anchor shared by every seed generator.

``SEED_RANDOM_SEED`` seeds both the ``random.Random`` and the ``Faker`` instance
so a given seed always produces the same rows; ``SEED_ANCHOR_DATE`` is "today"
for every generated timeline, which ends at ``ANCHOR_TIME`` in ``TIMEZONE``.
"""

from __future__ import annotations

import random
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from django.conf import settings
from faker import Faker

TIMEZONE = "Asia/Kolkata"
# The demo day "ends" at 18:00 local time; nothing seeded happens after this moment.
ANCHOR_TIME = time(18, 0)
FAKER_LOCALE = "en_IN"


@dataclass(frozen=True)
class SeedContext:
    seed: int
    anchor: datetime  # ANCHOR_TIME on SEED_ANCHOR_DATE, timezone-aware
    rng: random.Random
    faker: Faker

    @classmethod
    def build(cls, seed: int, anchor_date: date, tz: str = TIMEZONE) -> SeedContext:
        rng = random.Random(seed)
        faker = Faker(FAKER_LOCALE)
        faker.seed_instance(seed)
        anchor = datetime.combine(anchor_date, ANCHOR_TIME, tzinfo=ZoneInfo(tz))
        return cls(seed=seed, anchor=anchor, rng=rng, faker=faker)

    @classmethod
    def from_settings(cls) -> SeedContext:
        return cls.build(settings.SEED_RANDOM_SEED, settings.SEED_ANCHOR_DATE)

    @property
    def anchor_date(self) -> date:
        return self.anchor.date()

    @property
    def tz(self) -> ZoneInfo:
        return self.anchor.tzinfo  # type: ignore[return-value]

    def local(self, day: date, at: time) -> datetime:
        """An aware datetime for ``day`` at wall-clock time ``at`` in the seed timezone."""
        return datetime.combine(day, at, tzinfo=self.tz)

    def days_before_anchor(self, days: int, at: time | None = None) -> datetime:
        """``days`` before the anchor date, at ``at`` (default: the anchor time)."""
        day = self.anchor_date - timedelta(days=days)
        return self.local(day, at or ANCHOR_TIME)
