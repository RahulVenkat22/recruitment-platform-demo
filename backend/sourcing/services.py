"""``SearchService``: one "Search candidates" execution (plan.md 6.7), in phases.

    analysing   the JD is turned into a query plan (LLM, cached per version;
                falls back to the structured fields)
    retrieving  providers are queried in order and de-duplicated by email or
                phone; candidates are upserted through ``CandidateRepository``
                and scored by the rule engine, in memory
    evaluating  the top of the pool is evaluated by the LLM against the
                resume evidence; scores are blended (resumes.engines.scoring).
                A verdict already given on this version of the JD is reused,
                so a repeat search costs no calls and moves no numbers
    summarising every other candidate gets two sentences on why they received
                their percentage, written by the LLM from the scoring facts in
                batches; a summary written for this JD version is kept
    finalising  everything lands in one transaction: applications for new
                candidates, every match, the AI shortlist, counts and the
                timeline. Until then nothing in the pipeline changes, so a
                cancelled run leaves no trace

``start`` creates the run and, when ``SEARCH_RUN_ASYNC`` is on, executes it in
a background thread; the run's ``phase`` / ``progress`` columns are updated
outside any transaction so ``GET /searches/{id}/`` shows live progress. ``run``
keeps the old synchronous contract for scripts and tests.
"""

from __future__ import annotations

import logging
import threading
import time
from collections.abc import Sequence
from dataclasses import dataclass, field
from typing import Any

from django.conf import settings
from django.db import connections, transaction
from django.utils import timezone

from activity.services import record_activity
from candidates.repositories import CandidateRepository, phone_digits
from common.enums import ActivityCategory, ApplicationStatus, JDStatus, SearchRunStatus
from common.permissions import is_hr_staff
from matching.adapters import candidate_profile, jd_profile
from matching.engine import MatchResult
from matching.registry import get_engine
from matching.services import apply_semantic_result, compute_match
from matching.skills import display_name
from pipeline.models import Application, SearchRun
from resumes.engines import evaluation as evaluator
from resumes.engines.embeddings import EmbeddingError, get_embedding_service
from resumes.engines.llm import LLMError
from resumes.engines.planner import QueryPlan, plan_for, structured_plan
from resumes.engines.retrieval import Evidence, evidence_for, has_resume_chunks, library_size
from resumes.engines.scoring import SemanticResult, blend, preliminary
from sourcing.dtos import SearchCriteria
from sourcing.exceptions import (
    JobNotSearchable,
    NoSourcesSelected,
    SearchCancelled,
    SearchNotRunning,
    UnknownSource,
)
from sourcing.registry import ALL_SOURCES, get_provider, provider_keys

logger = logging.getLogger(__name__)

SEARCHABLE_STATUSES: frozenset[str] = frozenset({JDStatus.OPEN, JDStatus.ON_HOLD, JDStatus.DRAFT})
TOP_NAMES = 3
SOURCE_LABELS = {
    "internal": "Internal Database",
    "referral": "Referral Email",
    "naukri": "Naukri",
    "linkedin": "LinkedIn",
}
TERMINAL_STATUSES: frozenset[str] = frozenset(
    {SearchRunStatus.COMPLETED, SearchRunStatus.PARTIAL, SearchRunStatus.FAILED}
)


@dataclass
class Found:
    """One candidate a source returned, scored in memory until the run completes."""

    candidate: Any
    source: str
    # The application already on this job description, when there is one.
    existing: Application | None
    result: MatchResult
    # The provider's retrieval info (resumes.engines.retrieval), when it did a semantic pass.
    semantic: dict[str, Any] = field(default_factory=dict)
    verdict: SemanticResult | None = None
    summary: str = ""

    @property
    def rule_pct(self) -> float:
        return float(self.result.overall_pct)

    @property
    def retrieval(self) -> float | None:
        score = self.semantic.get("retrieval_score")
        return float(score) if score is not None else None

    @property
    def score(self) -> float:
        return self.verdict.overall_pct if self.verdict else self.rule_pct

    @property
    def previous(self) -> Any:
        """The match the candidate already has on this job description, if any."""
        return getattr(self.existing, "match", None) if self.existing else None


@dataclass
class SearchOutcome:
    run: SearchRun
    found: list[Found] = field(default_factory=list)
    applications: list[Application] = field(default_factory=list)
    new_application_ids: set[Any] = field(default_factory=set)
    errors: dict[str, str] = field(default_factory=dict)


def resolve_sources(sources: Sequence[str] | str | None) -> list[str]:
    """``["all"]`` / ``"all"`` -> every configured key; otherwise validate the keys."""
    if isinstance(sources, str):
        sources = [sources]
    wanted = [str(item).strip().lower() for item in (sources or []) if str(item).strip()]
    if not wanted:
        raise NoSourcesSelected
    configured = provider_keys()
    if ALL_SOURCES in wanted:
        return list(configured)
    unknown = [key for key in wanted if key not in configured]
    if unknown:
        raise UnknownSource(f"Unknown candidate source: {', '.join(unknown)}")
    ordered = [key for key in configured if key in wanted]
    return ordered


def criteria_for(jd: Any, plan: QueryPlan | None = None) -> SearchCriteria:
    return SearchCriteria(
        job_description_id=jd.id,
        title=jd.title,
        required_skills=list(jd.required_skills or []),
        preferred_skills=list(jd.preferred_skills or []),
        experience_min=int(jd.experience_min_years),
        experience_max=int(jd.experience_max_years),
        location=jd.location,
        domain=(jd.domain or None),
        limit=int(getattr(settings, "SEARCH_RESULT_LIMIT_PER_SOURCE", 60)),
        query_plan=plan.as_dict() if plan else None,
    )


def _join_names(names: Sequence[str]) -> str:
    if len(names) <= 1:
        return "".join(names)
    return ", ".join(names[:-1]) + " and " + names[-1]


def _actor_name(actor: Any) -> str:
    return getattr(actor, "full_name", None) or "System"


# Where each phase sits on the 0-100 scale the loader shows; a counter moves within the span.
PHASE_SPAN: dict[str, tuple[int, int]] = {
    "queued": (0, 2),
    "analysing": (2, 10),
    "retrieving": (10, 35),
    "scoring": (35, 40),
    "evaluating": (40, 80),
    "summarising": (80, 95),
    "finalising": (95, 100),
    "done": (100, 100),
}


class RunProgress:
    """Writes phase/progress straight to the row (autocommit) so pollers see it, and
    stops the worker as soon as the row is gone, which is how a cancel arrives."""

    def __init__(self, run: SearchRun) -> None:
        self.run = run

    def check(self) -> None:
        if not SearchRun.objects.filter(pk=self.run.pk).exists():
            raise SearchCancelled(str(self.run.pk))

    def update(
        self, phase: str, message: str, *, current: int | None = None, total: int | None = None
    ) -> None:
        """``current`` counts the items already finished in this phase, of ``total``."""
        self.check()
        low, high = PHASE_SPAN.get(phase, (0, 100))
        fraction = min(current, total) / total if current is not None and total else 0
        payload: dict[str, Any] = {
            "message": message,
            "percent": round(low + (high - low) * fraction),
        }
        if current is not None:
            payload["current"] = current
        if total is not None:
            payload["total"] = total
        self.run.phase = phase
        self.run.progress = payload
        SearchRun.objects.filter(pk=self.run.pk).update(
            phase=phase, progress=payload, updated_at=timezone.now()
        )


class SearchService:
    # ------------------------------------------------------------ entry points

    @staticmethod
    def create_run(jd: Any, sources: Sequence[str] | str | None, actor: Any) -> SearchRun:
        if str(jd.status) not in SEARCHABLE_STATUSES:
            raise JobNotSearchable
        keys = resolve_sources(sources)
        return SearchRun.objects.create(
            job_description=jd,
            requested_by=actor,
            sources=keys,
            status=SearchRunStatus.PENDING,
            started_at=timezone.now(),
            phase="queued",
            progress={"message": "Queued"},
        )

    @staticmethod
    def start(jd: Any, sources: Sequence[str] | str | None, actor: Any) -> SearchOutcome:
        """Create the run; execute inline or hand it to a background thread."""
        run = SearchService.create_run(jd, sources, actor)
        if not getattr(settings, "SEARCH_RUN_ASYNC", False):
            return SearchService.execute(run.pk)
        transaction.on_commit(lambda: _spawn(run.pk))
        return SearchOutcome(run=run)

    @staticmethod
    def run(jd: Any, sources: Sequence[str] | str | None, actor: Any) -> SearchOutcome:
        """Synchronous execution (scripts, tests, ``SEARCH_RUN_ASYNC=false``)."""
        run = SearchService.create_run(jd, sources, actor)
        return SearchService.execute(run.pk)

    @staticmethod
    def cancel(run: SearchRun) -> None:
        """Stop an in-flight run and remove it. A run writes to the pipeline only when
        it completes, so deleting the row is the whole undo; the worker notices at its
        next step and stops."""
        if str(run.status) in TERMINAL_STATUSES:
            raise SearchNotRunning
        run.delete()

    # ------------------------------------------------------------- execution

    @staticmethod
    def execute(run_id: Any) -> SearchOutcome:
        run = SearchRun.objects.select_related("job_description", "requested_by").get(pk=run_id)
        jd, actor, keys = run.job_description, run.requested_by, list(run.sources)
        progress = RunProgress(run)
        started = timezone.now()
        SearchRun.objects.filter(pk=run.pk).update(
            status=SearchRunStatus.RUNNING, started_at=started
        )
        run.status = SearchRunStatus.RUNNING
        run.started_at = started
        outcome = SearchOutcome(run=run)
        try:
            plan = SearchService._analyse(run, jd, keys, progress)
            SearchService._retrieve(jd, keys, plan, progress, outcome, started)
            SearchService._evaluate(run, jd, plan, progress, outcome)
            SearchService._summarise(jd, plan, progress, outcome)
            SearchService._finalise(run, jd, actor, keys, progress, outcome, started)
        except SearchCancelled:
            logger.info("search run %s was cancelled and removed", run.pk)
            return outcome
        except Exception as exc:  # noqa: BLE001 - the run row must always reach a final state
            logger.exception("search run %s failed", run.pk)
            finished = timezone.now()
            SearchRun.objects.filter(pk=run.pk).update(
                status=SearchRunStatus.FAILED,
                error=f"{exc.__class__.__name__}: {exc}"[:2000],
                finished_at=finished,
                duration_ms=int((finished - started).total_seconds() * 1000),
                phase="done",
                progress={"message": "Search failed"},
            )
            run.refresh_from_db()
            outcome.run = run
            raise
        return outcome

    @staticmethod
    def _analyse(run: SearchRun, jd: Any, keys: list[str], progress: RunProgress) -> QueryPlan:
        # The LLM query plan pays off when resume chunks can be searched with it:
        # the internal pool holds the ingested resumes.
        semantic_needed = getattr(settings, "SEMANTIC_RERANK_ENABLED", False) or (
            "internal" in keys and library_size() > 0
        )
        if not semantic_needed:
            plan = structured_plan(jd)
        else:
            progress.update("analysing", f"Reading the job description for “{jd.title}”…")
            plan = plan_for(jd)
        SearchRun.objects.filter(pk=run.pk).update(query_plan=plan.as_dict())
        run.query_plan = plan.as_dict()
        return plan

    @staticmethod
    def _retrieve(
        jd: Any,
        keys: list[str],
        plan: QueryPlan,
        progress: RunProgress,
        outcome: SearchOutcome,
        started,
    ) -> None:
        """Query every source, keep each candidate once, and score them by the rules
        in memory; only the candidate records themselves are written."""
        criteria = criteria_for(jd, plan)
        engine = get_engine()
        job = jd_profile(jd)
        seen_emails: set[str] = set()
        seen_phones: set[str] = set()
        seen_candidates: set[Any] = set()
        for index, key in enumerate(keys, start=1):
            progress.update(
                "retrieving",
                f"Searching {SOURCE_LABELS.get(key, key)}…",
                current=index - 1,
                total=len(keys),
            )
            try:
                provider = get_provider(key)
                for dto in provider.search(criteria):
                    progress.check()
                    email = (dto.email or "").strip().lower()
                    digits = phone_digits(dto.phone)
                    if (email and email in seen_emails) or (digits and digits in seen_phones):
                        continue
                    if email:
                        seen_emails.add(email)
                    if digits:
                        seen_phones.add(digits)
                    with transaction.atomic():
                        candidate, _created = CandidateRepository.upsert_from_dto(
                            dto, discovered_at=started
                        )
                    if candidate.pk in seen_candidates:
                        continue
                    seen_candidates.add(candidate.pk)
                    existing = (
                        Application.objects.filter(candidate=candidate, job_description=jd)
                        .select_related("match")
                        .first()
                    )
                    outcome.found.append(
                        Found(
                            candidate=candidate,
                            source=dto.source,
                            existing=existing,
                            result=engine.score(job, candidate_profile(candidate)),
                            semantic=dict((dto.raw or {}).get("semantic") or {}),
                        )
                    )
            except Exception as exc:  # noqa: BLE001 - a broken provider must not sink the run
                logger.exception("candidate source %s failed", key)
                outcome.errors[key] = str(exc) or exc.__class__.__name__

    @staticmethod
    def _evaluate(
        run: SearchRun, jd: Any, plan: QueryPlan, progress: RunProgress, outcome: SearchOutcome
    ) -> None:
        """LLM evaluation of the top of the pool. A candidate the AI already reviewed for
        this version of the job description keeps that verdict; everyone else gets the
        rules-plus-retrieval blend."""
        if not outcome.found:
            return
        ranked = sorted(
            outcome.found,
            key=lambda item: preliminary(item.rule_pct, item.retrieval),
            reverse=True,
        )
        limit = int(getattr(settings, "SEMANTIC_RERANK_LIMIT", 0))
        enabled = bool(getattr(settings, "SEMANTIC_RERANK_ENABLED", False)) and limit > 0
        top = ranked[:limit] if enabled else []
        model = settings.LLM_SEARCH_MODEL
        job_vector: list[float] | None = None
        if top:
            try:
                job_vector = get_embedding_service().embed_query(
                    plan.queries[0] if plan.queries else jd.title
                )
            except EmbeddingError as exc:
                logger.warning("no job vector for evidence lookup: %s", exc)

        for index, item in enumerate(top, start=1):
            candidate = item.candidate
            item.verdict = _carried_verdict(item, jd)
            if item.verdict is not None:
                continue
            progress.update(
                "evaluating",
                f"AI is reviewing {candidate.full_name} ({index} of {len(top)})…",
                current=index - 1,
                total=len(top),
            )
            evidence = [
                Evidence(
                    section=entry["section"],
                    excerpt=entry["excerpt"],
                    similarity=entry.get("similarity", 0.0),
                )
                for entry in item.semantic.get("evidence", [])
            ]
            if not evidence and job_vector is not None and has_resume_chunks(candidate.pk):
                evidence = evidence_for(candidate.pk, job_vector)
            if not evidence and candidate.resume_text:
                evidence = [
                    Evidence(
                        section="text",
                        excerpt=" ".join(candidate.resume_text.split())[:420],
                        similarity=0.0,
                    )
                ]
            try:
                started_at = time.monotonic()
                verdict = evaluator.evaluate(
                    plan,
                    candidate_profile(candidate),
                    evidence,
                    model=model,
                    location=candidate.location,
                    headline=candidate.headline,
                )
                seconds = round(time.monotonic() - started_at, 1)
            except LLMError as exc:
                logger.warning("evaluation skipped for %s: %s", candidate.full_name, exc)
                outcome.errors.setdefault("evaluation", str(exc))
                item.verdict = _blend_only(item, jd)
                continue
            item.verdict = SemanticResult(
                overall_pct=blend(item.rule_pct, item.retrieval, verdict.score),
                retrieval_score=item.retrieval,
                rerank_score=verdict.score,
                explanation=verdict.explanation,
                matched_skills=verdict.matched_skills,
                missing_skills=verdict.missing_skills,
                strengths=verdict.matching_experience,
                concerns=verdict.concerns,
                details={
                    "rule_pct": item.rule_pct,
                    "retrieval_score": item.retrieval,
                    "llm_score": verdict.score,
                    "matched_skills": verdict.matched_skills,
                    "missing_skills": verdict.missing_skills,
                    "matching_experience": verdict.matching_experience,
                    "concerns": verdict.concerns,
                    "meets_experience_requirement": verdict.meets_experience_requirement,
                    "dropped_claims": verdict.dropped_claims,
                    "evidence": [entry.as_dict() for entry in evidence[:3]],
                    "model": model,
                    "seconds": seconds,
                    "search_run_id": str(run.pk),
                    "jd_version": jd.current_version,
                },
            )
        for item in ranked[len(top) :]:
            item.verdict = _carried_verdict(item, jd) or _blend_only(item, jd)
        if top:
            progress.update(
                "evaluating",
                f"AI reviewed the top {len(top)} candidates.",
                current=len(top),
                total=len(top),
            )

    @staticmethod
    def _summarise(jd: Any, plan: QueryPlan, progress: RunProgress, outcome: SearchOutcome) -> None:
        """Two sentences on the percentage for every candidate without an explanation;
        one written for this version of the job description is kept, not rewritten."""
        if not bool(getattr(settings, "SEMANTIC_RERANK_ENABLED", False)):
            return
        pending: list[Found] = []
        for item in outcome.found:
            if item.verdict is not None and item.verdict.explanation:
                continue
            previous = item.previous
            details = (previous.semantic_details or {}) if previous else {}
            if (
                previous is not None
                and previous.explanation
                and details.get("summary_model")
                and details.get("jd_version") == jd.current_version
            ):
                item.summary = previous.explanation
                continue
            pending.append(item)
        pending.sort(key=lambda item: item.score, reverse=True)
        model = settings.LLM_SEARCH_MODEL
        for start in range(0, len(pending), evaluator.SUMMARY_BATCH):
            batch = pending[start : start + evaluator.SUMMARY_BATCH]
            progress.update(
                "summarising",
                f"Writing match summaries ({start + len(batch)} of {len(pending)})…",
                current=start,
                total=len(pending),
            )
            facts = [
                evaluator.MatchFacts(
                    id=str(item.candidate.pk),
                    name=item.candidate.full_name,
                    overall_pct=item.score,
                    years=float(item.candidate.total_experience_years),
                    years_min=jd.experience_min_years,
                    years_max=jd.experience_max_years,
                    matched_required=[display_name(k) for k in item.result.matched_required_skills],
                    missing_required=[display_name(k) for k in item.result.missing_required_skills],
                    matched_preferred=[
                        display_name(k) for k in item.result.matched_preferred_skills
                    ],
                    experience_score=float(item.result.experience_score),
                    domain_score=float(item.result.domain_score),
                    education_score=float(item.result.education_score),
                    responsibility_score=float(item.result.responsibility_score),
                    retrieval_score=item.retrieval,
                )
                for item in batch
            ]
            try:
                summaries = evaluator.summarise(plan, facts, model=model)
            except LLMError as exc:
                logger.warning("match summaries stopped at %d of %d: %s", start, len(pending), exc)
                outcome.errors.setdefault("summary", str(exc))
                return
            for item in batch:
                item.summary = summaries.get(str(item.candidate.pk), "")

    @staticmethod
    def _finalise(
        run: SearchRun,
        jd: Any,
        actor: Any,
        keys: list[str],
        progress: RunProgress,
        outcome: SearchOutcome,
        started,
    ) -> None:
        """Everything the run found lands in one transaction: applications for the new
        candidates, every match (rules, the AI's verdict, the summary), the AI
        shortlist, the counts and the timeline."""
        progress.update("finalising", "Ranking the results…")
        threshold = int(getattr(settings, "AI_SHORTLIST_THRESHOLD", 80))
        engine = get_engine()
        owner = actor if is_hr_staff(actor) else None
        model = settings.LLM_SEARCH_MODEL
        shortlisted: list[Application] = []
        scores: dict[Any, float] = {}
        with transaction.atomic():
            finished = timezone.now()
            for item in outcome.found:
                application, created = Application.objects.get_or_create(
                    candidate=item.candidate,
                    job_description=jd,
                    defaults={
                        "status": ApplicationStatus.NEW,
                        "entry_source": item.source,
                        "search_run": run,
                        "owner": owner,
                        "stage_entered_at": finished,
                        "last_activity_at": finished,
                    },
                )
                match = compute_match(
                    application, engine=engine, computed_at=finished, result=item.result
                )
                if item.verdict is not None:
                    match = apply_semantic_result(match, item.verdict, computed_at=finished)
                if item.summary and not match.explanation:
                    match.explanation = item.summary
                    match.semantic_details = {
                        **(match.semantic_details or {}),
                        "summary_model": model,
                        "jd_version": jd.current_version,
                    }
                    match.save(update_fields=["explanation", "semantic_details", "updated_at"])
                scores[application.pk] = float(match.overall_pct)
                if created:
                    outcome.new_application_ids.add(application.pk)
                    if scores[application.pk] >= threshold:
                        application.status = ApplicationStatus.AI_SHORTLISTED
                        application.save(update_fields=["status", "updated_at"])
                        shortlisted.append(application)
                outcome.applications.append(application)
            run.total_found = len(outcome.applications)
            run.new_candidates = len(outcome.new_application_ids)
            run.existing_candidates = run.total_found - run.new_candidates
            run.shortlisted = len(shortlisted)
            run.finished_at = finished
            run.duration_ms = int((finished - started).total_seconds() * 1000)
            if outcome.errors and not outcome.applications:
                run.status = SearchRunStatus.FAILED
            elif outcome.errors:
                run.status = SearchRunStatus.PARTIAL
            else:
                run.status = SearchRunStatus.COMPLETED
            run.error = "; ".join(f"{k}: {v}" for k, v in outcome.errors.items()) or None
            run.phase = "done"
            run.progress = {
                "message": f"{run.total_found} candidates found, {run.shortlisted} AI shortlisted",
                "percent": 100,
            }
            # A cancel that landed during the ranking rolls all of this back.
            progress.check()
            run.save()
            SearchService._record(jd, run, actor, keys, shortlisted, finished)
        outcome.applications.sort(key=lambda app: scores[app.pk], reverse=True)

    # -------------------------------------------------------------- timeline

    @staticmethod
    def _record(jd: Any, run: SearchRun, actor: Any, keys: list[str], shortlisted, when) -> None:
        across = _join_names([SOURCE_LABELS.get(key, key) for key in keys])
        plan = run.query_plan or {}
        record_activity(
            job_description=jd,
            category=ActivityCategory.CANDIDATE_SEARCH,
            event_type="search.completed",
            title=f"{_actor_name(actor)} searched for candidates",
            description=(
                f"{run.total_found} candidates found across {across}; "
                f"{run.new_candidates} new, {run.shortlisted} AI shortlisted."
            ),
            actor=actor,
            metadata={
                "search_run_id": str(run.pk),
                "sources": list(keys),
                "total_found": run.total_found,
                "new_candidates": run.new_candidates,
                "existing_candidates": run.existing_candidates,
                "shortlisted": run.shortlisted,
                "status": str(run.status),
                "query_plan_source": plan.get("source", ""),
                "inferred_skills": list(plan.get("inferred_skills", []))[:10],
            },
            occurred_at=when,
        )
        for application in shortlisted:
            candidate = application.candidate
            pct = float(application.match.overall_pct)
            record_activity(
                job_description=jd,
                category=ActivityCategory.CANDIDATE_SHORTLISTED,
                event_type="application.ai_shortlisted",
                title=f"AI shortlisted {candidate.full_name} ({pct:.0f}% match)",
                description=application.match.explanation
                or ", ".join(application.match.strengths[:2]),
                actor=None,
                application=application,
                candidate=candidate,
                metadata={
                    "match_pct": pct,
                    "to": str(ApplicationStatus.AI_SHORTLISTED),
                    "search_run_id": str(run.pk),
                    "candidates": [
                        {
                            "id": str(candidate.pk),
                            "name": candidate.full_name,
                            "avatar_url": candidate.display_avatar_url,
                        }
                    ],
                },
                occurred_at=when,
            )


# ------------------------------------------------------------- verdicts


def _carried_verdict(item: Found, jd: Any) -> SemanticResult | None:
    """The AI's earlier verdict on this version of the job description, re-blended with
    today's rule score: a repeat search neither asks the model again nor moves the number."""
    previous = item.previous
    details = dict(previous.semantic_details or {}) if previous is not None else {}
    llm = details.get("llm_score")
    if llm is None or details.get("jd_version") != jd.current_version:
        return None
    retrieval = item.retrieval if item.retrieval is not None else details.get("retrieval_score")
    details.update(rule_pct=item.rule_pct, retrieval_score=retrieval)
    return SemanticResult(
        overall_pct=blend(item.rule_pct, retrieval, float(llm)),
        retrieval_score=retrieval,
        rerank_score=float(llm),
        explanation=previous.explanation,
        matched_skills=list(details.get("matched_skills", [])),
        missing_skills=list(details.get("missing_skills", [])),
        strengths=list(details.get("matching_experience", [])),
        concerns=list(details.get("concerns", [])),
        details=details,
    )


def _blend_only(item: Found, jd: Any) -> SemanticResult | None:
    """Rules plus resume similarity, for a candidate the AI did not review."""
    if item.retrieval is None:
        return None
    return SemanticResult(
        overall_pct=blend(item.rule_pct, item.retrieval, None),
        retrieval_score=item.retrieval,
        rerank_score=None,
        explanation="",
        details={
            "rule_pct": item.rule_pct,
            "retrieval_score": item.retrieval,
            "llm_score": None,
            "evidence": list(item.semantic.get("evidence", []))[:3],
            "jd_version": jd.current_version,
        },
    )


# ------------------------------------------------------------ background


def _spawn(run_id: Any) -> None:
    thread = threading.Thread(
        target=_thread_main, args=(run_id,), name=f"search-run-{run_id}", daemon=True
    )
    thread.start()


def _thread_main(run_id: Any) -> None:
    try:
        SearchService.execute(run_id)
    except Exception:  # noqa: BLE001 - already recorded on the run and logged
        pass
    finally:
        connections.close_all()
