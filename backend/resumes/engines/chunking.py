"""Parsed resume -> the chunks that get embedded.

One embedding for a whole eight-page resume would average everything into
noise, so each candidate gets small, self-describing chunks: a profile
summary, the skill list, one chunk per role (split further when a role's
description is long), education, certifications, projects -- plus windows over
the raw text so anything the parser did not structure is still searchable.
Every chunk starts with a header line (candidate, section) because the
embedding model only sees the chunk.
"""

from __future__ import annotations

from dataclasses import dataclass

from langchain_text_splitters import RecursiveCharacterTextSplitter

from matching.skills import display_name
from resumes.engines.schemas import ParsedResume

MAX_TEXT_CHUNKS = 24


@dataclass(frozen=True)
class ChunkDraft:
    section: str
    index: int
    content: str

    @property
    def char_count(self) -> int:
        return len(self.content)


def _splitter(chunk_size: int, overlap: int) -> RecursiveCharacterTextSplitter:
    return RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=overlap,
        separators=["\n\n", "\n", ". ", "; ", ", ", " ", ""],
        length_function=len,
    )


def _pieces(text: str, chunk_size: int, overlap: int) -> list[str]:
    text = text.strip()
    if not text:
        return []
    if len(text) <= chunk_size:
        return [text]
    return [
        piece.strip() for piece in _splitter(chunk_size, overlap).split_text(text) if piece.strip()
    ]


def build_chunks(
    profile: ParsedResume,
    raw_text: str,
    *,
    chunk_size: int,
    overlap: int,
) -> list[ChunkDraft]:
    name = profile.full_name or "Candidate"
    drafts: list[ChunkDraft] = []
    seen: set[str] = set()

    def add(section: str, body: str, header: str) -> None:
        for piece in _pieces(body, chunk_size - len(header) - 2, overlap):
            content = f"{header}\n{piece}"
            key = content.lower()
            if key in seen:
                continue
            seen.add(key)
            drafts.append(
                ChunkDraft(section=section, index=_next(drafts, section), content=content)
            )

    headline = " ".join(
        part
        for part in (
            profile.current_title,
            "at" if profile.current_title and profile.current_company else "",
            profile.current_company,
        )
        if part
    ).strip()
    profile_lines = [
        line
        for line in (
            f"Headline: {headline}" if headline else "",
            f"Location: {profile.location}" if profile.location else "",
            f"Total experience: {profile.total_experience_years:g} years"
            if profile.total_experience_years
            else "",
            profile.summary,
        )
        if line
    ]
    add("summary", "\n".join(profile_lines), f"{name} — Profile summary")

    if profile.skills:
        skills = ", ".join(display_name(key) for key in profile.skills)
        add("skills", f"Skills: {skills}", f"{name} — Skills")

    for row in profile.experience:
        when = " – ".join(part for part in (row.start_date, row.end_date) if part)
        title_line = " ".join(
            part
            for part in (row.title, "at" if row.title and row.company else "", row.company)
            if part
        )
        lines = [
            line
            for line in (
                title_line,
                f"Period: {when}" if when else "",
                f"Industry: {row.industry}" if row.industry else "",
                row.description,
            )
            if line
        ]
        add("experience", "\n".join(lines), f"{name} — Experience: {title_line or 'role'}"[:140])

    if profile.education:
        lines = []
        for row in profile.education:
            years = "–".join(str(y) for y in (row.start_year, row.end_year) if y)
            lines.append(
                " ".join(
                    part
                    for part in (
                        row.degree,
                        row.field,
                        f"at {row.institution}" if row.institution else "",
                        f"({years})" if years else "",
                    )
                    if part
                )
            )
        add("education", "\n".join(lines), f"{name} — Education")

    if profile.certifications:
        lines = [
            " ".join(
                part
                for part in (
                    row.name,
                    f"({row.issuer})" if row.issuer else "",
                    str(row.year) if row.year else "",
                )
                if part
            )
            for row in profile.certifications
        ]
        add("certifications", "\n".join(lines), f"{name} — Certifications")

    for row in profile.projects:
        lines = [
            line
            for line in (
                row.name,
                row.description,
                ("Technologies: " + ", ".join(row.technologies)) if row.technologies else "",
            )
            if line
        ]
        add("projects", "\n".join(lines), f"{name} — Project: {row.name}"[:140])

    # Raw windows last, capped so a 13-page resume does not dominate the index.
    for piece in _pieces(raw_text, chunk_size, overlap)[:MAX_TEXT_CHUNKS]:
        add("text", piece, f"{name} — Resume text")
    return drafts


def _next(drafts: list[ChunkDraft], section: str) -> int:
    return sum(1 for draft in drafts if draft.section == section)


def reconstruct_text(profile: ParsedResume) -> str:
    """Plain prose rebuilt from the structured answer, for a PDF with no text layer.

    Only the ``text`` chunks above come from ``raw_text``; the structured
    sections are derived from the profile and survive an empty extraction on
    their own. But a scanned PDF read by a cloud model has no raw text at all,
    and that free-phrasing window is what catches wording the schema has no
    field for -- so it is rebuilt deterministically from the profile instead.
    The same string is what ``Candidate.resume_text`` gets, which is the
    match-evidence excerpt the LLM evaluator falls back to.

    Derived data, and used ONLY where the extraction was insufficient: a good
    text layer is never replaced by this. ``ResumeDocument.extracted_text`` and
    ``text_chars`` are deliberately left at what PyMuPDF actually found, because
    they are the record of that and the signal that explains the missing
    ``text`` chunks later.
    """
    lines: list[str] = []
    if profile.full_name:
        lines.append(profile.full_name)
    headline = " ".join(
        part
        for part in (
            profile.current_title,
            "at" if profile.current_title and profile.current_company else "",
            profile.current_company,
        )
        if part
    ).strip()
    if headline:
        lines.append(headline)
    for label, value in (
        ("Location", profile.location),
        ("Email", profile.email),
        ("Phone", profile.phone),
        ("LinkedIn", profile.linkedin_url),
        ("GitHub", profile.github_url),
    ):
        if value:
            lines.append(f"{label}: {value}")
    if profile.total_experience_years:
        lines.append(f"Total experience: {profile.total_experience_years:g} years")
    if profile.summary:
        lines += ["", "Summary", profile.summary]
    if profile.skills:
        lines += ["", "Skills", ", ".join(display_name(key) for key in profile.skills)]
    if profile.experience:
        lines += ["", "Experience"]
        for row in profile.experience:
            when = " – ".join(part for part in (row.start_date, row.end_date) if part)
            title_line = " ".join(
                part
                for part in (row.title, "at" if row.title and row.company else "", row.company)
                if part
            )
            head = ", ".join(part for part in (title_line, when, row.location) if part)
            if head:
                lines.append(head)
            if row.industry:
                lines.append(f"Industry: {row.industry}")
            if row.description:
                lines.append(row.description)
            lines.append("")
    if profile.education:
        lines += ["Education"]
        for row in profile.education:
            years = "–".join(str(year) for year in (row.start_year, row.end_year) if year)
            lines.append(
                " ".join(
                    part
                    for part in (
                        row.degree,
                        row.field,
                        f"at {row.institution}" if row.institution else "",
                        f"({years})" if years else "",
                        f"grade {row.grade}" if row.grade else "",
                    )
                    if part
                )
            )
        lines.append("")
    if profile.certifications:
        lines += ["Certifications"]
        for row in profile.certifications:
            lines.append(
                " ".join(
                    part
                    for part in (
                        row.name,
                        f"({row.issuer})" if row.issuer else "",
                        str(row.year) if row.year else "",
                    )
                    if part
                )
            )
        lines.append("")
    if profile.projects:
        lines += ["Projects"]
        for row in profile.projects:
            lines.append(row.name)
            if row.description:
                lines.append(row.description)
            if row.technologies:
                lines.append("Technologies: " + ", ".join(row.technologies))
            lines.append("")
    return "\n".join(lines).strip()
