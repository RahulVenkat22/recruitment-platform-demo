"""``ResumeLibraryProvider`` (key ``resume``): the ingested PDFs, searched semantically.

The job's query plan (from ``resumes.engines.planner``, passed on the criteria
by ``SearchService``) is embedded and run against the resume chunks in
pgvector; the fused, per-candidate results come back as ordinary
``NormalizedCandidate`` DTOs with the retrieval score and evidence excerpts in
``raw["semantic"]``, so the rest of the search pipeline (upsert, application,
rule-based match, LLM evaluation) treats them like any other source.
"""

from __future__ import annotations

import logging
from collections.abc import Iterator

from django.conf import settings
from django.db.models import Prefetch

from candidates.models import Candidate, CandidateSkill, CandidateSource
from resumes.engines.embeddings import EmbeddingError, embedding_status, get_embedding_service
from resumes.engines.llm import chat_status
from resumes.engines.planner import QueryPlan, structured_plan
from resumes.engines.retrieval import search_candidates
from resumes.models import ResumeDocument, ResumeStatus
from sourcing.dtos import NormalizedCandidate, ProviderHealth, SearchCriteria
from sourcing.providers.base import CandidateSourceProvider
from sourcing.providers.database import to_dto

logger = logging.getLogger(__name__)


class ResumeLibraryProvider(CandidateSourceProvider):
    key = "resume"
    display_name = "Resume Library"

    def pool(self):
        return Candidate.objects.filter(resume_documents__status=ResumeStatus.PARSED).distinct()

    def search(self, criteria: SearchCriteria) -> Iterator[NormalizedCandidate]:
        if criteria.query_plan:
            plan = QueryPlan.from_dict(criteria.query_plan)
        else:
            plan = structured_plan(_JobLike(criteria))
        try:
            vectors = get_embedding_service().embed_queries(plan.queries)
        except EmbeddingError as exc:
            raise RuntimeError(f"Resume library search unavailable: {exc}") from exc
        retrieved = search_candidates(
            vectors,
            required_skills=list(plan.required_skills),
            chunks_per_query=int(settings.VECTOR_SEARCH_LIMIT),
            limit=max(0, criteria.limit),
        )
        if not retrieved:
            return
        by_id = {entry.candidate_id: entry for entry in retrieved}
        rows = Candidate.objects.filter(pk__in=list(by_id)).prefetch_related(
            Prefetch(
                "skills", queryset=CandidateSkill.objects.order_by("-is_primary", "-proficiency")
            ),
            "experiences",
            "education",
            "certifications",
            Prefetch("sources", queryset=CandidateSource.objects.order_by("discovered_at")),
        )
        ordered = sorted(rows, key=lambda candidate: -by_id[str(candidate.pk)].score)
        for candidate in ordered:
            dto = to_dto(candidate, self.key)
            dto.raw["semantic"] = by_id[str(candidate.pk)].as_dict()
            yield dto

    def health(self) -> ProviderHealth:
        parsed = ResumeDocument.objects.filter(status=ResumeStatus.PARSED).count()
        pending = ResumeDocument.objects.filter(
            status__in=[ResumeStatus.NEEDS_REVIEW, ResumeStatus.FAILED]
        ).count()
        # `available` tracks the embeddings only: the query vector is what this
        # provider needs, and it makes no chat call itself (the LLM evaluation
        # lives in SearchService and degrades on its own). Neither check makes a
        # network call -- key present, client constructible -- because this runs
        # on the health card.
        embeddings = embedding_status()
        note = f"{parsed} resumes ingested"
        if pending:
            note += f", {pending} need attention"
        if not embeddings["available"]:
            note += f" · {embeddings['provider']} embeddings unavailable"
        else:
            chat = chat_status()
            if not chat["available"]:
                note += f" · {chat['provider']} LLM unavailable"
            elif not chat["search_model_available"]:
                # Search-only: ingestion is fine, the reranker will not run.
                note += f" · {chat['provider']} search LLM unavailable"
        return ProviderHealth(
            key=self.key,
            display_name=self.display_name,
            available=embeddings["available"] and parsed > 0,
            profile_count=self.pool().count(),
            note=note,
        )


class _JobLike:
    """Just enough of a JD for ``structured_plan`` when no plan was supplied."""

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
