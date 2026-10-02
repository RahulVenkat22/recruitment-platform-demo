"""Validate PDF uploads, persist their bytes, and enqueue durable per-document work.

PostgreSQL transactions coordinate batch metadata and work records. The storage
backend is private S3 in production and a shared media directory in local Compose.
"""

from __future__ import annotations

import logging
import re
from dataclasses import asdict, dataclass, field
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Any
from uuid import UUID, uuid4

from django.conf import settings
from django.core.files import File
from django.db import connection, transaction
from django.db.models import Count, Max, Min, Q
from django.utils import timezone

from resumes.engines.extraction import sha256_of
from resumes.models import DocumentOrigin, ResumeDocument, ResumeStatus
from resumes.repositories import ResumeRepository
from resumes.services.ingestion import ResumeIngestionService
from workqueue.models import WorkItem
from workqueue.services import enqueue

logger = logging.getLogger(__name__)

_UNSAFE = re.compile(r"[^A-Za-z0-9._ -]+")
PDF_MAGIC = b"%PDF"


@dataclass
class IntakeFile:
    file_name: str
    status: str  # accepted | duplicate | rejected
    reason: str = ""
    document_id: str | None = None
    candidate_id: str | None = None
    candidate_name: str = ""

    def as_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class IntakeResult:
    batch_id: str
    accepted: list[IntakeFile] = field(default_factory=list)
    duplicates: list[IntakeFile] = field(default_factory=list)
    rejected: list[IntakeFile] = field(default_factory=list)


def safe_file_name(name: str) -> str:
    base = Path(name or "resume.pdf").name
    cleaned = _UNSAFE.sub("_", base).strip(" ._") or "resume.pdf"
    if not cleaned.lower().endswith(".pdf"):
        cleaned += ".pdf"
    return cleaned[:200]


def _unique_path(folder: Path, name: str) -> Path:
    path = folder / name
    stem, suffix = path.stem, path.suffix
    counter = 2
    while path.exists():
        path = folder / f"{stem} ({counter}){suffix}"
        counter += 1
    return path


def store_uploads(files: list[Any], user: Any) -> IntakeResult:
    # Temporary files exist only while validating; acknowledged inputs are durable.
    with TemporaryDirectory(prefix="resume-intake-") as folder:
        return _store_uploads(files, user, Path(folder))


@transaction.atomic
def _store_uploads(files: list[Any], user: Any, folder: Path) -> IntakeResult:
    """Persist the uploaded files, create their documents, and queue the batch."""
    batch_id = uuid4()
    result = IntakeResult(batch_id=str(batch_id))
    max_bytes = int(settings.RESUME_UPLOAD_MAX_MB) * 1024 * 1024

    for upload in files[: int(settings.RESUME_UPLOAD_MAX_FILES)]:
        original = Path(str(getattr(upload, "name", "") or "resume.pdf")).name
        name = safe_file_name(original)
        if not original.lower().endswith(".pdf"):
            result.rejected.append(IntakeFile(original, "rejected", "only PDF files are accepted"))
            continue
        if upload.size > max_bytes:
            result.rejected.append(
                IntakeFile(name, "rejected", f"larger than {settings.RESUME_UPLOAD_MAX_MB} MB")
            )
            continue
        path = _unique_path(folder, name)
        with open(path, "wb") as handle:
            for chunk in upload.chunks():
                handle.write(chunk)
        with open(path, "rb") as handle:
            if not handle.read(5).startswith(PDF_MAGIC):
                path.unlink(missing_ok=True)
                result.rejected.append(IntakeFile(name, "rejected", "the file is not a PDF"))
                continue
        file_hash = sha256_of(path)
        with connection.cursor() as cursor:
            cursor.execute("SELECT pg_advisory_xact_lock(%s)", [int(file_hash[:15], 16)])
        existing = ResumeRepository.by_hash(file_hash)
        active_work = (
            existing is not None
            and WorkItem.objects.filter(
                key=f"resume:{existing.pk}",
                status__in=[WorkItem.Status.PENDING, WorkItem.Status.RUNNING],
            ).exists()
        )
        if existing is not None and (
            active_work
            or existing.status
            in (
                ResumeStatus.PARSED,
                ResumeStatus.SUPERSEDED,
                ResumeStatus.PENDING,
            )
        ):
            path.unlink(missing_ok=True)
            candidate = existing.candidate
            result.duplicates.append(
                IntakeFile(
                    name,
                    "duplicate",
                    "this exact file is already in the library",
                    document_id=str(existing.pk),
                    candidate_id=str(candidate.pk) if candidate else None,
                    candidate_name=candidate.full_name if candidate else "",
                )
            )
            continue
        if existing is not None:
            # A file that failed or needs review earlier: take this upload as the retry.
            document = existing
            document.file_name = path.name
            document.source_path = str(path.resolve())
            document.file_size = path.stat().st_size
        else:
            document = ResumeDocument(
                file_name=path.name,
                source_path=str(path.resolve()),
                file_hash=file_hash,
                file_size=path.stat().st_size,
            )
        document.origin = DocumentOrigin.UPLOAD
        document.upload_batch = batch_id
        document.uploaded_by = user if getattr(user, "pk", None) else None
        document.status = ResumeStatus.PENDING
        document.status_reason = ""
        with transaction.atomic():
            # S3 writes precede the commit. A DB rollback may leave an orphan;
            # retention maintenance removes orphans, never acknowledged inputs.
            with path.open("rb") as source:
                document.input_file.save(f"{document.pk}/{name}", File(source), save=False)
            document.source_path = document.input_file.name
            document.save()
            if getattr(settings, "RESUME_INGEST_ASYNC", True):
                enqueue(
                    "resume", f"resume:{document.pk}", {"id": str(document.pk)}, reschedule=True
                )
        result.accepted.append(IntakeFile(path.name, "accepted", document_id=str(document.pk)))

    if result.accepted:
        if not getattr(settings, "RESUME_INGEST_ASYNC", True):
            process_batch(batch_id)
    return result


def process_batch(batch_id: UUID) -> None:
    """Run every pending document of the batch through the ingestion graph, in order."""
    documents = ResumeDocument.objects.filter(
        upload_batch=batch_id, status=ResumeStatus.PENDING
    ).order_by("created_at")
    for document in documents:
        result = ResumeIngestionService.ingest_document(document)
        logger.info("upload %s: %s -> %s", batch_id, document.file_name, result.outcome)


class IngestionQueue:
    """Database-backed batch status, shared by every API and worker replica."""

    def _jobs(self, batch_id):
        ids = ResumeDocument.objects.filter(upload_batch=batch_id).values_list("pk", flat=True)
        return WorkItem.objects.filter(kind="resume", payload__id__in=[str(pk) for pk in ids])

    def enqueue(self, batch_id):
        for pk in ResumeDocument.objects.filter(upload_batch=batch_id).values_list("pk", flat=True):
            enqueue("resume", f"resume:{pk}", {"id": str(pk)}, reschedule=True)

    def is_active(self, batch_id):
        return self._jobs(batch_id).filter(status=WorkItem.Status.RUNNING).exists()

    def is_queued(self, batch_id):
        return self._jobs(batch_id).filter(status=WorkItem.Status.PENDING).exists()

    def position(self, batch_id):
        return 0  # Concurrent workers do not provide a stable FIFO position.


def ingestion_queue():
    return IngestionQueue()


# ------------------------------------------------------------------ status


def batch_documents(batch_id: UUID):
    return (
        ResumeDocument.objects.filter(upload_batch=batch_id)
        .select_related("candidate", "uploaded_by")
        .order_by("created_at", "file_name")
    )


def batch_status(batch_id: UUID) -> dict[str, Any] | None:
    documents = list(batch_documents(batch_id))
    if not documents:
        return None
    counts = {key: 0 for key in ResumeStatus.values}
    for document in documents:
        counts[document.status] += 1
    pending = counts[ResumeStatus.PENDING]
    q = ingestion_queue()
    running = pending > 0 and (q.is_active(batch_id) or q.is_queued(batch_id))
    return {
        "batch_id": str(batch_id),
        "created_at": min(document.created_at for document in documents),
        "uploaded_by": documents[0].uploaded_by,
        "total": len(documents),
        "done": len(documents) - pending,
        "counts": counts,
        "running": running,
        # No active/recoverable work record: operations must inspect this document.
        "stalled": pending > 0 and not running,
        "queue_position": q.position(batch_id),
        "documents": documents,
    }


def recent_batches(limit: int = 10) -> list[dict[str, Any]]:
    rows = (
        ResumeDocument.objects.filter(upload_batch__isnull=False)
        .values("upload_batch")
        .annotate(
            total=Count("id"),
            parsed=Count("id", filter=Q(status=ResumeStatus.PARSED)),
            needs_review=Count("id", filter=Q(status=ResumeStatus.NEEDS_REVIEW)),
            failed=Count("id", filter=Q(status=ResumeStatus.FAILED)),
            pending=Count("id", filter=Q(status=ResumeStatus.PENDING)),
            created_at=Min("created_at"),
            last_activity=Max("updated_at"),
        )
        .order_by("-created_at")[:limit]
    )
    return [
        {
            "batch_id": str(row["upload_batch"]),
            "created_at": row["created_at"],
            "total": row["total"],
            "parsed": row["parsed"],
            "needs_review": row["needs_review"],
            "failed": row["failed"],
            "pending": row["pending"],
            "last_activity": row["last_activity"] or timezone.now(),
        }
        for row in rows
    ]
