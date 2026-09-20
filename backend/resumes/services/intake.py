"""Resume PDFs uploaded through the API (``POST /resumes/uploads/``).

Files are written under ``RESUME_STORAGE_PATH/uploads/<batch>/`` (so the folder
command and the upload API share one library), validated (extension, size,
``%PDF`` header), de-duplicated by SHA-256 against what is already ingested,
and recorded as ``pending`` documents that share a batch id. A single
in-process worker thread then runs each file through the ingestion graph in
order; ``batch_status`` is what the upload page polls.
"""

from __future__ import annotations

import logging
import queue
import re
import threading
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any
from uuid import UUID, uuid4

from django.conf import settings
from django.db import connections
from django.db.models import Count, Max, Min, Q
from django.utils import timezone

from resumes.engines.extraction import sha256_of
from resumes.models import DocumentOrigin, ResumeDocument, ResumeStatus
from resumes.repositories import ResumeRepository
from resumes.services.ingestion import ResumeIngestionService

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
    """Persist the uploaded files, create their documents, and queue the batch."""
    batch_id = uuid4()
    result = IntakeResult(batch_id=str(batch_id))
    max_bytes = int(settings.RESUME_UPLOAD_MAX_MB) * 1024 * 1024
    folder = Path(settings.RESUME_STORAGE_PATH).expanduser() / "uploads" / str(batch_id)
    folder.mkdir(parents=True, exist_ok=True)

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
        existing = ResumeRepository.by_hash(file_hash)
        if existing is not None and existing.status in (
            ResumeStatus.PARSED,
            ResumeStatus.SUPERSEDED,
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
        document.save()
        result.accepted.append(IntakeFile(path.name, "accepted", document_id=str(document.pk)))

    if not folder.exists() or not any(folder.iterdir()):
        folder.rmdir()
    if result.accepted:
        if getattr(settings, "RESUME_INGEST_ASYNC", True):
            ingestion_queue().enqueue(batch_id)
        else:
            process_batch(batch_id)
    return result


def process_batch(batch_id: UUID) -> None:
    """Run every pending document of the batch through the ingestion graph, in order."""
    documents = ResumeDocument.objects.filter(
        upload_batch=batch_id, status=ResumeStatus.PENDING
    ).order_by("created_at")
    for document in documents:
        result = ResumeIngestionService.ingest_file(document.source_path)
        logger.info("upload %s: %s -> %s", batch_id, document.file_name, result.outcome)


class IngestionQueue:
    """One worker thread per process; batches are processed one after another so
    the per-document model and embedding calls never compete for the provider's
    rate limit."""

    def __init__(self) -> None:
        self._queue: queue.Queue[UUID] = queue.Queue()
        self._lock = threading.Lock()
        self._thread: threading.Thread | None = None
        self._active: UUID | None = None
        self._queued: set[UUID] = set()

    def enqueue(self, batch_id: UUID) -> None:
        with self._lock:
            self._queued.add(batch_id)
            self._queue.put(batch_id)
            if self._thread is None or not self._thread.is_alive():
                self._thread = threading.Thread(
                    target=self._run, name="resume-ingestion-worker", daemon=True
                )
                self._thread.start()

    def is_active(self, batch_id: UUID) -> bool:
        with self._lock:
            return self._active == batch_id

    def is_queued(self, batch_id: UUID) -> bool:
        with self._lock:
            return batch_id in self._queued

    def position(self, batch_id: UUID) -> int:
        """0 when running, otherwise how many batches are ahead in the queue."""
        with self._lock:
            if self._active == batch_id:
                return 0
            return len(self._queued) if batch_id in self._queued else 0

    def _run(self) -> None:
        while True:
            try:
                batch_id = self._queue.get(timeout=30)
            except queue.Empty:
                with self._lock:
                    if self._queue.empty():
                        self._thread = None
                        return
                continue
            with self._lock:
                self._queued.discard(batch_id)
                self._active = batch_id
            try:
                process_batch(batch_id)
            except Exception:  # noqa: BLE001 - the worker must survive a broken batch
                logger.exception("resume upload batch %s crashed", batch_id)
            finally:
                with self._lock:
                    self._active = None
                connections.close_all()
                self._queue.task_done()


_QUEUE: IngestionQueue | None = None
_QUEUE_LOCK = threading.Lock()


def ingestion_queue() -> IngestionQueue:
    global _QUEUE
    with _QUEUE_LOCK:
        if _QUEUE is None:
            _QUEUE = IngestionQueue()
        return _QUEUE


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
        # Pending files with no worker on them (e.g. the server restarted):
        # `manage.py ingest_resumes` finishes them because uploads live in the library folder.
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
