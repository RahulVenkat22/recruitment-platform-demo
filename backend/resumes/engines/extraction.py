"""PDF -> text with PyMuPDF (no OCR, no cloud).

``extract_text`` opens the file, reads every page in reading order, cleans the
whitespace and reports whether enough text came out to be worth parsing. A
scanned or empty PDF is not an error here: the caller decides what to do with
``ExtractedText.is_sufficient``.
"""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass
from pathlib import Path

import pymupdf

_CONTROL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
_SPACES = re.compile(r"[ \t ]+")
_BLANK_LINES = re.compile(r"\n{3,}")
_BULLETS = re.compile(r"^[\s]*[•●▪■◦○»–\-*]+\s*", re.MULTILINE)


class ExtractionError(Exception):
    """The file could not be opened or read as a PDF."""


@dataclass(frozen=True)
class ExtractedText:
    path: str
    file_name: str
    file_hash: str
    file_size: int
    page_count: int
    pages: tuple[str, ...]
    text: str
    min_chars: int

    @property
    def char_count(self) -> int:
        return len(self.text)

    @property
    def is_sufficient(self) -> bool:
        return self.char_count >= self.min_chars


def sha256_of(path: str | Path) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for block in iter(lambda: handle.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def clean_text(raw: str) -> str:
    """Normalise whitespace and bullets while keeping line and paragraph breaks."""

    text = _CONTROL.sub("", raw or "")
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = _SPACES.sub(" ", text)
    text = _BULLETS.sub("- ", text)
    lines = [line.strip() for line in text.split("\n")]
    text = "\n".join(lines)
    text = _BLANK_LINES.sub("\n\n", text)
    return text.strip()


def extract_text(
    path: str | Path, *, min_chars: int, file_hash: str | None = None
) -> ExtractedText:
    file_path = Path(path)
    if not file_path.is_file():
        raise ExtractionError(f"{file_path} does not exist")
    try:
        document = pymupdf.open(file_path)
    except Exception as exc:  # noqa: BLE001 - PyMuPDF raises several unrelated types
        raise ExtractionError(f"{file_path.name}: cannot open as PDF ({exc})") from exc
    try:
        if document.needs_pass and not document.authenticate(""):
            raise ExtractionError(f"{file_path.name}: the PDF is password protected")
        pages: list[str] = []
        for page in document:
            try:
                # sort=True orders blocks top-to-bottom, left-to-right: two-column
                # resumes read as columns rather than interleaved lines.
                pages.append(clean_text(page.get_text("text", sort=True)))
            except Exception as exc:  # noqa: BLE001 - one broken page must not lose the rest
                pages.append("")
                raise ExtractionError(f"{file_path.name}: page {page.number + 1}: {exc}") from exc
        page_count = document.page_count
    finally:
        document.close()
    text = "\n\n".join(page for page in pages if page)
    return ExtractedText(
        path=str(file_path.resolve()),
        file_name=file_path.name,
        file_hash=file_hash or sha256_of(file_path),
        file_size=file_path.stat().st_size,
        page_count=page_count,
        pages=tuple(pages),
        text=text,
        min_chars=min_chars,
    )
