"""Seed v4: the event chain that takes every application from the search that
found it to the status it is in today (plan.md section 10 "History generation",
section 12 phase 7).

Everything is replayed through the real pipeline services with ``occurred_at``
backdated, so seeded history reads exactly like history the app writes at
runtime: shortlists, contacts (``Communication`` rows), interviews with
feedback, offers, onboardings with checklists, decisions with reasons, and the
notifications those events send. John Doe's chain follows
``seed.pools.journey`` to the minute.
"""

from __future__ import annotations

import random
from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import datetime, time, timedelta
from typing import Any

from django.utils import timezone

from accounts.models import User
from common.enums import (
    ApplicationStatus,
    CommunicationChannel,
    CommunicationDirection,
    CommunicationOutcome,
    InterviewMode,
    InterviewRound,
    InterviewStatus,
    ParticipantRole,
    UserRole,
)
from jobs.models import JobDescription
from notifications.models import Notification
from pipeline.models import Application, Interview
from pipeline.services import (
    CommunicationService,
    InterviewService,
    OfferService,
    OnboardingService,
    PipelineService,
)
from seed.context import SeedContext
from seed.generators.applications import SPD_TITLE, _recruiter_for
from seed.pools import journey, text
from seed.pools.users import ARUN, DIVYA, PRIYA, RAHUL

# Notifications older than this are not generated at all (plan.md 10: "around 30").
NOTIFY_WINDOW = timedelta(days=10)
# Kept per recipient (newest first); the first few stay unread, the rest are read.
KEEP_PER_RECIPIENT = 8
UNREAD_PER_RECIPIENT = 4
WORK_START = time(9, 0)
WORK_END = time(18, 0)
ACTIVE = list(ApplicationStatus.ACTIVE)
MEETING_HOSTS = ("https://meet.aimious.demo/", "https://teams.aimious.demo/join/")

# Where a rejected / withdrawn / on-hold candidate was before the decision.
DECISION_DEPTHS: tuple[tuple[str, int], ...] = (
    (ApplicationStatus.HR_REVIEW, 5),
    (ApplicationStatus.CONTACTED, 5),
    (ApplicationStatus.PHONE_SCREENING, 2),
    (ApplicationStatus.TECHNICAL_INTERVIEW, 3),
    (ApplicationStatus.HR_INTERVIEW, 1),
    (ApplicationStatus.FINAL_INTERVIEW, 1),
    (ApplicationStatus.OFFER_SENT, 1),
)
ROUND_FOR_STATUS: dict[str, str] = {
    ApplicationStatus.TECHNICAL_INTERVIEW: InterviewRound.TECHNICAL,
    ApplicationStatus.HR_INTERVIEW: InterviewRound.HR,
    ApplicationStatus.FINAL_INTERVIEW: InterviewRound.FINAL,
}


@dataclass
class HistoryCounts:
    replayed: int = 0
    interviews: int = 0
    communications: int = 0
    offers: int = 0
    onboardings: int = 0
    notifications: int = 0
    by_status: dict[str, int] = field(default_factory=dict)


@dataclass(frozen=True)
class Cast:
    """Who does what on one JD."""

    jd: JobDescription
    recruiter: User
    hiring_manager: User
    interviewers: tuple[User, ...]
    hr_people: tuple[User, ...]


# ------------------------------------------------------------------ entry point


def seed_history(
    ctx: SeedContext,
    applications: Sequence[Application],
    targets: dict[Any, str],
    users: dict[str, User],
) -> HistoryCounts:
    counts = HistoryCounts()
    casts: dict[Any, Cast] = {}
    ordered = sorted(
        applications, key=lambda app: (app.job_description.title, app.candidate.full_name)
    )
    john = None
    for app in ordered:
        cast = casts.get(app.job_description_id)
        if cast is None:
            cast = casts[app.job_description_id] = _cast_for(app.job_description, users)
        if app.job_description.title == SPD_TITLE and app.candidate.full_name in (
            journey.JOHN_DOE.full_name,
            *journey.SHORTLISTED_NAMES,
        ):
            if app.candidate.full_name == journey.JOHN_DOE.full_name:
                john = app
            continue  # the scripted journey covers these three together
        _replay(ctx, app, targets[app.pk], cast, counts)
    if john is not None:
        _replay_journey(ctx, john, users, casts[john.job_description_id], counts)
    counts.notifications = _settle_notifications(ctx)
    for app in applications:
        app.refresh_from_db(fields=["status"])
        counts.by_status[str(app.status)] = counts.by_status.get(str(app.status), 0) + 1
    counts.interviews = Interview.objects.count()
    return counts


# ------------------------------------------------------------------ casting


def _cast_for(jd: JobDescription, users: dict[str, User]) -> Cast:
    rows = list(jd.participants.select_related("user").order_by("created_at"))
    recruiter = _recruiter_for(jd, users)
    managers = [r.user for r in rows if r.role_in_recruitment == ParticipantRole.HIRING_MANAGER]
    interviewers = [
        r.user
        for r in rows
        if r.user.role == UserRole.INTERVIEWER
        or r.role_in_recruitment in (ParticipantRole.INTERVIEWER, ParticipantRole.HIRING_MANAGER)
    ]
    if not interviewers:
        interviewers = [u for u in users.values() if u.role == UserRole.INTERVIEWER]
    hr_people = [r.user for r in rows if r.user.role in (UserRole.HR, UserRole.HR_ADMIN)]
    if jd.created_by not in hr_people:
        hr_people.insert(0, jd.created_by)
    return Cast(
        jd=jd,
        recruiter=recruiter,
        hiring_manager=managers[0] if managers else interviewers[0],
        interviewers=tuple(dict.fromkeys(interviewers)),
        hr_people=tuple(dict.fromkeys(hr_people)),
    )


# ------------------------------------------------------------------ timing


def _working_hours(moment: datetime, tz) -> datetime:
    """Map any moment onto the same day's working window (09:00 to 18:00).

    The map is monotone (later in, later out) and never moves a moment to a
    later day, so a chain of moments keeps its order and its end date.
    """
    local = moment.astimezone(tz)
    day_start = local.replace(hour=0, minute=0, second=0, microsecond=0)
    fraction = (local - day_start) / timedelta(days=1)
    window = timedelta(hours=WORK_END.hour - WORK_START.hour)
    return day_start + timedelta(hours=WORK_START.hour) + window * fraction


def _slots(ctx: SeedContext, start: datetime, end: datetime, count: int) -> list[datetime]:
    """``count`` increasing moments in working hours between ``start`` and ``end``."""
    if count == 0:
        return []
    rng = ctx.rng
    span = max(timedelta(hours=2 * count), end - start)
    fractions = sorted(rng.uniform(0.04, 1.0) ** 0.8 for _ in range(count))
    moments = [_working_hours(start + span * fraction, ctx.tz) for fraction in fractions]
    fixed: list[datetime] = []
    for moment in moments:
        floor = fixed[-1] + timedelta(minutes=rng.randint(20, 90)) if fixed else moment
        fixed.append(max(moment, floor))
    ceiling = ctx.anchor - timedelta(minutes=30)
    if fixed[-1] > ceiling:
        shift = fixed[-1] - ceiling
        fixed = [moment - shift for moment in fixed]
    return fixed


def _future_slot(ctx: SeedContext, days_min: int = 1, days_max: int = 6) -> datetime:
    rng = ctx.rng
    day = ctx.anchor_date + timedelta(days=rng.randint(days_min, days_max))
    if day.weekday() >= 5:
        day += timedelta(days=7 - day.weekday())
    return ctx.local(day, time(rng.choice((10, 11, 14, 15, 16)), rng.choice((0, 30))))


# ------------------------------------------------------------------ replay


def _replay(
    ctx: SeedContext, app: Application, target: str, cast: Cast, counts: HistoryCounts
) -> None:
    rng = ctx.rng
    current = str(app.status)
    if target in (ApplicationStatus.NEW, ApplicationStatus.AI_SHORTLISTED):
        if target != current:
            Application.objects.filter(pk=app.pk).update(status=target)
            app.status = target
        return
    if target in ApplicationStatus.TRAY:
        previous = _weighted(rng, DECISION_DEPTHS)
        if target != ApplicationStatus.WITHDRAWN and previous == ApplicationStatus.OFFER_SENT:
            previous = ApplicationStatus.FINAL_INTERVIEW
        stages = _stages_between(rng, current, previous)
        steps = _build_steps(rng, stages, previous, decision=target)
    else:
        stages = _stages_between(rng, current, target)
        steps = _build_steps(rng, stages, target, decision=None)
    counts.replayed += 1
    start = app.created_at + timedelta(hours=1)
    end = ctx.anchor - timedelta(hours=rng.uniform(0, 24 * 6))
    if target == ApplicationStatus.ONBOARDED:
        end = ctx.anchor - timedelta(days=rng.randint(1, 6))
    moments = _slots(ctx, start, max(start + timedelta(hours=2), end), len(steps))
    state: dict[str, Any] = {
        "interview": None,
        "offer": None,
        "onboarding": None,
        "decision": target if target in ApplicationStatus.TRAY else None,
    }
    for index, step in enumerate(steps):
        when = moments[index]
        nxt = moments[index + 1] if index + 1 < len(moments) else None
        step(ctx, app, cast, when, nxt, state, counts)


def _weighted(rng: random.Random, rows: Sequence[tuple[str, int]]) -> str:
    return rng.choices([row[0] for row in rows], [row[1] for row in rows])[0]


def _stages_between(rng: random.Random, current: str, target: str) -> list[str]:
    """Active statuses to pass through, skipping optional ones the way HR does."""
    lo, hi = ACTIVE.index(current), ACTIVE.index(target)
    stages = ACTIVE[lo + 1 : hi + 1]
    if ApplicationStatus.CONTACT_PENDING in stages and rng.random() < 0.6:
        stages.remove(ApplicationStatus.CONTACT_PENDING)
    if (
        ApplicationStatus.PHONE_SCREENING in stages
        and target != ApplicationStatus.PHONE_SCREENING
        and rng.random() < 0.75
    ):
        stages.remove(ApplicationStatus.PHONE_SCREENING)
    for optional in (ApplicationStatus.HR_INTERVIEW, ApplicationStatus.FINAL_INTERVIEW):
        if optional in stages and target != optional and rng.random() < 0.6:
            stages.remove(optional)
    return stages


Step = Any  # (ctx, app, cast, when, next_when, state, counts) -> None


def _build_steps(
    rng: random.Random, stages: list[str], last: str, decision: str | None
) -> list[Step]:
    steps: list[Step] = []
    for stage in stages:
        final = stage == last
        if stage == ApplicationStatus.HR_REVIEW:
            steps.append(_step_shortlist)
        elif stage == ApplicationStatus.CONTACT_PENDING:
            steps.append(_step_transition(stage))
        elif stage == ApplicationStatus.CONTACTED:
            if rng.random() < 0.35:
                steps.append(_step_contact(rng.choice(("no_answer", "voicemail", "email_sent"))))
            steps.append(_step_contact(rng.choice(("connected", "connected", "replied"))))
        elif stage == ApplicationStatus.PHONE_SCREENING:
            # A phone screen is always in the past; a final one without feedback
            # gets a future slot from ``_step_schedule`` (no next step).
            steps.append(_step_schedule(InterviewRound.PHONE_SCREEN, False))
            if not final or decision is not None or rng.random() < 0.5:
                steps.append(_step_feedback)
        elif stage == ApplicationStatus.INTERVIEW_SCHEDULED:
            steps.append(_step_schedule(InterviewRound.TECHNICAL, final and decision is None))
        elif stage in ROUND_FOR_STATUS:
            if stage != ApplicationStatus.TECHNICAL_INTERVIEW:
                steps.append(_step_schedule(ROUND_FOR_STATUS[stage], False))
            steps.append(_step_feedback)
            if final and decision is None and rng.random() < 0.35:
                steps.append(_step_schedule_next)
        elif stage == ApplicationStatus.SELECTED:
            steps.append(_step_transition(stage))
        elif stage == ApplicationStatus.OFFER_SENT:
            steps.append(_step_offer)
        elif stage == ApplicationStatus.OFFER_ACCEPTED:
            steps.append(_step_accept)
        elif stage == ApplicationStatus.ONBOARDING:
            steps.append(_step_onboarding)
            steps.append(_step_checklist)
        elif stage == ApplicationStatus.ONBOARDED:
            steps.append(_step_complete)
    if decision is not None:
        steps.append(_step_decision(decision))
    return steps


# ------------------------------------------------------------------ steps


def _notify_flag(ctx: SeedContext, when: datetime) -> bool:
    return when >= ctx.anchor - NOTIFY_WINDOW


def _step_shortlist(ctx, app, cast, when, nxt, state, counts) -> None:
    PipelineService.transition(
        app,
        ApplicationStatus.HR_REVIEW,
        cast.recruiter if ctx.rng.random() < 0.6 else cast.jd.created_by,
        occurred_at=when,
        notify=_notify_flag(ctx, when),
    )


def _step_transition(status: str) -> Step:
    def step(ctx, app, cast, when, nxt, state, counts) -> None:
        actor = cast.hiring_manager if status == ApplicationStatus.SELECTED else cast.recruiter
        PipelineService.transition(
            app, status, actor, occurred_at=when, notify=_notify_flag(ctx, when)
        )

    return step


def _step_contact(outcome: str) -> Step:
    def step(ctx, app, cast, when, nxt, state, counts) -> None:
        rng = ctx.rng
        actor = app.owner or cast.recruiter
        template = rng.choice(text.COMMUNICATION_TEMPLATES[outcome])
        values = {
            "name": app.candidate.full_name,
            "role": cast.jd.title,
            "recruiter": actor.full_name,
        }
        channel = rng.choice(text.OUTCOME_CHANNELS[outcome])
        next_at = None
        if template.next_action:
            next_at = _working_hours(when + timedelta(hours=rng.choice((4, 20, 26, 48))), ctx.tz)
        CommunicationService.log(
            app,
            channel=channel,
            direction=(
                CommunicationDirection.INBOUND
                if outcome == CommunicationOutcome.REPLIED
                else CommunicationDirection.OUTBOUND
            ),
            outcome=outcome,
            summary=template.summary.format(**values),
            notes=template.notes.format(**values),
            next_action=template.next_action,
            next_action_at=next_at,
            actor=actor,
            occurred_at=when,
            notify=_notify_flag(ctx, when),
        )
        counts.communications += 1

    return step


def _interviewer_for(ctx: SeedContext, cast: Cast, round_key: str, app: Application) -> User:
    if round_key == InterviewRound.PHONE_SCREEN:
        return app.owner or cast.recruiter
    if round_key == InterviewRound.HR:
        return ctx.rng.choice(cast.hr_people)
    if round_key in (InterviewRound.FINAL, InterviewRound.MANAGERIAL):
        return cast.hiring_manager
    return ctx.rng.choice(cast.interviewers)


def _schedule(ctx, app, cast, round_key, scheduled_at, when, counts) -> Interview:
    rng = ctx.rng
    mode = rng.choices((InterviewMode.VIDEO, InterviewMode.PHONE, InterviewMode.ONSITE), (6, 2, 2))[
        0
    ]
    if round_key == InterviewRound.PHONE_SCREEN:
        mode = InterviewMode.PHONE
    slug = app.candidate.full_name.lower().replace(" ", "-")
    interview = InterviewService.schedule(
        app,
        round=round_key,
        interviewer=_interviewer_for(ctx, cast, round_key, app),
        scheduled_at=scheduled_at,
        actor=app.owner or cast.recruiter,
        duration_minutes=30
        if round_key == InterviewRound.PHONE_SCREEN
        else rng.choice((45, 60, 60, 90)),
        mode=mode,
        meeting_link=(
            f"{rng.choice(MEETING_HOSTS)}{round_key.replace('_', '-')}-{slug}"
            if mode == InterviewMode.VIDEO
            else None
        ),
        location=(
            rng.choice(("Chennai office, meeting room 3", "Bengaluru office, 4th floor"))
            if mode == InterviewMode.ONSITE
            else None
        ),
        occurred_at=when,
        notify=_notify_flag(ctx, when),
    )
    counts.interviews += 1
    return interview


def _step_schedule(round_key: str, in_future: bool) -> Step:
    def step(ctx, app, cast, when, nxt, state, counts) -> None:
        if in_future or nxt is None:
            scheduled_at = _future_slot(ctx)
        else:
            scheduled_at = max(when + timedelta(minutes=30), nxt - timedelta(hours=1))
        state["interview"] = _schedule(ctx, app, cast, round_key, scheduled_at, when, counts)

    return step


def _step_schedule_next(ctx, app, cast, when, nxt, state, counts) -> None:
    """A future round after the current one (upcoming interviews for the page)."""
    last = state.get("interview")
    round_key = (
        InterviewRound.HR
        if last is not None and last.round == InterviewRound.TECHNICAL
        else InterviewRound.FINAL
    )
    state["interview"] = _schedule(ctx, app, cast, round_key, _future_slot(ctx), when, counts)


def _score_for(ctx: SeedContext, app: Application, decision: str | None) -> float:
    rng = ctx.rng
    pct = float(app.match.overall_pct)
    if decision == ApplicationStatus.REJECTED:
        base = rng.uniform(4.0, 6.4)
    elif decision == ApplicationStatus.ON_HOLD:
        base = rng.uniform(5.5, 7.4)
    else:
        base = 5.5 + (pct - 60) / 40 * 4 + rng.uniform(-0.6, 0.6)
    return max(3.0, min(9.5, round(base * 2) / 2))


def _step_feedback(ctx, app, cast, when, nxt, state, counts) -> None:
    interview = state.get("interview")
    if interview is None or str(interview.status) == InterviewStatus.COMPLETED:
        return
    decision = state.get("decision")
    score = _score_for(ctx, app, decision)
    band = text.feedback_band(score)
    primary = next(
        (row.display_name or row.skill for row in app.candidate.skills.all() if row.is_primary),
        "the core stack",
    )
    feedback = ctx.rng.choice(band.templates).format(
        name=app.candidate.full_name.split()[0],
        primary_skill=primary,
        role=cast.jd.title,
        round=str(InterviewRound(interview.round).label).lower(),
        score=f"{score:g}",
    )
    InterviewService.submit_feedback(
        interview,
        score=score,
        feedback=feedback,
        recommendation=band.recommendation,
        actor=interview.interviewer,
        occurred_at=max(
            when, interview.scheduled_at + timedelta(minutes=interview.duration_minutes)
        ),
        notify=_notify_flag(ctx, when),
    )


def _ctc_for(ctx: SeedContext, app: Application) -> int:
    expected = app.candidate.expected_ctc or app.candidate.current_ctc or 1_800_000
    return int(round(expected * ctx.rng.uniform(0.95, 1.08) / 50_000) * 50_000)


def _step_offer(ctx, app, cast, when, nxt, state, counts) -> None:
    joining = (when + timedelta(days=ctx.rng.randint(15, 45))).date()
    state["offer"] = OfferService.create(
        app,
        designation=cast.jd.title,
        annual_ctc=_ctc_for(ctx, app),
        joining_date=joining,
        expires_at=when + timedelta(days=5),
        actor=cast.jd.created_by,
        send=True,
        occurred_at=when,
        notify=_notify_flag(ctx, when),
    )
    counts.offers += 1


def _step_accept(ctx, app, cast, when, nxt, state, counts) -> None:
    offer = state.get("offer") or getattr(app, "offer", None)
    if offer is None:
        return
    OfferService.accept(
        offer, actor=cast.recruiter, occurred_at=when, notify=_notify_flag(ctx, when)
    )


def _step_onboarding(ctx, app, cast, when, nxt, state, counts) -> None:
    offer = state.get("offer")
    start_date = offer.joining_date if offer is not None else (when + timedelta(days=14)).date()
    state["onboarding"] = OnboardingService.start(
        app,
        start_date=start_date,
        buddy=ctx.rng.choice(cast.interviewers),
        hr_contact=cast.recruiter,
        actor=cast.recruiter,
        occurred_at=when,
        notify=_notify_flag(ctx, when),
    )
    counts.onboardings += 1


def _step_checklist(ctx, app, cast, when, nxt, state, counts) -> None:
    onboarding = state.get("onboarding")
    if onboarding is None:
        return
    keys = [item["key"] for item in onboarding.checklist]
    done = keys[: ctx.rng.randint(1, 3)]
    OnboardingService.update(
        onboarding,
        {"checklist": [{"key": key, "done": True} for key in done]},
        cast.recruiter,
        occurred_at=when,
    )


def _step_complete(ctx, app, cast, when, nxt, state, counts) -> None:
    onboarding = state.get("onboarding")
    if onboarding is None:
        return
    OnboardingService.complete(
        onboarding, actor=cast.recruiter, occurred_at=when, notify=_notify_flag(ctx, when)
    )


def _step_decision(decision: str) -> Step:
    def step(ctx, app, cast, when, nxt, state, counts) -> None:
        offer = state.get("offer")
        if decision == ApplicationStatus.WITHDRAWN and offer is not None:
            OfferService.decline(
                offer,
                actor=cast.recruiter,
                reason=ctx.rng.choice(
                    ("Accepted a counter-offer", "Chose another offer", "Relocation fell through")
                ),
                occurred_at=when,
                notify=_notify_flag(ctx, when),
            )
            return
        actor = cast.hiring_manager if state.get("interview") is not None else cast.recruiter
        if decision == ApplicationStatus.WITHDRAWN:
            actor = app.owner or cast.recruiter
        PipelineService.transition(
            app,
            decision,
            actor,
            reason=ctx.rng.choice(text.DECISION_REASONS[decision]),
            occurred_at=when,
            notify=_notify_flag(ctx, when),
        )

    return step


# ------------------------------------------------------------------ John Doe


def _replay_journey(
    ctx: SeedContext,
    john: Application,
    users: dict[str, User],
    cast: Cast,
    counts: HistoryCounts,
) -> None:
    """The prompt's sample timeline, minute for minute (``seed.pools.journey``)."""
    events = journey.JOURNEY_EVENTS_BY_KEY
    end = journey.journey_end(ctx.anchor_date)
    at = lambda key: journey.event_time(events[key], ctx.anchor_date)  # noqa: E731
    rahul, priya, arun = users[RAHUL], users[PRIYA], users[ARUN]
    divya = users.get(DIVYA)
    notify = lambda when: _notify_flag(ctx, when)  # noqa: E731
    spd = john.job_description
    others = {
        app.candidate.full_name: app
        for app in Application.objects.filter(
            job_description=spd, candidate__full_name__in=journey.SHORTLISTED_NAMES
        ).select_related("candidate", "job_description__created_by", "owner", "match")
    }
    counts.replayed += len(others)

    when = at("shortlisted")
    PipelineService.bulk_transition(
        [others[name] for name in journey.SHORTLISTED_NAMES if name in others],
        ApplicationStatus.HR_REVIEW,
        rahul,
        note=events["shortlisted"].description,
        occurred_at=when,
        notify=notify(when),
    )
    john.refresh_from_db()

    meta = events["contacted"].metadata
    when = at("contacted")
    CommunicationService.log(
        john,
        channel=meta["channel"],
        direction=meta["direction"],
        outcome=meta["outcome"],
        summary=meta["summary"],
        notes=meta["notes"],
        next_action=meta["next_action"],
        next_action_at=end + meta["next_action_offset"],
        actor=priya,
        occurred_at=when,
        notify=notify(when),
    )
    counts.communications += 1

    meta = events["interview_scheduled"].metadata
    when = at("interview_scheduled") - timedelta(hours=22)  # booked the afternoon before
    interview = InterviewService.schedule(
        john,
        round=meta["round"],
        interviewer=users[meta["interviewer_email"]],
        scheduled_at=end + meta["scheduled_offset"],
        actor=priya,
        duration_minutes=meta["duration_minutes"],
        mode=meta["mode"],
        meeting_link=meta["meeting_link"],
        occurred_at=when,
        notify=notify(when),
    )
    counts.interviews += 1

    meta = events["feedback_submitted"].metadata
    when = at("feedback_submitted")
    InterviewService.submit_feedback(
        interview,
        score=meta["score"],
        feedback=meta["feedback"],
        recommendation=meta["recommendation"],
        actor=arun,
        occurred_at=when,
        notify=notify(when),
    )

    when = at("selected")
    PipelineService.transition(
        john,
        ApplicationStatus.SELECTED,
        arun,
        note=events["selected"].description,
        occurred_at=when,
        notify=notify(when),
    )

    meta = events["offer_sent"].metadata
    when = at("offer_sent")
    offer = OfferService.create(
        john,
        designation=meta["designation"],
        annual_ctc=meta["annual_ctc"],
        currency=meta["currency"],
        joining_date=(when + timedelta(days=meta["joining_offset_days"])).date(),
        expires_at=when + timedelta(days=meta["expires_offset_days"]),
        actor=rahul,
        send=True,
        occurred_at=when,
        notify=notify(when),
    )
    counts.offers += 1

    when = at("offer_accepted")
    OfferService.accept(
        offer,
        actor=priya,
        note=events["offer_accepted"].description,
        occurred_at=when,
        notify=notify(when),
    )

    meta = events["onboarding_started"].metadata
    when = at("onboarding_started")
    onboarding = OnboardingService.start(
        john,
        start_date=ctx.anchor_date,
        buddy=divya,
        hr_contact=users[meta["hr_contact_email"]],
        notes=events["onboarding_started"].description,
        actor=priya,
        occurred_at=when,
        notify=notify(when),
    )
    counts.onboardings += 1
    OnboardingService.update(
        onboarding,
        {
            "checklist": [
                {"key": "offer_letter_signed", "done": True},
                {"key": "documents_collected", "done": True},
                {"key": "background_check", "done": True},
            ]
        },
        priya,
        occurred_at=when + timedelta(hours=3),
    )
    OnboardingService.update(
        onboarding,
        {"checklist": [{"key": "laptop_and_accounts", "done": True}]},
        priya,
        occurred_at=when + timedelta(hours=7),
    )

    when = at("onboarded")
    OnboardingService.complete(onboarding, actor=priya, occurred_at=when, notify=notify(when))

    # Alex Kumar: the prompt's table shows him Contacted; Jane stays in HR Review.
    alex = others.get("Alex Kumar")
    if alex is not None:
        template = text.COMMUNICATION_TEMPLATES["connected"][1]
        values = {"name": "Alex Kumar", "role": spd.title, "recruiter": priya.full_name}
        when = at("contacted") + timedelta(hours=2)
        CommunicationService.log(
            alex,
            channel=CommunicationChannel.PHONE,
            outcome=CommunicationOutcome.CONNECTED,
            summary=template.summary.format(**values),
            notes=template.notes.format(**values),
            next_action=template.next_action,
            next_action_at=_working_hours(when + timedelta(days=1), ctx.tz),
            actor=priya,
            occurred_at=when,
            notify=notify(when),
        )
        counts.communications += 1


# ------------------------------------------------------------------ notifications


def _settle_notifications(ctx: SeedContext) -> int:
    """Leave the newest few per recipient unread; mark the rest read a little
    after they arrived. Returns the total number of notifications."""
    rows = list(Notification.objects.order_by("recipient_id", "-created_at"))
    seen: dict[Any, int] = {}
    read: list[Notification] = []
    drop: list[Any] = []
    for row in rows:
        seen[row.recipient_id] = seen.get(row.recipient_id, 0) + 1
        if seen[row.recipient_id] > KEEP_PER_RECIPIENT:
            drop.append(row.pk)
        elif seen[row.recipient_id] > UNREAD_PER_RECIPIENT:
            row.is_read = True
            row.read_at = min(
                row.created_at + timedelta(hours=ctx.rng.randint(1, 30)), timezone.now()
            )
            read.append(row)
    if read:
        Notification.objects.bulk_update(read, ["is_read", "read_at"])
    if drop:
        Notification.objects.filter(pk__in=drop).delete()
    return len(rows) - len(drop)
