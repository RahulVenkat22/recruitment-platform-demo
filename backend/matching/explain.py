"""Templated strengths and gaps for a match (plan.md 6.6 "Explanations"), at most
five sentences each. Pure Python."""

from __future__ import annotations

from matching.engine import CandidateProfile, JDProfile
from matching.skills import display_name

MAX_ITEMS = 5

DEGREE_LABELS = {1: "Bachelor's degree", 2: "Master's degree", 3: "PhD"}


def _years(value: float | None) -> str:
    if value is None:
        return ""
    return f"{value:g}"


def build_strengths(
    jd: JDProfile,
    candidate: CandidateProfile,
    *,
    matched_required: list[str],
    matched_preferred: list[str],
    experience_score: float,
    domain_score: float,
) -> list[str]:
    items: list[str] = []
    for key in matched_required:
        skill = candidate.skill(key)
        if skill is not None and skill.proficiency >= 4:
            years = _years(skill.years)
            detail = f"{years} yrs, expert level" if years else "expert level"
            items.append(f"Strong {display_name(key)} experience ({detail})")
    if experience_score >= 100:
        items.append(
            f"{candidate.total_experience_years:g} years of experience fits the "
            f"{jd.experience_min}–{jd.experience_max} year range"
        )
    if jd.domain and domain_score >= 100:
        company = next(
            (
                exp.company
                for exp in candidate.experiences
                if (exp.domain or "").lower() == jd.domain.lower()
            ),
            None,
        )
        where = f" at {company}" if company else ""
        items.append(f"Relevant {jd.domain} domain background{where}")
    for cert in candidate.certifications[:2]:
        items.append(f"Holds {cert}")
    if jd.preferred_skills and matched_preferred:
        items.append(
            f"Covers {len(matched_preferred)} of {len(jd.preferred_skills)} preferred skills"
        )
    return items[:MAX_ITEMS]


def build_gaps(
    jd: JDProfile,
    candidate: CandidateProfile,
    *,
    matched_required: list[str],
    missing_required: list[str],
    domain_score: float,
    education_score: float,
    required_level: int,
) -> list[str]:
    items: list[str] = []
    for key in missing_required:
        items.append(f"No {display_name(key)} experience listed")
    for key in matched_required:
        skill = candidate.skill(key)
        if skill is not None and skill.proficiency <= 2:
            items.append(f"Limited {display_name(key)} exposure")
    shortfall = jd.experience_min - candidate.total_experience_years
    if shortfall > 0:
        items.append(f"{shortfall:g} years below the minimum experience")
    if jd.domain and domain_score <= 20:
        items.append(f"No direct {jd.domain} domain experience")
    if required_level and education_score < 100:
        items.append(f"{DEGREE_LABELS.get(required_level, 'Degree')} requirement not met")
    return items[:MAX_ITEMS]
