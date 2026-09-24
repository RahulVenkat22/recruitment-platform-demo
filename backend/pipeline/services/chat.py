"""``SearchChatService``: a conversation about the results of one search run.

The assistant answers only from what the search produced -- the brief the run
analysed, the ranked candidates with their scores, skills, gaps and AI
explanations, and the resume excerpts closest to the question -- and says so
when asked about anything else. A thread belongs to the person asking.

``ask`` streams the answer as server-sent events: ``context`` (which candidates
the question names, how many resume passages and ranked rows the answer rests
on), ``token`` per piece of text, then ``done`` with both persisted turns, or
``error`` with a sentence for the user. A turn is
only stored once the model has answered, so a failed question leaves no trace.
"""

from __future__ import annotations

import json
import logging
import re
import time
from collections import Counter
from collections.abc import Iterator
from dataclasses import asdict, dataclass
from typing import Any

from django.conf import settings
from django.utils import timezone
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage

from common.enums import CandidateSource, SearchRunStatus
from matching.adapters import candidate_profile
from matching.skills import display_name
from pipeline.exceptions import ChatUnavailable, SearchInProgress
from pipeline.models import Application, SearchChatMessage, SearchRun
from resumes.engines.embeddings import EmbeddingError, get_embedding_service
from resumes.engines.evaluation import candidate_card
from resumes.engines.llm import LLMError, as_llm_error, chat_model
from resumes.engines.planner import jd_text
from resumes.engines.retrieval import ChunkHit, any_resume_chunks, nearest_chunks

logger = logging.getLogger(__name__)

ANSWER_TOKENS = 1200
TEMPERATURE = 0.2
# Earlier turns of the thread the model sees, and how much of the results it is shown.
HISTORY_MESSAGES = 10
ROWS_IN_PROMPT = 40
DETAILED_CARDS = 10
EXCERPTS = 8
EXCERPT_CHARS = 360
CITATIONS_MAX = 8
FINISHED = frozenset({SearchRunStatus.COMPLETED, SearchRunStatus.PARTIAL, SearchRunStatus.FAILED})


@dataclass(frozen=True)
class Citation:
    """A candidate reference the interface can render: avatar, name, score, stage."""

    id: str
    name: str
    avatar_url: str | None
    match_pct: float
    status: str
    status_label: str

    def as_dict(self) -> dict[str, Any]:
        return asdict(self)


def citation_for(application: Application) -> Citation:
    candidate = application.candidate
    return Citation(
        id=str(candidate.pk),
        name=candidate.full_name,
        avatar_url=candidate.display_avatar_url,
        # Unrounded: the interface rounds once, the same way the results table does.
        match_pct=float(application.match.overall_pct),
        status=str(application.status),
        status_label=application.get_status_display(),
    )


# ------------------------------------------------------------------ the results


def ranked_results(run: SearchRun, *, detailed: bool = False) -> list[Application]:
    """The ranked candidates on the run's job description, best match first: the same
    list the results table shows once the search has finished."""
    qs = (
        Application.objects.filter(job_description_id=run.job_description_id, match__isnull=False)
        .select_related("candidate", "match")
        .order_by("-match__overall_pct", "created_at")
    )
    if detailed:
        qs = qs.prefetch_related(
            "candidate__skills",
            "candidate__experiences",
            "candidate__education",
            "candidate__certifications",
        )
    return list(qs)


def _source_label(key: str) -> str:
    try:
        return CandidateSource(key).label
    except ValueError:
        return key


def _names(keys: list[str]) -> str:
    return ", ".join(display_name(key) for key in keys) or "none"


def _row(rank: int, application: Application, run: SearchRun) -> str:
    candidate, match = application.candidate, application.match
    role = " at ".join(
        part for part in (candidate.current_title, candidate.current_company) if part
    )
    parts = [
        f"{rank}. {candidate.full_name} — {float(match.overall_pct):.0f}% match, "
        f"{application.get_status_display()}",
        f"{float(candidate.total_experience_years or 0):g} yrs",
        role,
        candidate.location,
        f"required found: {_names(match.matched_required_skills)}",
        f"required missing: {_names(match.missing_required_skills)}",
    ]
    if match.matched_preferred_skills:
        parts.append(f"nice-to-have found: {_names(match.matched_preferred_skills)}")
    if match.rerank_score is not None:
        parts.append(f"AI review {float(match.rerank_score):.0f}/100")
    if application.search_run_id == run.pk:
        parts.append("new in this search")
    return "; ".join(part for part in parts if part)


def _card(rank: int, application: Application) -> str:
    candidate, match = application.candidate, application.match
    details = match.semantic_details or {}
    lines = [
        f"--- Rank {rank}: {candidate.full_name} ({float(match.overall_pct):.0f}% match, "
        f"{application.get_status_display()}) ---",
        candidate_card(
            candidate_profile(candidate), location=candidate.location, headline=candidate.headline
        ),
        f"Score breakdown (0-100): skills {float(match.skills_score):.0f}, experience "
        f"{float(match.experience_score):.0f}, education {float(match.education_score):.0f}, "
        f"domain {float(match.domain_score):.0f}, responsibilities "
        f"{float(match.responsibility_score):.0f}",
        f"Required skills found: {_names(match.matched_required_skills)} | missing: "
        f"{_names(match.missing_required_skills)}",
        f"Nice-to-have skills found: {_names(match.matched_preferred_skills)}",
    ]
    if match.explanation:
        score = f" ({float(match.rerank_score):.0f}/100)" if match.rerank_score is not None else ""
        lines.append(f"AI review{score}: {match.explanation}")
    if details.get("matching_experience"):
        lines.append("Relevant experience: " + "; ".join(details["matching_experience"]))
    if details.get("concerns"):
        lines.append("Concerns: " + "; ".join(details["concerns"]))
    if match.strengths:
        lines.append("Strengths: " + " ".join(match.strengths[:3]))
    if match.gaps:
        lines.append("Gaps: " + " ".join(match.gaps[:3]))
    return "\n".join(lines)


# ------------------------------------------------------------- who is meant


def _mentions(text: str, phrase: str) -> int:
    """Position of ``phrase`` as a whole word in ``text`` (both lower-cased), or -1."""
    phrase = phrase.strip().lower()
    if not phrase:
        return -1
    found = re.search(r"(?<![a-z0-9])" + re.escape(phrase) + r"(?![a-z0-9])", text)
    return found.start() if found else -1


def named_in(
    text: str, applications: list[Application], *, strict: bool = False
) -> list[Application]:
    """The candidates ``text`` refers to, in order of appearance: by full name, or by a
    part of the name. With ``strict`` a part only counts when no other candidate in the
    results shares it, so a shared first name never cites the wrong person."""
    lowered = text.lower()
    counts = Counter(
        part
        for application in applications
        for part in set(_name_parts(application.candidate.full_name))
    )
    found: list[tuple[int, Application]] = []
    for application in applications:
        name = application.candidate.full_name
        positions = [_mentions(lowered, name)]
        for part in _name_parts(name):
            if not strict or counts[part] == 1:
                positions.append(_mentions(lowered, part))
        hits = [position for position in positions if position >= 0]
        if hits:
            found.append((min(hits), application))
    return [application for _position, application in sorted(found, key=lambda item: item[0])]


def _name_parts(name: str) -> list[str]:
    return [part.lower() for part in re.split(r"\s+", name) if len(part) >= 3]


# --------------------------------------------------------------- the excerpts


def _trim(content: str) -> str:
    # Drop the "Name — Section" header line the chunk was embedded with.
    body = content.split("\n", 1)[1] if "\n" in content else content
    body = " ".join(body.split())
    return body[:EXCERPT_CHARS] + ("…" if len(body) > EXCERPT_CHARS else "")


def _excerpts(
    question: str, applications: list[Application], named: list[Application]
) -> list[tuple[Application, ChunkHit]]:
    """Resume passages closest to the question, from the result set only (and a couple
    from each candidate the question names). Empty when nothing is embedded or the
    embedding provider is unreachable: the answer then rests on the structured data."""
    ids = [application.candidate_id for application in applications]
    if not ids or not any_resume_chunks(ids):
        return []
    try:
        vector = get_embedding_service().embed_query(question)
    except EmbeddingError as exc:
        logger.warning("results chat continues without resume excerpts: %s", exc)
        return []
    by_candidate = {str(application.candidate_id): application for application in applications}
    hits = nearest_chunks(vector, limit=EXCERPTS, candidate_ids=ids)
    for application in named[:3]:
        hits += nearest_chunks(vector, limit=2, candidate_id=application.candidate_id)
    seen: set[str] = set()
    out: list[tuple[Application, ChunkHit]] = []
    for hit in hits:
        application = by_candidate.get(hit.candidate_id)
        if application is None or hit.chunk_id in seen:
            continue
        seen.add(hit.chunk_id)
        out.append((application, hit))
    return out


# ------------------------------------------------------------------ the prompt


def _facts(run: SearchRun, total: int) -> str:
    jd = run.job_description
    sources = ", ".join(_source_label(key) for key in run.sources) or "no sources"
    who = run.requested_by.full_name if run.requested_by else "the system"
    when = timezone.localtime(run.started_at).strftime("%d %b %Y at %H:%M")
    threshold = int(getattr(settings, "AI_SHORTLIST_THRESHOLD", 80))
    lines = [
        f'Job: "{jd.title}" ({jd.department}), version {jd.current_version}, '
        f"status {jd.get_status_display()}.",
        f"Search run on {when} by {who} across {sources}; outcome: {run.get_status_display()}.",
        f"{run.total_found} candidates found ({run.new_candidates} new to this job, "
        f"{run.existing_candidates} already on it); {run.shortlisted} AI shortlisted "
        f"(a new candidate at or above {threshold}% is shortlisted automatically).",
    ]
    if total != run.total_found:
        lines.append(f"The job now lists {total} ranked candidates in total.")
    if run.error:
        lines.append(f"Notes from the run: {run.error}")
    plan = run.query_plan or {}
    if plan.get("ideal_candidate"):
        lines.append("The AI's reading of the ideal candidate: " + plan["ideal_candidate"])
    if plan.get("inferred_skills"):
        lines.append(
            "Skills the AI also looked for beyond the tagged ones: "
            + ", ".join(display_name(key) for key in plan["inferred_skills"][:12])
        )
    return "\n".join(lines)


def _system_prompt(
    run: SearchRun,
    applications: list[Application],
    named: list[Application],
    excerpts: list[tuple[Application, ChunkHit]],
) -> str:
    company = settings.EMAIL_COMPANY_NAME
    plan = run.query_plan or {}
    brief = plan.get("brief") or jd_text(run.job_description)[:2500]
    rank_of = {application.pk: index for index, application in enumerate(applications, start=1)}
    rows = [_row(rank_of[a.pk], a, run) for a in applications[:ROWS_IN_PROMPT]]
    if len(applications) > ROWS_IN_PROMPT:
        rows.append(
            f"… and {len(applications) - ROWS_IN_PROMPT} more below rank {ROWS_IN_PROMPT}, "
            "listed in full only when the question names them."
        )
    detailed = list(applications[:DETAILED_CARDS])
    detailed += [a for a in named if a not in detailed]
    cards = [_card(rank_of[a.pk], a) for a in detailed]
    passages = [
        f"[{application.candidate.full_name} — {hit.section}] {_trim(hit.content)}"
        for application, hit in excerpts
    ]
    return "\n\n".join(
        [
            f"You are the AI recruiting assistant inside {company}'s talent platform. You are "
            "answering questions about ONE candidate search and nothing else.",
            "SCOPE\n"
            "- Answer only from the DATA below: the job brief, the search facts, the ranked "
            "results and the resume excerpts. If the answer is not in the data, say so plainly "
            "and suggest what to check instead. Never invent skills, employers, dates or numbers.\n"
            "- If asked about anything outside this search (another job, candidates not listed, "
            "general knowledge, writing code, company policy), decline in one friendly sentence "
            "and remind the user that this conversation covers only this search's results.\n"
            "- Never share contact details; they are deliberately not in your data.",
            "HOW TO ANSWER\n"
            "- Lead with the answer, then the evidence. Be concise and specific.\n"
            "- Use short paragraphs and bullet points; bold the key phrase of a point. No tables "
            "and no long headings.\n"
            "- Refer to candidates by their full name exactly as written in the data, so the "
            "interface can link them. Quote match percentages as given.\n"
            "- When ranking or comparing, explain why: the required skills found and missing, "
            "years against the ask, domain, and the AI review where there is one.\n"
            "- The match percentage blends rule-based skill and experience scoring, resume "
            "similarity and the AI review where present.\n"
            "- Write for a recruiter or hiring manager. Plain language, no filler.",
            "JOB BRIEF\n" + brief,
            "SEARCH FACTS\n" + _facts(run, len(applications)),
            f"RANKED RESULTS ({len(applications)} candidates, best first)\n"
            + ("\n".join(rows) or "No candidates were found."),
            f"CANDIDATE DETAILS (the top {min(len(applications), DETAILED_CARDS)}"
            + (" and those the question names" if len(detailed) > DETAILED_CARDS else "")
            + ")\n"
            + ("\n\n".join(cards) or "None."),
            "RESUME EXCERPTS CLOSEST TO THE QUESTION\n"
            + ("\n\n".join(passages) or "(none available for these candidates)"),
        ]
    )


def _messages(
    run: SearchRun,
    applications: list[Application],
    named: list[Application],
    excerpts: list[tuple[Application, ChunkHit]],
    history: list[SearchChatMessage],
    question: str,
) -> list[BaseMessage]:
    turns: list[BaseMessage] = [
        SystemMessage(content=_system_prompt(run, applications, named, excerpts))
    ]
    for message in history:
        if message.role == "user":
            turns.append(HumanMessage(content=message.content))
        else:
            turns.append(AIMessage(content=message.content))
    turns.append(HumanMessage(content=question))
    return turns


# -------------------------------------------------------------- suggestions


def suggestions(run: SearchRun, applications: list[Application]) -> list[str]:
    """Opening questions built from the real results, so each one has an answer."""
    if not applications:
        return [
            "Why did this search find nobody?",
            "What did the AI read in the job description?",
        ]
    names = [application.candidate.full_name for application in applications]
    out = [f"Why is {names[0]} ranked first?"]
    if len(names) > 1:
        out.append(f"Compare {names[0]} and {names[1]}")
    missing = Counter(
        key for application in applications for key in application.match.missing_required_skills
    )
    if missing:
        out.append(f"Who is missing {display_name(missing.most_common(1)[0][0])}?")
    else:
        out.append("Which candidates are missing must-have skills?")
    out.append(
        "Summarise the AI shortlist for the hiring manager"
        if run.shortlisted
        else "Who should I contact first, and why?"
    )
    out.append("Who has the most relevant domain experience?")
    return out


# ------------------------------------------------------------------ the service


def _event(name: str, data: dict[str, Any]) -> bytes:
    return f"event: {name}\ndata: {json.dumps(data, ensure_ascii=False, default=str)}\n\n".encode()


def _payload(message: SearchChatMessage) -> dict[str, Any]:
    return {
        "id": str(message.pk),
        "role": message.role,
        "content": message.content,
        "citations": list(message.citations or []),
        "model": message.model,
        "created_at": message.created_at.isoformat(),
    }


def _chunk_text(chunk: Any) -> str:
    """The text of a streamed chunk; a thinking model's reasoning blocks are not text."""
    text = getattr(chunk, "text", "")
    return text() if callable(text) else (text or "")


class SearchChatService:
    @staticmethod
    def thread(run: SearchRun, user: Any) -> dict[str, Any]:
        applications = ranked_results(run)
        return {
            "scope": SearchChatService.scope(run, len(applications)),
            "messages": list(SearchChatMessage.objects.filter(search_run=run, user=user)),
            "suggestions": suggestions(run, applications),
        }

    @staticmethod
    def scope(run: SearchRun, ranked: int) -> dict[str, Any]:
        return {
            "run_id": str(run.pk),
            "job_id": str(run.job_description_id),
            "job_title": run.job_description.title,
            "status": str(run.status),
            "total_found": run.total_found,
            "shortlisted": run.shortlisted,
            "new_candidates": run.new_candidates,
            "ranked": ranked,
            "started_at": run.started_at,
            "finished_at": run.finished_at,
            "requested_by": run.requested_by,
            "sources": [_source_label(key) for key in run.sources],
            "model": settings.SEARCH_CHAT_MODEL,
        }

    @staticmethod
    def clear(run: SearchRun, user: Any) -> int:
        deleted, _ = SearchChatMessage.objects.filter(search_run=run, user=user).delete()
        return deleted

    @staticmethod
    def ask(run: SearchRun, user: Any, question: str) -> Iterator[bytes]:
        """Validate, build the client, then return the event stream for the answer."""
        if str(run.status) not in FINISHED:
            raise SearchInProgress
        model = settings.SEARCH_CHAT_MODEL
        try:
            client = chat_model(model, num_predict=ANSWER_TOKENS, temperature=TEMPERATURE)
        except LLMError as exc:
            raise ChatUnavailable(str(exc)) from exc
        return _stream(run, user, question.strip(), client, model)


def _stream(run: SearchRun, user: Any, question: str, client: Any, model: str) -> Iterator[bytes]:
    started = time.monotonic()
    applications = ranked_results(run, detailed=True)
    named = named_in(question, applications)
    excerpts = _excerpts(question, applications, named)
    yield _event(
        "context",
        {
            "named": [citation_for(a).as_dict() for a in named[:CITATIONS_MAX]],
            "excerpts": len(excerpts),
            "ranked": len(applications),
        },
    )
    history = list(
        SearchChatMessage.objects.filter(search_run=run, user=user).order_by("-created_at")[
            :HISTORY_MESSAGES
        ]
    )[::-1]
    asked = SearchChatMessage.objects.create(
        search_run=run, user=user, role="user", content=question
    )
    stored = False
    parts: list[str] = []
    try:
        for chunk in client.stream(
            _messages(run, applications, named, excerpts, history, question)
        ):
            text = _chunk_text(chunk)
            if text:
                parts.append(text)
                yield _event("token", {"text": text})
        answer = "".join(parts).strip()
        if not answer:
            yield _event(
                "error",
                {"message": "The model returned an empty answer; try rephrasing the question."},
            )
            return
        reply = SearchChatMessage.objects.create(
            search_run=run,
            user=user,
            role="assistant",
            content=answer,
            citations=[
                citation_for(a).as_dict()
                for a in named_in(answer, applications, strict=True)[:CITATIONS_MAX]
            ],
            model=model,
        )
        stored = True
        yield _event(
            "done",
            {
                "question": _payload(asked),
                "message": _payload(reply),
                "seconds": round(time.monotonic() - started, 1),
            },
        )
    except Exception as exc:  # noqa: BLE001 - every failure becomes one sentence for the user
        error = (
            exc if isinstance(exc, LLMError) else as_llm_error(settings.LLM_PROVIDER, model, exc)
        )
        logger.warning("results chat failed for search %s: %s", run.pk, error)
        yield _event("error", {"message": str(error)})
    finally:
        # A failed, empty or abandoned answer (the browser stopped the stream, which
        # closes this generator) leaves no half of a conversation behind.
        if not stored:
            asked.delete()
