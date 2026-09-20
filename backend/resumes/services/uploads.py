"""Push ingested PDFs to S3 once the credentials exist (``manage.py upload_resumes``)."""

from __future__ import annotations

import logging
from collections.abc import Callable
from dataclasses import dataclass, field

from resumes.engines.storage import StorageError, get_storage
from resumes.models import ResumeDocument
from resumes.repositories import ResumeRepository

logger = logging.getLogger(__name__)


@dataclass
class UploadStats:
    total: int = 0
    uploaded: int = 0
    failed: int = 0
    missing_files: int = 0
    errors: list[str] = field(default_factory=list)


def upload_pending(
    *,
    limit: int | None = None,
    progress: Callable[[int, int, ResumeDocument, str], None] | None = None,
) -> UploadStats:
    storage = get_storage()
    stats = UploadStats()
    if not storage.configured:
        raise StorageError(storage.not_configured_message())
    queryset = ResumeRepository.pending_upload()
    documents = list(queryset[:limit] if limit else queryset)
    stats.total = len(documents)
    for index, document in enumerate(documents, start=1):
        key = storage.object_key(str(document.pk), document.file_name)
        try:
            storage.upload_file(document.source_path, key)
        except FileNotFoundError:
            stats.missing_files += 1
            ResumeRepository.mark_upload_pending(
                document, f"local file missing: {document.source_path}", failed=True
            )
            status = "missing local file"
        except StorageError as exc:
            stats.failed += 1
            stats.errors.append(f"{document.file_name}: {exc}")
            ResumeRepository.mark_upload_pending(document, str(exc), failed=True)
            status = "failed"
        else:
            stats.uploaded += 1
            ResumeRepository.mark_uploaded(document, key)
            status = "uploaded"
        if progress:
            progress(index, stats.total, document, status)
    return stats
