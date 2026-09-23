"""Resume PDF -> ``ParsedResume``: the model reads the file, and nothing else parses it.

The PDF itself goes to the model (``LLM_PROVIDER=openai`` or ``gemini``, both of
which read a file): the pages go as they look and the model returns the whole
``ParsedResume``, descriptions included. That answer IS the profile. There is
no regex parser under it any more: no section detection, no contact scraping,
no skill lexicon, no experience-block splitting. A scanned resume parses
exactly like a typed one because the text layer is never asked for a field.

``validate`` then applies the syntactic guards to the model's own answer: a
template address (``someone@example.com``) or a three-digit "phone" is dropped,
dates are parsed and roles without a start date skipped, skills are normalised
and category words removed, field lengths capped. Nothing here consults the
text layer.

The extracted text layer is not read here at all. Its one job is elsewhere:
when PyMuPDF finds enough of it (``RESUME_MIN_TEXT_CHARS``), ``ingestion``
embeds it as the candidate's searchable text, since the full prose beats a
reconstruction from the structured answer; a scan has none, so
``chunking.reconstruct_text`` stands in. No field ever comes from the text.

With no usable model answer the document is shelved as ``needs_review`` (the
``UNREADABLE`` source): a call that fails, an answer with nothing in it, or an
answer whose every value the guards deleted. The model is the parser, so
there is no profile without it, and the next ``ingest_resumes`` run retries
the row.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from datetime import date
from pathlib import Path

from langchain_core.messages import HumanMessage, SystemMessage

from matching.skills import normalize_skill
from resumes.engines.llm import LLMBusy, LLMError, invoke_structured_with_file
from resumes.engines.pdf_payload import PdfPayload
from resumes.engines.schemas import ParsedExperience, ParsedResume

logger = logging.getLogger(__name__)

# ------------------------------------------------------------------ patterns

EMAIL_RE = re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}")

_MONTHS = (
    "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|"
    "sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?"
)
_MONTH_INDEX = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
    "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
}  # fmt: skip
_PRESENT = r"present|current|till\s*date|till\s*now|to\s*date|ongoing|now|today"
YEAR_RE = re.compile(r"(?<!\d)(19|20)\d{2}(?!\d)")

# Words the model sometimes returns as "skills" that are headings, not skills.
_SKILL_CATEGORY_WORDS = frozenset(
    """
    languages language programming frameworks framework databases database tools tool technologies
    technology others other web scripting scripts operating systems system platforms platform ide
    ides servers server version control build automation testing methodologies methodology cloud
    reporting messaging design patterns pattern miscellaneous skills skill technical environment
    environments application applications software hardware libraries library concepts markup
    protocols protocol middleware utilities utility packages package apis api's etc and or
    """.split()
)
_FILE_NOISE = re.compile(
    r"resume|cv|curriculum|vitae|updated|latest|final|new|copy|\(\d+\)|\bv?\d+\b|profile|"
    r"java|python|net|full ?stack|developer|engineer|analyst|ba|pm|qa|devops|aws|data|"
    r"sr|jr|senior|junior|years?|yrs?|exp",
    re.I,
)
_PLACEHOLDER_EMAIL_DOMAINS = frozenset(
    {"example.com", "example.org", "email.com", "domain.com", "test.com", "yourdomain.com"}
)

# ------------------------------------------------------------------- helpers


def phone_digits(value: str) -> str:
    return re.sub(r"\D", "", value or "")


def name_from_file(file_name: str) -> str:
    """``"Jane_Doe_Resume_2024.pdf"`` -> ``"Jane Doe"``; used only when the model gave no name."""
    stem = Path(file_name).stem
    stem = re.sub(r"[_\-.]+", " ", stem)
    stem = _FILE_NOISE.sub(" ", stem)
    words = [word for word in stem.split() if word.isalpha() and len(word) > 1]
    return " ".join(word.capitalize() for word in words[:4])


def _clean_name(value: str) -> str:
    value = re.sub(r"\s+", " ", value).strip(" ,.-|")
    # "CHENNA KESAVA" -> "Chenna Kesava", "Abiral Pandey" stays.
    if value.isupper():
        value = value.title()
    return value[:160]


def _is_skill_key(key: str) -> bool:
    """Normalised keys that can be stored: short, contain a letter, not a category word."""
    if not key or len(key) < 2 or len(key) > 40 or not re.search(r"[a-z]", key):
        return False
    words = key.split(" ")
    return len(words) <= 4 and not all(word in _SKILL_CATEGORY_WORDS for word in words)


def parse_partial_date(value: str) -> tuple[date | None, bool]:
    """``("Jan 2020")`` -> ``(2020-01-01, False)``; ``"Present"`` -> ``(None, True)``."""
    text = (value or "").strip().lower().replace("’", "'")
    if not text:
        return None, False
    if re.fullmatch(_PRESENT, text):
        return None, True
    match = re.search(rf"({_MONTHS})[a-z]*\.?,?\s*'?(\d{{2,4}})", text)
    if match:
        month = _MONTH_INDEX[match.group(1)[:3]]
        year = _year(match.group(2))
        return (date(year, month, 1), False) if year else (None, False)
    match = re.search(r"(\d{1,2})[/\-](\d{4})", text)
    if match and 1 <= int(match.group(1)) <= 12:
        return date(int(match.group(2)), int(match.group(1)), 1), False
    match = re.search(r"(\d{4})[/\-](\d{1,2})", text)
    if match and 1 <= int(match.group(2)) <= 12:
        return date(int(match.group(1)), int(match.group(2)), 1), False
    match = YEAR_RE.search(text)
    if match:
        return date(int(match.group(0)), 1, 1), False
    return None, False


def _year(raw: str) -> int | None:
    value = int(raw)
    if value < 100:
        value += 2000 if value <= date.today().year % 100 + 1 else 1900
    return value if 1960 <= value <= date.today().year + 1 else None


def _plausible_email(value: str) -> bool:
    """Shape-only check: real syntax, not a template address."""
    value = (value or "").strip().lower()
    if not value or not EMAIL_RE.fullmatch(value):
        return False
    return value.rsplit("@", 1)[-1] not in _PLACEHOLDER_EMAIL_DOMAINS


def _plausible_phone(value: str) -> bool:
    """7 to 15 digits: the shortest national numbers up to the international maximum."""
    return 7 <= len(phone_digits(value)) <= 15


# ------------------------------------------------------------------ the model

PDF_ANSWER_TOKENS = 8192

# Returned as the parse source when there is nothing to store. Never persisted:
# the caller routes the document to needs_review instead. Every ParsedResume
# field has a default, so an empty answer validates silently and would
# otherwise look like a clean parse.
UNREADABLE = "unreadable"

# Each role's description is a short summary grounded in that role's own
# bullets: the model is looking at the page, so summarising what is written is
# not invention -- and the descriptions are what give the experience chunks
# their semantic surface when there is no text layer to window over.
_PDF_SYSTEM = SystemMessage(
    content=(
        "You are an expert technical recruiter reading a resume PDF and returning structured "
        "JSON. Read every page, including pages that are scanned images of text. "
        "Use only facts visible in the document; leave a field empty (or 0) when it is not "
        "stated. Never invent employers, dates, degrees, skills or contact details. "
        "Transcribe the email address and phone number exactly as printed. "
        "Write `summary` as 2-3 factual sentences about the candidate's profession, seniority, "
        "main technologies and industries. For each role return the company, the job title, the "
        "start and end dates exactly as written (end = 'Present' when current), the location and "
        "the industry if obvious, and set `description` to a summary of that role in one or "
        "two sentences, at most about 40 words: read every bullet point under the role and "
        "state what the person did, the technologies used and the notable outcomes. Use only "
        "facts written under that role -- do not invent and do not copy the bullets verbatim "
        "-- and leave it empty if the page is unreadable. List the most recent role first. "
        "Set has_photo to true only when the document shows a photograph of the candidate's "
        "face; a logo, a certification badge or a QR code is not a photo."
    )
)


def parse_pdf_with_llm(pdf: PdfPayload, *, model: str) -> ParsedResume:
    """Send the PDF itself and take the model's structured answer as the result."""
    return invoke_structured_with_file(
        ParsedResume,
        [
            _PDF_SYSTEM,
            HumanMessage(
                content=(
                    f"The attached PDF is the resume file {pdf.file_name!r}. "
                    "Read it and return the JSON."
                )
            ),
        ],
        data=pdf.data,
        file_name=pdf.file_name,
        model=model,
        num_predict=PDF_ANSWER_TOKENS,
    )


def answer_is_blank(answer: ParsedResume, *, count_full_name: bool = True) -> bool:
    """Did a SUCCESSFUL model call come back with nothing at all?

    ``_PDF_SYSTEM`` tells the model to leave a field empty when the page is
    unreadable, so a blank, upside-down or handwritten scan comes back as a
    well-formed ``ParsedResume`` full of defaults. Stored, that is a ghost
    candidate: a row in the library matching nothing. "Blank" is drawn tight on
    purpose -- ANY identity field or ANY body content is enough to pass, so a
    sparse-but-real resume still ingests. ``summary`` alone is deliberately not
    enough: a model asked to read an unreadable page often narrates that fact
    into the summary and leaves every other field empty.

    It is asked twice: of the raw answer, and again of the validated profile
    with ``count_full_name=False`` when the model gave no name -- because by
    then ``full_name`` may hold ``name_from_file``, and a name guessed from a
    file name is precisely the one fact a ghost row has.
    """
    return not (
        (answer.full_name.strip() if count_full_name else "")
        or answer.email.strip()
        or answer.phone.strip()
        or answer.current_title.strip()
        or answer.current_company.strip()
        or answer.location.strip()
        or answer.linkedin_url.strip()
        or answer.github_url.strip()
        or answer.total_experience_years
        or answer.experience
        or answer.education
        or answer.skills
        or answer.certifications
        or answer.projects
    )


# ------------------------------------------------------- validating the answer


@dataclass
class ValidatedResume:
    profile: ParsedResume
    warnings: list[str]
    # `[{name, proficiency, mentions, is_primary}]`, the payload of
    # ProfileSync.sync_skills: it drives the rule-based match score and the
    # structured-skill floor of hybrid retrieval. Every row is the model's.
    skill_rows: list[dict]
    # The model that produced the profile: the configured one, or the fallback
    # when the configured one was busy. Empty on the unreadable placeholder.
    model: str = ""

    @property
    def has_identity(self) -> bool:
        return bool(self.profile.email or self.profile.phone)


def validate(parsed: ParsedResume) -> ValidatedResume:
    """Syntactic guards over the model's answer; no text layer is consulted.

    A template address or an implausibly short or long phone is dropped with a
    warning; names, summaries and headline fields are trimmed and capped; an
    implausible total-years figure is reset; roles without a parseable start
    date are skipped; skills are normalised, de-duplicated and stripped of
    category words. The model read the rendered page, so its values are
    otherwise kept.
    """
    warnings: list[str] = []
    profile = parsed.model_copy(deep=True)

    email = profile.email.strip().lower()
    if email and not _plausible_email(email):
        warnings.append(f"email {profile.email!r} is not a usable address; dropped")
        email = ""
    profile.email = email
    phone = profile.phone.strip()
    if phone and not _plausible_phone(phone):
        warnings.append(f"phone {phone!r} is not a usable number; dropped")
        phone = ""
    profile.phone = phone

    profile.full_name = _clean_name(profile.full_name)
    profile.summary = re.sub(r"\s+", " ", profile.summary).strip()[:2000]
    profile.location = profile.location.strip()[:160]
    profile.current_title = profile.current_title.strip()[:160]
    profile.current_company = profile.current_company.strip()[:160]
    if profile.total_experience_years < 0 or profile.total_experience_years > 45:
        warnings.append(f"implausible experience {profile.total_experience_years}; reset")
        profile.total_experience_years = 0

    skill_rows: list[dict] = []
    known: set[str] = set()
    for index, skill in enumerate(profile.skills):
        key = normalize_skill(skill)
        if not _is_skill_key(key) or key in known:
            continue
        if len(skill_rows) >= 60:
            break
        skill_rows.append({"name": key, "proficiency": 3, "mentions": 1, "is_primary": index < 8})
        known.add(key)
    profile.skills = [row["name"] for row in skill_rows]

    kept: list[ParsedExperience] = []
    for row in profile.experience:
        start, _ = parse_partial_date(row.start_date)
        if start is None:
            warnings.append(f"experience without a start date skipped: {row.title or row.company}")
            continue
        # A safety net under the prompt's "one or two sentences": the profile
        # page shows this as one paragraph per role.
        row.description = " ".join(row.description.split())[:600]
        kept.append(row)
    profile.experience = kept[:15]
    profile.education = [row for row in profile.education if row.degree or row.institution][:6]
    profile.certifications = [row for row in profile.certifications if row.name][:10]
    return ValidatedResume(profile=profile, warnings=warnings, skill_rows=skill_rows)


# ------------------------------------------------------------------ entry point


def parse_resume(
    pdf: PdfPayload, *, model: str, fallback_model: str = ""
) -> tuple[ValidatedResume, str, list[str]]:
    """Send the PDF to the model and validate its answer.

    Returns ``(validated, parse_source, warnings)``. ``parse_source`` is
    ``"llm_pdf"`` for a stored profile and ``UNREADABLE`` when there is nothing
    to store, in which case the caller shelves the document as ``needs_review``.

    ``fallback_model`` is tried once when ``model`` is busy -- a server error or
    a rate limit that outlived the client's own retries (``LLMBusy``). The
    document says which model answered: ``ValidatedResume.model`` and a warning.

    ``UNREADABLE`` is reached from three places: the model call raising, the
    call succeeding with a blank answer (a blank, upside-down or handwritten
    scan), and an answer that is blank once ``validate`` has deleted the
    template address, the bad phone and the category-word skills.
    """
    warnings = list(pdf.warnings)
    try:
        answer, used = _ask_model(pdf, model, fallback_model, warnings)
    except LLMError as exc:
        logger.warning("PDF parsing failed for %s: %s", pdf.file_name, exc)
        warnings.append(f"the model could not read the PDF: {exc}")
        return _unreadable(warnings)
    if answer_is_blank(answer):
        warnings.append(
            "the model read the PDF but returned no name, contact details, roles, education "
            "or skills; the pages are blank, upside down or handwritten"
        )
        return _unreadable(warnings)

    # Kept for the second, post-validation ask below: a name taken from the
    # file name must not count as a fact the model read.
    model_gave_name = bool(answer.full_name.strip())
    if not model_gave_name:
        fallback = name_from_file(pdf.file_name)
        if fallback:
            answer = answer.model_copy(update={"full_name": fallback})
            warnings.append("the model did not return a name; taken from the file name")

    validated = validate(answer)
    validated.model = used
    validated.warnings = warnings + validated.warnings
    if answer_is_blank(validated.profile, count_full_name=model_gave_name):
        # Not blank on the raw answer, blank once the guards ran: every value
        # the model returned was a template address, a bad number, a category
        # word or a role without a date. That is a ghost row the long way round.
        return _unreadable(
            [
                *validated.warnings,
                "nothing the model returned from the PDF survived validation -- the address, "
                "number, skills or dates it read are not usable values; there is no profile "
                "here to store",
            ]
        )
    return validated, "llm_pdf", validated.warnings


def _ask_model(
    pdf: PdfPayload, model: str, fallback_model: str, warnings: list[str]
) -> tuple[ParsedResume, str]:
    """The answer and which model gave it; the fallback is tried once when the primary is busy."""
    try:
        return parse_pdf_with_llm(pdf, model=model), model
    except LLMBusy as exc:
        if not fallback_model or fallback_model == model:
            raise
        logger.warning(
            "%s is busy for %s (%s); trying %s", model, pdf.file_name, exc, fallback_model
        )
        warnings.append(f"{model} was busy ({exc}), so {fallback_model} was tried instead")
        return parse_pdf_with_llm(pdf, model=fallback_model), fallback_model


def _unreadable(warnings: list[str]) -> tuple[ValidatedResume, str, list[str]]:
    """The ``needs_review`` return: an empty profile under the ``UNREADABLE`` source."""
    empty = ValidatedResume(profile=ParsedResume(), warnings=warnings, skill_rows=[])
    return empty, UNREADABLE, warnings
