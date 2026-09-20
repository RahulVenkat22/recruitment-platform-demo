"""How the three signals become one match percentage.

* ``rule``      the deterministic engine (matching.rule_based): skills, years,
                education, domain, responsibilities -- 0..100
* ``retrieval`` how strongly the resume text resembles the job (pgvector) -- 0..1
* ``llm``       the evaluator's judgement on the evidence it was shown -- 0..100

Weights renormalise over the signals that exist, so a candidate from a source
without resume chunks is scored on the rules alone, exactly as before.
"""

from __future__ import annotations

from dataclasses import dataclass, field

ENGINE_NAME = "hybrid_semantic"
ENGINE_VERSION = "1.0"

WEIGHT_RULE = 0.35
WEIGHT_RETRIEVAL = 0.20
WEIGHT_LLM = 0.45


@dataclass
class SemanticResult:
    overall_pct: float
    retrieval_score: float | None
    rerank_score: float | None
    explanation: str
    matched_skills: list[str] = field(default_factory=list)
    missing_skills: list[str] = field(default_factory=list)
    strengths: list[str] = field(default_factory=list)
    concerns: list[str] = field(default_factory=list)
    details: dict = field(default_factory=dict)


def blend(rule_pct: float, retrieval: float | None, llm_pct: float | None) -> float:
    parts: list[tuple[float, float]] = [(WEIGHT_RULE, rule_pct)]
    if retrieval is not None:
        parts.append((WEIGHT_RETRIEVAL, retrieval * 100))
    if llm_pct is not None:
        parts.append((WEIGHT_LLM, llm_pct))
    total_weight = sum(weight for weight, _ in parts)
    return round(sum(weight * value for weight, value in parts) / total_weight, 2)


def preliminary(rule_pct: float, retrieval: float | None) -> float:
    """Ranking before the LLM has spoken: rules plus retrieval."""
    return blend(rule_pct, retrieval, None)
