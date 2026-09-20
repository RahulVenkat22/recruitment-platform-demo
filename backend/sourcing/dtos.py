"""Provider-neutral shapes for candidate sourcing (plan.md 6.7)."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import Any
from uuid import UUID


@dataclass(frozen=True)
class SearchCriteria:
    job_description_id: UUID
    title: str
    required_skills: list[str]
    preferred_skills: list[str]
    experience_min: int
    experience_max: int
    location: str
    domain: str | None
    limit: int
    # Output of resumes.engines.planner for this run (skills, queries, brief); None
    # when JD analysis is disabled or failed, in which case providers derive their
    # own queries from the structured JD fields.
    query_plan: dict[str, Any] | None = None


@dataclass
class SkillDTO:
    name: str
    proficiency: int  # 1..5
    years: float | None = None
    is_primary: bool = False


@dataclass
class ExperienceDTO:
    company: str
    title: str
    start_date: date
    end_date: date | None = None
    is_current: bool = False
    domain: str | None = None
    description: str = ""


@dataclass
class EducationDTO:
    degree: str
    field: str
    institution: str
    start_year: int
    end_year: int
    grade: str | None = None


@dataclass
class CertificationDTO:
    name: str
    issuer: str
    issued_year: int
    credential_url: str | None = None


@dataclass
class NormalizedCandidate:
    source: str  # internal | referral | naukri | linkedin
    external_id: str
    full_name: str
    email: str
    phone: str
    location: str
    headline: str
    current_company: str
    current_title: str
    total_experience_years: float
    skills: list[SkillDTO] = field(default_factory=list)
    experiences: list[ExperienceDTO] = field(default_factory=list)
    education: list[EducationDTO] = field(default_factory=list)
    certifications: list[CertificationDTO] = field(default_factory=list)
    summary: str = ""
    avatar_url: str | None = None
    linkedin_url: str | None = None
    github_url: str | None = None
    resume_text: str = ""
    resume_url: str | None = None
    notice_period_days: int | None = None
    current_ctc: int | None = None
    expected_ctc: int | None = None
    raw: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class ProviderHealth:
    key: str
    display_name: str
    available: bool
    profile_count: int
    note: str = ""
