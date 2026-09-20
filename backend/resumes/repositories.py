"""Writers for the resume tables and the candidate child collections.

``ResumeRepository`` owns ``ResumeDocument`` / ``ResumeChunk`` rows.
``ProfileSync`` refreshes a candidate's experience, education and
certifications from a parsed resume without duplicating what a previous
ingestion (or another source) already stored: rows are matched on natural keys
(company + title, institution + degree, certification name) and updated in
place, new ones are inserted, and nothing is deleted.
"""

from __future__ import annotations

import re
from datetime import date
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
)
from matching.skills import display_name, normalize_skill
from resumes.engines.chunking import ChunkDraft
from resumes.engines.parsing import parse_partial_date
from resumes.engines.schemas import ParsedResume
from resumes.models import ResumeChunk, ResumeDocument, ResumeStatus, StorageStatus


def _norm(value: str) -> str:
    return " ".join((value or "").lower().split())


class ResumeRepository:
    @staticmethod
    def by_hash(file_hash: str) -> ResumeDocument | None:
        return ResumeDocument.objects.filter(file_hash=file_hash).first()

    @staticmethod
    def create(
        *, file_name: str, source_path: str, file_hash: str, file_size: int
    ) -> ResumeDocument:
        return ResumeDocument.objects.create(
            file_name=file_name,
            source_path=source_path,
            file_hash=file_hash,
            file_size=file_size,
            status=ResumeStatus.PENDING,
        )

    @staticmethod
    @transaction.atomic
    def supersede_others(document: ResumeDocument) -> int:
        """Older documents ingested from the same path are replaced by this one."""
        others = ResumeDocument.objects.filter(source_path=document.source_path).exclude(
            pk=document.pk
        )
        count = 0
        for other in others:
            ResumeChunk.objects.filter(document=other).delete()
            other.status = ResumeStatus.SUPERSEDED
            other.status_reason = f"Replaced by {document.file_name} ({document.file_hash[:12]})"
            other.chunk_count = 0
            other.save(update_fields=["status", "status_reason", "chunk_count", "updated_at"])
            count += 1
        return count

    @staticmethod
    @transaction.atomic
    def replace_chunks(
        document: ResumeDocument,
        candidate: Candidate,
        drafts: list[ChunkDraft],
        vectors: list[list[float]],
        *,
        embedding_model: str,
    ) -> int:
        if len(drafts) != len(vectors):
            raise ValueError("one vector per chunk is required")
        ResumeChunk.objects.filter(document=document).delete()
        ResumeChunk.objects.bulk_create(
            [
                ResumeChunk(
                    document=document,
                    candidate=candidate,
                    section=draft.section,
                    chunk_index=draft.index,
                    content=draft.content,
                    char_count=draft.char_count,
                    embedding=vector,
                )
                for draft, vector in zip(drafts, vectors, strict=True)
            ],
            batch_size=200,
        )
        document.chunk_count = len(drafts)
        document.embedding_model = embedding_model
        document.save(update_fields=["chunk_count", "embedding_model", "updated_at"])
        return len(drafts)

    @staticmethod
    def mark(
        document: ResumeDocument, status: str, reason: str = "", **fields: Any
    ) -> ResumeDocument:
        document.status = status
        document.status_reason = reason[:2000]
        for name, value in fields.items():
            setattr(document, name, value)
        document.save()
        return document

    @staticmethod
    def mark_uploaded(document: ResumeDocument, key: str) -> None:
        document.storage_status = StorageStatus.UPLOADED
        document.storage_key = key
        document.storage_error = ""
        document.uploaded_at = timezone.now()
        document.save(
            update_fields=[
                "storage_status",
                "storage_key",
                "storage_error",
                "uploaded_at",
                "updated_at",
            ]
        )

    @staticmethod
    def mark_upload_pending(document: ResumeDocument, error: str, *, failed: bool = False) -> None:
        document.storage_status = StorageStatus.FAILED if failed else StorageStatus.PENDING_UPLOAD
        document.storage_error = error[:2000]
        document.save(update_fields=["storage_status", "storage_error", "updated_at"])

    @staticmethod
    def current_for(candidate: Candidate) -> ResumeDocument | None:
        return (
            ResumeDocument.objects.filter(candidate=candidate, status=ResumeStatus.PARSED)
            .order_by("-ingested_at", "-created_at")
            .first()
        )

    @staticmethod
    def pending_upload():
        return ResumeDocument.objects.filter(
            status=ResumeStatus.PARSED,
            storage_status__in=[StorageStatus.PENDING_UPLOAD, StorageStatus.FAILED],
        ).order_by("created_at")


class ProfileSync:
    """Child collections from a parsed resume, merged by natural key."""

    @staticmethod
    @transaction.atomic
    def sync(candidate: Candidate, profile: ParsedResume, skill_rows: list[dict]) -> dict[str, int]:
        counts = {"skills": 0, "experiences": 0, "education": 0, "certifications": 0}
        counts["skills"] = ProfileSync.sync_skills(candidate, skill_rows)
        counts["experiences"] = ProfileSync.sync_experiences(candidate, profile)
        counts["education"] = ProfileSync.sync_education(candidate, profile)
        counts["certifications"] = ProfileSync.sync_certifications(candidate, profile)
        return counts

    @staticmethod
    def sync_skills(candidate: Candidate, skill_rows: list[dict]) -> int:
        existing = {row.skill: row for row in candidate.skills.all()}
        changed = 0
        for entry in skill_rows:
            key = normalize_skill(entry["name"])
            if not key or not re.search(r"[a-z]", key):
                continue
            proficiency = max(1, min(5, int(entry.get("proficiency") or 3)))
            row = existing.get(key)
            if row is None:
                # Two entries can normalise to one key; the dict keeps the second from
                # colliding with the unique (candidate, skill) constraint.
                existing[key] = CandidateSkill.objects.create(
                    candidate=candidate,
                    skill=key,
                    display_name=display_name(key),
                    proficiency=proficiency,
                    is_primary=bool(entry.get("is_primary")),
                )
                changed += 1
            elif row.proficiency < proficiency or (entry.get("is_primary") and not row.is_primary):
                row.proficiency = max(row.proficiency, proficiency)
                row.is_primary = row.is_primary or bool(entry.get("is_primary"))
                row.save(update_fields=["proficiency", "is_primary", "updated_at"])
                changed += 1
        return changed

    @staticmethod
    def sync_experiences(candidate: Candidate, profile: ParsedResume) -> int:
        existing = {
            (_norm(row.company), _norm(row.title)): row for row in candidate.experiences.all()
        }
        changed = 0
        for entry in profile.experience:
            start, _ = parse_partial_date(entry.start_date)
            end, current = parse_partial_date(entry.end_date)
            if start is None:
                continue
            if end is not None and end < start:
                end = None
            key = (_norm(entry.company), _norm(entry.title))
            row = existing.get(key)
            fields = {
                "start_date": start,
                "end_date": None if current else end,
                "is_current": current,
                "description": entry.description[:4000],
                "domain": (entry.industry or "").strip().lower()[:80] or None,
            }
            if row is None:
                existing[key] = CandidateExperience.objects.create(
                    candidate=candidate,
                    company=entry.company[:160] or "Not stated",
                    title=entry.title[:160] or "Not stated",
                    **fields,
                )
                changed += 1
            elif any(getattr(row, name) != value for name, value in fields.items()):
                for name, value in fields.items():
                    setattr(row, name, value)
                row.save()
                changed += 1
        return changed

    @staticmethod
    def sync_education(candidate: Candidate, profile: ParsedResume) -> int:
        existing = {
            (_norm(row.institution), _norm(row.degree)): row for row in candidate.education.all()
        }
        changed = 0
        for entry in profile.education:
            key = (_norm(entry.institution), _norm(entry.degree))
            if key in existing or not (entry.degree or entry.institution):
                continue
            end_year = entry.end_year or entry.start_year or 0
            existing[key] = CandidateEducation.objects.create(
                candidate=candidate,
                degree=(entry.degree or "Degree")[:40],
                field=entry.field[:120],
                institution=(entry.institution or "Not stated")[:200],
                start_year=entry.start_year or end_year,
                end_year=end_year,
                grade=entry.grade[:40] or None,
            )
            changed += 1
        return changed

    @staticmethod
    def sync_certifications(candidate: Candidate, profile: ParsedResume) -> int:
        existing = {_norm(row.name) for row in candidate.certifications.all()}
        changed = 0
        for entry in profile.certifications:
            key = _norm(entry.name)
            if not key or key in existing:
                continue
            CandidateCertification.objects.create(
                candidate=candidate,
                name=entry.name[:160],
                issuer=entry.issuer[:160] or "Not stated",
                issued_year=entry.year if 1960 <= entry.year <= date.today().year + 1 else 0,
            )
            existing.add(key)
            changed += 1
        return changed


def experience_decimal(value: float) -> Decimal:
    return Decimal(str(round(float(value or 0), 1)))
