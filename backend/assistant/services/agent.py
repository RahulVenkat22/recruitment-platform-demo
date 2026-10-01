"""``AssistantService``: the agent behind the TalentOS assistant.

One conversation per user. ``ask`` streams a turn as server-sent events: ``token``
per piece of text, ``step`` whenever the agent takes an action (running, then done,
failed or pending), then ``done`` with both stored turns, or ``error`` with a
sentence for the user. The model sees the tools in ``assistant.services.tools``,
calls the ones it needs (looking ids up first), reads their results and answers;
a tool that needs the user's confirmation is recorded as a ``pending`` step and
run by ``confirm`` once the user agrees in the interface.
"""

from __future__ import annotations

import json
import logging
import time
import uuid
from collections import Counter
from collections.abc import Iterator
from typing import Any

from django.conf import settings
from django.utils import timezone
from langchain_core.messages import (
    AIMessage,
    BaseMessage,
    HumanMessage,
    SystemMessage,
    ToolMessage,
)
from pydantic import ValidationError

from assistant.exceptions import ActionNotPending, AssistantUnavailable
from assistant.models import AssistantMessage
from assistant.services.tools import (
    PLACEHOLDERS,
    TOOLS,
    TOOLS_BY_NAME,
    Tool,
    ToolError,
    needs_confirmation,
    openai_tool,
    run_tool,
)
from common.permissions import (
    can_create_job,
    is_hr_admin,
    is_hr_staff,
    visible_job_descriptions_for,
)
from resumes.engines.llm import LLMError, as_llm_error, chat_model

logger = logging.getLogger(__name__)

ANSWER_TOKENS = 4096
TEMPERATURE = 0.3
MAX_TURNS = 8
HISTORY_MESSAGES = 16
FEEDBACK_CHARS = 12_000

ROUTES = (
    "/jobs (job descriptions), /jobs/<job_id> (one job; ?tab=timeline, ?tab=candidates, "
    "?tab=kanban), /jobs/new, /search?jd=<job_id> (AI candidate search), /candidates, "
    "/candidates/<candidate_id>?jd=<job_id>, /interviews, /templates (email templates), "
    "/notifications, /dashboard (HR only), /support"
)


# ------------------------------------------------------------------ events


def _event(name: str, data: dict[str, Any]) -> bytes:
    return f"event: {name}\ndata: {json.dumps(data, ensure_ascii=False, default=str)}\n\n".encode()


def _payload(message: AssistantMessage) -> dict[str, Any]:
    return {
        "id": str(message.pk),
        "role": message.role,
        "content": message.content,
        "steps": list(message.steps or []),
        "model": message.model,
        "created_at": message.created_at.isoformat(),
    }


def _chunk_text(chunk: Any) -> str:
    """The text of a streamed chunk; a thinking model's reasoning blocks are not text."""
    return str(getattr(chunk, "text", "") or "")


# ------------------------------------------------------------------ prompt


def _defaults(user: Any) -> str:
    """The location and currency the user's job descriptions usually carry."""
    rows = list(
        visible_job_descriptions_for(user)
        .order_by("-created_at")
        .values_list("location", "salary_currency")[:25]
    )
    if not rows:
        return "No job descriptions exist yet; default to location 'Remote' and currency INR."
    location = Counter(row[0] for row in rows if row[0]).most_common(1)
    currency = Counter(row[1] for row in rows if row[1]).most_common(1)
    return (
        f"Existing job descriptions mostly use location {location[0][0]!r} and currency "
        f"{currency[0][0]!r}; use them when the user does not say otherwise."
    )


def _system_prompt(user: Any) -> str:
    company = settings.EMAIL_COMPANY_NAME
    try:
        now = timezone.localtime(timezone.now(), timezone.zoneinfo.ZoneInfo(user.timezone))
    except Exception:  # noqa: BLE001 - an unknown zone falls back to the server's
        now = timezone.localtime(timezone.now())
    role = user.get_role_display()
    rights = []
    if can_create_job(user):
        rights.append("create and edit job descriptions, move candidates, email them")
    if is_hr_admin(user):
        rights.append("see every job description")
    elif is_hr_staff(user):
        rights.append("see the job descriptions they created or are involved in")
    else:
        rights.append(
            "only see the job descriptions they are involved in and cannot change the pipeline"
        )
    return "\n\n".join(
        [
            f"You are TalentOS AI, the assistant built into {company}'s recruitment platform. You "
            "do the user's recruiting work in the application through your tools: create and "
            "update job descriptions, move candidates through the pipeline, email candidates, "
            "comment on timelines, notify colleagues, schedule interviews, start candidate "
            "searches, and answer questions from the data.",
            f"USER\n{user.full_name} ({role}"
            + (f", {user.designation}" if user.designation else "")
            + f"). They can {'; '.join(rights)}. Every action runs as them and under their "
            f"permissions; a tool refuses what they may not do, and you report that plainly.\n"
            f"Now: {now.strftime('%A %d %B %Y, %H:%M')} ({user.timezone}).",
            "HOW TO WORK\n"
            "- Act, do not narrate plans. When the user asks for something, call the tools and "
            "then report what happened. Never claim an action you did not perform.\n"
            "- Never guess an id. Resolve a job, candidate or person the user named with "
            "find_job_descriptions, list_candidates or find_people first; if several match and "
            "the user's words do not settle it, pick nothing and ask a short question listing "
            "the matches.\n"
            "- Chain tools freely: 'email the onboarded candidates on the Python job' is "
            "find_job_descriptions -> list_candidates(status=onboarded) -> send_email.\n"
            "- Actions that reach outside the app or are hard to undo (send_email, force close, "
            "rejecting / withdrawing / holding candidates) are shown to the user for "
            "confirmation by the interface: call them once with the complete arguments and "
            "stop; the user confirms or cancels with buttons. Do not call them again for the "
            "same request.\n"
            "- When a request is ambiguous in a way that changes what you would do, ask; "
            "when it is only missing details, choose sensible values and say what you assumed.\n"
            "- Only recruiting and this application are in scope. Decline anything else in one "
            "friendly sentence.",
            "JOB DESCRIPTIONS\n"
            "- create_job_description takes a COMPLETE posting: write the title, department, "
            "location, work mode, employment type, experience range, 4-8 required and 2-5 "
            "preferred skills, 5-8 responsibilities, 4-6 qualifications, education, and a "
            "120-220 word description yourself from the brief. Infer the department from the "
            "role family. Keep drafts unless the user says to publish/open it.\n"
            f"- {_defaults(user)}\n"
            "- Salary is optional; include it only when the user gives it.",
            "EMAIL AND NOTIFICATIONS\n"
            "- send_email writes to candidates by application_id. Compose the subject and body "
            "yourself in a warm, professional voice, 80-200 words, plain text, signed off with "
            "{recruiter_name}, {company}. Use the placeholders "
            + ", ".join("{" + key + "}" for key in PLACEHOLDERS)
            + " where the value belongs; they are filled per candidate. Candidates without an "
            "email address are skipped and reported.\n"
            "- notify_people sends in-app notifications to staff (find_people gives the ids); "
            "for notifications about a job, pass its route as link_url.\n"
            "- add_job_comment posts on the job's timeline and notifies everyone involved.",
            "ANSWERS\n"
            "- Lead with what you did or found; be brief and specific. Short paragraphs or "
            "bullets; bold the key phrase. No tables, no headings longer than a few words.\n"
            "- Link to things with markdown links on in-app routes, e.g. "
            "[Senior Python Developer](/jobs/<job_id>) or [Priya Nair](/candidates/<id>). "
            f"Routes: {ROUTES}.\n"
            "- Quote numbers, statuses and names exactly as the tools returned them. Never "
            "reveal candidate email addresses or phone numbers.\n"
            "- After a pending action, explain in one or two sentences what it will do and "
            "that the user can confirm or cancel it above.",
        ]
    )


def _history(user: Any) -> list[BaseMessage]:
    rows = list(
        AssistantMessage.objects.filter(user=user).order_by("-created_at")[:HISTORY_MESSAGES]
    )[::-1]
    turns: list[BaseMessage] = []
    for row in rows:
        if row.role == "user":
            turns.append(HumanMessage(content=row.content))
        else:
            turns.append(AIMessage(content=_transcript(row)))
    return turns


def _transcript(message: AssistantMessage) -> str:
    """An earlier assistant turn as the model should remember it: its text and the
    outcome of each action, in order."""
    lines: list[str] = []
    for step in message.steps or []:
        if step.get("type") == "text":
            lines.append(step.get("text", ""))
        else:
            outcome = step.get("status", "")
            result = step.get("result") or {}
            detail = result.get("summary") or step.get("error") or ""
            lines.append(f"[Action {step.get('name')} — {outcome}: {detail}]".strip())
    return "\n\n".join(line for line in lines if line) or message.content


# ------------------------------------------------------------- suggestions


def suggestions(user: Any) -> list[str]:
    latest = (
        visible_job_descriptions_for(user)
        .exclude(status__in=("archived", "force_closed"))
        .order_by("-updated_at")
        .values_list("title", flat=True)
        .first()
    )
    job = f'"{latest}"' if latest else "the latest job description"
    if can_create_job(user):
        return [
            "Create a job description for a Python developer with 3 years of experience",
            f"Who is in TA Review on {job}?",
            f"Send a congratulations email to the onboarded candidates on {job}",
            f"Add a comment on {job}: hiring manager review is due this Friday",
            "Notify the recruiters that the weekly pipeline review is at 4 pm",
        ]
    return [
        "Which job descriptions am I involved in?",
        "What interviews do I have coming up?",
        f"Who is on the pipeline of {job}?",
        f"Show the latest activity on {job}",
    ]


# ------------------------------------------------------------------ steps


def _text_step(steps: list[dict[str, Any]], text: str) -> None:
    text = text.strip()
    if not text:
        return
    if steps and steps[-1]["type"] == "text":
        steps[-1]["text"] = f"{steps[-1]['text']}\n\n{text}"
    else:
        steps.append({"type": "text", "text": text})


def _action_step(tool_name: str, label: str, args: dict[str, Any]) -> dict[str, Any]:
    return {
        "type": "action",
        "id": str(uuid.uuid4()),
        "name": tool_name,
        "label": label,
        "status": "running",
        "args": args,
        "details": [],
        "body": "",
        "result": None,
        "error": "",
    }


def _feedback(result: Any) -> str:
    text = json.dumps(
        {
            "summary": result.summary,
            "data": result.data,
            "link": result.link,
            "changed": result.changed,
        },
        ensure_ascii=False,
        default=str,
    )
    return text if len(text) <= FEEDBACK_CHARS else text[:FEEDBACK_CHARS] + '… (truncated)"}'


def _validation_text(exc: ValidationError) -> str:
    return "; ".join(
        f"{'.'.join(str(part) for part in error.get('loc', ()))}: {error.get('msg')}"
        for error in exc.errors()[:6]
    )


def _run_step(user: Any, tool: Tool, args: Any, step: dict[str, Any]) -> str:
    """Run ``tool`` for a step already announced as running; returns the model feedback."""
    try:
        result = run_tool(tool, user, args)
    except ToolError as exc:
        step["status"], step["error"] = "failed", str(exc)
        return f"FAILED: {exc}"
    except Exception as exc:  # noqa: BLE001 - one action failing must not end the turn
        logger.exception("assistant tool %s failed", tool.name)
        step["status"], step["error"] = "failed", f"The action failed ({type(exc).__name__})."
        return f"FAILED: {step['error']}"
    step["status"], step["result"] = "done", result.as_dict()
    return _feedback(result)


def _execute(user: Any, call: dict[str, Any], step: dict[str, Any]) -> str:
    """Resolve one tool call: ``step`` (already announced as running) ends up done, failed
    or pending, and the model gets the feedback returned."""
    name = str(call.get("name") or "")
    raw = call.get("args") or {}
    tool = TOOLS_BY_NAME.get(name)
    step["args"] = raw
    if tool is None:
        step["status"], step["error"] = "failed", f"There is no tool named {name}."
        return f"FAILED: {step['error']}"
    try:
        args = tool.schema.model_validate(raw)
    except ValidationError as exc:
        step["status"], step["error"] = "failed", f"Invalid arguments: {_validation_text(exc)}"
        return f"FAILED: {step['error']}"
    step["label"] = tool.label(args)
    step["args"] = args.model_dump()
    if needs_confirmation(tool, args) and tool.preview is not None:
        try:
            preview = tool.preview(user, args)
        except ToolError as exc:
            step["status"], step["error"] = "failed", str(exc)
            return f"FAILED: {exc}"
        step.update(
            status="pending", label=preview.label, details=preview.details, body=preview.body
        )
        return (
            f"PENDING: '{preview.label}' is shown to the user for confirmation in the "
            "interface. It has not run yet. Do not call it again; tell the user what it will "
            "do and that they can confirm or cancel it above."
        )
    return _run_step(user, tool, args, step)


# ---------------------------------------------------------------- service


class AssistantService:
    @staticmethod
    def thread(user: Any) -> dict[str, Any]:
        return {
            "scope": AssistantService.scope(user),
            "messages": list(AssistantMessage.objects.filter(user=user)),
            "suggestions": suggestions(user),
        }

    @staticmethod
    def scope(user: Any) -> dict[str, Any]:
        return {
            "model": settings.ASSISTANT_MODEL,
            "company": settings.EMAIL_COMPANY_NAME,
            "user_name": user.full_name,
            "role": str(user.role),
            "role_label": user.get_role_display(),
            "can_act": is_hr_staff(user),
        }

    @staticmethod
    def clear(user: Any) -> int:
        deleted, _ = AssistantMessage.objects.filter(user=user).delete()
        return deleted

    @staticmethod
    def ask(user: Any, message: str) -> Iterator[bytes]:
        model = settings.ASSISTANT_MODEL
        try:
            client = chat_model(model, num_predict=ANSWER_TOKENS, temperature=TEMPERATURE)
        except LLMError as exc:
            raise AssistantUnavailable(str(exc)) from exc
        return _stream(user, message.strip(), client, model)

    @staticmethod
    def confirm(user: Any, step_id: str) -> AssistantMessage:
        message, step = _pending(user, step_id)
        tool = TOOLS_BY_NAME[step["name"]]
        args = tool.schema.model_validate(step.get("args") or {})
        step["status"] = "running"
        _run_step(user, tool, args, step)
        message.save(update_fields=["steps", "updated_at"])
        return message

    @staticmethod
    def cancel(user: Any, step_id: str) -> AssistantMessage:
        message, step = _pending(user, step_id)
        step["status"] = "cancelled"
        message.save(update_fields=["steps", "updated_at"])
        return message


def _pending(user: Any, step_id: str) -> tuple[AssistantMessage, dict[str, Any]]:
    message = AssistantMessage.objects.filter(
        user=user, role="assistant", steps__contains=[{"id": str(step_id)}]
    ).first()
    if message is None:
        raise ActionNotPending("No such action.")
    step = next(step for step in message.steps if step.get("id") == str(step_id))
    if step.get("status") != "pending" or step.get("name") not in TOOLS_BY_NAME:
        raise ActionNotPending
    return message, step


def _stream(user: Any, question: str, client: Any, model: str) -> Iterator[bytes]:
    started = time.monotonic()
    messages: list[BaseMessage] = [
        SystemMessage(content=_system_prompt(user)),
        *_history(user),
        HumanMessage(content=question),
    ]
    asked = AssistantMessage.objects.create(user=user, role="user", content=question)
    llm = client.bind_tools([openai_tool(tool) for tool in TOOLS])
    steps: list[dict[str, Any]] = []
    stored = False
    try:
        for turn in range(MAX_TURNS):
            aggregate: Any = None
            parts: list[str] = []
            for chunk in llm.stream(messages):
                aggregate = chunk if aggregate is None else aggregate + chunk
                text = _chunk_text(chunk)
                if text:
                    parts.append(text)
                    yield _event("token", {"text": text})
            text = "".join(parts).strip()
            _text_step(steps, text)
            calls = list(getattr(aggregate, "tool_calls", None) or [])
            invalid = list(getattr(aggregate, "invalid_tool_calls", None) or [])
            if not calls and not invalid:
                break
            for call in calls:
                call["id"] = call.get("id") or f"call_{uuid.uuid4().hex[:12]}"
            messages.append(AIMessage(content=text, tool_calls=calls))
            pending = False
            for call in calls:
                name = str(call.get("name") or "")
                step = _action_step(name, name.replace("_", " ").capitalize(), {})
                yield _event("step", step)
                feedback = _execute(user, call, step)
                steps.append(step)
                yield _event("step", step)
                messages.append(
                    ToolMessage(content=feedback, tool_call_id=call["id"], name=call["name"])
                )
                pending = pending or step["status"] == "pending"
            for bad in invalid:
                messages.append(
                    ToolMessage(
                        content=f"FAILED: the call could not be parsed ({bad.get('error')}).",
                        tool_call_id=bad.get("id") or f"call_{uuid.uuid4().hex[:12]}",
                        name=bad.get("name") or "unknown",
                    )
                )
            if pending:
                messages.append(
                    HumanMessage(
                        content=(
                            "(interface) The pending action is waiting for my confirmation "
                            "above. Tell me briefly what it will do; do not call any tools."
                        )
                    )
                )
                parts = []
                for chunk in client.stream(messages):
                    piece = _chunk_text(chunk)
                    if piece:
                        parts.append(piece)
                        yield _event("token", {"text": piece})
                _text_step(steps, "".join(parts))
                break
            if turn == MAX_TURNS - 1:
                note = "I stopped after several steps; tell me how to continue."
                _text_step(steps, note)
                yield _event("token", {"text": note})
        content = "\n\n".join(step["text"] for step in steps if step["type"] == "text").strip()
        if not steps:
            yield _event(
                "error",
                {"message": "The model returned an empty answer; try rephrasing the request."},
            )
            return
        reply = AssistantMessage.objects.create(
            user=user, role="assistant", content=content, steps=steps, model=model
        )
        stored = True
        yield _event(
            "done",
            {
                "question": _payload(asked),
                "message": _payload(reply),
                "seconds": round(time.monotonic() - started, 1),
            },
        )
    except Exception as exc:  # noqa: BLE001 - every failure becomes one sentence for the user
        error = (
            exc if isinstance(exc, LLMError) else as_llm_error(settings.LLM_PROVIDER, model, exc)
        )
        logger.warning("assistant turn failed for %s: %s", user.pk, error)
        yield _event("error", {"message": str(error)})
    finally:
        if not stored:
            if steps:
                # The browser stopped the stream or the model failed after actions already
                # ran: keep the turn so the user sees what happened.
                content = "\n\n".join(s["text"] for s in steps if s["type"] == "text")
                AssistantMessage.objects.create(
                    user=user, role="assistant", content=content, steps=steps, model=model
                )
            else:
                # Nothing was done: no half-conversation is left behind.
                asked.delete()
