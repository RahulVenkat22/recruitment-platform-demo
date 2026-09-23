"""A job description file -> the form's fields, read by the model.

The New Job Description page lets HR drop the JD they already have as a PDF or
a Word file. A PDF goes to the model as the file itself, the way a resume does;
a ``.docx`` goes as its text, since neither provider reads Word files. The
model also counts the job postings in the document, and the file is refused
when it holds none (a resume, a policy) or more than one, so the form is only
ever filled from a single job description.
"""

from __future__ import annotations

import io
import re
import zipfile
from typing import Any
from xml.etree import ElementTree

import pymupdf
from django.conf import settings
from django.db import models
from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import BaseModel, Field

from common import locations
from common.enums import EmploymentType, WorkMode
from jobs.exceptions import InvalidJobFile, JobFileNotRead
from resumes.engines.llm import LLMBusy, LLMError, invoke_structured, invoke_structured_with_file

MAX_MB = 10
MAX_PAGES = 12
# Sized together: the answer repeats the document's text (``description``), so what
# is sent must fit in the answer budget with room for the rest of the JSON.
MAX_TEXT_CHARS = 40_000
ANSWER_TOKENS = 16_384
# The decompressed body of a .docx; a compressed 10 MB upload could unpack to gigabytes.
MAX_DOCX_XML_BYTES = 20 * 1024 * 1024
EXPERIENCE_MAX_YEARS = 50
OPENINGS_MAX = 500


class ExtractedJobDescription(BaseModel):
    """The model's reading of the file; every field defaults so a partial answer validates."""

    # Distinct job postings in the document; 0 when it is not a job description at all.
    job_count: int = 0
    title: str = ""
    department: str = ""
    location: str = ""
    # onsite | hybrid | remote, or empty when the document does not say.
    work_mode: str = ""
    # full_time | part_time | contract | internship, or empty when the document does not say.
    employment_type: str = ""
    experience_min_years: int = 0
    experience_max_years: int = 0
    openings: int = 0
    domain: str = ""
    salary_min: int = 0
    salary_max: int = 0
    salary_currency: str = ""
    required_skills: list[str] = Field(default_factory=list)
    preferred_skills: list[str] = Field(default_factory=list)
    education_requirements: str = ""
    responsibilities: str = ""
    qualifications: str = ""
    additional_requirements: str = ""
    description: str = ""


_SYSTEM = SystemMessage(
    content=(
        "You are an expert technical recruiter reading a job description document and returning "
        "structured JSON for a job posting form. First count the distinct job postings in the "
        "document as job_count: each posting has its own job title, and one posting that lists "
        "several openings, teams or locations is still one. A resume, a policy or any other "
        "document that is not a job description is 0. Fill the remaining fields from the "
        "document when job_count is 1. Use only what the document states and leave a field "
        "empty (or 0) when it says nothing. title is the job title. work_mode is onsite, hybrid "
        "or remote. employment_type is full_time, part_time, contract or internship. "
        "experience_min_years and experience_max_years are whole years ('4-8 years' is 4 and 8, "
        "'5+ years' is 5 and 0). openings is the number of positions. domain is the industry "
        "(fintech, healthcare, ecommerce ...). salary_min and salary_max are whole annual amounts "
        "in the stated currency ('18-28 LPA' is 1800000 and 2800000; a monthly figure times 12) "
        "and salary_currency its ISO code (INR, USD ...). required_skills are the technologies "
        "or competencies the text treats as mandatory and preferred_skills the rest, as short "
        "canonical names ('Python', 'PostgreSQL', 'AWS'). education_requirements is the degree "
        "asked for. responsibilities and qualifications are the document's own bullet points, "
        "one per line, without bullet characters. additional_requirements is anything else the "
        "candidate must meet (shift, travel, notice period). description is the full job "
        "description text as written in the document, laid out as markdown with '# ' headings "
        "and '- ' bullets."
    )
)


def extract_job_description(upload: Any) -> dict[str, Any]:
    """The form fields read from one uploaded JD file, blanks left out.

    Raises ``InvalidJobFile`` for a file that is not a PDF or ``.docx``, is too
    big or long, or does not hold exactly one job description, and
    ``JobFileNotRead`` when the model could not be asked.
    """
    name = str(getattr(upload, "name", "") or "")
    suffix = name.rsplit(".", 1)[-1].lower() if "." in name else ""
    if suffix not in ("pdf", "docx"):
        raise InvalidJobFile("Upload the job description as a PDF or a Word (.docx) file.")
    if upload.size > MAX_MB * 1024 * 1024:
        raise InvalidJobFile(f"The file is larger than {MAX_MB} MB.")
    data = upload.read()
    prompt = f"The attached file is the job description {name!r}. Read it and return the JSON."
    if suffix == "pdf":
        _check_pdf(data)
        messages = [_SYSTEM, HumanMessage(content=prompt)]
        answer = _ask(messages, data=data, file_name=name)
    else:
        text = docx_text(data)[:MAX_TEXT_CHARS]
        messages = [_SYSTEM, HumanMessage(content=f"{prompt}\n\nDOCUMENT:\n{text}")]
        answer = _ask(messages)
    if answer.job_count == 0:
        raise InvalidJobFile(f"{name} does not look like a job description.")
    if answer.job_count > 1:
        raise InvalidJobFile(
            f"{name} contains {answer.job_count} job descriptions; upload one at a time."
        )
    return _fields(answer)


def _check_pdf(data: bytes) -> None:
    try:
        document = pymupdf.open(stream=data, filetype="pdf")
    except Exception as exc:  # noqa: BLE001 - PyMuPDF raises several unrelated types
        raise InvalidJobFile("The file could not be opened as a PDF.") from exc
    with document:
        if document.needs_pass:
            raise InvalidJobFile("The PDF is password protected.")
        if document.page_count > MAX_PAGES:
            raise InvalidJobFile(
                f"The PDF has {document.page_count} pages; one job description fits in {MAX_PAGES}."
            )


def docx_text(data: bytes) -> str:
    """The paragraphs of a ``.docx`` in reading order, tables and text boxes included."""
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            entry = archive.getinfo("word/document.xml")
            if entry.file_size > MAX_DOCX_XML_BYTES:
                raise InvalidJobFile("The Word document is too large to read.")
            root = ElementTree.fromstring(archive.read(entry))
    except InvalidJobFile:
        raise
    except Exception as exc:  # noqa: BLE001 - zipfile, zlib and expat raise several unrelated types
        raise InvalidJobFile("The file could not be opened as a Word document.") from exc
    lines: list[str] = []
    _walk(root, [], lines)
    if not lines:
        raise InvalidJobFile("The Word document has no readable text.")
    return "\n".join(lines)


def _walk(node: ElementTree.Element, parts: list[str], lines: list[str]) -> None:
    """Collect ``node``'s text into ``parts``; every paragraph, a nested one (a text box)
    included, becomes its own line. Tags are matched by local name, so the transitional
    and the strict WordprocessingML namespaces both read."""
    for child in node:
        tag = child.tag.rsplit("}", 1)[-1]
        if tag == "Fallback":
            # mc:AlternateContent repeats a text box for older Word versions.
            continue
        if tag == "p":
            own: list[str] = []
            _walk(child, own, lines)
            line = " ".join("".join(own).split())
            if line:
                lines.append(line)
        elif tag == "t":
            parts.append(child.text or "")
        elif tag in ("tab", "br"):
            parts.append(" ")
        else:
            _walk(child, parts, lines)


def _ask(
    messages: list[Any], *, data: bytes | None = None, file_name: str = ""
) -> ExtractedJobDescription:
    """The model's answer; ``LLM_FALLBACK_MODEL`` is tried once when the main model is busy."""
    model, fallback = settings.LLM_MODEL, settings.LLM_FALLBACK_MODEL
    try:
        try:
            return _invoke(messages, model, data=data, file_name=file_name)
        except LLMBusy:
            if not fallback or fallback == model:
                raise
            return _invoke(messages, fallback, data=data, file_name=file_name)
    except LLMError as exc:
        raise JobFileNotRead(f"The AI could not read the file: {exc}") from exc


def _invoke(
    messages: list[Any], model: str, *, data: bytes | None, file_name: str
) -> ExtractedJobDescription:
    if data is None:
        return invoke_structured(
            ExtractedJobDescription, messages, model=model, num_predict=ANSWER_TOKENS
        )
    return invoke_structured_with_file(
        ExtractedJobDescription,
        messages,
        data=data,
        file_name=file_name,
        model=model,
        num_predict=ANSWER_TOKENS,
    )


def _choice(value: str, choices: type[models.TextChoices]) -> str:
    """``"Full-time"`` -> ``"full_time"``, ``"On-site"`` -> ``"onsite"``, else ``""``."""
    key = re.sub(r"[^a-z]", "", value.lower())
    return next((choice for choice in choices.values if choice.replace("_", "") == key), "")


def _skills(names: list[str]) -> list[str]:
    """Trimmed and de-duplicated regardless of case, at most 40."""
    seen: set[str] = set()
    result: list[str] = []
    for name in names:
        cleaned = " ".join(name.split())[:80]
        if cleaned and cleaned.lower() not in seen:
            seen.add(cleaned.lower())
            result.append(cleaned)
    return result[:40]


def _fields(answer: ExtractedJobDescription) -> dict[str, Any]:
    """The answer as create-request fields; a field the model left blank is left out."""
    years = [
        min(max(y, 0), EXPERIENCE_MAX_YEARS)
        for y in (answer.experience_min_years, answer.experience_max_years)
    ]
    if years[1] and years[1] < years[0]:
        years.reverse()
    salaries = [max(s, 0) for s in (answer.salary_min, answer.salary_max)]
    if salaries[1] and salaries[1] < salaries[0]:
        salaries.reverse()
    currency = answer.salary_currency.strip().upper()
    fields = {
        "title": answer.title,
        "department": answer.department,
        "location": locations.normalise(answer.location),
        "work_mode": _choice(answer.work_mode, WorkMode),
        "employment_type": _choice(answer.employment_type, EmploymentType),
        "openings": min(max(answer.openings, 0), OPENINGS_MAX),
        "domain": answer.domain,
        "salary_min": salaries[0],
        "salary_max": salaries[1],
        "salary_currency": currency if len(currency) == 3 and currency.isalpha() else "",
        "required_skills": _skills(answer.required_skills),
        "preferred_skills": _skills(answer.preferred_skills),
        "education_requirements": answer.education_requirements,
        "responsibilities": answer.responsibilities,
        "qualifications": answer.qualifications,
        "additional_requirements": answer.additional_requirements,
        "description": answer.description,
    }
    cleaned = {
        name: value.strip() if isinstance(value, str) else value for name, value in fields.items()
    }
    result = {name: value for name, value in cleaned.items() if value not in ("", 0, [])}
    # A 0 minimum is a real value ("0-2 years") whenever the model gave a range.
    if years[0] or years[1]:
        result["experience_min_years"] = years[0]
    if years[1]:
        result["experience_max_years"] = years[1]
    return result
