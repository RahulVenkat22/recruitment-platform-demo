"""LLM evaluation of one candidate against one job (search-time reranking).

The prompt is deliberately two-part: a system message carrying the job brief
and the rules (identical for every candidate in a run, so the provider reuses
its prompt cache) and a human message with the candidate card and the resume
excerpts retrieved for this job. The answer is grounded afterwards: a skill
the model claims as matched must actually appear in the candidate's data, and
the score is clamped to 0..100.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage

from matching.engine import CandidateProfile
from matching.skills import display_name, normalize_skill
from resumes.engines.llm import invoke_structured
from resumes.engines.planner import QueryPlan
from resumes.engines.retrieval import Evidence
from resumes.engines.schemas import CandidateEvaluation

MAX_EXPERIENCES = 6
MAX_SKILLS = 30
DESCRIPTION_CHARS = 220


@dataclass
class GroundedEvaluation:
    score: float
    matched_skills: list[str] = field(default_factory=list)
    missing_skills: list[str] = field(default_factory=list)
    matching_experience: list[str] = field(default_factory=list)
    concerns: list[str] = field(default_factory=list)
    meets_experience_requirement: bool = False
    explanation: str = ""
    dropped_claims: list[str] = field(default_factory=list)

    def as_dict(self) -> dict[str, Any]:
        return {
            "score": self.score,
            "matched_skills": self.matched_skills,
            "missing_skills": self.missing_skills,
            "matching_experience": self.matching_experience,
            "concerns": self.concerns,
            "meets_experience_requirement": self.meets_experience_requirement,
            "explanation": self.explanation,
            "dropped_claims": self.dropped_claims,
        }


def candidate_card(profile: CandidateProfile, *, location: str = "", headline: str = "") -> str:
    """The structured facts about a candidate, compact enough for a small model."""
    lines = [f"Name: {profile.full_name}"]
    if headline:
        lines.append(f"Headline: {headline}")
    if location:
        lines.append(f"Location: {location}")
    lines.append(f"Total experience: {profile.total_experience_years:g} years")
    if profile.skills:
        lines.append(
            "Skills: " + ", ".join(skill.display_name for skill in profile.skills[:MAX_SKILLS])
        )
    if profile.experiences:
        lines.append("Experience:")
        for row in profile.experiences[:MAX_EXPERIENCES]:
            description = " ".join(row.description.split())[:DESCRIPTION_CHARS]
            domain = f" [{row.domain}]" if row.domain else ""
            lines.append(f"- {row.title} at {row.company}{domain}: {description}".rstrip(": "))
    if profile.degrees:
        lines.append("Education: " + "; ".join(profile.degrees[:3]))
    if profile.certifications:
        lines.append("Certifications: " + "; ".join(profile.certifications[:5]))
    if profile.summary:
        lines.append("Summary: " + " ".join(profile.summary.split())[:500])
    return "\n".join(lines)


def _system(plan: QueryPlan) -> SystemMessage:
    return SystemMessage(
        content=(
            "You are a meticulous technical recruiter scoring one candidate for the job below. "
            "Judge only from the CANDIDATE data and RESUME EXCERPTS you are given; if something is "
            "not mentioned, treat it as absent and say so rather than guessing. match_score is "
            "0-100 (90+: hire-ready fit on must-haves and experience; 70-89: strong with small "
            "gaps; 50-69: partial fit; below 50: weak fit). matched_skills / missing_skills refer "
            "to "
            "the must-have and nice-to-have skills of the job. matching_experience lists up to 3 "
            "roles or projects from the candidate that map to the job, one short phrase each. "
            "concerns lists up to 3 risks (missing must-haves, years below the minimum, domain "
            "mismatch, outdated stack). explanation is 2-3 plain sentences a hiring manager can "
            "read, grounded in the supplied data.\n\nJOB:\n" + plan.brief
        )
    )


def evaluate(
    plan: QueryPlan,
    profile: CandidateProfile,
    evidence: list[Evidence],
    *,
    model: str,
    location: str = "",
    headline: str = "",
) -> GroundedEvaluation:
    card = candidate_card(profile, location=location, headline=headline)
    excerpts = (
        "\n\n".join(f"[{item.section}] {item.excerpt}" for item in evidence[:3])
        or "(no resume excerpts available)"
    )
    answer = invoke_structured(
        CandidateEvaluation,
        [
            _system(plan),
            HumanMessage(
                content=f"CANDIDATE:\n{card}\n\nRESUME EXCERPTS:\n{excerpts}\n\nReturn the JSON."
            ),
        ],
        model=model,
        num_predict=450,
    )
    return ground(answer, plan, profile, card + "\n" + excerpts)


def ground(
    answer: CandidateEvaluation, plan: QueryPlan, profile: CandidateProfile, context: str
) -> GroundedEvaluation:
    """Keep only claims the supplied data supports."""
    haystack = context.lower()
    candidate_keys = {skill.key for skill in profile.skills}
    job_keys = set(plan.required_skills) | set(plan.preferred_skills)
    matched: list[str] = []
    dropped: list[str] = []
    for name in answer.matched_skills:
        key = normalize_skill(name)
        if not key:
            continue
        if key in candidate_keys or _mentioned(haystack, key) or _mentioned(haystack, name.lower()):
            label = display_name(key)
            if label not in matched:
                matched.append(label)
        else:
            dropped.append(name)
    missing: list[str] = []
    for name in answer.missing_skills:
        key = normalize_skill(name)
        if key and key not in candidate_keys and (key in job_keys or not _mentioned(haystack, key)):
            label = display_name(key)
            if label not in missing and label not in matched:
                missing.append(label)
    score = float(max(0, min(100, int(answer.match_score))))

    def clean(items: list[str], limit: int) -> list[str]:
        return [" ".join(str(item).split())[:200] for item in items if str(item).strip()][:limit]

    return GroundedEvaluation(
        score=score,
        matched_skills=matched[:12],
        missing_skills=missing[:8],
        matching_experience=clean(answer.matching_experience, 3),
        concerns=clean(answer.concerns, 3),
        meets_experience_requirement=bool(answer.meets_experience_requirement),
        explanation=" ".join(answer.explanation.split())[:900],
        dropped_claims=dropped[:6],
    )


def _mentioned(haystack: str, needle: str) -> bool:
    if not needle:
        return False
    return (
        re.search(r"(?<![a-z0-9+#])" + re.escape(needle) + r"(?![a-z0-9+#])", haystack) is not None
    )
