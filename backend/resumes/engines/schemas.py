"""Pydantic schemas the LLM fills in (JSON-schema constrained decoding).

Kept flat and defaulted on purpose: every field has a default so a partial
answer still validates, and there are no unions the grammar builder has to
reason about. Anything derived (dates, normalised skills, experience totals)
is computed deterministically in ``resumes.engines.parsing`` afterwards.
"""

from __future__ import annotations

from pydantic import BaseModel, Field


class ParsedExperience(BaseModel):
    company: str = ""
    title: str = ""
    # As written in the resume ("Jan 2020", "03/2019", "2021", "Present"); parsed later.
    start_date: str = ""
    end_date: str = ""
    location: str = ""
    # Industry when obvious (fintech, healthcare, ecommerce ...), else empty.
    industry: str = ""
    # One or two sentences (~40 words) summarising the role's own bullet points.
    description: str = ""


class ParsedEducation(BaseModel):
    institution: str = ""
    # Short form: B.Tech, B.E, M.Tech, MCA, B.Sc, M.Sc, MBA, PhD, Diploma ...
    degree: str = ""
    field: str = ""
    start_year: int = 0
    end_year: int = 0
    grade: str = ""


class ParsedCertification(BaseModel):
    name: str = ""
    issuer: str = ""
    year: int = 0


class ParsedProject(BaseModel):
    name: str = ""
    description: str = ""
    technologies: list[str] = Field(default_factory=list)


class ParsedResume(BaseModel):
    full_name: str = ""
    email: str = ""
    phone: str = ""
    location: str = ""
    current_title: str = ""
    current_company: str = ""
    # 2-4 sentences describing the candidate, using only facts in the resume.
    summary: str = ""
    total_experience_years: float = 0
    skills: list[str] = Field(default_factory=list)
    experience: list[ParsedExperience] = Field(default_factory=list)
    education: list[ParsedEducation] = Field(default_factory=list)
    certifications: list[ParsedCertification] = Field(default_factory=list)
    projects: list[ParsedProject] = Field(default_factory=list)
    linkedin_url: str = ""
    github_url: str = ""


class JobRequirements(BaseModel):
    """What a job description asks for, extracted from its free text."""

    must_have_skills: list[str] = Field(default_factory=list)
    nice_to_have_skills: list[str] = Field(default_factory=list)
    min_years_experience: float = 0
    max_years_experience: float = 0
    education: str = ""
    certifications: list[str] = Field(default_factory=list)
    domains: list[str] = Field(default_factory=list)
    seniority: str = ""
    # The ideal candidate in 2-3 sentences; embedded as the main semantic query.
    ideal_candidate: str = ""
    # 2-4 short search phrases covering distinct aspects of the role.
    search_queries: list[str] = Field(default_factory=list)


class MatchSummary(BaseModel):
    """Why one candidate received their match percentage (written in batches after a search)."""

    id: str = ""
    why: str = ""


class MatchSummaries(BaseModel):
    summaries: list[MatchSummary] = Field(default_factory=list)


class CandidateEvaluation(BaseModel):
    """The LLM's verdict on one candidate for one job (search-time reranking)."""

    match_score: int = 0
    matched_skills: list[str] = Field(default_factory=list)
    missing_skills: list[str] = Field(default_factory=list)
    # Roles or projects in the resume that map to the job, one short phrase each.
    matching_experience: list[str] = Field(default_factory=list)
    concerns: list[str] = Field(default_factory=list)
    meets_experience_requirement: bool = False
    # 2-3 sentences, grounded in the supplied data only.
    explanation: str = ""
