"""The PDF bytes that actually go to a cloud model, bounded before they are read.

``LLM_PROVIDER=openai`` and ``gemini`` are handed the resume FILE, not a text
digest, so two limits that never mattered before now do. Pages are the cost
limit -- a provider bills a PDF page as an image, so an unbounded document is an
unbounded invoice, and a sixty-page PDF is almost never a sixty-page resume.
Bytes are the request limit -- an inline attachment travels base64-encoded
(measured at exactly 1.3333x) inside one request body, and the providers cap
that body.

Over the page cap the FIRST ``max_pages`` pages are sent and a warning naming
the setting is recorded, so no file ever dead-ends for being long: identity,
contact details, the current role and the recent experience are on the first
pages of essentially every resume. Over the byte cap there is no request that
can be sent at all, so that one raises ``PdfTooLarge`` and the caller decides
(the text digest when the PDF has a text layer, ``needs_review`` when it does
not).

Deliberately separate from ``resumes.engines.extraction``: that module answers
"what text is in this file", this one answers "what may be put on the wire".
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from pathlib import Path

import pymupdf

logger = logging.getLogger(__name__)


class PdfTooLarge(Exception):
    """The file is over the request-size limit even after the page cap."""


@dataclass(frozen=True)
class PdfPayload:
    """What will be attached to the model request."""

    data: bytes
    file_name: str
    mime_type: str = "application/pdf"
    page_count: int = 0
    pages_sent: int = 0
    warnings: list[str] = field(default_factory=list)

    @property
    def size_mb(self) -> float:
        return len(self.data) / (1024 * 1024)

    @property
    def truncated(self) -> bool:
        return 0 < self.pages_sent < self.page_count


def _mb(size_bytes: int) -> float:
    return size_bytes / (1024 * 1024)


def load_pdf_for_model(
    path: str | Path, *, file_name: str, max_pages: int, max_mb: int
) -> PdfPayload:
    """The bytes to attach, truncated to ``max_pages`` and refused over ``max_mb``.

    Never loads a file it is about to refuse: the page count comes from the page
    tree without reading the content streams, and the whole file is only read
    when it is both within the page cap and within the size cap.
    """
    file_path = Path(path)
    limit = max(0, int(max_mb)) * 1024 * 1024
    warnings: list[str] = []
    try:
        document = pymupdf.open(file_path)
    except Exception as exc:  # noqa: BLE001 - PyMuPDF raises several unrelated types
        raise PdfTooLarge(f"{file_path.name}: cannot open as PDF ({exc})") from exc
    try:
        page_count = document.page_count
        if page_count > max_pages > 0:
            subset = pymupdf.open()
            try:
                subset.insert_pdf(document, from_page=0, to_page=max_pages - 1)
                data = subset.tobytes()
            finally:
                subset.close()
            pages_sent = max_pages
            warnings.append(
                f"sent the first {max_pages} of {page_count} pages to the model; "
                "raise RESUME_LLM_PDF_MAX_PAGES to send more"
            )
        else:
            pages_sent = page_count
            size = file_path.stat().st_size
            if size > limit:
                raise PdfTooLarge(
                    f"{file_path.name} is {_mb(size):.1f} MB, over RESUME_LLM_PDF_MAX_MB={max_mb}"
                )
            data = file_path.read_bytes()
    finally:
        document.close()
    if len(data) > limit:
        raise PdfTooLarge(
            f"the first {pages_sent} page(s) of {file_path.name} are "
            f"{_mb(len(data)):.1f} MB, over RESUME_LLM_PDF_MAX_MB={max_mb}"
        )
    # Size, pages and mime type only: the base64 payload is megabytes long and
    # must never reach a log line, an exception message or ResumeDocument.warnings.
    logger.info(
        "attaching %s to the model: %d/%d page(s), %.1f MB (application/pdf)",
        file_name,
        pages_sent,
        page_count,
        _mb(len(data)),
    )
    return PdfPayload(
        data=data,
        file_name=file_name,
        page_count=page_count,
        pages_sent=pages_sent,
        warnings=warnings,
    )
