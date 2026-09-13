"""ORM rows -> the engine's pure profiles (plan.md 6.6 ``matching/adapters.py``).

Works with plain instances and with ``prefetch_related`` caches alike, so a
search that scores sixty candidates does not issue sixty extra queries.
"""

from __future__ import annotations

from typing import Any

from matching.engine import CandidateProfile, ExperienceProfile, JDProfile, SkillProfile


def jd_profile(jd: Any) -> JDProfile:
    return JDProfile(
        title=jd.title,
        required_skills=tuple(jd.required_skills or ()),
        preferred_skills=tuple(jd.preferred_skills or ()),
        experience_min=int(jd.experience_min_years),
        experience_max=int(jd.experience_max_years),
        responsibilities=jd.responsibilities or "",
        domain=(jd.domain or "").strip().lower() or None,
        education_requirements=jd.education_requirements or "",
    )


def candidate_profile(candidate: Any) -> CandidateProfile:
    skills = tuple(
        SkillProfile(
            key=row.skill,
            display_name=row.display_name,
            proficiency=int(row.proficiency),
            years=float(row.years) if row.years is not None else None,
        )
        for row in candidate.skills.all()
    )
    experiences = tuple(
        ExperienceProfile(
            company=row.company,
            title=row.title,
            domain=(row.domain or "").strip().lower() or None,
            description=row.description or "",
        )
        for row in candidate.experiences.all()
    )
    degrees = tuple(f"{row.degree} {row.field}".strip() for row in candidate.education.all())
    certifications = tuple(row.name for row in candidate.certifications.all())
    return CandidateProfile(
        full_name=candidate.full_name,
        skills=skills,
        total_experience_years=float(candidate.total_experience_years or 0),
        experiences=experiences,
        degrees=degrees,
        certifications=certifications,
        summary=candidate.summary or "",
    )
