"""The six job descriptions with their version history and participants
(plan.md section 10 "Job descriptions", 6.3 jobs.*)."""

from __future__ import annotations

from datetime import datetime, time, timedelta
from typing import Any

from accounts.models import User
from common.enums import ParticipantRole
from jobs.models import JobDescription, JobDescriptionVersion, RecruitmentParticipant
from matching.skills import normalize_skills
from seed.context import SeedContext
from seed.pools.jobs import JOBS, JobSpec

# JDs were created five to seven weeks before the anchor so six weeks of history fit.
MIN_AGE_DAYS = 5 * 7
MAX_AGE_DAYS = 7 * 7
# plan.md 9.6 shows the Senior Python Developer JD created at 09:30 (v3 at 14:10).
CREATION_TIME = time(9, 30)
OTHER_CREATION_TIMES = (time(9, 30), time(10, 0), time(10, 45), time(11, 15), time(14, 30))
_SKILL_FIELDS = ("required_skills", "preferred_skills")


def seed_jobs(ctx: SeedContext, users: dict[str, User]) -> list[JobDescription]:
    """Create the six JDs in plan order, oldest first, each with three versions and
    its participant set (owner inserted first)."""
    jobs: list[JobDescription] = []
    for spec, created_at in zip(JOBS, _creation_times(ctx), strict=True):
        jd = _create_job(ctx, spec, users, created_at)
        _create_versions(spec, jd, users)
        _create_participants(ctx, spec, jd, users)
        jobs.append(jd)
    return jobs


def _creation_times(ctx: SeedContext) -> list[datetime]:
    """Distinct creation days inside the window, oldest for the first (richest) JD."""
    ages = sorted(ctx.rng.sample(range(MIN_AGE_DAYS, MAX_AGE_DAYS + 1), len(JOBS)), reverse=True)
    times: list[datetime] = []
    for index, age in enumerate(ages):
        at = CREATION_TIME if index == 0 else ctx.rng.choice(OTHER_CREATION_TIMES)
        times.append(ctx.days_before_anchor(age, at))
    return times


def _content(spec: JobSpec, version: int | None = None) -> dict[str, Any]:
    """Content fields in model shape with skills passed through the project normaliser."""
    content = spec.content_fields() if version is None else spec.snapshot(version)
    for name in _SKILL_FIELDS:
        content[name] = normalize_skills(content[name])
    return content


def _create_job(
    ctx: SeedContext, spec: JobSpec, users: dict[str, User], created_at: datetime
) -> JobDescription:
    last_version = spec.versions[-1]
    updated_at = created_at + timedelta(minutes=last_version.offset_minutes)
    jd = JobDescription.objects.create(
        **_content(spec),
        status=spec.status,
        created_by=users[spec.created_by],
        updated_by=users[last_version.author_email],
        published_at=created_at + timedelta(minutes=ctx.rng.randint(10, 60)),
        current_version=len(spec.versions),
    )
    _backdate(jd, created_at, updated_at)
    return jd


def _create_versions(spec: JobSpec, jd: JobDescription, users: dict[str, User]) -> None:
    for version_spec in spec.versions:
        row = JobDescriptionVersion.objects.create(
            job_description=jd,
            version=version_spec.version,
            snapshot=_content(spec, version_spec.version),
            change_summary=version_spec.change_summary,
            created_by=users[version_spec.author_email],
        )
        _backdate(row, jd.created_at + timedelta(minutes=version_spec.offset_minutes))


def _create_participants(
    ctx: SeedContext, spec: JobSpec, jd: JobDescription, users: dict[str, User]
) -> None:
    owner = users[spec.created_by]
    participants = sorted(
        spec.participants, key=lambda p: p.role != ParticipantRole.OWNER
    )  # owner first, others in plan order
    added_at = jd.created_at
    for index, participant in enumerate(participants):
        if index:
            added_at += timedelta(minutes=ctx.rng.randint(3, 25))
        row = RecruitmentParticipant.objects.create(
            job_description=jd,
            user=users[participant.email],
            role_in_recruitment=participant.role,
            added_by=owner,
        )
        _backdate(row, added_at)


def _backdate(row, created_at: datetime, updated_at: datetime | None = None) -> None:
    """Rewrite the auto timestamps (``auto_now_add`` ignores values passed to create)."""
    updated_at = updated_at or created_at
    type(row).objects.filter(pk=row.pk).update(created_at=created_at, updated_at=updated_at)
    row.created_at = created_at
    row.updated_at = updated_at
