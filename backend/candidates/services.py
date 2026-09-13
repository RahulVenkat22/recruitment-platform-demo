"""Manual candidate entry and edits (plan.md 6.10 "POST / PATCH candidates"):
the same DTO path a provider takes, with ``source = internal``."""

from __future__ import annotations

import uuid
from collections.abc import Mapping
from decimal import Decimal
from typing import Any

from django.db import transaction

from candidates.exceptions import DuplicateCandidate
from candidates.models import Candidate, CandidateSkill
from candidates.repositories import CandidateRepository
from matching.skills import display_name, normalize_skill
from sourcing.dtos import NormalizedCandidate, SkillDTO

MANUAL_SOURCE = "internal"

_SCALAR_FIELDS: tuple[str, ...] = (
    "full_name",
    "phone",
    "location",
    "avatar_url",
    "headline",
    "current_company",
    "current_title",
    "summary",
    "resume_url",
    "linkedin_url",
    "github_url",
    "notice_period_days",
    "current_ctc",
    "expected_ctc",
)


def _skill_dtos(entries: list[Mapping[str, Any]] | None) -> list[SkillDTO]:
    return [
        SkillDTO(
            name=str(entry["name"]),
            proficiency=int(entry.get("proficiency") or 3),
            years=entry.get("years"),
            is_primary=bool(entry.get("is_primary", False)),
        )
        for entry in entries or []
        if str(entry.get("name", "")).strip()
    ]


@transaction.atomic
def create_candidate(data: Mapping[str, Any], actor: Any) -> Candidate:
    """A manually entered candidate; duplicates by email or phone are refused."""
    dto = NormalizedCandidate(
        source=MANUAL_SOURCE,
        external_id=f"manual:{uuid.uuid4()}",
        full_name=data["full_name"],
        email=data["email"],
        phone=data.get("phone") or "",
        location=data.get("location") or "",
        headline=data.get("headline") or "",
        current_company=data.get("current_company") or "",
        current_title=data.get("current_title") or "",
        total_experience_years=float(data.get("total_experience_years") or 0),
        skills=_skill_dtos(data.get("skills")),
        summary=data.get("summary") or "",
        avatar_url=data.get("avatar_url") or None,
        linkedin_url=data.get("linkedin_url") or None,
        github_url=data.get("github_url") or None,
        resume_url=data.get("resume_url") or None,
        notice_period_days=data.get("notice_period_days"),
        current_ctc=data.get("current_ctc"),
        expected_ctc=data.get("expected_ctc"),
        raw={"added_by": str(getattr(actor, "pk", "")), "manual": True},
    )
    if CandidateRepository.find_existing(dto) is not None:
        raise DuplicateCandidate
    candidate, _created = CandidateRepository.upsert_from_dto(dto)
    if not candidate.headline:
        candidate.headline = f"{candidate.current_title} at {candidate.current_company}".strip(
            " at"
        )
        candidate.save(update_fields=["headline", "updated_at"])
    return candidate


@transaction.atomic
def update_candidate(candidate: Candidate, data: Mapping[str, Any], actor: Any) -> Candidate:
    """Edit profile fields; when ``skills`` is given it replaces the skill list."""
    changed: list[str] = []
    for name in _SCALAR_FIELDS:
        if name in data and getattr(candidate, name) != data[name]:
            setattr(candidate, name, data[name])
            changed.append(name)
    if "email" in data and data["email"] and data["email"].lower() != candidate.email:
        if Candidate.objects.filter(email=data["email"].lower()).exclude(pk=candidate.pk).exists():
            raise DuplicateCandidate
        candidate.email = data["email"].lower()
        changed.append("email")
    if "total_experience_years" in data and data["total_experience_years"] is not None:
        candidate.total_experience_years = Decimal(
            str(round(float(data["total_experience_years"]), 1))
        )
        changed.append("total_experience_years")
    if changed:
        candidate.save()
    if "skills" in data and data["skills"] is not None:
        keep: set[str] = set()
        for entry in _skill_dtos(data["skills"]):
            key = normalize_skill(entry.name)
            if not key:
                continue
            keep.add(key)
            CandidateSkill.objects.update_or_create(
                candidate=candidate,
                skill=key,
                defaults={
                    "display_name": display_name(key),
                    "proficiency": max(1, min(5, entry.proficiency)),
                    "years": Decimal(str(entry.years)) if entry.years is not None else None,
                    "is_primary": entry.is_primary,
                },
            )
        candidate.skills.exclude(skill__in=keep).delete()
    return candidate
