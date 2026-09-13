"""``AuditMiddleware`` (plan.md 6.9 "Audit"): one ``AuditLog`` row for every
mutating request under ``/api/``, plus an ``X-Request-ID`` header on every API
response.

The row carries the actor (the user DRF authenticated, or a lightweight decode
of the bearer token when the view never got that far), an action derived from
the method and path, the entity resource and id from the path, the JSON body
with secrets redacted, the client address, user agent, request id, path and
status code. Login, logout and password changes write their own rows from the
views (``audit.services``) and flag the request so nothing is recorded twice.
A failure to write the row is logged and never surfaces to the client.
"""

from __future__ import annotations

import json
import logging
import re
from collections.abc import Callable
from typing import Any

from django.http import HttpRequest, HttpResponse
from rest_framework_simplejwt.authentication import JWTAuthentication

from audit.dtos import REQUEST_ID_HEADER, RequestMeta, ensure_request_id, is_audited
from audit.models import AuditLog
from common.enums import AuditAction

logger = logging.getLogger(__name__)

API_PREFIX = "/api/"
MUTATING_METHODS = frozenset({"POST", "PUT", "PATCH", "DELETE"})
# Bodies above this size are not stored (resume text, bulk payloads).
MAX_BODY_BYTES = 64 * 1024

# Path segments that mean "change the status of the entity before me".
STATUS_CHANGE_VERBS = frozenset(
    {
        "transition",
        "bulk-transition",
        "status",
        "publish",
        "archive",
        "unarchive",
        "send",
        "accept",
        "decline",
        "withdraw",
        "cancel",
        "complete",
    }
)
# POST verbs that create a new entity even though the path carries an id.
CREATE_VERBS = frozenset({"duplicate"})
# POST verbs without an id that still update existing rows.
UPDATE_VERBS = frozenset({"read-all"})

# Key names (case-insensitive substrings) whose values are never stored.
SENSITIVE_KEY_PARTS = ("password", "secret", "token")
SENSITIVE_KEYS = frozenset({"refresh", "access", "authorization"})
REDACTED = "***"

_API_VERSION_PREFIX = re.compile(r"^/api/(?:v\d+/)?")
_UUID = re.compile(r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")
_INTEGER = re.compile(r"^\d+$")


# ------------------------------------------------------------------ pure rules


def _segments(path: str) -> list[str]:
    return [segment for segment in _API_VERSION_PREFIX.sub("", path).split("/") if segment]


def _is_identifier(segment: str) -> bool:
    return bool(_UUID.match(segment) or _INTEGER.match(segment))


def parse_entity(path: str) -> tuple[str, str]:
    """``(entity_type, entity_id)``: the first resource segment and the id right after it."""
    segments = _segments(path)
    if not segments:
        return "", ""
    entity_id = segments[1] if len(segments) > 1 and _is_identifier(segments[1]) else ""
    return segments[0], entity_id


def derive_action(method: str, path: str) -> str:
    """Map method and path onto ``AuditAction``: create / update / delete / status_change."""
    segments = _segments(path)
    last = segments[-1] if segments else ""
    if last in STATUS_CHANGE_VERBS:
        return AuditAction.STATUS_CHANGE
    if method == "DELETE":
        return AuditAction.DELETE
    if method in ("PATCH", "PUT"):
        return AuditAction.UPDATE
    if last in CREATE_VERBS:
        return AuditAction.CREATE
    if last in UPDATE_VERBS or any(_is_identifier(segment) for segment in segments):
        # POST to an action on an existing entity, e.g. /applications/{id}/rematch/.
        return AuditAction.UPDATE
    return AuditAction.CREATE


def _is_sensitive(key: str) -> bool:
    lowered = key.lower()
    return lowered in SENSITIVE_KEYS or any(part in lowered for part in SENSITIVE_KEY_PARTS)


def redact(value: Any) -> Any:
    """Copy of ``value`` with every password / token / secret field replaced by ``***``."""
    if isinstance(value, dict):
        return {
            str(key): REDACTED if _is_sensitive(str(key)) else redact(inner)
            for key, inner in value.items()
        }
    if isinstance(value, list):
        return [redact(item) for item in value]
    return value


def resolve_actor(request: HttpRequest) -> Any:
    """The acting user, without raising.

    DRF writes the user it authenticated back onto the Django request, so that
    is checked first; otherwise the bearer token is decoded with SimpleJWT's
    ``JWTAuthentication`` (needed when the view failed before authenticating).
    """
    user = getattr(request, "user", None)
    if user is not None and getattr(user, "is_authenticated", False):
        return user
    try:
        authenticated = JWTAuthentication().authenticate(request)
    except Exception:  # invalid, expired, unknown user: the row simply has no actor
        return None
    return authenticated[0] if authenticated else None


# ------------------------------------------------------------------ middleware


class AuditMiddleware:
    def __init__(self, get_response: Callable[[HttpRequest], HttpResponse]) -> None:
        self.get_response = get_response

    def __call__(self, request: HttpRequest) -> HttpResponse:
        if not request.path.startswith(API_PREFIX):
            return self.get_response(request)

        request_id = ensure_request_id(request)
        mutating = request.method in MUTATING_METHODS
        # The body has to be captured before the view consumes the stream.
        body = self._capture_body(request) if mutating else None

        response = self.get_response(request)
        response[REQUEST_ID_HEADER] = str(request_id)

        if mutating and not is_audited(request):
            self._record(request, response, body)
        return response

    @staticmethod
    def _capture_body(request: HttpRequest) -> dict:
        """The JSON body as a dict, ``{}`` for other content types or unparsable data."""
        if not request.content_type or not request.content_type.startswith("application/json"):
            return {}
        try:
            length = int(request.META.get("CONTENT_LENGTH") or 0)
        except ValueError:
            length = 0
        if length <= 0:
            return {}
        if length > MAX_BODY_BYTES:
            return {"_omitted": f"body larger than {MAX_BODY_BYTES} bytes"}
        try:
            parsed = json.loads(request.body)
        except (ValueError, UnicodeDecodeError, RuntimeError):
            return {}
        if isinstance(parsed, dict):
            return parsed
        if isinstance(parsed, list):
            return {"items": parsed}
        return {}

    @staticmethod
    def _record(request: HttpRequest, response: HttpResponse, body: dict | None) -> None:
        try:
            meta = RequestMeta.from_request(request)
            entity_type, entity_id = parse_entity(request.path)
            AuditLog.objects.create(
                actor=resolve_actor(request),
                action=derive_action(request.method, request.path),
                entity_type=entity_type,
                entity_id=entity_id,
                changes=redact(body or {}),
                ip_address=meta.ip_address,
                user_agent=meta.user_agent,
                request_id=meta.request_id,
                path=meta.path,
                status_code=response.status_code,
            )
        except Exception:
            logger.exception("audit log write failed for %s %s", request.method, request.path)
