"""``SearchService``: one "Search candidates" execution (plan.md 6.7), in phases.

    analysing   the JD is turned into a query plan (LLM, cached per version;
                falls back to the structured fields)
    retrieving  providers are queried in order and de-duplicated by email or
                phone; candidates are upserted through ``CandidateRepository``,
                applications created (or kept) and scored by the rule engine
    evaluating  the top of the pool is evaluated by the LLM against the
                resume evidence; scores are blended (resumes.engines.scoring)
    finalising  new applications at or above the threshold become
                AI Shortlisted, counts and activities are written

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
from matching.adapters import candidate_profile
from matching.registry import get_engine
from matching.services import apply_semantic_result, compute_match
from pipeline.models import Application, SearchRun
from resumes.engines import evaluation as evaluator
from resumes.engines.embeddings import EmbeddingError, get_embedding_service
from resumes.engines.llm import LLMError
from resumes.engines.planner import QueryPlan, plan_for, structured_plan
from resumes.engines.retrieval import Evidence, evidence_for, has_resume_chunks, library_size
from resumes.engines.scoring import SemanticResult, blend, preliminary
from sourcing.dtos import SearchCriteria
from sourcing.exceptions import JobNotSearchable, NoSourcesSelected, UnknownSource
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
class SearchOutcome:
    run: SearchRun
    applications: list[Application] = field(default_factory=list)
    new_application_ids: set[Any] = field(default_factory=set)
    errors: dict[str, str] = field(default_factory=dict)
    # Per application: the provider's retrieval info (resumes.engines.retrieval).
    semantic: dict[Any, dict[str, Any]] = field(default_factory=dict)


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


class RunProgress:
    """Writes phase/progress straight to the row (autocommit) so pollers see it."""

    def __init__(self, run: SearchRun) -> None:
        self.run = run

    def update(
        self, phase: str, message: str, *, current: int | None = None, total: int | None = None
    ) -> None:
        payload: dict[str, Any] = {"message": message}
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
            SearchService._retrieve(run, jd, actor, keys, plan, progress, outcome, started)
            SearchService._evaluate(run, jd, plan, progress, outcome)
            SearchService._finalise(run, jd, actor, keys, progress, outcome, started)
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
        run: SearchRun,
        jd: Any,
        actor: Any,
        keys: list[str],
        plan: QueryPlan,
        progress: RunProgress,
        outcome: SearchOutcome,
        started,
    ) -> None:
        criteria = criteria_for(jd, plan)
        engine = get_engine()
        owner = actor if is_hr_staff(actor) else None
        seen_emails: set[str] = set()
        seen_phones: set[str] = set()
        existing = 0
        for index, key in enumerate(keys, start=1):
            progress.update(
                "retrieving",
                f"Searching {SOURCE_LABELS.get(key, key)}…",
                current=index,
                total=len(keys),
            )
            try:
                provider = get_provider(key)
                for dto in provider.search(criteria):
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
                        application, app_created = Application.objects.get_or_create(
                            candidate=candidate,
                            job_description=jd,
                            defaults={
                                "status": ApplicationStatus.NEW,
                                "entry_source": dto.source,
                                "search_run": run,
                                "owner": owner,
                                "stage_entered_at": started,
                                "last_activity_at": started,
                            },
                        )
                        compute_match(application, engine=engine, computed_at=started)
                    if app_created:
                        outcome.new_application_ids.add(application.pk)
                    else:
                        existing += 1
                    semantic = (dto.raw or {}).get("semantic")
                    if semantic:
                        outcome.semantic[application.pk] = semantic
                    outcome.applications.append(application)
            except Exception as exc:  # noqa: BLE001 - a broken provider must not sink the run
                logger.exception("candidate source %s failed", key)
                outcome.errors[key] = str(exc) or exc.__class__.__name__
        run.existing_candidates = existing

    @staticmethod
    def _evaluate(
        run: SearchRun, jd: Any, plan: QueryPlan, progress: RunProgress, outcome: SearchOutcome
    ) -> None:
        """LLM evaluation of the top of the pool; retrieval-only blending for the rest."""
        if not outcome.applications:
            return
        applications = list(outcome.applications)
        for application in applications:
            application.match.refresh_from_db()

        # Preliminary order: rules blended with retrieval, best first.
        def prelim(application: Application) -> float:
            info = outcome.semantic.get(application.pk)
            retrieval = float(info["retrieval_score"]) if info else None
            return preliminary(float(application.match.overall_pct), retrieval)

        applications.sort(key=prelim, reverse=True)
        limit = int(getattr(settings, "SEMANTIC_RERANK_LIMIT", 0))
        enabled = bool(getattr(settings, "SEMANTIC_RERANK_ENABLED", False)) and limit > 0
        top = applications[:limit] if enabled else []
        model = settings.LLM_SEARCH_MODEL
        job_vector: list[float] | None = None
        if top:
            try:
                job_vector = get_embedding_service().embed_query(
                    plan.queries[0] if plan.queries else jd.title
                )
            except EmbeddingError as exc:
                logger.warning("no job vector for evidence lookup: %s", exc)

        evaluated = 0
        for index, application in enumerate(top, start=1):
            candidate = application.candidate
            progress.update(
                "evaluating",
                f"AI is reviewing {candidate.full_name} ({index} of {len(top)})…",
                current=index,
                total=len(top),
            )
            info = outcome.semantic.get(application.pk) or {}
            evidence = [
                Evidence(
                    section=item["section"],
                    excerpt=item["excerpt"],
                    similarity=item.get("similarity", 0.0),
                )
                for item in info.get("evidence", [])
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
            profile = candidate_profile(candidate)
            retrieval = float(info["retrieval_score"]) if info else None
            rule_pct = float(application.match.overall_pct)
            try:
                started_at = time.monotonic()
                verdict = evaluator.evaluate(
                    plan,
                    profile,
                    evidence,
                    model=model,
                    location=candidate.location,
                    headline=candidate.headline,
                )
                seconds = round(time.monotonic() - started_at, 1)
            except LLMError as exc:
                logger.warning("evaluation skipped for %s: %s", candidate.full_name, exc)
                outcome.errors.setdefault("evaluation", str(exc))
                SearchService._blend_only(application, rule_pct, retrieval, info)
                continue
            result = SemanticResult(
                overall_pct=blend(rule_pct, retrieval, verdict.score),
                retrieval_score=retrieval,
                rerank_score=verdict.score,
                explanation=verdict.explanation,
                matched_skills=verdict.matched_skills,
                missing_skills=verdict.missing_skills,
                strengths=verdict.matching_experience,
                concerns=verdict.concerns,
                details={
                    "rule_pct": rule_pct,
                    "retrieval_score": retrieval,
                    "llm_score": verdict.score,
                    "matched_skills": verdict.matched_skills,
                    "missing_skills": verdict.missing_skills,
                    "matching_experience": verdict.matching_experience,
                    "concerns": verdict.concerns,
                    "meets_experience_requirement": verdict.meets_experience_requirement,
                    "dropped_claims": verdict.dropped_claims,
                    "evidence": [item.as_dict() for item in evidence[:3]],
                    "model": model,
                    "seconds": seconds,
                    "search_run_id": str(run.pk),
                },
            )
            apply_semantic_result(application.match, result)
            evaluated += 1
        for application in applications[len(top) :]:
            info = outcome.semantic.get(application.pk)
            if info:
                SearchService._blend_only(
                    application,
                    float(application.match.overall_pct),
                    float(info["retrieval_score"]),
                    info,
                )
        if top:
            progress.update(
                "finalising",
                f"AI reviewed {evaluated} of {len(top)} top candidates; ranking results…",
            )

    @staticmethod
    def _blend_only(
        application: Application, rule_pct: float, retrieval: float | None, info: dict
    ) -> None:
        if retrieval is None:
            return
        result = SemanticResult(
            overall_pct=blend(rule_pct, retrieval, None),
            retrieval_score=retrieval,
            rerank_score=None,
            explanation="",
            details={
                "rule_pct": rule_pct,
                "retrieval_score": retrieval,
                "llm_score": None,
                "evidence": list(info.get("evidence", []))[:3],
            },
        )
        apply_semantic_result(application.match, result)

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
        threshold = int(getattr(settings, "AI_SHORTLIST_THRESHOLD", 80))
        shortlisted: list[Application] = []
        with transaction.atomic():
            for application in outcome.applications:
                if application.pk not in outcome.new_application_ids:
                    continue
                application.match.refresh_from_db()
                if float(application.match.overall_pct) >= threshold:
                    application.status = ApplicationStatus.AI_SHORTLISTED
                    application.save(update_fields=["status", "updated_at"])
                    shortlisted.append(application)
            finished = timezone.now()
            run.total_found = len(outcome.applications)
            run.new_candidates = len(outcome.new_application_ids)
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
                "message": f"{run.total_found} candidates found, {run.shortlisted} AI shortlisted"
            }
            run.save()
            SearchService._record(jd, run, actor, keys, shortlisted, finished)
        outcome.applications.sort(
            key=lambda app: float(getattr(getattr(app, "match", None), "overall_pct", 0) or 0),
            reverse=True,
        )

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
                            "avatar_url": candidate.avatar_url,
                        }
                    ],
                },
                occurred_at=when,
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
