"""``CandidateRepository``: the only writer of candidate rows from provider
DTOs (plan.md 6.1 candidates row, 6.7 step 3)."""

from __future__ import annotations

import re
from datetime import datetime
from decimal import Decimal
from typing import Any

from django.db import transaction
from django.utils import timezone

from candidates.models import (
    Candidate,
    CandidateCertification,
    CandidateEducation,
    CandidateExperience,
    CandidateSkill,
    CandidateSource,
)
from matching.skills import display_name, normalize_skill
from sourcing.dtos import NormalizedCandidate

_DIGITS = re.compile(r"\D+")

# Scalar columns refreshed from a DTO when the DTO carries a value.
_SCALAR_FIELDS: tuple[str, ...] = (
    "full_name",
    "phone",
    "location",
    "avatar_url",
    "headline",
    "current_company",
    "current_title",
    "summary",
    "resume_text",
    "resume_url",
    "linkedin_url",
    "github_url",
    "notice_period_days",
    "current_ctc",
    "expected_ctc",
)


def phone_digits(value: str | None) -> str:
    return _DIGITS.sub("", value or "")


class CandidateRepository:
    @staticmethod
    def find_existing(dto: NormalizedCandidate) -> Candidate | None:
        email = (dto.email or "").strip().lower()
        if email:
            match = Candidate.objects.filter(email=email).first()
            if match is not None:
                return match
        digits = phone_digits(dto.phone)
        if len(digits) >= 8:
            for row in Candidate.objects.filter(phone__endswith=digits[-8:]):
                if phone_digits(row.phone) == digits:
                    return row
        return None

    @staticmethod
    @transaction.atomic
    def upsert_from_dto(
        dto: NormalizedCandidate, *, discovered_at: datetime | None = None, referred_by: Any = None
    ) -> tuple[Candidate, bool]:
        """Create or refresh the candidate behind ``dto``; returns ``(candidate, created)``.

        Existing rows keep any value the DTO leaves empty, child collections are
        only created when the candidate has none of that kind (a second source
        never duplicates a work history), skills are upserted by normalised key,
        and the ``CandidateSource`` row for ``dto.source`` is ensured.
        """
        candidate = CandidateRepository.find_existing(dto)
        created = candidate is None
        if candidate is None:
            candidate = Candidate(email=(dto.email or "").strip().lower())
        for name in _SCALAR_FIELDS:
            value = getattr(dto, name, None)
            if value not in (None, ""):
                setattr(candidate, name, value)
        if dto.total_experience_years:
            candidate.total_experience_years = Decimal(str(round(dto.total_experience_years, 1)))
        if not candidate.headline and (candidate.current_title or candidate.current_company):
            candidate.headline = f"{candidate.current_title} at {candidate.current_company}".strip()
        candidate.save()

        for skill in dto.skills:
            key = normalize_skill(skill.name)
            if not key:
                continue
            CandidateSkill.objects.update_or_create(
                candidate=candidate,
                skill=key,
                defaults={
                    "display_name": display_name(key),
                    "proficiency": max(1, min(5, int(skill.proficiency or 3))),
                    "years": Decimal(str(skill.years)) if skill.years is not None else None,
                    "is_primary": bool(skill.is_primary),
                },
            )
        if dto.experiences and not candidate.experiences.exists():
            CandidateExperience.objects.bulk_create(
                CandidateExperience(candidate=candidate, **vars(row)) for row in dto.experiences
            )
        if dto.education and not candidate.education.exists():
            CandidateEducation.objects.bulk_create(
                CandidateEducation(candidate=candidate, **vars(row)) for row in dto.education
            )
        if dto.certifications and not candidate.certifications.exists():
            CandidateCertification.objects.bulk_create(
                CandidateCertification(candidate=candidate, **vars(row))
                for row in dto.certifications
            )
        CandidateSource.objects.get_or_create(
            candidate=candidate,
            source=dto.source,
            defaults={
                "source_reference": dto.external_id or "",
                "referred_by": referred_by,
                "discovered_at": discovered_at or timezone.now(),
                "raw_payload": dto.raw or None,
            },
        )
        return candidate, created
