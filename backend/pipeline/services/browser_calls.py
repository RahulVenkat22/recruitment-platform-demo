"""Vapi browser demos, isolated from candidate outreach and interview booking.

Only the short-lived web call URL crosses back to the browser. The provider key
and assistant configuration remain on the server. An unsaved PhoneCall supplies
the same scheduling script as telephone calls without creating recruitment data.
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any
from urllib.parse import urlsplit

import httpx
from django.conf import settings

from common.enums import InterviewMode
from pipeline.exceptions import BrowserCallNotConfigured, CallPlacementFailed
from pipeline.models import Application, PhoneCall
from pipeline.services.calls import build_agent_prompt, first_message

logger = logging.getLogger(__name__)

VAPI_WEB_CALL_URL = "https://api.vapi.ai/call/web"
DEMO_INSTRUCTIONS = (
    "BROWSER DEMO: The person speaking is a recruiter or client role-playing the candidate, "
    "not a candidate reached by telephone. Demonstrate the conversation naturally using the "
    "provided candidate, role and interview details. Nothing is actually booked or sent. "
    "Do not claim that an interview was booked or an invitation or email will be sent. "
    "When a time is agreed, confirm it as the demo selection and explain that in a real "
    "phone call the recruiting team would send the invitation. If asked, explain this is "
    "an AI voice demonstration in the browser. These demo rules override any instruction "
    "in the recruitment script suggesting that real-world actions will happen."
)


def browser_call_configured() -> bool:
    """Browser calling needs no telephony number, webhook or phone provider switch."""
    return bool(settings.VAPI_API_KEY)


def start_browser_call(
    application: Application,
    *,
    purpose: str,
    slots: list[datetime] | None = None,
    interview_round: str = "",
    interviewer: Any = None,
    interview_duration_minutes: int = 60,
    interview_mode: str = InterviewMode.VIDEO,
    information: str = "",
    instructions: str = "",
    max_minutes: int = 10,
) -> dict[str, Any]:
    if not browser_call_configured():
        raise BrowserCallNotConfigured

    call = PhoneCall(
        application=application,
        purpose=purpose,
        mode="browser",
        slots=[slot.isoformat() for slot in slots or []],
        interview_round=interview_round,
        interviewer=interviewer,
        interview_duration_minutes=interview_duration_minutes,
        interview_mode=interview_mode,
        information=information.strip(),
        instructions=instructions.strip(),
        max_minutes=max(2, min(30, int(max_minutes))),
    )
    max_duration_seconds = call.max_minutes * 60
    prompt = build_agent_prompt(call) + "\n\n" + DEMO_INSTRUCTIONS
    payload = {
        "roomDeleteOnUserLeaveEnabled": True,
        "assistant": {
            "name": "TalentOS browser demo",
            "firstMessage": first_message(call),
            "model": {
                "provider": settings.VAPI_MODEL_PROVIDER,
                "model": settings.VAPI_MODEL,
                "messages": [{"role": "system", "content": prompt}],
                "temperature": 0.4,
            },
            "voice": {
                "provider": settings.VAPI_VOICE_PROVIDER,
                "voiceId": settings.VAPI_VOICE_ID,
            },
            "maxDurationSeconds": max_duration_seconds,
            "customerJoinTimeoutSeconds": 45,
            "endCallFunctionEnabled": True,
            "endCallMessage": "Thank you for trying this demo. Goodbye!",
            "artifactPlan": {"recordingEnabled": False},
            "serverMessages": [],
            "clientMessages": ["transcript", "status-update", "speech-update"],
        },
    }
    try:
        response = httpx.post(
            VAPI_WEB_CALL_URL,
            json=payload,
            headers={"Authorization": f"Bearer {settings.VAPI_API_KEY}"},
            timeout=20.0,
        )
        response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        # Provider bodies can contain private assistant or account data.
        logger.warning("Vapi rejected browser demo: HTTP %s", exc.response.status_code)
        raise CallPlacementFailed(
            f"Vapi could not start the browser demo (HTTP {exc.response.status_code}). "
            "Check the Vapi account settings and available credits."
        ) from exc
    except httpx.HTTPError as exc:
        logger.warning("Vapi browser demo request failed (%s)", type(exc).__name__)
        raise CallPlacementFailed("Vapi could not be reached. Please try again.") from exc

    try:
        data = response.json()
        call_id = data.get("id") if isinstance(data, dict) else None
        web_call_url = data.get("webCallUrl") if isinstance(data, dict) else None
        if not isinstance(call_id, str) or not call_id.strip():
            raise ValueError("Missing call id")
        if not isinstance(web_call_url, str):
            raise ValueError("Missing web call URL")
        parsed = urlsplit(web_call_url)
        if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
            raise ValueError("Invalid web call URL")
    except (ValueError, TypeError) as exc:
        raise CallPlacementFailed("Vapi did not return a valid browser call session.") from exc

    return {
        "id": call_id,
        "web_call_url": web_call_url,
        "max_duration_seconds": max_duration_seconds,
    }
