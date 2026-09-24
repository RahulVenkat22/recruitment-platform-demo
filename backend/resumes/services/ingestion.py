"""The resume ingestion pipeline, as a LangGraph state graph.

    fingerprint ─┬─ (already ingested) ───────────────────────────────► END
                 └─► extract ─► prepare_pdf ─┬─ (the file cannot be sent)
                                             │        └─► needs_review ──► END
                                             └─► parse ─┬─ (the model could not read it)
                                                        │        └─► needs_review ──► END
                                                        └─► sync_profile ─► chunk ─► embed
                                                            ─► store ─► upload ─► END

Every node is a plain function over ``IngestionState``; the graph only adds the
routing. Each PDF is one ``invoke`` with a fresh state, so nothing carries over
between files.

The model is the parser. ``extract`` records the PyMuPDF text layer,
``prepare_pdf`` loads the file (the first ``RESUME_LLM_PDF_MAX_PAGES`` pages,
refused over ``RESUME_LLM_PDF_MAX_MB``) and ``parse`` hands it to the configured
provider, which returns the whole structured profile. The text layer is never
asked for a field. When the PDF has one it is embedded as the candidate's
searchable text; a scan has none, so the text is rebuilt from the answer
(``chunking.reconstruct_text``) and is never indexed with zero vectors.

A PDF that cannot be sent, a call that fails and an answer with nothing in it
all shelve the document as ``needs_review`` with the reason, and ``fingerprint``
retries such rows on the next run. A node raising marks the document ``failed``
and the folder loop carries on with the next file.

``sync_profile`` keys the candidate on the resume's email, then phone, exactly
as ``CandidateRepository.find_existing`` does. A value already on another
candidate whose NAME disagrees is refused as a key -- an agency's recruiting
address or switchboard number must not fuse two people into one row -- and the
document is filed under a placeholder address derived from the file hash, with
a warning. A resume with no contact details gets the same placeholder.
"""

from __future__ import annotations

import logging
import re
import time
from collections.abc import Callable, Iterable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, TypedDict

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from langgraph.graph import END, START, StateGraph

from candidates.models import Candidate
from candidates.repositories import CandidateRepository, phone_digits
from common.enums import CandidateSource
from resumes.engines.chunking import ChunkDraft, build_chunks, reconstruct_text
from resumes.engines.embeddings import EmbeddingError, get_embedding_service
from resumes.engines.extraction import ExtractedText, ExtractionError, extract_text, sha256_of
from resumes.engines.parsing import UNREADABLE, ValidatedResume, parse_resume
from resumes.engines.pdf_payload import PdfPayload, load_pdf_for_model
from resumes.engines.photo import candidate_photo, photo_path
from resumes.engines.schemas import ParsedResume
from resumes.engines.storage import StorageError, get_storage
from resumes.models import ResumeDocument, ResumeStatus
from resumes.repositories import ProfileSync, ResumeRepository
from sourcing.dtos import NormalizedCandidate

logger = logging.getLogger(__name__)


class IngestionState(TypedDict, total=False):
    path: str
    force: bool
    document_id: str
    outcome: str
    reason: str
    extracted: ExtractedText
    # The file to hand the model, or None when it cannot be sent.
    pdf: PdfPayload | None
    validated: ValidatedResume
    parse_source: str
    warnings: list[str]
    # What the candidate is stored and indexed under: the text layer when the
    # PDF has one, the reconstruction from the model's answer otherwise.
    # Written once, in `parse`.
    search_text: str
    candidate_id: str
    candidate_created: bool
    drafts: list[ChunkDraft]
    vectors: list[list[float]]
    chunk_count: int
    uploaded: bool
    sync_counts: dict[str, int]


@dataclass
class IngestionResult:
    path: str
    outcome: str
    document: ResumeDocument | None = None
    candidate: Candidate | None = None
    candidate_created: bool = False
    chunk_count: int = 0
    uploaded: bool = False
    parse_source: str = ""
    reason: str = ""
    warnings: list[str] = field(default_factory=list)
    seconds: float = 0.0


@dataclass
class IngestionStats:
    total: int = 0
    processed: int = 0
    failed: int = 0
    skipped: int = 0
    needs_review: int = 0
    new_candidates: int = 0
    updated_candidates: int = 0
    chunks_created: int = 0
    embedding_failures: int = 0
    uploaded: int = 0
    results: list[IngestionResult] = field(default_factory=list)

    def record(self, result: IngestionResult) -> None:
        self.results.append(result)
        self.total += 1
        if result.outcome == "processed":
            self.processed += 1
            self.chunks_created += result.chunk_count
            if result.candidate_created:
                self.new_candidates += 1
            else:
                self.updated_candidates += 1
            if result.uploaded:
                self.uploaded += 1
        elif result.outcome == "skipped":
            self.skipped += 1
        elif result.outcome == "needs_review":
            self.needs_review += 1
        else:
            self.failed += 1
            if "mbedding" in result.reason:
                self.embedding_failures += 1


# ------------------------------------------------------------------ nodes


def _document(state: IngestionState) -> ResumeDocument:
    return ResumeDocument.objects.get(pk=state["document_id"])


def _llm_provenance(model: str = "") -> str:
    """What ``ResumeDocument.llm_model`` records: the provider-qualified model that answered."""
    return f"{settings.LLM_PROVIDER}:{model or settings.LLM_MODEL}"


def fingerprint(state: IngestionState) -> IngestionState:
    """Skip a file already ingested; otherwise create or reuse its document row."""
    path = Path(state["path"])
    if not path.is_file():
        raise ExtractionError(f"{path} does not exist")
    file_hash = sha256_of(path)
    document = ResumeRepository.by_hash(file_hash)
    done = (ResumeStatus.PARSED, ResumeStatus.SUPERSEDED)
    if document is not None and not state.get("force") and document.status in done:
        reason = (
            "already ingested (unchanged file)"
            if document.status == ResumeStatus.PARSED
            else "superseded by a newer file"
        )
        return {"document_id": str(document.pk), "outcome": "skipped", "reason": reason}
    if document is None:
        document = ResumeRepository.create(
            file_name=path.name,
            source_path=str(path.resolve()),
            file_hash=file_hash,
            file_size=path.stat().st_size,
        )
    # A failed or needs_review row is retried on the same document.
    ResumeRepository.mark(document, ResumeStatus.PENDING, "", source_path=str(path.resolve()))
    return {"document_id": str(document.pk)}


def extract(state: IngestionState) -> IngestionState:
    """Record the PDF's text layer. It decides nothing: the model reads the file itself."""
    document = _document(state)
    extracted = extract_text(
        state["path"], min_chars=settings.RESUME_MIN_TEXT_CHARS, file_hash=document.file_hash
    )
    document.page_count = extracted.page_count
    document.extracted_text = extracted.text
    document.text_chars = extracted.char_count
    document.save(update_fields=["page_count", "extracted_text", "text_chars", "updated_at"])
    return {"extracted": extracted}


def prepare_pdf(state: IngestionState) -> IngestionState:
    """Load the bytes to send to the model, or record why the file cannot be sent."""
    extracted = state["extracted"]
    try:
        pdf = load_pdf_for_model(
            extracted.path,
            file_name=extracted.file_name,
            max_pages=int(settings.RESUME_LLM_PDF_MAX_PAGES),
            max_mb=int(settings.RESUME_LLM_PDF_MAX_MB),
        )
    except Exception as exc:  # noqa: BLE001 - PyMuPDF raises bare RuntimeError/FzErrorBase on damaged files
        logger.warning("cannot send %s to the model: %s", extracted.file_name, exc)
        return {"pdf": None, "reason": f"the PDF could not be sent to the model: {exc}"}
    return {"pdf": pdf}


def parse(state: IngestionState) -> IngestionState:
    """Hand the file to the model and record what came back."""
    extracted = state["extracted"]
    validated, source, warnings = parse_resume(
        state["pdf"], model=settings.LLM_MODEL, fallback_model=settings.LLM_FALLBACK_MODEL
    )
    warnings = list(warnings)
    document = _document(state)
    if source == UNREADABLE:
        # Clear any earlier parse on a reused row, or the review screen would
        # show a profile this run could not produce.
        document.parsed_data = None
        document.parse_source = ""
        document.llm_model = ""
        document.warnings = warnings
        document.save(
            update_fields=["parsed_data", "parse_source", "llm_model", "warnings", "updated_at"]
        )
        return {
            "outcome": "needs_review",
            "reason": warnings[-1] if warnings else "the model could not read the PDF",
            "warnings": warnings,
        }
    if not extracted.is_sufficient:
        warnings.append(
            f"no text layer; parsed directly from the PDF by {_llm_provenance(validated.model)}"
        )
    # A real text layer is the best thing to search on; a scan has none, so the
    # text is rebuilt from the model's answer instead.
    if extracted.is_sufficient:
        search_text = extracted.text
    else:
        search_text = reconstruct_text(validated.profile)
    document.parsed_data = validated.profile.model_dump()
    document.parse_source = source
    document.warnings = warnings
    document.llm_model = _llm_provenance(validated.model)
    document.save(
        update_fields=["parsed_data", "parse_source", "warnings", "llm_model", "updated_at"]
    )
    return {
        "validated": validated,
        "parse_source": source,
        "warnings": warnings,
        "search_text": search_text,
    }


# Honorifics, suffixes and the words this pipeline's own placeholder name is
# made of, dropped before two names are compared.
_NAME_NOISE = frozenset("mr mrs ms miss dr prof jr sr ii iii iv unknown candidate".split())


def _name_tokens(value: str) -> set[str]:
    """The comparable words of a name in any script: case-folded, no honorifics, no initials."""
    return {
        token
        for token in re.findall(r"\w+", (value or "").casefold())
        if len(token) > 1 and token not in _NAME_NOISE
    }


def _names_disagree(left: str, right: str) -> bool:
    """Both names say something and neither contains the other.

    "Ravi Kumar" and "Ravi Kumar Reddy" agree; so does an empty side, because a
    row with no usable name cannot testify that this is somebody else.
    """
    a, b = _name_tokens(left), _name_tokens(right)
    return bool(a and b) and not (a <= b or b <= a)


def _other_candidate(
    document: ResumeDocument, *, email: str = "", digits: str = ""
) -> Candidate | None:
    """The existing candidate ``find_existing`` would hand this document, excluding its own."""
    rows = Candidate.objects.all()
    if document.candidate_id:
        rows = rows.exclude(pk=document.candidate_id)
    if email:
        return rows.filter(email=email).first()
    return next(
        (
            row
            for row in rows.filter(phone__endswith=digits[-8:])
            if phone_digits(row.phone) == digits
        ),
        None,
    )


def _identity(document: ResumeDocument, profile: ParsedResume) -> tuple[str, str, list[str]]:
    """The email and phone to key the candidate on, and what to say about any refusal.

    ``CandidateRepository.find_existing`` matches on the email, then on the
    phone, so a value already on another candidate MERGES this document into
    them. That is right for a newer copy of the same person's resume and wrong
    for an agency's recruiting address or switchboard number: when the other
    candidate's name disagrees, the value is left off the row (it stays on
    ``parsed_data``) and the document is filed under a placeholder address.
    """
    warnings: list[str] = []
    if not profile.email and not profile.phone:
        warnings.append("no email address or phone number in the resume; placeholder identity used")
    email, phone = profile.email, profile.phone
    if email:
        other = _other_candidate(document, email=email)
        if other is not None and _names_disagree(other.full_name, profile.full_name):
            warnings.append(
                f"the address {email!r} already belongs to {other.full_name!r}; this document "
                "was filed under a placeholder identity so the two people are not merged"
            )
            email = ""
    if phone:
        other = _other_candidate(document, digits=phone_digits(phone))
        if other is not None and _names_disagree(other.full_name, profile.full_name):
            warnings.append(
                f"the number {phone!r} already belongs to {other.full_name!r}; it was left off "
                "this candidate so the two people are not merged"
            )
            phone = ""
    return email or _placeholder_email(document.file_hash), phone, warnings


def sync_profile(state: IngestionState) -> IngestionState:
    """Create or refresh the candidate and their skills, roles, education and certifications."""
    validated = state["validated"]
    profile = validated.profile
    document = _document(state)
    email, phone, identity_warnings = _identity(document, profile)
    warnings = [*state.get("warnings", []), *identity_warnings]
    with transaction.atomic():
        dto = NormalizedCandidate(
            source=CandidateSource.INTERNAL,
            external_id=f"resume:{document.file_hash[:16]}",
            full_name=profile.full_name or "Unknown candidate",
            email=email,
            phone=phone,
            location=profile.location,
            headline=_headline(profile.current_title, profile.current_company),
            current_company=profile.current_company,
            current_title=profile.current_title,
            total_experience_years=float(profile.total_experience_years or 0),
            summary=profile.summary,
            linkedin_url=profile.linkedin_url or None,
            github_url=profile.github_url or None,
            # An empty value leaves the text an earlier ingest stored in place.
            resume_text=state.get("search_text", ""),
            raw={"provider": "internal", "file": document.file_name, "hash": document.file_hash},
        )
        candidate, created = CandidateRepository.upsert_from_dto(dto, discovered_at=timezone.now())
        counts = ProfileSync.sync(candidate, profile, validated.skill_rows)
        document.candidate = candidate
        document.warnings = warnings
        document.save(update_fields=["candidate", "warnings", "updated_at"])
    return {
        "candidate_id": str(candidate.pk),
        "candidate_created": created,
        "sync_counts": counts,
        "warnings": warnings,
    }


def attach_photo(candidate_id: str, path: str | Path) -> bool:
    """Cut the photo out of the resume at ``path`` and put it on the candidate; False when none."""
    data = candidate_photo(path)
    if data is None:
        return False
    target = photo_path(f"{candidate_id}.jpg")
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)
    Candidate.objects.filter(pk=candidate_id).update(photo=target.name)
    return True


def photo(state: IngestionState) -> IngestionState:
    """The candidate's photo, when the first page carries one (most resumes have none)."""
    try:
        attach_photo(state["candidate_id"], state["path"])
    except Exception as exc:  # noqa: BLE001 - a rendering failure must not cost the ingestion
        logger.warning("photo extraction failed for %s: %s", state["path"], exc)
        return {"warnings": [*state.get("warnings", []), f"the photo could not be cut out: {exc}"]}
    return {}


def chunk(state: IngestionState) -> IngestionState:
    drafts = build_chunks(
        state["validated"].profile,
        state.get("search_text", ""),
        chunk_size=settings.RESUME_CHUNK_SIZE,
        overlap=settings.RESUME_CHUNK_OVERLAP,
    )
    if drafts:
        return {"drafts": drafts}
    # `embed` and `store` accept an empty list, so say it here: the row would
    # otherwise look healthy while the candidate is absent from every search.
    warning = "no embeddable content; this candidate will not appear in semantic search"
    warnings = [*state.get("warnings", []), warning]
    document = _document(state)
    document.warnings = warnings
    document.save(update_fields=["warnings", "updated_at"])
    logger.warning("%s produced no chunks", document.file_name)
    return {"drafts": drafts, "warnings": warnings}


def embed(state: IngestionState) -> IngestionState:
    drafts = state["drafts"]
    vectors = get_embedding_service().embed_documents([draft.content for draft in drafts])
    return {"vectors": vectors}


def store(state: IngestionState) -> IngestionState:
    document = _document(state)
    candidate = Candidate.objects.get(pk=state["candidate_id"])
    count = ResumeRepository.replace_chunks(
        document,
        candidate,
        state["drafts"],
        state["vectors"],
        embedding_model=f"{settings.LLM_PROVIDER}:{settings.EMBEDDING_MODEL}",
    )
    ResumeRepository.supersede_others(document)
    ResumeRepository.mark(document, ResumeStatus.PARSED, "", ingested_at=timezone.now())
    return {"chunk_count": count, "outcome": "processed"}


def upload(state: IngestionState) -> IngestionState:
    document = _document(state)
    storage = get_storage()
    if not storage.configured:
        ResumeRepository.mark_upload_pending(document, storage.not_configured_message())
        return {"uploaded": False}
    key = storage.object_key(str(document.pk), document.file_name)
    try:
        storage.upload_file(document.source_path, key)
    except StorageError as exc:
        logger.warning("upload failed for %s: %s", document.file_name, exc)
        ResumeRepository.mark_upload_pending(document, str(exc), failed=True)
        return {"uploaded": False}
    ResumeRepository.mark_uploaded(document, key)
    return {"uploaded": True}


def finish_review(state: IngestionState) -> IngestionState:
    """Shelve the document with the reason the stopping node wrote."""
    reason = state.get("reason") or "the PDF could not be parsed"
    ResumeRepository.mark(_document(state), ResumeStatus.NEEDS_REVIEW, reason)
    return {"outcome": "needs_review", "reason": reason}


# ------------------------------------------------------------------ routing


def _after_fingerprint(state: IngestionState) -> str:
    return END if state.get("outcome") == "skipped" else "extract"


def _after_prepare(state: IngestionState) -> str:
    return "parse" if state.get("pdf") is not None else "needs_review"


def _after_parse(state: IngestionState) -> str:
    return "needs_review" if state.get("outcome") == "needs_review" else "sync_profile"


def build_graph():
    graph = StateGraph(IngestionState)
    graph.add_node("fingerprint", fingerprint)
    graph.add_node("extract", extract)
    graph.add_node("prepare_pdf", prepare_pdf)
    graph.add_node("parse", parse)
    graph.add_node("sync_profile", sync_profile)
    graph.add_node("photo", photo)
    graph.add_node("chunk", chunk)
    graph.add_node("embed", embed)
    graph.add_node("store", store)
    graph.add_node("upload", upload)
    graph.add_node("needs_review", finish_review)

    graph.add_edge(START, "fingerprint")
    graph.add_conditional_edges("fingerprint", _after_fingerprint, {END: END, "extract": "extract"})
    graph.add_edge("extract", "prepare_pdf")
    graph.add_conditional_edges(
        "prepare_pdf", _after_prepare, {"parse": "parse", "needs_review": "needs_review"}
    )
    graph.add_conditional_edges(
        "parse", _after_parse, {"needs_review": "needs_review", "sync_profile": "sync_profile"}
    )
    graph.add_edge("sync_profile", "photo")
    graph.add_edge("photo", "chunk")
    graph.add_edge("chunk", "embed")
    graph.add_edge("embed", "store")
    graph.add_edge("store", "upload")
    graph.add_edge("upload", END)
    graph.add_edge("needs_review", END)
    return graph.compile()


_GRAPH = None


def ingestion_graph():
    global _GRAPH
    if _GRAPH is None:
        _GRAPH = build_graph()
    return _GRAPH


# ------------------------------------------------------------------ helpers


def _headline(title: str, company: str) -> str:
    if title and company:
        return f"{title} at {company}"[:200]
    return (title or company)[:200]


def _placeholder_email(file_hash: str) -> str:
    """A candidate still needs the unique email key; ``.invalid`` never routes."""
    return f"resume-{file_hash[:12]}@no-email.invalid"


def list_pdfs(folder: str | Path) -> list[Path]:
    root = Path(folder).expanduser()
    if not root.is_dir():
        raise FileNotFoundError(f"{root} is not a directory")
    return sorted(
        (path for path in root.rglob("*") if path.is_file() and path.suffix.lower() == ".pdf"),
        key=lambda path: path.name.lower(),
    )


# ------------------------------------------------------------------ service


class ResumeIngestionService:
    @staticmethod
    def ingest_file(path: str | Path, *, force: bool = False) -> IngestionResult:
        started = time.monotonic()
        state: IngestionState = {"path": str(path), "force": force}
        try:
            final = ingestion_graph().invoke(state)
        except (ExtractionError, EmbeddingError) as exc:
            return ResumeIngestionService._failed(state, str(exc), started)
        except Exception as exc:  # noqa: BLE001 - one bad file must not stop the folder
            logger.exception("ingestion failed for %s", path)
            return ResumeIngestionService._failed(
                state, f"{exc.__class__.__name__}: {exc}", started
            )
        document = (
            ResumeDocument.objects.filter(pk=final.get("document_id"))
            .select_related("candidate")
            .first()
        )
        return IngestionResult(
            path=str(path),
            outcome=final.get("outcome") or "failed",
            document=document,
            candidate=document.candidate if document else None,
            candidate_created=bool(final.get("candidate_created")),
            chunk_count=int(final.get("chunk_count") or 0),
            uploaded=bool(final.get("uploaded")),
            parse_source=final.get("parse_source", ""),
            reason=final.get("reason", ""),
            warnings=list(final.get("warnings") or []),
            seconds=round(time.monotonic() - started, 1),
        )

    @staticmethod
    def _failed(state: IngestionState, reason: str, started: float) -> IngestionResult:
        # The graph's partial state is not returned on an exception; find the row by hash.
        path = Path(state["path"])
        try:
            document = ResumeRepository.by_hash(sha256_of(path)) if path.is_file() else None
        except OSError:
            document = None
        if document is not None and document.status != ResumeStatus.PARSED:
            ResumeRepository.mark(document, ResumeStatus.FAILED, reason)
        return IngestionResult(
            path=state["path"],
            outcome="failed",
            document=document,
            reason=reason,
            seconds=round(time.monotonic() - started, 1),
        )

    @staticmethod
    def ingest_folder(
        folder: str | Path,
        *,
        limit: int | None = None,
        force: bool = False,
        progress: Callable[[int, int, Path], None] | None = None,
        on_result: Callable[[int, int, IngestionResult], None] | None = None,
        paths: Iterable[Path] | None = None,
    ) -> IngestionStats:
        files = list(paths) if paths is not None else list_pdfs(folder)
        if limit:
            files = files[:limit]
        stats = IngestionStats()
        total = len(files)
        for index, path in enumerate(files, start=1):
            if progress:
                progress(index, total, path)
            result = ResumeIngestionService.ingest_file(path, force=force)
            stats.record(result)
            if on_result:
                on_result(index, total, result)
        return stats


def stats_summary(stats: IngestionStats) -> dict[str, Any]:
    return {
        "total": stats.total,
        "processed": stats.processed,
        "failed": stats.failed,
        "skipped": stats.skipped,
        "needs_review": stats.needs_review,
        "new_candidates": stats.new_candidates,
        "updated_candidates": stats.updated_candidates,
        "chunks_created": stats.chunks_created,
        "embedding_failures": stats.embedding_failures,
        "uploaded": stats.uploaded,
    }
