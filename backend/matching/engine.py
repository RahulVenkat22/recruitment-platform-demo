"""Match engine interface and the profiles it scores (plan.md 6.6).

Pure Python: no Django import, so an engine is unit-testable in isolation and
``matching.adapters`` is the only place that knows about the ORM.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol


@dataclass(frozen=True)
class SkillProfile:
    key: str  # normalised (matching.skills)
    display_name: str
    proficiency: int  # 1..5
    years: float | None = None


@dataclass(frozen=True)
class ExperienceProfile:
    company: str
    title: str
    domain: str | None = None
    description: str = ""


@dataclass(frozen=True)
class JDProfile:
    title: str
    required_skills: tuple[str, ...]
    preferred_skills: tuple[str, ...]
    experience_min: int
    experience_max: int
    responsibilities: str = ""
    domain: str | None = None
    education_requirements: str = ""


@dataclass(frozen=True)
class CandidateProfile:
    full_name: str
    skills: tuple[SkillProfile, ...]
    total_experience_years: float
    experiences: tuple[ExperienceProfile, ...] = ()
    degrees: tuple[str, ...] = ()
    certifications: tuple[str, ...] = ()
    summary: str = ""

    def skill(self, key: str) -> SkillProfile | None:
        for entry in self.skills:
            if entry.key == key:
                return entry
        return None


@dataclass
class MatchResult:
    overall_pct: float
    skills_score: float
    experience_score: float
    education_score: float
    domain_score: float
    responsibility_score: float
    required_score: float
    preferred_score: float
    matched_required_skills: list[str] = field(default_factory=list)
    missing_required_skills: list[str] = field(default_factory=list)
    matched_preferred_skills: list[str] = field(default_factory=list)
    strengths: list[str] = field(default_factory=list)
    gaps: list[str] = field(default_factory=list)
    engine: str = ""
    engine_version: str = ""


class MatchEngine(Protocol):
    name: str
    version: str

    def score(self, jd: JDProfile, candidate: CandidateProfile) -> MatchResult: ...


# Component weights, total 100 (plan.md 6.6 table).
WEIGHTS: dict[str, int] = {
    "required": 35,
    "preferred": 10,
    "experience": 20,
    "responsibilities": 15,
    "domain": 10,
    "education": 10,
}
