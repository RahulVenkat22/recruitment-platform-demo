"""``InterviewService``: schedule, reschedule, cancel and score interviews
(plan.md 6.3 pipeline.Interview, 6.5 triggers, 6.8 notifications)."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any

from django.db import transaction
from django.utils import timezone

from activity.services import record_activity
from common.enums import (
    ActivityCategory,
    ApplicationStatus,
    InterviewMode,
    InterviewRound,
    InterviewStatus,
    NotificationType,
    Recommendation,
)
from notifications.services import notify_all
from pipeline.exceptions import InvalidTransition
from pipeline.models import Application, Interview
from pipeline.services._common import (
    actor_name,
    advance,
    candidate_link,
    owners_of,
    person_ref,
    require_active,
    stamp,
    status_label,
    touch,
)

# The pipeline status a round moves the application into once it has happened
# (feedback submitted). Scheduling only moves to interview_scheduled, or to
# phone_screening for a phone screen (plan.md 6.5).
ROUND_STATUS: dict[str, str] = {
    InterviewRound.PHONE_SCREEN: ApplicationStatus.PHONE_SCREENING,
    InterviewRound.TECHNICAL: ApplicationStatus.TECHNICAL_INTERVIEW,
    InterviewRound.SYSTEM_DESIGN: ApplicationStatus.TECHNICAL_INTERVIEW,
    InterviewRound.MANAGERIAL: ApplicationStatus.FINAL_INTERVIEW,
    InterviewRound.HR: ApplicationStatus.HR_INTERVIEW,
    InterviewRound.FINAL: ApplicationStatus.FINAL_INTERVIEW,
}
OPEN_STATUSES: frozenset[str] = frozenset({InterviewStatus.SCHEDULED, InterviewStatus.RESCHEDULED})


def round_label(round_key: str) -> str:
    return str(InterviewRound(round_key).label)


def _mode_label(mode: str) -> str:
    return str(InterviewMode(mode).label).lower()


def _when_text(scheduled_at: datetime) -> str:
    local = timezone.localtime(scheduled_at)
    return local.strftime("%a %d %b, %I:%M %p").replace(" 0", " ")


def _metadata(interview: Interview, **extra: Any) -> dict[str, Any]:
    return {
        "interview_id": str(interview.pk),
        "round": str(interview.round),
        "sequence": interview.sequence,
        "interviewer": person_ref(interview.interviewer),
        "scheduled_at": interview.scheduled_at.isoformat(),
        "duration_minutes": interview.duration_minutes,
        "mode": str(interview.mode),
        "meeting_link": interview.meeting_link or "",
        "location": interview.location or "",
        **extra,
    }


class InterviewService:
    @staticmethod
    @transaction.atomic
    def schedule(
        application: Application,
        *,
        round: str,  # noqa: A002 - mirrors the model column
        interviewer: Any,
        scheduled_at: datetime,
        actor: Any,
        duration_minutes: int = 60,
        mode: str = InterviewMode.VIDEO,
        meeting_link: str | None = None,
        location: str | None = None,
        occurred_at: datetime | None = None,
        notify: bool = True,
    ) -> Interview:
        """``POST /interviews``. Moves an earlier application to
        ``interview_scheduled`` (``phone_screening`` for a phone screen)."""
        require_active(application, "Scheduling an interview")
        when = occurred_at or timezone.now()
        previous = str(application.status)
        interview = Interview.objects.create(
            application=application,
            round=round,
            sequence=application.interviews.count() + 1,
            interviewer=interviewer,
            scheduled_at=scheduled_at,
            duration_minutes=duration_minutes,
            mode=mode,
            meeting_link=meeting_link or None,
            location=location or None,
            status=InterviewStatus.SCHEDULED,
            created_by=actor,
        )
        stamp(interview, occurred_at)
        target = (
            ApplicationStatus.PHONE_SCREENING
            if round == InterviewRound.PHONE_SCREEN
            else ApplicationStatus.INTERVIEW_SCHEDULED
        )
        advance(application, target, actor, when=when, notify=False)
        candidate = application.candidate
        activity = record_activity(
            job_description=application.job_description,
            category=ActivityCategory.INTERVIEW,
            event_type="interview.scheduled",
            title=f"{round_label(round)} interview scheduled for {candidate.full_name}",
            description=(
                f"Interviewer: {interviewer.full_name}. {duration_minutes} minutes over "
                f"{_mode_label(mode)}, {_when_text(scheduled_at)}."
            ),
            actor=actor,
            application=application,
            candidate=candidate,
            metadata=_metadata(interview, **{"from": previous, "to": str(application.status)}),
            occurred_at=when,
        )
        stamp(activity, occurred_at)
        if notify:
            notify_all(
                [interviewer, *owners_of(application)],
                NotificationType.INTERVIEW,
                f"{round_label(round)} interview: {candidate.full_name}, "
                f"{_when_text(scheduled_at)}",
                f"Scheduled by {actor_name(actor)} for {application.job_description.title}.",
                candidate_link(application) + "&tab=interviews",
                actor,
                occurred_at=occurred_at,
            )
        return interview

    @staticmethod
    @transaction.atomic
    def reschedule(
        interview: Interview,
        *,
        scheduled_at: datetime,
        actor: Any,
        duration_minutes: int | None = None,
        mode: str | None = None,
        meeting_link: str | None = None,
        location: str | None = None,
        note: str = "",
        occurred_at: datetime | None = None,
        notify: bool = True,
    ) -> Interview:
        if str(interview.status) not in OPEN_STATUSES:
            raise InvalidTransition(
                f"A {str(interview.get_status_display()).lower()} interview cannot be rescheduled."
            )
        when = occurred_at or timezone.now()
        earlier = interview.scheduled_at
        interview.scheduled_at = scheduled_at
        if duration_minutes:
            interview.duration_minutes = duration_minutes
        if mode:
            interview.mode = mode
        if meeting_link is not None:
            interview.meeting_link = meeting_link or None
        if location is not None:
            interview.location = location or None
        interview.status = InterviewStatus.RESCHEDULED
        interview.save()
        application = interview.application
        touch(application, when)
        candidate = application.candidate
        activity = record_activity(
            job_description=application.job_description,
            category=ActivityCategory.INTERVIEW,
            event_type="interview.rescheduled",
            title=(
                f"{actor_name(actor)} rescheduled the {round_label(interview.round).lower()} "
                f"interview for {candidate.full_name}"
            ),
            description=(
                f"Moved from {_when_text(earlier)} to {_when_text(scheduled_at)}."
                + (f" {note}" if note else "")
            ),
            actor=actor,
            application=application,
            candidate=candidate,
            metadata=_metadata(interview, previous_scheduled_at=earlier.isoformat(), note=note),
            occurred_at=when,
        )
        stamp(activity, occurred_at)
        if notify:
            notify_all(
                [interview.interviewer, *owners_of(application)],
                NotificationType.INTERVIEW,
                f"Rescheduled: {candidate.full_name}, {_when_text(scheduled_at)}",
                note,
                candidate_link(application) + "&tab=interviews",
                actor,
                occurred_at=occurred_at,
            )
        return interview

    @staticmethod
    @transaction.atomic
    def cancel(
        interview: Interview,
        *,
        actor: Any,
        reason: str = "",
        occurred_at: datetime | None = None,
        notify: bool = True,
    ) -> Interview:
        if str(interview.status) not in OPEN_STATUSES:
            raise InvalidTransition(
                f"A {str(interview.get_status_display()).lower()} interview cannot be cancelled."
            )
        when = occurred_at or timezone.now()
        interview.status = InterviewStatus.CANCELLED
        interview.save(update_fields=["status", "updated_at"])
        application = interview.application
        touch(application, when)
        candidate = application.candidate
        activity = record_activity(
            job_description=application.job_description,
            category=ActivityCategory.INTERVIEW,
            event_type="interview.cancelled",
            title=(
                f"{actor_name(actor)} cancelled the {round_label(interview.round).lower()} "
                f"interview for {candidate.full_name}"
            ),
            description=reason,
            actor=actor,
            application=application,
            candidate=candidate,
            metadata=_metadata(interview, reason=reason),
            occurred_at=when,
        )
        stamp(activity, occurred_at)
        if notify:
            notify_all(
                [interview.interviewer, *owners_of(application)],
                NotificationType.INTERVIEW,
                f"Cancelled: {round_label(interview.round)} interview with {candidate.full_name}",
                reason,
                candidate_link(application) + "&tab=interviews",
                actor,
                occurred_at=occurred_at,
            )
        return interview

    @staticmethod
    @transaction.atomic
    def submit_feedback(
        interview: Interview,
        *,
        score: Decimal | float,
        feedback: str,
        recommendation: str,
        actor: Any,
        occurred_at: datetime | None = None,
        notify: bool = True,
    ) -> Interview:
        """``POST /interviews/{id}/feedback``: completes the interview and moves
        the application into the round's status (plan.md 6.5)."""
        if str(interview.status) == InterviewStatus.CANCELLED:
            raise InvalidTransition("A cancelled interview cannot receive feedback.")
        when = occurred_at or timezone.now()
        application = interview.application
        previous = str(application.status)
        interview.score = Decimal(str(score)).quantize(Decimal("0.1"))
        interview.feedback = feedback or ""
        interview.recommendation = recommendation
        interview.feedback_submitted_at = when
        interview.status = InterviewStatus.COMPLETED
        interview.save()
        target = ROUND_STATUS.get(str(interview.round), ApplicationStatus.INTERVIEW_SCHEDULED)
        advance(application, target, actor, when=when, notify=False)
        candidate = application.candidate
        rec_label = str(Recommendation(recommendation).label)
        activity = record_activity(
            job_description=application.job_description,
            category=ActivityCategory.INTERVIEW_FEEDBACK,
            event_type="interview.feedback_submitted",
            title=f"{actor_name(actor)} submitted interview feedback for {candidate.full_name}",
            description=f"Score {interview.score}/10. Recommendation: {rec_label}.",
            actor=actor,
            application=application,
            candidate=candidate,
            metadata=_metadata(
                interview,
                score=float(interview.score),
                recommendation=recommendation,
                feedback=feedback or "",
                **{"from": previous, "to": str(application.status)},
            ),
            occurred_at=when,
        )
        stamp(activity, occurred_at)
        if notify:
            notify_all(
                owners_of(application),
                NotificationType.FEEDBACK,
                f"Feedback for {candidate.full_name}: {interview.score}/10, {rec_label}",
                (feedback or "")[:200],
                candidate_link(application) + "&tab=interviews",
                actor,
                occurred_at=occurred_at,
            )
        return interview

    @staticmethod
    @transaction.atomic
    def update(interview: Interview, data: dict[str, Any], actor: Any) -> Interview:
        """``PATCH /interviews/{id}``: interviewer, mode, link, location, duration,
        or marking a no-show. Time changes go through ``reschedule``."""
        changed: list[str] = []
        for name in ("interviewer", "duration_minutes", "mode", "meeting_link", "location"):
            if name in data and data[name] != getattr(interview, name):
                setattr(interview, name, data[name])
                changed.append(name)
        if data.get("status") == InterviewStatus.NO_SHOW and str(interview.status) in OPEN_STATUSES:
            interview.status = InterviewStatus.NO_SHOW
            changed.append("status")
        if changed:
            interview.save(update_fields=[*changed, "updated_at"])
            touch(interview.application)
        return interview

    @staticmethod
    @transaction.atomic
    def delete(interview: Interview, actor: Any) -> None:
        if str(interview.status) == InterviewStatus.COMPLETED:
            raise InvalidTransition(
                "A completed interview keeps its feedback and cannot be deleted."
            )
        application = interview.application
        interview.delete()
        touch(application)

    @staticmethod
    def status_after(round_key: str) -> str:
        return status_label(ROUND_STATUS[round_key])
