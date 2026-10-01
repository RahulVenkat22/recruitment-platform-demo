"""Calendar-time recruitment metrics, derived from persisted milestones.

Hired means onboarded, as on the dashboard. Holds remain in elapsed time.
Stage visits are kept separately so returns to a stage are visible. Unknown
historical intervals are explicit; they are never attributed to a guessed stage.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime

from django.db.models import Q
from django.utils import timezone

from activity.models import Activity
from common.enums import ApplicationStatus as AS
from common.enums import JDStatus
from jobs.models import JobDescription
from pipeline.models import Application

STOPPED = frozenset({AS.ONBOARDED, AS.REJECTED, AS.WITHDRAWN})
CLOSED_JOBS = frozenset({JDStatus.CLOSED, JDStatus.FORCE_CLOSED, JDStatus.ARCHIVED})


def seconds_between(start: datetime | None, end: datetime | None) -> int | None:
    if start is None or end is None or end < start:
        return None
    return int((end - start).total_seconds())


def hired_at(application: Application) -> datetime | None:
    if application.status != AS.ONBOARDED:
        return None
    onboarding = getattr(application, "onboarding", None)
    return (onboarding.completed_at if onboarding else None) or application.stage_entered_at


def application_tat(
    application: Application, *, now: datetime | None = None, events: list[dict] | None = None
) -> dict:
    now = now or timezone.now()
    start = application.created_at
    stopped = application.status in STOPPED
    end = (hired_at(application) or application.stage_entered_at) if stopped else now
    end = min(end, now)
    if events is None:
        events = list(
            Activity.objects.filter(job_description_id=application.job_description_id)
            .filter(
                Q(application=application)
                | Q(metadata__application_ids__contains=[str(application.pk)])
            )
            .filter(occurred_at__lte=end, metadata__to__in=AS.values)
            .order_by("occurred_at", "created_at", "pk")
            .values("occurred_at", "metadata", "event_type")
        )
    else:
        events = [event for event in events if event["occurred_at"] <= end]

    # A first transition identifies the previous stage. A creation event
    # identifies the initial stage; otherwise retain the gap as unknown.
    initial = None

    def previous_status(event):
        metadata = event["metadata"]
        return metadata.get("from_by_application", {}).get(
            str(application.pk), metadata.get("from")
        )

    if events:
        first = events[0]
        initial = previous_status(first)
        if first["event_type"] in {"application.added_manually", "application.ai_shortlisted"}:
            initial = first["metadata"]["to"]
    elif application.stage_entered_at <= start:
        initial = application.status
    points = [[start, initial if initial in AS.values else None]]
    for event in events:
        when = max(start, event["occurred_at"])
        previous = previous_status(event)
        target = event["metadata"]["to"]
        if previous in AS.values and previous != points[-1][1]:
            # The log is missing a transition before this event.
            points[-1][1] = None
        if target == points[-1][1]:
            continue  # Feedback, edits and duplicate events do not restart a stage.
        if when == points[-1][0]:
            points[-1][1] = target
        else:
            points.append([when, target])

    # The current stage timestamp is authoritative even for imported records.
    entered = min(end, max(start, application.stage_entered_at))
    if points[-1][1] != application.status or points[-1][0] != entered:
        points = [point for point in points if point[0] < entered]
        if not points and entered > start:
            points.append([start, None])
        points.append([entered, application.status])

    stages = []
    for index, (entered_at, status) in enumerate(points):
        current = index == len(points) - 1
        exited_at = end if current else points[index + 1][0]
        stages.append(
            {
                "status": status,
                "label": AS(status).label if status else "Unrecorded stage",
                "entered_at": entered_at,
                "exited_at": None if current and not stopped else exited_at,
                "elapsed_seconds": seconds_between(entered_at, exited_at) or 0,
                "is_current": current,
            }
        )

    return {
        "as_of": now,
        "started_at": start,
        "finished_at": end if stopped else None,
        "elapsed_seconds": seconds_between(start, end),
        "job_elapsed_seconds": seconds_between(application.job_description.published_at, end),
        "on_hold_seconds": sum(s["elapsed_seconds"] for s in stages if s["status"] == AS.ON_HOLD),
        "history_complete": all(s["status"] is not None for s in stages),
        "stages": stages,
    }


def application_tats(applications: list[Application], *, now: datetime) -> list[dict]:
    """Reuse the detail calculation for a cohort with one activity query.

    Applications must already have job_description and onboarding selected.
    The caller supplies only applications the viewer is allowed to see.
    """
    if not applications:
        return []
    ids = {str(app.pk) for app in applications}
    histories = defaultdict(list)
    events = (
        Activity.objects.filter(
            job_description_id__in={app.job_description_id for app in applications}
        )
        .filter(
            Q(application_id__in=ids)
            | Q(application__isnull=True, metadata__has_key="application_ids")
        )
        .filter(occurred_at__lte=now, metadata__to__in=AS.values)
        .order_by("occurred_at", "created_at", "pk")
        .values("application_id", "occurred_at", "metadata", "event_type")
    )
    for event in events:
        targets = (
            {str(event["application_id"])}
            if event["application_id"]
            else set(event["metadata"].get("application_ids", []))
        )
        for application_id in targets & ids:
            histories[application_id].append(event)
    return [application_tat(app, now=now, events=histories[str(app.pk)]) for app in applications]


def job_tat(job: JobDescription, *, now: datetime | None = None) -> dict:
    now = now or timezone.now()
    start = job.published_at
    hires = sorted(
        when
        for application in job.applications.filter(status=AS.ONBOARDED).select_related("onboarding")
        if (when := hired_at(application)) is not None
        and start is not None
        and start <= when <= now
    )
    filled_at = hires[job.openings - 1] if job.openings > 0 and len(hires) >= job.openings else None
    finished_at = filled_at
    state = "filled" if filled_at else "in_progress"
    if start is None:
        state = "not_started"
    elif not filled_at and job.status in CLOSED_JOBS:
        state = "closed"
        # Archiving a previously closed job must not extend recruitment time.
        # A reopening clears the stop and the next closure stops it again.
        for occurred_at, metadata in (
            job.activities.filter(
                event_type__startswith="jd.",
                metadata__to__in=JDStatus.values,
                occurred_at__gte=start,
                occurred_at__lte=now,
            )
            .order_by("occurred_at", "created_at")
            .values_list("occurred_at", "metadata")
        ):
            if metadata["to"] not in CLOSED_JOBS:
                finished_at = None
            elif finished_at is None:
                finished_at = occurred_at
    elif not filled_at and job.status == JDStatus.ON_HOLD:
        state = "on_hold"
    elapsed_end = finished_at if state in {"filled", "closed"} else now
    spans = [seconds_between(start, when) for when in hires]
    return {
        "as_of": now,
        "started_at": start,
        "finished_at": finished_at,
        "state": state,
        "elapsed_seconds": seconds_between(start, elapsed_end),
        "first_hire_seconds": seconds_between(start, hires[0]) if hires else None,
        "average_hire_seconds": round(sum(spans) / len(spans)) if spans else None,
        "filled_seconds": seconds_between(start, filled_at),
        "hires": len(hires),
        "openings": job.openings,
    }
