"""Opening a candidate's resume: a pre-signed S3 link, or a precise reason why not."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from resumes.engines.storage import StorageError, StorageNotConfigured, get_storage
from resumes.exceptions import (
    ResumeNotFound,
    ResumeNotUploaded,
    ResumeStorageError,
    ResumeStorageNotConfigured,
)
from resumes.models import ResumeDocument, StorageStatus
from resumes.repositories import ResumeRepository


@dataclass(frozen=True)
class ResumeLink:
    url: str
    expires_at: datetime
    file_name: str
    document_id: str


def current_document(candidate) -> ResumeDocument | None:
    return ResumeRepository.current_for(candidate)


def resume_link_for(candidate) -> ResumeLink:
    document = current_document(candidate)
    if document is None:
        raise ResumeNotFound
    storage = get_storage()
    if not storage.configured:
        raise ResumeStorageNotConfigured(storage.not_configured_message())
    if document.storage_status != StorageStatus.UPLOADED or not document.storage_key:
        detail = (
            f"{document.file_name} has not been uploaded to S3 yet"
            + (f" (last attempt: {document.storage_error})" if document.storage_error else "")
            + ". Run `manage.py upload_resumes` to push pending files."
        )
        raise ResumeNotUploaded(detail)
    try:
        link = storage.presigned_url(document.storage_key)
    except StorageNotConfigured as exc:
        raise ResumeStorageNotConfigured(str(exc)) from exc
    except StorageError as exc:
        raise ResumeStorageError(str(exc)) from exc
    return ResumeLink(
        url=link.url,
        expires_at=link.expires_at,
        file_name=document.file_name,
        document_id=str(document.pk),
    )
