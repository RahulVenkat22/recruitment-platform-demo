"""Job description -> ``QueryPlan``: what to look for and how to ask the index.

The plan merges the JD's structured fields (the recruiter's tagged skills and
experience range are authoritative) with what the LLM reads in the free text
(extra skills, domains, seniority, an "ideal candidate" description and a few
focused search phrases). The result is cached per JD version, so repeated
searches on the same brief cost no LLM time.
"""

from __future__ import annotations

import hashlib
import logging
from dataclasses import asdict, dataclass, field
from typing import Any

from django.conf import settings
from django.core.cache import cache
from langchain_core.messages import HumanMessage, SystemMessage

from matching.skills import display_name, normalize_skills
from resumes.engines.llm import LLMError, invoke_structured
from resumes.engines.schemas import JobRequirements

logger = logging.getLogger(__name__)

PLAN_CACHE_SECONDS = 7 * 24 * 3600
MAX_QUERIES = 5
BRIEF_TEXT_CHARS = 1400


@dataclass
class QueryPlan:
    title: str
    required_skills: list[str] = field(default_factory=list)
    preferred_skills: list[str] = field(default_factory=list)
    # Skills the LLM read in the free text that the recruiter did not tag.
    inferred_skills: list[str] = field(default_factory=list)
    min_years: float = 0
    max_years: float = 0
    education: str = ""
    certifications: list[str] = field(default_factory=list)
    domains: list[str] = field(default_factory=list)
    seniority: str = ""
    ideal_candidate: str = ""
    queries: list[str] = field(default_factory=list)
    # A compact, stable description of the job for the evaluator prompts.
    brief: str = ""
    source: str = "structured"  # "llm" | "structured"
    model: str = ""
    error: str = ""

    def as_dict(self) -> dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> QueryPlan:
        known = {name for name in cls.__dataclass_fields__}
        return cls(**{key: value for key, value in data.items() if key in known})


def _jd_text(jd: Any) -> str:
    parts = [
        f"Title: {jd.title}",
        f"Department: {jd.department}" if jd.department else "",
        f"Location: {jd.location} ({jd.get_work_mode_display()})" if jd.location else "",
        f"Experience: {jd.experience_min_years}-{jd.experience_max_years} years",
        f"Domain: {jd.domain}" if jd.domain else "",
        "Required skills: " + ", ".join(display_name(k) for k in jd.required_skills)
        if jd.required_skills
        else "",
        "Preferred skills: " + ", ".join(display_name(k) for k in jd.preferred_skills)
        if jd.preferred_skills
        else "",
        f"Education: {jd.education_requirements}" if jd.education_requirements else "",
        f"Responsibilities:\n{jd.responsibilities}" if jd.responsibilities else "",
        f"Qualifications:\n{jd.qualifications}" if jd.qualifications else "",
        f"Additional requirements:\n{jd.additional_requirements}"
        if jd.additional_requirements
        else "",
        f"Description:\n{jd.description}" if jd.description else "",
    ]
    return "\n".join(part for part in parts if part)


def structured_plan(jd: Any) -> QueryPlan:
    """A plan from the JD's own fields only (no LLM)."""
    required = list(jd.required_skills or [])
    preferred = [key for key in (jd.preferred_skills or []) if key not in required]
    plan = QueryPlan(
        title=jd.title,
        required_skills=required,
        preferred_skills=preferred,
        min_years=float(jd.experience_min_years),
        max_years=float(jd.experience_max_years),
        education=jd.education_requirements or "",
        domains=[jd.domain] if jd.domain else [],
        source="structured",
    )
    plan.queries = _queries(jd, plan)
    plan.brief = _brief(jd, plan)
    return plan


_SYSTEM = SystemMessage(
    content=(
        "You are a senior technical recruiter. Read the job description and extract what the "
        "hiring team is really asking for. must_have_skills are technologies or competencies the "
        "text treats as mandatory; nice_to_have_skills are the rest. Use short canonical skill "
        "names (e.g. 'Python', 'FastAPI', 'AWS'). ideal_candidate is 2-3 sentences describing the "
        "person who would be hired, written like the opening of their resume (role, years, main "
        "technologies, domain). search_queries are 2-4 short phrases (5-12 words) that each cover "
        "a different aspect of the role, phrased the way a resume would say it. Use only what the "
        "job description states; leave fields empty when it says nothing about them."
    )
)


def llm_plan(jd: Any, *, model: str) -> QueryPlan:
    answer = invoke_structured(
        JobRequirements,
        [
            _SYSTEM,
            HumanMessage(content=f"JOB DESCRIPTION:\n{_jd_text(jd)[:6000]}\n\nReturn the JSON."),
        ],
        model=model,
        num_predict=600,
    )
    plan = structured_plan(jd)
    tagged = set(plan.required_skills) | set(plan.preferred_skills)
    inferred = [
        key
        for key in normalize_skills([*answer.must_have_skills, *answer.nice_to_have_skills])
        if key not in tagged
    ]
    plan.inferred_skills = inferred[:15]
    plan.preferred_skills = plan.preferred_skills + [
        k for k in plan.inferred_skills if k not in plan.preferred_skills
    ]
    if not plan.education and answer.education:
        plan.education = answer.education[:300]
    plan.certifications = [item for item in answer.certifications if item][:8]
    plan.domains = plan.domains or [item for item in answer.domains if item][:5]
    plan.seniority = answer.seniority[:60]
    plan.ideal_candidate = " ".join(answer.ideal_candidate.split())[:900]
    plan.source = "llm"
    plan.model = model
    plan.queries = _queries(jd, plan, [q for q in answer.search_queries if q.strip()])
    plan.brief = _brief(jd, plan)
    return plan


def _queries(jd: Any, plan: QueryPlan, extra: list[str] | None = None) -> list[str]:
    queries: list[str] = []
    skills = [display_name(k) for k in plan.required_skills[:8]]
    queries.append(f"{jd.title}: {', '.join(skills)}" if skills else jd.title)
    if plan.ideal_candidate:
        queries.append(plan.ideal_candidate)
    else:
        blurb = " ".join((jd.responsibilities or jd.description or "").split())[:600]
        if blurb:
            queries.append(f"{jd.title}. {blurb}")
    for phrase in extra or []:
        cleaned = " ".join(phrase.split())[:200]
        if cleaned and cleaned.lower() not in {q.lower() for q in queries}:
            queries.append(cleaned)
    if len(queries) < 3 and plan.preferred_skills:
        queries.append(
            f"{jd.title} with {', '.join(display_name(k) for k in plan.preferred_skills[:6])}"
        )
    return queries[:MAX_QUERIES]


def _brief(jd: Any, plan: QueryPlan) -> str:
    lines = [
        f"Job title: {jd.title}",
        f"Experience required: {jd.experience_min_years}-{jd.experience_max_years} years"
        + (f" ({plan.seniority})" if plan.seniority else ""),
        "Must-have skills: "
        + (", ".join(display_name(k) for k in plan.required_skills) or "not specified"),
    ]
    if plan.preferred_skills:
        lines.append(
            "Nice-to-have skills: " + ", ".join(display_name(k) for k in plan.preferred_skills[:12])
        )
    if plan.domains:
        lines.append("Domain: " + ", ".join(plan.domains))
    if plan.education:
        lines.append(f"Education: {' '.join(plan.education.split())[:200]}")
    if plan.certifications:
        lines.append("Certifications: " + ", ".join(plan.certifications))
    if jd.location:
        lines.append(f"Location: {jd.location} ({jd.get_work_mode_display()})")
    body = " ".join((jd.responsibilities or jd.description or "").split())[:BRIEF_TEXT_CHARS]
    if body:
        lines.append(f"Responsibilities: {body}")
    return "\n".join(lines)


def _cache_key(jd: Any, model: str) -> str:
    # The provider is part of the stamp: the same model name on two providers
    # (an OpenAI-compatible gateway serving a model of the same name, say) must
    # not serve the other provider's plan.
    stamp = (
        f"{jd.pk}:{jd.current_version}:{jd.updated_at.isoformat() if jd.updated_at else ''}:"
        f"{settings.LLM_PROVIDER}:{model}"
    )
    return "resumes:query_plan:" + hashlib.sha1(stamp.encode()).hexdigest()


def plan_for(jd: Any, *, use_llm: bool | None = None, model: str | None = None) -> QueryPlan:
    """The plan for ``jd``: LLM-backed when enabled and reachable, structured otherwise."""
    use_llm = settings.SEMANTIC_JD_ANALYSIS_ENABLED if use_llm is None else use_llm
    model = model or settings.LLM_SEARCH_MODEL
    if not use_llm:
        return structured_plan(jd)
    key = _cache_key(jd, model)
    cached = cache.get(key)
    if cached:
        return QueryPlan.from_dict(cached)
    try:
        plan = llm_plan(jd, model=model)
    except LLMError as exc:
        logger.warning("JD analysis fell back to structured fields for %s: %s", jd.pk, exc)
        plan = structured_plan(jd)
        plan.error = str(exc)
        return plan
    cache.set(key, plan.as_dict(), PLAN_CACHE_SECONDS)
    return plan
