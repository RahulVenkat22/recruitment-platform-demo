"""Telephony behind the AI phone call: number normalisation and the provider adapter.

The conversation itself (script, follow-ups, assessment) lives in
``pipeline.services.calls`` and runs on the project's own LLM. Placing a real
call needs a voice platform that dials, streams speech to a model and speaks
its replies; ``VapiProvider`` is that adapter, switched on by
``VOICE_PROVIDER=vapi`` plus its keys. Without it the app still runs the
interview as a simulated call in the browser.

Safe mode: while ``VOICE_SAFE_NUMBER`` is set, every real call is placed to
that number instead of the candidate's, and the call record says so.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

import httpx
import phonenumbers
from django.conf import settings

from pipeline.exceptions import CallPlacementFailed, NoPhoneNumber, VoiceNotConfigured

logger = logging.getLogger(__name__)

VAPI_URL = "https://api.vapi.ai/call"


@dataclass(frozen=True)
class VoiceConfig:
    provider: str
    configured: bool
    safe_number: str
    default_region: str
    public_base_url: str


def voice_config() -> VoiceConfig:
    provider = (settings.VOICE_PROVIDER or "").lower()
    configured = provider == "vapi" and bool(
        settings.VAPI_API_KEY and settings.VAPI_PHONE_NUMBER_ID and settings.PUBLIC_BASE_URL
    )
    return VoiceConfig(
        provider=provider,
        configured=configured,
        safe_number=settings.VOICE_SAFE_NUMBER,
        default_region=settings.VOICE_DEFAULT_REGION,
        public_base_url=settings.PUBLIC_BASE_URL,
    )


def normalize_number(raw: str, region: str | None = None) -> str:
    """``"98765 43210"`` -> ``"+919876543210"``; ``NoPhoneNumber`` when it is not a number."""
    text = (raw or "").strip()
    if not text:
        raise NoPhoneNumber
    try:
        parsed = phonenumbers.parse(text, region or settings.VOICE_DEFAULT_REGION)
    except phonenumbers.NumberParseException as exc:
        raise NoPhoneNumber(f"{text!r} is not a phone number the dialler can use.") from exc
    if not phonenumbers.is_valid_number(parsed):
        raise NoPhoneNumber(f"{text!r} is not a valid phone number.")
    return phonenumbers.format_number(parsed, phonenumbers.PhoneNumberFormat.E164)


@dataclass(frozen=True)
class CallEvent:
    """What a provider webhook told us about one call."""

    provider_call_id: str
    kind: str  # "status" | "ended" | "ignored"
    status: str = ""
    transcript: tuple[dict[str, str], ...] = ()
    summary: str = ""
    recording_url: str = ""
    duration_seconds: int = 0
    ended_reason: str = ""


class VapiProvider:
    """Outbound calls through Vapi (https://vapi.ai): one HTTP call out, webhooks back.

    The assistant is sent inline with every call, so the script built by
    ``calls.build_agent_prompt`` is exactly what the voice agent follows. The
    request and webhook shapes follow Vapi's public API; verify them against the
    current docs when the account exists, since they are not exercised by tests.
    """

    def place_call(
        self, *, to_number: str, prompt: str, first_message: str, max_minutes: int
    ) -> str:
        config = voice_config()
        if not config.configured:
            raise VoiceNotConfigured
        payload: dict[str, Any] = {
            "phoneNumberId": settings.VAPI_PHONE_NUMBER_ID,
            "customer": {"number": to_number},
            "assistant": {
                "name": "TalentOS recruiter",
                "firstMessage": first_message,
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
                "maxDurationSeconds": max(60, int(max_minutes) * 60),
                "endCallFunctionEnabled": True,
                "endCallMessage": "Thank you for your time today. Goodbye!",
                "recordingEnabled": True,
                "server": {
                    "url": f"{settings.PUBLIC_BASE_URL.rstrip('/')}/api/v1/calls/webhook/vapi/",
                    "secret": settings.VAPI_WEBHOOK_SECRET or None,
                },
                "serverMessages": ["status-update", "end-of-call-report"],
            },
        }
        try:
            response = httpx.post(
                VAPI_URL,
                json=payload,
                headers={"Authorization": f"Bearer {settings.VAPI_API_KEY}"},
                timeout=20.0,
            )
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            logger.warning(
                "Vapi rejected the call: %s %s", exc.response.status_code, exc.response.text[:300]
            )
            raise CallPlacementFailed(
                f"The voice provider rejected the call (HTTP {exc.response.status_code})."
            ) from exc
        except httpx.HTTPError as exc:
            logger.warning("Vapi unreachable: %s", exc)
            raise CallPlacementFailed("The voice provider could not be reached.") from exc
        data = response.json()
        call_id = str(data.get("id") or "")
        if not call_id:
            raise CallPlacementFailed("The voice provider did not return a call id.")
        return call_id

    @staticmethod
    def verify(request_headers: Any) -> bool:
        secret = settings.VAPI_WEBHOOK_SECRET
        return not secret or request_headers.get("x-vapi-secret") == secret

    @staticmethod
    def parse_webhook(payload: dict[str, Any]) -> CallEvent:
        message = payload.get("message") or {}
        call = message.get("call") or {}
        call_id = str(call.get("id") or payload.get("callId") or "")
        kind = str(message.get("type") or "")
        if kind == "status-update":
            return CallEvent(
                provider_call_id=call_id, kind="status", status=str(message.get("status") or "")
            )
        if kind == "end-of-call-report":
            turns = []
            for item in message.get("messages") or []:
                role = str(item.get("role") or "")
                text = str(item.get("message") or item.get("content") or "").strip()
                if role in {"bot", "assistant"} and text:
                    turns.append({"role": "ai", "text": text})
                elif role == "user" and text:
                    turns.append({"role": "candidate", "text": text})
            return CallEvent(
                provider_call_id=call_id,
                kind="ended",
                status="ended",
                transcript=tuple(turns),
                summary=str(message.get("summary") or ""),
                recording_url=str(message.get("recordingUrl") or ""),
                duration_seconds=int(float(message.get("durationSeconds") or 0)),
                ended_reason=str(message.get("endedReason") or ""),
            )
        return CallEvent(provider_call_id=call_id, kind="ignored")


def get_voice_provider() -> VapiProvider | None:
    return VapiProvider() if voice_config().configured else None
