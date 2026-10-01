"""``CallService``: the AI phone call to a candidate, real or simulated.

Two purposes (``CallPurpose``): **schedule an interview**, where the agent
offers the slots the recruiter picked, the candidate chooses one and the
interview is booked when the call ends; and **information** delivery ("you
have an interview today at 5 pm"), which confirms the candidate understood.
Either way the candidate may ask about the company or the role, and the agent
answers from ``COMPANY_PROFILE`` and the job description.

The script (``build_agent_prompt``) is the same whether a voice platform
speaks it (``pipeline.services.voice``) or the browser runs it as a text chat
(``mode="simulated"``: ``reply`` asks the project's LLM for the next turn). When
the call ends, ``finish`` reads the transcript (``assess``), logs a phone
Communication (Connected moves an early candidate to Contacted) and books the
slot the candidate agreed to.
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import BaseModel, Field

from common.enums import (
    CallPurpose,
    CallStatus,
    CommunicationChannel,
    CommunicationOutcome,
    InterviewMode,
)
from pipeline.exceptions import InvalidTransition
from pipeline.models import Application, PhoneCall
from pipeline.services._common import require_active
from pipeline.services.communications import CommunicationService
from pipeline.services.interviews import InterviewService
from pipeline.services.voice import CallEvent, get_voice_provider, normalize_number, voice_config
from resumes.engines.llm import LLMError, invoke_structured
from resumes.engines.planner import jd_text

logger = logging.getLogger(__name__)

TURN_TOKENS = 400
ASSESSMENT_TOKENS = 800
MAX_TURNS = 40


def slot_text(value: str) -> str:
    """``"2026-10-01T05:30:00+00:00"`` -> ``"Thursday 1 October, 11:00 AM IST"``."""
    local = timezone.localtime(datetime.fromisoformat(value))
    return f"{local.strftime('%A %-d %B, %-I:%M %p')} {local.tzname()}"


def _offered(call: PhoneCall) -> str:
    return "\n".join(f"{i}. {slot_text(slot)}" for i, slot in enumerate(call.slots, start=1))


# ------------------------------------------------------------------ the script


def build_agent_prompt(call: PhoneCall) -> str:
    """The system prompt the voice agent (or the simulated chat) follows."""
    application = call.application
    candidate, jd = application.candidate, application.job_description
    first_name = (candidate.full_name or "there").split(" ")[0]
    company = settings.EMAIL_COMPANY_NAME
    minutes = int(call.max_minutes or 10)
    common = [
        f"You are a friendly, professional recruiter from {company} on a phone call with "
        f"{candidate.full_name} ({first_name}) about the {jd.title} role.",
        "Speak naturally in short sentences, one question at a time, and wait for the answer. "
        "Never read lists or headings aloud. Use the candidate's first name occasionally.",
        "If the candidate asks who you are, say you are the recruiting assistant of "
        f"{company}. If they ask to stop or cannot talk now, apologise, offer to call back, "
        "thank them and end the call.",
        "If you reach voicemail or nobody answers, leave a brief polite message with the "
        f"purpose of the call and that {company} will follow up, then end the call.",
        f"Keep the whole call under {minutes} minutes.",
        "The candidate may ask about the company or the role at any point. Answer from the "
        "COMPANY and ROLE sections below in one or two crisp, friendly sentences, then return "
        "to the purpose of the call. Never invent anything beyond those sections, salary "
        "included: if the answer is not there, say a recruiter will follow up by email.",
    ]
    if call.purpose == CallPurpose.SCHEDULE_INTERVIEW:
        interviewer = call.interviewer.full_name if call.interviewer else "the hiring team"
        purpose = [
            f"PURPOSE: fix a time for the candidate's {call.get_interview_round_display()} "
            f"interview: {call.interview_duration_minutes} minutes over "
            f"{call.get_interview_mode_display().lower()} with {interviewer}.",
            "Open by introducing yourself and confirming you are speaking with the candidate. "
            "Say the team would like to invite them to the interview.",
            f"AVAILABLE SLOTS:\n{_offered(call)}",
            "Offer the slots in natural speech, in order, and ask which one works. Never offer "
            "a time outside this list. When the candidate picks one, repeat the full day and "
            "time back and get a clear yes before moving on.",
            "If none of the slots works, ask which days and times would suit them, note the "
            "answer, and say a recruiter will confirm a new time by email.",
            "Close by saying an invitation with the details will follow by email, thank them "
            "and wish them well. Then end the call.",
        ]
    else:
        purpose = [
            "PURPOSE: deliver a message from the hiring team and make sure it was understood.",
            "Open by introducing yourself and confirming you are speaking with the candidate.",
            f"THE MESSAGE TO DELIVER (say it in your own words, keep every fact exact):\n"
            f"{(call.information or '').strip()}",
            "After delivering it, ask the candidate to confirm they have noted it (for example the "
            "date and time) and whether it works for them. Answer simple logistics questions "
            "using only the message and the role details; for anything else say a recruiter "
            "will confirm by email.",
            "Close by thanking them and wishing them well. Then end the call.",
        ]
    extra = (call.instructions or "").strip()
    parts = ["\n".join(common), "\n".join(purpose)]
    if extra:
        parts.append(f"EXTRA INSTRUCTIONS FROM THE RECRUITER:\n{extra}")
    parts.append(f"COMPANY:\n{settings.COMPANY_PROFILE}")
    parts.append(f"ROLE:\n{jd_text(jd)[:2500]}")
    return "\n\n".join(parts)


def first_message(call: PhoneCall) -> str:
    candidate = call.application.candidate
    first_name = (candidate.full_name or "there").split(" ")[0]
    company = settings.EMAIL_COMPANY_NAME
    title = call.application.job_description.title
    return (
        f"Hi {first_name}, this is the recruiting assistant from {company} calling about the "
        f"{title} role. Am I speaking with {candidate.full_name}?"
    )


# ------------------------------------------------------- the simulated turn


class AgentTurn(BaseModel):
    say: str = ""
    end_call: bool = False


def _history_text(transcript: list[dict[str, Any]]) -> str:
    lines = []
    for turn in transcript:
        who = "You" if turn.get("role") == "ai" else "Candidate"
        lines.append(f"{who}: {turn.get('text', '')}")
    return "\n".join(lines)


def next_turn(call: PhoneCall) -> AgentTurn:
    """The agent's next line given the transcript so far (simulated calls only)."""
    system = SystemMessage(
        content=build_agent_prompt(call)
        + "\n\nYou are producing ONE turn of the conversation as JSON: `say` is what you say next "
        "(one to three sentences, plain speech, no lists), and `end_call` is true only when you "
        "have said your goodbye. Follow the purpose exactly."
    )
    human = HumanMessage(
        content=f"Conversation so far:\n{_history_text(call.transcript)}\n\nYour next turn:"
    )
    turn = invoke_structured(
        AgentTurn, [system, human], model=settings.VOICE_MODEL, num_predict=TURN_TOKENS
    )
    turn.say = " ".join(turn.say.split())
    if not turn.say:
        turn.say = "Thank you for your time today, the team will be in touch by email. Goodbye!"
        turn.end_call = True
    return turn


# ------------------------------------------------------------ the outcome


class CallAssessment(BaseModel):
    summary: str = ""
    # 1-based number of the offered slot the candidate agreed to; 0 when none.
    chosen_slot: int = Field(default=0, ge=0)
    preferred_time: str = ""
    information_acknowledged: bool = False
    candidate_questions: list[str] = Field(default_factory=list)


_ASSESS_SYSTEM = SystemMessage(
    content=(
        "You are a senior recruiter reviewing the transcript of a phone call. Return JSON. "
        "`summary`: 2-3 factual sentences on how the call went. For an interview scheduling "
        "call: `chosen_slot` is the number of the offered slot the candidate clearly agreed to "
        "(0 if they agreed to none) and `preferred_time` is what they said would suit them when "
        "no slot worked (else empty). For an information call: `information_acknowledged` is "
        "true if the candidate confirmed the message. `candidate_questions`: the questions they "
        "asked about the company or the role. Use only what is in the transcript; never guess."
    )
)


def assess(call: PhoneCall) -> CallAssessment:
    human = HumanMessage(
        content=(
            f"Purpose: {call.get_purpose_display()}.\n"
            f"Role: {call.application.job_description.title}.\n"
            f"Offered slots:\n{_offered(call) or '-'}\n"
            f"Message to deliver: {call.information or '-'}\n\n"
            f"Transcript:\n{_history_text(call.transcript)}"
        )
    )
    return invoke_structured(
        CallAssessment,
        [_ASSESS_SYSTEM, human],
        model=settings.VOICE_MODEL,
        num_predict=ASSESSMENT_TOKENS,
    )


# --------------------------------------------------------------- the service


def _candidate_turns(call: PhoneCall) -> int:
    return sum(1 for turn in call.transcript if turn.get("role") == "candidate")


class CallService:
    @staticmethod
    def create(
        application: Application,
        *,
        purpose: str,
        actor: Any,
        slots: list[datetime] | None = None,
        interview_round: str = "",
        interviewer: Any = None,
        interview_duration_minutes: int = 60,
        interview_mode: str = InterviewMode.VIDEO,
        information: str = "",
        instructions: str = "",
        max_minutes: int = 10,
        mode: str = "simulated",
    ) -> PhoneCall:
        """Record the call and start it: dial through the provider, or open the simulated chat."""
        require_active(application, "Calling the candidate")
        call = PhoneCall(
            application=application,
            purpose=purpose,
            mode=mode,
            status=CallStatus.QUEUED,
            slots=[slot.isoformat() for slot in slots or []],
            interview_round=interview_round,
            interviewer=interviewer,
            interview_duration_minutes=interview_duration_minutes,
            interview_mode=interview_mode,
            information=(information or "").strip(),
            instructions=(instructions or "").strip(),
            max_minutes=max(2, min(30, int(max_minutes or 10))),
            created_by=actor,
        )
        call.system_prompt = build_agent_prompt(call)
        opening = first_message(call)
        if mode == "simulated":
            call.provider = "simulated"
            call.status = CallStatus.IN_PROGRESS
            call.started_at = timezone.now()
            call.transcript = [{"role": "ai", "text": opening}]
            call.save()
            return call

        config = voice_config()
        number = normalize_number(application.candidate.phone or "")
        dialled = config.safe_number or number
        call.to_number = number
        call.provider = config.provider or "none"
        if config.safe_number:
            call.notes = f"Safe mode: dialled {config.safe_number} instead of {number}."
        provider = get_voice_provider()
        if provider is None:
            call.status = CallStatus.FAILED
            call.error = "No voice provider is configured (VOICE_PROVIDER / VAPI_* settings)."
            call.save()
            return call
        call.save()
        try:
            call.provider_call_id = provider.place_call(
                to_number=normalize_number(dialled),
                prompt=call.system_prompt,
                first_message=opening,
                max_minutes=call.max_minutes,
            )
        except Exception as exc:
            call.status = CallStatus.FAILED
            call.error = str(getattr(exc, "detail", exc))[:500]
            call.save(update_fields=["status", "error", "updated_at"])
            raise
        call.save(update_fields=["provider_call_id", "updated_at"])
        return call

    @staticmethod
    def reply(call: PhoneCall, answer: str, actor: Any) -> PhoneCall:
        """Simulated call: record the candidate's answer and ask the model for the next turn."""
        if call.mode != "simulated" or call.status != CallStatus.IN_PROGRESS:
            raise InvalidTransition("This call is not a simulated call in progress.")
        text = " ".join((answer or "").split())[:4000]
        if not text:
            return call
        call.transcript = [*call.transcript, {"role": "candidate", "text": text}]
        try:
            turn = next_turn(call)
        except LLMError as exc:
            logger.warning("simulated call %s: %s", call.pk, exc)
            call.save(update_fields=["transcript", "updated_at"])
            raise
        call.transcript = [*call.transcript, {"role": "ai", "text": turn.say}]
        call.save(update_fields=["transcript", "updated_at"])
        if turn.end_call or len(call.transcript) >= MAX_TURNS:
            return CallService.finish(call, actor=actor)
        return call

    @staticmethod
    @transaction.atomic
    def finish(call: PhoneCall, *, actor: Any, reason: str = "") -> PhoneCall:
        """Close the call: read the transcript, log the contact, book the chosen slot."""
        if call.status in {CallStatus.COMPLETED, CallStatus.NO_ANSWER, CallStatus.FAILED}:
            return call
        now = timezone.now()
        actor = actor or call.created_by
        answered = _candidate_turns(call) > 0
        call.ended_at = now
        if call.started_at and not call.duration_seconds:
            call.duration_seconds = int((now - call.started_at).total_seconds())
        call.status = CallStatus.COMPLETED if answered else CallStatus.NO_ANSWER
        if reason:
            call.error = reason[:500]
        chosen = 0
        if answered:
            try:
                result = assess(call)
                call.assessment = result.model_dump()
                call.summary = result.summary or call.summary
                chosen = result.chosen_slot
            except LLMError as exc:
                logger.warning("assessment failed for call %s: %s", call.pk, exc)
                call.summary = call.summary or "Assessment unavailable; see the transcript."
        elif not call.summary:
            call.summary = "The candidate did not answer."
        call.save()

        application = call.application
        outcome = CommunicationOutcome.CONNECTED if answered else CommunicationOutcome.NO_ANSWER
        label = call.get_purpose_display()
        notes = _history_text(call.transcript)
        if call.notes:
            notes += f"\n\n[{call.notes}]"
        CommunicationService.log(
            application,
            channel=CommunicationChannel.PHONE,
            outcome=outcome,
            summary=f"AI call, {label.lower()}: {call.summary}"[:300],
            notes=notes,
            actor=actor,
        )
        if call.purpose == CallPurpose.SCHEDULE_INTERVIEW and 0 < chosen <= len(call.slots):
            application.refresh_from_db()
            call.interview = InterviewService.schedule(
                application,
                round=call.interview_round,
                interviewer=call.interviewer,
                scheduled_at=datetime.fromisoformat(call.slots[chosen - 1]),
                actor=actor,
                duration_minutes=call.interview_duration_minutes,
                mode=call.interview_mode,
            )
            call.save(update_fields=["interview", "updated_at"])
        return call

    @staticmethod
    def apply_event(call: PhoneCall, event: CallEvent) -> PhoneCall:
        """A provider webhook: status changes while the call runs, the report at the end."""
        if event.kind == "status":
            mapping = {
                "queued": CallStatus.QUEUED,
                "ringing": CallStatus.RINGING,
                "in-progress": CallStatus.IN_PROGRESS,
            }
            if event.status in mapping and call.status not in {
                CallStatus.COMPLETED,
                CallStatus.NO_ANSWER,
                CallStatus.FAILED,
            }:
                call.status = mapping[event.status]
                if event.status == "in-progress" and not call.started_at:
                    call.started_at = timezone.now()
                call.save(update_fields=["status", "started_at", "updated_at"])
            return call
        if event.kind == "ended":
            call.transcript = [dict(turn) for turn in event.transcript] or call.transcript
            call.summary = event.summary or call.summary
            call.recording_url = event.recording_url or call.recording_url
            if event.duration_seconds:
                call.duration_seconds = event.duration_seconds
            call.save()
            return CallService.finish(call, actor=call.created_by, reason=event.ended_reason)
        return call

    @staticmethod
    def bulk_create(
        applications: list[Application], *, actor: Any, **kwargs: Any
    ) -> tuple[list[PhoneCall], dict[str, str]]:
        placed: list[PhoneCall] = []
        skipped: dict[str, str] = {}
        for application in applications:
            try:
                placed.append(CallService.create(application, actor=actor, **kwargs))
            except Exception as exc:  # noqa: BLE001 - one bad number must not stop the batch
                skipped[str(application.pk)] = str(getattr(exc, "detail", exc))[:200]
        return placed, skipped
