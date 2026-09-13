"""Scoring an application and storing the verdict (plan.md 6.3 CandidateMatch,
6.7 step 5). ``compute_match`` never touches ``Application.status``: the
threshold decision belongs to the search and pipeline services."""

from __future__ import annotations

from datetime import datetime
from decimal import ROUND_HALF_UP, Decimal
from typing import Any

from django.utils import timezone

from matching.adapters import candidate_profile, jd_profile
from matching.engine import MatchEngine, MatchResult
from matching.registry import get_engine
from pipeline.models import CandidateMatch


def to_decimal(value: float) -> Decimal:
    return Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def score_pair(jd: Any, candidate: Any, engine: MatchEngine | None = None) -> MatchResult:
    """Score without persisting (used to rank a pool before attaching anyone)."""
    engine = engine or get_engine()
    return engine.score(jd_profile(jd), candidate_profile(candidate))


def compute_match(
    application: Any,
    *,
    engine: MatchEngine | None = None,
    computed_at: datetime | None = None,
    result: MatchResult | None = None,
) -> CandidateMatch:
    """Score ``application`` and upsert its ``CandidateMatch``."""
    engine = engine or get_engine()
    result = result or engine.score(
        jd_profile(application.job_description), candidate_profile(application.candidate)
    )
    match, _created = CandidateMatch.objects.update_or_create(
        application=application,
        defaults={
            "overall_pct": to_decimal(result.overall_pct),
            "skills_score": to_decimal(result.skills_score),
            "experience_score": to_decimal(result.experience_score),
            "education_score": to_decimal(result.education_score),
            "domain_score": to_decimal(result.domain_score),
            "responsibility_score": to_decimal(result.responsibility_score),
            "matched_required_skills": list(result.matched_required_skills),
            "missing_required_skills": list(result.missing_required_skills),
            "matched_preferred_skills": list(result.matched_preferred_skills),
            "strengths": list(result.strengths),
            "gaps": list(result.gaps),
            "engine": result.engine or engine.name,
            "engine_version": result.engine_version or engine.version,
            "computed_at": computed_at or timezone.now(),
        },
    )
    return match
