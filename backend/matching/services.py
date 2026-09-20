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
from resumes.engines.scoring import ENGINE_NAME, ENGINE_VERSION, SemanticResult

MAX_ITEMS = 5


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
            # A recompute is rules-only until the next search evaluates the candidate again.
            "retrieval_score": None,
            "rerank_score": None,
            "explanation": "",
            "semantic_details": None,
        },
    )
    return match


def _merge(first: list[str], second: list[str]) -> list[str]:
    merged: list[str] = []
    for item in [*first, *second]:
        if item and item not in merged:
            merged.append(item)
    return merged[:MAX_ITEMS]


def apply_semantic_result(
    match: CandidateMatch, result: SemanticResult, *, computed_at: datetime | None = None
) -> CandidateMatch:
    """Blend the search's semantic signals into an existing rule-based match.

    ``overall_pct`` becomes the blended score; the LLM's matched skills that the
    rules missed move from ``missing_required_skills`` to ``matched`` (the model
    saw them in the resume text); strengths and gaps lead with the LLM's
    findings, followed by the rule engine's templated sentences.
    """
    from matching.skills import normalize_skill

    llm_keys = {normalize_skill(name) for name in result.matched_skills}
    matched_required = list(match.matched_required_skills)
    missing_required = []
    for key in match.missing_required_skills:
        if key in llm_keys and key not in matched_required:
            matched_required.append(key)
        else:
            missing_required.append(key)
    match.overall_pct = to_decimal(result.overall_pct)
    match.retrieval_score = (
        Decimal(str(round(result.retrieval_score, 4)))
        if result.retrieval_score is not None
        else None
    )
    match.rerank_score = (
        to_decimal(result.rerank_score) if result.rerank_score is not None else None
    )
    match.explanation = result.explanation
    match.semantic_details = result.details
    match.matched_required_skills = matched_required
    match.missing_required_skills = missing_required
    match.strengths = _merge(result.strengths, list(match.strengths))
    match.gaps = _merge(result.concerns, list(match.gaps))
    match.engine = ENGINE_NAME
    match.engine_version = ENGINE_VERSION
    match.computed_at = computed_at or timezone.now()
    match.save()
    return match
