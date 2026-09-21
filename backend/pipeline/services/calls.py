"""``CallService``: the AI phone call to a candidate, real or simulated.

Two purposes (``CallPurpose``): a friendly **knowledge test** that asks the
HR's questions first, then questions drawn from the job description, and
probes each answer with one follow-up; and **information** delivery ("you have
an interview today at 5 pm"), which confirms the candidate understood and
answers simple logistics questions.

The script (``build_agent_prompt``) is the same whether a voice platform
speaks it (``pipeline.services.voice``) or the browser runs it as a text chat
(``mode="simulated"``: ``reply`` asks the project's LLM for the next turn). When
the call ends, ``finish`` writes the assessment, logs a phone Communication
(Connected moves an early candidate to Contacted) and, for a completed
knowledge test, moves the candidate to Phone Screening.
"""

from __future__ import annotations

import logging
from typing import Any

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import BaseModel, Field

from common.enums import (
    ApplicationStatus,
    CallPurpose,
    CallStatus,
    CommunicationChannel,
    CommunicationOutcome,
)
from pipeline.exceptions import InvalidTransition
from pipeline.models import Application, PhoneCall
from pipeline.services._common import advance, require_active
from pipeline.services.communications import CommunicationService
from pipeline.services.voice import CallEvent, get_voice_provider, normalize_number, voice_config
from resumes.engines.llm import LLMError, invoke_structured
from resumes.engines.planner import jd_text

logger = logging.getLogger(__name__)

TURN_TOKENS = 400
ASSESSMENT_TOKENS = 1500
MAX_TURNS = 40


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
        "Never invent facts about the company, the salary or the process. If asked something "
        "you do not know, say a recruiter will follow up by email.",
    ]
    if call.purpose == CallPurpose.KNOWLEDGE_TEST:
        questions = [q for q in (call.questions or []) if str(q).strip()]
        numbered = "\n".join(f"{i}. {q}" for i, q in enumerate(questions, start=1))
        purpose = [
            "PURPOSE: a short, friendly screening conversation to understand the candidate's "
            "real hands-on knowledge for this role. It is a conversation, not an exam.",
            "Open by introducing yourself, saying the call takes a few minutes, and asking if "
            "now is a good time. Then ask the HR questions below in order, one at a time.",
            f"HR QUESTIONS:\n{numbered}" if numbered else "HR QUESTIONS: none; rely on the role.",
            "After the HR questions, ask two to four further questions drawn from the ROLE below "
            "(its required skills, responsibilities and experience level).",
            "After EACH answer, decide: if it was vague, generic or very short, ask exactly one "
            "follow-up that probes for a concrete example, a decision they made or a detail "
            "only someone who did the work would know. If the answer was specific, acknowledge "
            "it briefly and move on. Never ask more than one follow-up per question.",
            "Do not tell the candidate whether an answer was right or wrong, and do not teach. "
            "Stay warm and encouraging regardless of the answer quality.",
            "Close by thanking them, saying the team will review and be in touch by email, and "
            "asking if they have one quick question for you. Then end the call.",
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
    parts.append(f"ROLE:\n{jd_text(jd)[:2500]}")
    return "\n\n".join(parts)


def first_message(call: PhoneCall) -> str:
    candidate = call.application.candidate
    first_name = (candidate.full_name or "there").split(" ")[0]
    company = settings.EMAIL_COMPANY_NAME
    title = call.application.job_description.title
    if call.purpose == CallPurpose.KNOWLEDGE_TEST:
        return (
            f"Hi {first_name}, this is the recruiting assistant from {company} calling about the "
            f"{title} role you were considered for. Is now a good time for a quick few-minute chat?"
        )
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
        "have said your goodbye. Follow the purpose and the follow-up rule exactly."
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


# ------------------------------------------------------------ the assessment


class QuestionAssessment(BaseModel):
    question: str = ""
    answer_summary: str = ""
    score: int = Field(default=0, ge=0, le=10)
    notes: str = ""


class CallAssessment(BaseModel):
    summary: str = ""
    overall_score: int = Field(default=0, ge=0, le=100)
    questions: list[QuestionAssessment] = Field(default_factory=list)
    strengths: list[str] = Field(default_factory=list)
    concerns: list[str] = Field(default_factory=list)
    recommendation: str = ""  # proceed | hold | reject | n/a
    information_acknowledged: bool = False
    candidate_questions: list[str] = Field(default_factory=list)


_ASSESS_SYSTEM = SystemMessage(
    content=(
        "You are a senior recruiter reviewing the transcript of a screening phone call. Return "
        "JSON. `summary`: 2-3 factual sentences on how the call went. For a knowledge test: one "
        "entry in `questions` per question the agent asked, with a one-sentence `answer_summary`, "
        "a `score` 0-10 for depth and correctness of the answer (0 if unanswered) and short "
        "`notes`; `overall_score` 0-100; `strengths` and `concerns` as short phrases; "
        "`recommendation` one of proceed, hold, reject. For an information call: "
        "`information_acknowledged` true if the candidate confirmed the message, "
        "`candidate_questions` they asked, and recommendation n/a. Use only what is in the "
        "transcript; never guess."
    )
)


def assess(call: PhoneCall) -> CallAssessment:
    human = HumanMessage(
        content=(
            f"Purpose: {call.get_purpose_display()}.\n"
            f"Role: {call.application.job_description.title}.\n"
            f"HR questions: {call.questions or []}\n"
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
        questions: list[str] | None = None,
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
            questions=[str(q).strip() for q in (questions or []) if str(q).strip()][:20],
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
        """Close the call: assess, log the contact, move the candidate on."""
        if call.status in {CallStatus.COMPLETED, CallStatus.NO_ANSWER, CallStatus.FAILED}:
            return call
        now = timezone.now()
        answered = _candidate_turns(call) > 0
        call.ended_at = now
        if call.started_at and not call.duration_seconds:
            call.duration_seconds = int((now - call.started_at).total_seconds())
        call.status = CallStatus.COMPLETED if answered else CallStatus.NO_ANSWER
        if reason:
            call.error = reason[:500]
        if answered:
            try:
                result = assess(call)
                call.assessment = result.model_dump()
                call.summary = result.summary or call.summary
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
            actor=actor or call.created_by,
        )
        if answered and call.purpose == CallPurpose.KNOWLEDGE_TEST:
            application.refresh_from_db()
            advance(application, ApplicationStatus.PHONE_SCREENING, actor or call.created_by)
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
