"""Orchestration for ``manage.py seed_demo``: marker check, optional wipe, the
generators in dependency order, and the summary counts. Everything runs inside
one transaction so a failure leaves the database as it was.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import datetime
from time import perf_counter

from django.db import connection, transaction

from accounts.models import User
from activity.models import Activity
from candidates.models import (
    Candidate,
    CandidateCertification,
    CandidateEducation,
    CandidateExperience,
    CandidateSkill,
    CandidateSource,
)
from common.enums import CandidateSource as SourceKey
from jobs.models import JobDescription, JobDescriptionVersion, RecruitmentParticipant
from notifications.models import Notification
from pipeline.models import (
    Application,
    CandidateMatch,
    Communication,
    Interview,
    Offer,
    Onboarding,
    SearchRun,
)
from seed.context import SeedContext
from seed.generators.activities import seed_job_history
from seed.generators.applications import seed_applications
from seed.generators.candidates import seed_candidates
from seed.generators.history import seed_history
from seed.generators.jobs import seed_jobs
from seed.generators.support import seed_support_tickets
from seed.generators.users import seed_users
from seed.models import SeedMarker
from seed.pools.users import EMAIL_DOMAIN
from support.models import Ticket, TicketEvent
from support.services import NUMBER_SEQUENCE

# Bump when the shape of the seeded dataset changes (later phases add applications).
SEED_VERSION = 5

Logger = Callable[[str], None]


@dataclass(frozen=True)
class SeedSummary:
    skipped: bool
    seed: int
    anchor: datetime
    elapsed_seconds: float
    counts: dict[str, int] = field(default_factory=dict)
    seeded_at: datetime | None = None


def run_seed(reset: bool = False, log: Logger | None = None) -> SeedSummary:
    """Seed the demo dataset unless a marker says it is already there.

    ``reset`` first removes every candidate and job description in the database
    plus the demo users (see ``wipe_demo_data``). ``log`` receives progress lines;
    pass ``None`` for a silent run.
    """
    log = log or (lambda _message: None)
    started = perf_counter()
    ctx = SeedContext.from_settings()
    with transaction.atomic():
        marker = SeedMarker.objects.order_by("-created_at").first()
        if marker is not None and not reset:
            return SeedSummary(
                skipped=True,
                seed=ctx.seed,
                anchor=ctx.anchor,
                elapsed_seconds=perf_counter() - started,
                counts=marker.counts or collect_counts(),
                seeded_at=marker.created_at,
            )
        if reset:
            deleted = wipe_demo_data()
            log(
                f"Wiped {deleted['candidates']} candidates, {deleted['jobs']} jobs, "
                f"{deleted['users']} users"
            )
        users = seed_users(ctx)
        log(f"Users: {len(users)}")
        jobs = seed_jobs(ctx, users)
        log(f"Job descriptions: {len(jobs)}")
        history = seed_job_history(ctx, jobs)
        log(f"Activities: {len(history)}")
        candidates = seed_candidates(ctx, users)
        log(f"Candidates: {len(candidates)}")
        applications, targets = seed_applications(ctx, jobs, users)
        log(f"Applications: {len(applications)}")
        history = seed_history(ctx, applications, targets, users)
        log(
            f"History: {history.interviews} interviews, {history.communications} contacts, "
            f"{history.offers} offers, {history.onboardings} onboardings, "
            f"{history.notifications} notifications"
        )
        tickets = seed_support_tickets(ctx, users)
        log(f"Support tickets: {len(tickets)}")
        counts = collect_counts()
        marker = SeedMarker.objects.create(version=SEED_VERSION, counts=counts)
    return SeedSummary(
        skipped=False,
        seed=ctx.seed,
        anchor=ctx.anchor,
        elapsed_seconds=perf_counter() - started,
        counts=counts,
        seeded_at=marker.created_at,
    )


def wipe_demo_data() -> dict[str, int]:
    """Reset the demo database, in an order the PROTECT foreign keys allow.

    The demo database holds nothing but seeded data, so this deletes *every*
    candidate and job description (not only rows the seeder wrote), then the
    ``@aimious.demo`` users and the marker. Candidates go first (their
    applications and child rows cascade), then job descriptions (versions,
    participants and later search runs and activities cascade). Returns
    top-level row counts.
    """
    with transaction.atomic():
        # Tickets protect their requester, so they go before the users; the number
        # sequence restarts so a reseeded demo hands out the same ticket numbers.
        Ticket.objects.all().delete()
        with connection.cursor() as cursor:
            cursor.execute(f"ALTER SEQUENCE {NUMBER_SEQUENCE} RESTART")
        candidates = Candidate.objects.all().delete()[1].get(Candidate._meta.label, 0)
        jobs = JobDescription.objects.all().delete()[1].get(JobDescription._meta.label, 0)
        users = (
            User.objects.filter(email__iendswith=f"@{EMAIL_DOMAIN}")
            .delete()[1]
            .get(User._meta.label, 0)
        )
        Notification.objects.all().delete()
        SeedMarker.objects.all().delete()
    return {"candidates": candidates, "jobs": jobs, "users": users}


def collect_counts() -> dict[str, int]:
    """Row counts for the summary table, in display order."""
    counts = {
        "Users": User.objects.filter(email__iendswith=f"@{EMAIL_DOMAIN}").count(),
        "Job descriptions": JobDescription.objects.count(),
        "Versions": JobDescriptionVersion.objects.count(),
        "Participants": RecruitmentParticipant.objects.count(),
        "Activities": Activity.objects.count(),
        "Search runs": SearchRun.objects.count(),
        "Applications": Application.objects.count(),
        "Matches": CandidateMatch.objects.count(),
        "Interviews": Interview.objects.count(),
        "Communications": Communication.objects.count(),
        "Offers": Offer.objects.count(),
        "Onboardings": Onboarding.objects.count(),
        "Notifications": Notification.objects.count(),
        "Support tickets": Ticket.objects.count(),
        "Ticket events": TicketEvent.objects.count(),
        "Candidates": Candidate.objects.count(),
        "Candidate skills": CandidateSkill.objects.count(),
        "Experiences": CandidateExperience.objects.count(),
        "Education": CandidateEducation.objects.count(),
        "Certifications": CandidateCertification.objects.count(),
        "Sources": CandidateSource.objects.count(),
    }
    for key, label in SourceKey.choices:
        counts[f"  {label}"] = CandidateSource.objects.filter(source=key).count()
    return counts
