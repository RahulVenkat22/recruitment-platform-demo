"""``SearchService.run()``: one "Search candidates" execution (plan.md 6.7).

Providers are queried in order, results are de-duplicated within the run by
email or phone, candidates are upserted through ``CandidateRepository``,
applications are created (or kept) per candidate and JD, every application is
scored, and the timeline gets one ``search.completed`` plus one
``application.ai_shortlisted`` per newly shortlisted candidate. Runs
synchronously inside the request.
"""

from __future__ import annotations

import logging
from collections.abc import Sequence
from dataclasses import dataclass, field
from typing import Any

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from activity.services import record_activity
from candidates.repositories import CandidateRepository, phone_digits
from common.enums import ActivityCategory, ApplicationStatus, JDStatus, SearchRunStatus
from common.permissions import is_hr_staff
from matching.registry import get_engine
from matching.services import compute_match
from pipeline.models import Application, SearchRun
from sourcing.dtos import SearchCriteria
from sourcing.exceptions import JobNotSearchable, NoSourcesSelected, UnknownSource
from sourcing.registry import ALL_SOURCES, get_provider, provider_keys

logger = logging.getLogger(__name__)

SEARCHABLE_STATUSES: frozenset[str] = frozenset({JDStatus.OPEN, JDStatus.ON_HOLD, JDStatus.DRAFT})
TOP_NAMES = 3


@dataclass
class SearchOutcome:
    run: SearchRun
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


def criteria_for(jd: Any) -> SearchCriteria:
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
    )


def _join_names(names: Sequence[str]) -> str:
    if len(names) <= 1:
        return "".join(names)
    return ", ".join(names[:-1]) + " and " + names[-1]


def _actor_name(actor: Any) -> str:
    return getattr(actor, "full_name", None) or "System"


class SearchService:
    @staticmethod
    @transaction.atomic
    def run(jd: Any, sources: Sequence[str] | str | None, actor: Any) -> SearchOutcome:
        if str(jd.status) not in SEARCHABLE_STATUSES:
            raise JobNotSearchable
        keys = resolve_sources(sources)
        started = timezone.now()
        run = SearchRun.objects.create(
            job_description=jd,
            requested_by=actor,
            sources=keys,
            status=SearchRunStatus.RUNNING,
            started_at=started,
        )
        outcome = SearchOutcome(run=run)
        criteria = criteria_for(jd)
        engine = get_engine()
        threshold = int(getattr(settings, "AI_SHORTLIST_THRESHOLD", 80))
        owner = actor if is_hr_staff(actor) else None

        seen_emails: set[str] = set()
        seen_phones: set[str] = set()
        shortlisted: list[Application] = []
        existing = 0
        for key in keys:
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
                    match = compute_match(application, engine=engine, computed_at=started)
                    if app_created:
                        outcome.new_application_ids.add(application.pk)
                        if float(match.overall_pct) >= threshold:
                            application.status = ApplicationStatus.AI_SHORTLISTED
                            application.save(update_fields=["status", "updated_at"])
                            shortlisted.append(application)
                    else:
                        existing += 1
                    outcome.applications.append(application)
            except Exception as exc:  # noqa: BLE001 - a broken provider must not sink the run
                logger.exception("candidate source %s failed", key)
                outcome.errors[key] = str(exc) or exc.__class__.__name__

        finished = timezone.now()
        run.total_found = len(outcome.applications)
        run.new_candidates = len(outcome.new_application_ids)
        run.existing_candidates = existing
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
        run.save()

        SearchService._record(jd, run, actor, keys, shortlisted, finished)
        outcome.applications.sort(
            key=lambda app: float(getattr(getattr(app, "match", None), "overall_pct", 0) or 0),
            reverse=True,
        )
        return outcome

    @staticmethod
    def _record(jd: Any, run: SearchRun, actor: Any, keys: list[str], shortlisted, when) -> None:
        labels = {
            "internal": "Internal Database",
            "referral": "Referral Email",
            "naukri": "Naukri",
            "linkedin": "LinkedIn",
        }
        across = _join_names([labels.get(key, key) for key in keys])
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
                description=", ".join(application.match.strengths[:2]),
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
