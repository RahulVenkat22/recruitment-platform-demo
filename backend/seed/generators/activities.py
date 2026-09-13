"""JD-level timeline history for the seeded job descriptions (plan.md section 10
"History generation": ``jd.created``, ``jd.participant_added``, ``jd.published``,
``jd.updated`` per later version, and ``jd.archived`` for the archived role),
backdated to the moments the JD rows themselves were backdated to.

Titles follow the exact phrasing ``jobs.services.JobService`` writes at runtime,
so seeded and live events read the same on the timeline.
"""

from __future__ import annotations

from collections.abc import Sequence
from datetime import datetime, timedelta
from typing import Any

from activity.models import Activity
from activity.services import record_activity
from common.enums import ActivityCategory, JDStatus, ParticipantRole
from jobs.models import JobDescription
from seed.context import SeedContext
from seed.pools.jobs import CONTENT_FIELDS

_SKILL_FIELDS = frozenset({"required_skills", "preferred_skills"})


def seed_job_history(ctx: SeedContext, jobs: Sequence[JobDescription]) -> list[Activity]:
    rows: list[Activity] = []
    for jd in jobs:
        rows.extend(_history_for(ctx, jd))
    return rows


def _join_names(names: Sequence[str]) -> str:
    if len(names) <= 1:
        return "".join(names)
    return ", ".join(names[:-1]) + " and " + names[-1]


def _changed_fields(before: dict[str, Any], after: dict[str, Any]) -> list[str]:
    changed = []
    for name in CONTENT_FIELDS:
        old, new = before.get(name), after.get(name)
        if name in _SKILL_FIELDS:
            if set(old or []) != set(new or []):
                changed.append(name)
        elif old != new:
            changed.append(name)
    return changed


def _record(jd: JobDescription, occurred_at: datetime, **kwargs: Any) -> Activity:
    row = record_activity(
        job_description=jd,
        category=ActivityCategory.JOB_DESCRIPTION,
        occurred_at=occurred_at,
        **kwargs,
    )
    # Timeline rows are ordered by occurred_at then created_at; keep both historical.
    Activity.objects.filter(pk=row.pk).update(created_at=occurred_at, updated_at=occurred_at)
    return row


def _history_for(ctx: SeedContext, jd: JobDescription) -> list[Activity]:
    creator = jd.created_by
    rows: list[Activity] = []

    rows.append(
        _record(
            jd,
            jd.created_at,
            event_type="jd.created",
            title=f'{creator.full_name} created the job description "{jd.title}"',
            actor=creator,
            metadata={"version": 1, "status": str(JDStatus.DRAFT)},
        )
    )

    others = [
        p
        for p in jd.participants.select_related("user").order_by("created_at")
        if p.user_id != jd.created_by_id
    ]
    if others:
        names = [
            f"{p.user.full_name} ({ParticipantRole(p.role_in_recruitment).label})" for p in others
        ]
        rows.append(
            _record(
                jd,
                max(p.created_at for p in others),
                event_type="jd.participant_added",
                title=f"{creator.full_name} added {_join_names(names)} to the recruitment",
                actor=creator,
                metadata={
                    "participants": [
                        {
                            "user_id": str(p.user_id),
                            "name": p.user.full_name,
                            "role": str(p.role_in_recruitment),
                        }
                        for p in others
                    ]
                },
            )
        )

    if jd.published_at:
        rows.append(
            _record(
                jd,
                jd.published_at,
                event_type="jd.published",
                title=f'{creator.full_name} published the job description "{jd.title}"',
                actor=creator,
                metadata={"from": str(JDStatus.DRAFT), "to": str(JDStatus.OPEN)},
            )
        )

    versions = list(jd.versions.select_related("created_by").order_by("version"))
    for previous, current in zip(versions, versions[1:], strict=False):
        actor = current.created_by or creator
        summary = current.change_summary
        rows.append(
            _record(
                jd,
                current.created_at,
                event_type="jd.updated",
                title=f"{actor.full_name} updated the job description (v{current.version})",
                actor=actor,
                description=summary,
                metadata={
                    "changed_fields": _changed_fields(previous.snapshot, current.snapshot),
                    "version": current.version,
                    "change_summary": summary,
                },
            )
        )

    if jd.status == JDStatus.ARCHIVED:
        last = versions[-1].created_at if versions else jd.created_at
        archived_at = last + timedelta(days=ctx.rng.randint(2, 6), hours=ctx.rng.randint(0, 8))
        archived_at = min(archived_at, ctx.anchor - timedelta(days=1))
        rows.append(
            _record(
                jd,
                archived_at,
                event_type="jd.archived",
                title=f'{creator.full_name} archived the job description "{jd.title}"',
                actor=creator,
                metadata={"from": str(JDStatus.OPEN), "to": str(JDStatus.ARCHIVED)},
            )
        )
    return rows
