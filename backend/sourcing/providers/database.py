"""The pool-backed providers (plan.md 6.7 "MVP providers").

Each provider sees only candidates that carry a ``CandidateSource`` row for its
key, filters to people sharing a required skill or a similar title, orders by a
rough relevance and yields ``NormalizedCandidate`` DTOs, so the DTO ->
repository -> application path is exercised end to end without any network. A
real Naukri provider replaces one class and one settings entry.

``InternalDatabaseProvider`` is the company's own talent pool and the one real
source: resumes ingested from PDFs land here (``resumes.services.ingestion``).
On top of the rule-based pass it runs the semantic search over the resume
chunks in pgvector (``resumes.engines.retrieval``) for the job's query plan and
yields those hits first, with the retrieval score and evidence excerpts in
``raw["semantic"]`` for ``SearchService`` to blend into the ranking and hand to
the LLM evaluator. When the embeddings are unavailable it still returns the
rule-based results and reports the semantic failure on the run.
"""

from __future__ import annotations

import logging
import re
from collections.abc import Iterator
from typing import Any

from django.conf import settings
from django.db.models import Prefetch, Q

from candidates.models import Candidate, CandidateSkill, CandidateSource
from resumes.engines.embeddings import EmbeddingError, embedding_status, get_embedding_service
from resumes.engines.llm import chat_status
from resumes.engines.planner import QueryPlan, structured_plan
from resumes.engines.retrieval import library_size, search_candidates
from resumes.models import ResumeDocument, ResumeStatus
from sourcing.dtos import (
    CertificationDTO,
    EducationDTO,
    ExperienceDTO,
    NormalizedCandidate,
    ProviderHealth,
    SearchCriteria,
    SkillDTO,
)
from sourcing.providers.base import CandidateSourceProvider

logger = logging.getLogger(__name__)

# Title words that say nothing about the discipline ("Senior Python Developer" -> "python").
_GENERIC_TITLE_WORDS = frozenset(
    """
    senior junior lead principal staff associate developer engineer engineering specialist
    analyst scientist architect manager consultant automation software application
    applications full stack fullstack backend frontend intern trainee head
    """.split()
)
_WORD = re.compile(r"[a-z][a-z+#]*")


def title_keywords(title: str) -> set[str]:
    """Discipline words of a JD title: {"python"} for "Senior Python Developer"."""
    return {word for word in _WORD.findall(title.lower()) if word not in _GENERIC_TITLE_WORDS}


def to_dto(candidate: Candidate, source: str) -> NormalizedCandidate:
    """A ``NormalizedCandidate`` from a pool row, exactly as a remote provider would send it."""
    reference = next(
        (row.source_reference for row in candidate.sources.all() if row.source == source),
        str(candidate.pk),
    )
    return NormalizedCandidate(
        source=source,
        external_id=reference,
        full_name=candidate.full_name,
        email=candidate.email,
        phone=candidate.phone,
        location=candidate.location,
        headline=candidate.headline,
        current_company=candidate.current_company,
        current_title=candidate.current_title,
        total_experience_years=float(candidate.total_experience_years or 0),
        skills=[
            SkillDTO(
                name=row.display_name,
                proficiency=int(row.proficiency),
                years=float(row.years) if row.years is not None else None,
                is_primary=row.is_primary,
            )
            for row in candidate.skills.all()
        ],
        experiences=[
            ExperienceDTO(
                company=row.company,
                title=row.title,
                start_date=row.start_date,
                end_date=row.end_date,
                is_current=row.is_current,
                domain=row.domain,
                description=row.description,
            )
            for row in candidate.experiences.all()
        ],
        education=[
            EducationDTO(
                degree=row.degree,
                field=row.field,
                institution=row.institution,
                start_year=row.start_year,
                end_year=row.end_year,
                grade=row.grade,
            )
            for row in candidate.education.all()
        ],
        certifications=[
            CertificationDTO(
                name=row.name,
                issuer=row.issuer,
                issued_year=row.issued_year,
                credential_url=row.credential_url,
            )
            for row in candidate.certifications.all()
        ],
        summary=candidate.summary,
        avatar_url=candidate.display_avatar_url,
        linkedin_url=candidate.linkedin_url,
        github_url=candidate.github_url,
        resume_text=candidate.resume_text,
        resume_url=candidate.resume_url,
        notice_period_days=candidate.notice_period_days,
        current_ctc=candidate.current_ctc,
        expected_ctc=candidate.expected_ctc,
        raw={"provider": source, "pool_id": str(candidate.pk)},
    )


class DatabasePoolProvider(CandidateSourceProvider):
    """Base for the pool-backed providers; subclasses only set ``key`` and ``display_name``."""

    def pool(self):
        return Candidate.objects.filter(sources__source=self.key).distinct()

    def _relevance(self, candidate: Candidate, criteria: SearchCriteria) -> tuple[Any, ...]:
        keys = {row.skill for row in candidate.skills.all()}
        required = sum(1 for key in criteria.required_skills if key in keys)
        preferred = sum(1 for key in criteria.preferred_skills if key in keys)
        years = float(candidate.total_experience_years or 0)
        if years < criteria.experience_min:
            distance = criteria.experience_min - years
        elif years > criteria.experience_max:
            distance = years - criteria.experience_max
        else:
            distance = 0.0
        return (required, preferred, -distance)

    @staticmethod
    def _with_children(rows):
        return rows.prefetch_related(
            Prefetch(
                "skills", queryset=CandidateSkill.objects.order_by("-is_primary", "-proficiency")
            ),
            "experiences",
            "education",
            "certifications",
            Prefetch("sources", queryset=CandidateSource.objects.order_by("discovered_at")),
        )

    def search(self, criteria: SearchCriteria) -> Iterator[NormalizedCandidate]:
        condition = Q(skills__skill__in=list(criteria.required_skills))
        for word in title_keywords(criteria.title):
            condition |= Q(current_title__icontains=word)
        rows = self._with_children(self.pool().filter(condition).distinct())
        ranked = sorted(rows, key=lambda c: self._relevance(c, criteria), reverse=True)
        for candidate in ranked[: max(0, criteria.limit)]:
            yield to_dto(candidate, self.key)

    def health(self) -> ProviderHealth:
        return ProviderHealth(
            key=self.key,
            display_name=self.display_name,
            available=True,
            profile_count=self.pool().count(),
            note="Seeded pool",
        )


class InternalDatabaseProvider(DatabasePoolProvider):
    key = "internal"
    display_name = "Internal Database"

    def search(self, criteria: SearchCriteria) -> Iterator[NormalizedCandidate]:
        """Semantic hits over the ingested resumes first, then the rule-based pass.

        Both passes read the same pool, so a resume the vectors missed still
        comes through on a shared skill. An embedding failure is raised only
        AFTER the rule-based results, so the run keeps them and records the
        semantic failure against this source.
        """
        limit = max(0, criteria.limit)
        semantic_error: EmbeddingError | None = None
        try:
            hits = self._semantic_hits(criteria)
        except EmbeddingError as exc:
            logger.warning("semantic search unavailable, rule-based results only: %s", exc)
            hits, semantic_error = [], exc
        yielded: set[str] = set()
        for dto in hits:
            if len(yielded) >= limit:
                break
            yielded.add(dto.raw["pool_id"])
            yield dto
        for dto in super().search(criteria):
            if len(yielded) >= limit:
                break
            if dto.raw["pool_id"] in yielded:
                continue
            yielded.add(dto.raw["pool_id"])
            yield dto
        if semantic_error is not None:
            raise RuntimeError(
                f"semantic search unavailable, rule-based results only: {semantic_error}"
            ) from semantic_error

    def _semantic_hits(self, criteria: SearchCriteria) -> list[NormalizedCandidate]:
        """Resume-chunk retrieval for the job's query plan, best first; ``[]`` with no resumes."""
        if not library_size():
            return []
        if criteria.query_plan:
            plan = QueryPlan.from_dict(criteria.query_plan)
        else:
            plan = structured_plan(_JobLike(criteria))
        vectors = get_embedding_service().embed_queries(plan.queries)
        retrieved = search_candidates(
            vectors,
            required_skills=list(plan.required_skills),
            chunks_per_query=int(settings.VECTOR_SEARCH_LIMIT),
            limit=max(0, criteria.limit),
        )
        by_id = {entry.candidate_id: entry for entry in retrieved}
        rows = self._with_children(self.pool().filter(pk__in=list(by_id)))
        dtos: list[NormalizedCandidate] = []
        for candidate in sorted(rows, key=lambda c: -by_id[str(c.pk)].score):
            dto = to_dto(candidate, self.key)
            dto.raw["semantic"] = by_id[str(candidate.pk)].as_dict()
            dtos.append(dto)
        return dtos

    def health(self) -> ProviderHealth:
        parsed = ResumeDocument.objects.filter(status=ResumeStatus.PARSED).count()
        pending = ResumeDocument.objects.filter(
            status__in=[ResumeStatus.NEEDS_REVIEW, ResumeStatus.FAILED]
        ).count()
        note = f"{parsed} resumes ingested" if parsed else "Seeded pool"
        if pending:
            note += f", {pending} need attention"
        if parsed:
            # Key present and client constructible; no network call on the health card.
            embeddings = embedding_status()
            if not embeddings["available"]:
                note += f" · {embeddings['provider']} embeddings unavailable"
            else:
                chat = chat_status()
                if not chat["available"]:
                    note += f" · {chat['provider']} LLM unavailable"
                elif not chat["search_model_available"]:
                    note += f" · {chat['provider']} search LLM unavailable"
        return ProviderHealth(
            key=self.key,
            display_name=self.display_name,
            available=True,
            profile_count=self.pool().count(),
            note=note,
        )


class MockReferralProvider(DatabasePoolProvider):
    key = "referral"
    display_name = "Referral Email"


class MockNaukriProvider(DatabasePoolProvider):
    key = "naukri"
    display_name = "Naukri"


class MockLinkedInProvider(DatabasePoolProvider):
    key = "linkedin"
    display_name = "LinkedIn"


class _JobLike:
    """Just enough of a JD for ``structured_plan`` when no query plan was supplied."""

    def __init__(self, criteria: SearchCriteria) -> None:
        self.title = criteria.title
        self.required_skills = criteria.required_skills
        self.preferred_skills = criteria.preferred_skills
        self.experience_min_years = criteria.experience_min
        self.experience_max_years = criteria.experience_max
        self.education_requirements = ""
        self.domain = criteria.domain
        self.responsibilities = ""
        self.description = ""
        self.location = criteria.location
        self.department = ""
        self.qualifications = ""
        self.additional_requirements = ""

    @staticmethod
    def get_work_mode_display() -> str:
        return ""
