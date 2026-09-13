"""``get_engine()``: the configured ``MatchEngine`` (plan.md 6.6, ``MATCH_ENGINE``)."""

from __future__ import annotations

from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from django.utils.module_loading import import_string

from matching.engine import MatchEngine

ENGINES: dict[str, str] = {
    "rule_based": "matching.rule_based.RuleBasedEngine",
}


def get_engine(name: str | None = None) -> MatchEngine:
    key = name or getattr(settings, "MATCH_ENGINE", "rule_based")
    path = ENGINES.get(key)
    if path is None:
        raise ImproperlyConfigured(
            f"MATCH_ENGINE={key!r} is not one of {', '.join(sorted(ENGINES))}"
        )
    return import_string(path)()
