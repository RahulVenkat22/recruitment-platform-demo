"""Applications with real match scores for the seeded JDs (plan.md section 10
"Applications", section 12 phase 5 "seed v3").

For every JD the pool providers run exactly as a live search would, the most
relevant candidates are attached (about forty for the Senior Python Developer
JD, fewer elsewhere, roughly 130 overall), each application is scored by the
configured engine, and statuses are spread so every pipeline stage appears at
least twice. John Doe and the prompt's ranking examples keep their scripted
statuses. Timeline rows: one ``search.completed`` per run and one
``application.ai_shortlisted`` per AI-shortlisted candidate; the later
status-change chains arrive with the phase 7 history generator.
"""

from __future__ import annotations

from collections import Counter
from datetime import datetime, time, timedelta
from typing import Any

from django.utils import timezone

from accounts.models import User
from activity.models import Activity
from activity.services import record_activity
from candidates.models import Candidate
from common.enums import (
    ActivityCategory,
    ApplicationStatus,
    ParticipantRole,
    SearchRunStatus,
    UserRole,
)
from jobs.models import JobDescription
from matching.registry import get_engine
from matching.services import compute_match, score_pair
from pipeline.models import Application, SearchRun
from seed.context import SeedContext
from seed.pools import journey
from seed.pools.jobs import JOBS
from seed.pools.users import PRIYA, RAHUL
from sourcing.registry import get_provider, provider_keys
from sourcing.services import criteria_for

SPD_TITLE = journey.JOURNEY_JD_TITLE
ATTACH_LIMIT = {SPD_TITLE: 40}
DEFAULT_ATTACH_LIMIT = 18
# The Senior Python Developer search covers every source so the prompt's ranking table
# (John from LinkedIn, Jane from Naukri, Alex from a referral, David internal) is found.
SEARCH_SOURCES = {SPD_TITLE: ["internal", "referral", "naukri", "linkedin"]}
MIN_PER_STATUS = 2
# Where a strong candidate is likely to be by now, from the front of the ranking backwards.
PROGRESS_LADDER: tuple[str, ...] = (
    ApplicationStatus.ONBOARDED,
    ApplicationStatus.ONBOARDING,
    ApplicationStatus.OFFER_ACCEPTED,
    ApplicationStatus.OFFER_SENT,
    ApplicationStatus.SELECTED,
    ApplicationStatus.FINAL_INTERVIEW,
    ApplicationStatus.HR_INTERVIEW,
    ApplicationStatus.TECHNICAL_INTERVIEW,
    ApplicationStatus.INTERVIEW_SCHEDULED,
    ApplicationStatus.PHONE_SCREENING,
    ApplicationStatus.CONTACTED,
    ApplicationStatus.CONTACT_PENDING,
    ApplicationStatus.HR_REVIEW,
)
SOURCE_LABELS = {
    "internal": "Internal Database",
    "referral": "Referral Email",
    "naukri": "Naukri",
    "linkedin": "LinkedIn",
}


def seed_applications(
    ctx: SeedContext, jobs: list[JobDescription], users: dict[str, User]
) -> tuple[list[Application], dict[Any, str]]:
    """Attach and score applications; returns them with the status each one should
    end up in. The history generator (``seed.generators.history``) replays the
    events that take every application there."""
    engine = get_engine()
    threshold = 80
    applications: list[Application] = []
    scripted = {example.full_name: example for example in journey.RANKED_EXAMPLES}
    by_jd: dict[Any, list[Application]] = {}

    for spec, jd in zip(JOBS, jobs, strict=True):
        recruiter = _recruiter_for(jd, users)
        sources = SEARCH_SOURCES.get(spec.title) or _pick_sources(ctx, spec.title)
        run_at = _run_time(ctx, spec.title, jd)
        limit = ATTACH_LIMIT.get(spec.title, DEFAULT_ATTACH_LIMIT)
        found = _collect(jd, sources, engine)
        attached = found[:limit]
        run = SearchRun.objects.create(
            job_description=jd,
            requested_by=recruiter,
            sources=sources,
            status=SearchRunStatus.COMPLETED,
            started_at=run_at,
            finished_at=run_at + timedelta(seconds=ctx.rng.randint(2, 6)),
            duration_ms=ctx.rng.randint(1800, 5200),
        )
        shortlisted: list[Application] = []
        rows: list[Application] = []
        for candidate, source in attached:
            application = Application.objects.create(
                candidate=candidate,
                job_description=jd,
                status=ApplicationStatus.NEW,
                entry_source=source,
                search_run=run,
                owner=_owner_for(ctx, jd, users, recruiter),
                stage_entered_at=run_at,
                last_activity_at=run_at,
            )
            match = compute_match(application, engine=engine, computed_at=run_at)
            if float(match.overall_pct) >= threshold:
                application.status = ApplicationStatus.AI_SHORTLISTED
                application.save(update_fields=["status", "updated_at"])
                shortlisted.append(application)
            _backdate(application, run_at)
            rows.append(application)
        run.total_found = len(rows)
        run.new_candidates = len(rows)
        run.existing_candidates = 0
        run.shortlisted = len(shortlisted)
        run.save()
        _backdate(run, run_at)
        _record_search(jd, run, recruiter, sources, shortlisted, run_at)
        by_jd[jd.pk] = rows
        applications.extend(rows)

    targets = _assign_statuses(ctx, applications, by_jd, scripted, jobs)
    return applications, targets


# ------------------------------------------------------------------ helpers


def _recruiter_for(jd: JobDescription, users: dict[str, User]) -> User:
    rows = jd.participants.select_related("user").order_by("created_at")
    for role in (ParticipantRole.RECRUITER, ParticipantRole.OWNER):
        for row in rows:
            if row.role_in_recruitment == role and row.user.role in (
                UserRole.HR,
                UserRole.HR_ADMIN,
            ):
                return row.user
    return users.get(PRIYA) or jd.created_by


def _owner_for(
    ctx: SeedContext, jd: JobDescription, users: dict[str, User], recruiter: User
) -> User:
    hr_people = [
        row.user
        for row in jd.participants.select_related("user")
        if row.user.role in (UserRole.HR, UserRole.HR_ADMIN)
    ]
    if not hr_people:
        hr_people = [recruiter]
    weights = [3 if user.pk == recruiter.pk else 1 for user in hr_people]
    return ctx.rng.choices(hr_people, weights)[0]


def _pick_sources(ctx: SeedContext, title: str) -> list[str]:
    keys = provider_keys()
    count = ctx.rng.randint(2, len(keys))
    chosen = ctx.rng.sample(keys, count)
    return [key for key in keys if key in chosen]


def _run_time(ctx: SeedContext, title: str, jd: JobDescription) -> datetime:
    if title == SPD_TITLE:
        return journey.event_time(
            journey.JOURNEY_EVENTS_BY_KEY["search_completed"], ctx.anchor_date
        )
    base = jd.published_at or jd.created_at
    at = base + timedelta(days=ctx.rng.randint(1, 4))
    return ctx.local(
        at.astimezone(ctx.tz).date(),
        time(ctx.rng.choice((10, 11, 14, 15)), ctx.rng.choice((0, 15, 30, 45))),
    )


def _collect(jd: JobDescription, sources: list[str], engine: Any) -> list[tuple[Any, str]]:
    """Distinct candidates the providers return for the JD, best engine score first
    (the source is the first provider that surfaced the person)."""
    criteria = criteria_for(jd)
    seen: set[str] = set()
    found: list[tuple[Any, str, float]] = []
    for key in sources:
        for dto in get_provider(key).search(criteria):
            email = dto.email.lower()
            if email in seen:
                continue
            seen.add(email)
            candidate = Candidate.objects.prefetch_related(
                "skills", "experiences", "education", "certifications"
            ).get(email=email)
            found.append((candidate, key, score_pair(jd, candidate, engine).overall_pct))
    found.sort(key=lambda item: item[2], reverse=True)
    return [(candidate, key) for candidate, key, _score in found]


def _backdate(row: Any, created_at: datetime, updated_at: datetime | None = None) -> None:
    """Backdate the row in the database *and* on the instance, so a later full
    ``save()`` (the history replay) does not write today's date back."""
    updated_at = updated_at or created_at
    type(row).objects.filter(pk=row.pk).update(created_at=created_at, updated_at=updated_at)
    row.created_at = created_at
    row.updated_at = updated_at


def _join_names(names: list[str]) -> str:
    if len(names) <= 1:
        return "".join(names)
    return ", ".join(names[:-1]) + " and " + names[-1]


def _record_search(jd, run, recruiter, sources, shortlisted, when) -> None:
    across = _join_names([SOURCE_LABELS.get(key, key) for key in sources])
    row = record_activity(
        job_description=jd,
        category=ActivityCategory.CANDIDATE_SEARCH,
        event_type="search.completed",
        title=f"{recruiter.full_name} searched for candidates",
        description=(
            f"{run.total_found} candidates found across {across}; "
            f"{run.new_candidates} new, {run.shortlisted} AI shortlisted."
        ),
        actor=recruiter,
        metadata={
            "search_run_id": str(run.pk),
            "sources": list(sources),
            "total_found": run.total_found,
            "new_candidates": run.new_candidates,
            "existing_candidates": 0,
            "shortlisted": run.shortlisted,
            "status": str(run.status),
        },
        occurred_at=when,
    )
    Activity.objects.filter(pk=row.pk).update(created_at=when, updated_at=when)
    for application in shortlisted:
        candidate = application.candidate
        pct = float(application.match.overall_pct)
        moment = when + timedelta(minutes=1)
        row = record_activity(
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
            occurred_at=moment,
        )
        Activity.objects.filter(pk=row.pk).update(created_at=moment, updated_at=moment)


def _assign_statuses(ctx, applications, by_jd, scripted, jobs) -> dict[Any, str]:
    """Spread statuses along the pipeline by rank, keep the scripted rows, and make
    sure every status appears at least ``MIN_PER_STATUS`` times. Returns the target
    status per application; nothing is written here."""
    rng = ctx.rng
    assigned: dict[Any, str] = {}
    locked: set[Any] = set()
    for rows in by_jd.values():
        ranked = sorted(rows, key=lambda app: float(app.match.overall_pct), reverse=True)
        for position, app in enumerate(ranked):
            name = app.candidate.full_name
            if name in scripted and app.job_description.title == SPD_TITLE:
                example = scripted[name]
                assigned[app.pk] = (
                    ApplicationStatus.ONBOARDED
                    if name == journey.JOHN_DOE.full_name
                    else example.status
                )
                locked.add(app.pk)
                continue
            pct = float(app.match.overall_pct)
            rank_share = position / max(1, len(ranked))
            roll = rng.random()
            if rank_share < 0.35 and pct >= 70:
                depth = min(
                    len(PROGRESS_LADDER) - 1, int(rank_share / 0.35 * (len(PROGRESS_LADDER) - 1))
                )
                if roll < 0.12:
                    status = rng.choice(
                        (
                            ApplicationStatus.REJECTED,
                            ApplicationStatus.ON_HOLD,
                            ApplicationStatus.WITHDRAWN,
                        )
                    )
                else:
                    status = (
                        PROGRESS_LADDER[max(depth, 4 - int(roll * 4))]
                        if depth < 4
                        else PROGRESS_LADDER[depth]
                    )
            elif rank_share < 0.6 and pct >= 60:
                status = rng.choice(
                    (
                        ApplicationStatus.HR_REVIEW,
                        ApplicationStatus.CONTACT_PENDING,
                        ApplicationStatus.CONTACTED,
                        ApplicationStatus.REJECTED,
                        ApplicationStatus.AI_SHORTLISTED if pct >= 80 else ApplicationStatus.NEW,
                    )
                )
            else:
                status = ApplicationStatus.AI_SHORTLISTED if pct >= 80 else ApplicationStatus.NEW
                if roll < 0.08:
                    status = ApplicationStatus.REJECTED
            assigned[app.pk] = str(status)

    counts = Counter(assigned.values())
    movable = [app for app in applications if app.pk not in locked]
    rng.shuffle(movable)
    for status in ApplicationStatus.values:
        while counts[status] < MIN_PER_STATUS and movable:
            app = movable.pop()
            if counts[assigned[app.pk]] <= MIN_PER_STATUS:
                movable.insert(0, app)
                if all(counts[assigned[a.pk]] <= MIN_PER_STATUS for a in movable):
                    break
                continue
            counts[assigned[app.pk]] -= 1
            assigned[app.pk] = status
            counts[status] += 1
    return assigned


# Silence "unused" warnings for helpers kept for readability.
_ = (RAHUL, timezone, timedelta, datetime, time)
