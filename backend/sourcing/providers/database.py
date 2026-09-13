"""The four MVP providers, all reading the seeded PostgreSQL pool (plan.md 6.7
"MVP providers"). Each one sees only candidates that carry a ``CandidateSource``
row for its key, filters to people sharing a required skill or a similar title,
orders by a rough relevance and yields ``NormalizedCandidate`` DTOs, so the
DTO -> repository -> application path is exercised end to end without any
network. A real Naukri provider replaces one class and one settings entry.
"""

from __future__ import annotations

import re
from collections.abc import Iterator
from typing import Any

from django.db.models import Prefetch, Q

from candidates.models import Candidate, CandidateSkill, CandidateSource
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
        avatar_url=candidate.avatar_url,
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

    def search(self, criteria: SearchCriteria) -> Iterator[NormalizedCandidate]:
        condition = Q(skills__skill__in=list(criteria.required_skills))
        for word in title_keywords(criteria.title):
            condition |= Q(current_title__icontains=word)
        rows = (
            self.pool()
            .filter(condition)
            .distinct()
            .prefetch_related(
                Prefetch(
                    "skills",
                    queryset=CandidateSkill.objects.order_by("-is_primary", "-proficiency"),
                ),
                "experiences",
                "education",
                "certifications",
                Prefetch("sources", queryset=CandidateSource.objects.order_by("discovered_at")),
            )
        )
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


class MockReferralProvider(DatabasePoolProvider):
    key = "referral"
    display_name = "Referral Email"


class MockNaukriProvider(DatabasePoolProvider):
    key = "naukri"
    display_name = "Naukri"


class MockLinkedInProvider(DatabasePoolProvider):
    key = "linkedin"
    display_name = "LinkedIn"
