"""Request metadata captured on every audit row (plan.md 6.3 audit.AuditLog)."""

from __future__ import annotations

import ipaddress
import uuid
from dataclasses import dataclass
from typing import Any

# Set on the Django ``HttpRequest`` by the auth views once they have written their
# own login / logout row, so ``AuditMiddleware`` does not add a generic one.
AUDITED_FLAG = "_audit_recorded"
# Attribute holding the request id the middleware assigns (echoed as X-Request-ID).
REQUEST_ID_ATTR = "request_id"
REQUEST_ID_HEADER = "X-Request-ID"

_MAX_USER_AGENT = 512


def http_request(request: Any):
    """The Django ``HttpRequest`` behind a DRF ``Request`` (or the request itself)."""
    return getattr(request, "_request", request)


def client_ip(request: Any) -> str | None:
    """The caller's address: first ``X-Forwarded-For`` hop, else ``REMOTE_ADDR``.

    Mirrors DRF's throttle ``get_ident`` so the audit log and the login
    throttle agree on who the client is. Anything that is not an IP address
    is dropped rather than stored in the ``inet`` column.
    """
    meta = http_request(request).META
    forwarded = meta.get("HTTP_X_FORWARDED_FOR", "")
    candidate = forwarded.split(",")[0].strip() if forwarded else meta.get("REMOTE_ADDR", "")
    try:
        return str(ipaddress.ip_address(candidate))
    except ValueError:
        return None


def ensure_request_id(request: Any) -> uuid.UUID:
    """The request's id, assigning one (or adopting a UUID ``X-Request-ID``) on first use."""
    django_request = http_request(request)
    existing = getattr(django_request, REQUEST_ID_ATTR, None)
    if isinstance(existing, uuid.UUID):
        return existing
    incoming = django_request.META.get("HTTP_X_REQUEST_ID", "")
    try:
        request_id = uuid.UUID(incoming)
    except ValueError:
        request_id = uuid.uuid4()
    setattr(django_request, REQUEST_ID_ATTR, request_id)
    return request_id


def mark_audited(request: Any) -> None:
    """Tell the middleware a view has already written the row for this request."""
    setattr(http_request(request), AUDITED_FLAG, True)


def is_audited(request: Any) -> bool:
    return bool(getattr(http_request(request), AUDITED_FLAG, False))


@dataclass(frozen=True)
class RequestMeta:
    """Who called from where: the columns every audit row shares."""

    ip_address: str | None
    user_agent: str
    request_id: uuid.UUID
    path: str

    @classmethod
    def from_request(cls, request: Any) -> RequestMeta:
        django_request = http_request(request)
        return cls(
            ip_address=client_ip(django_request),
            user_agent=django_request.META.get("HTTP_USER_AGENT", "")[:_MAX_USER_AGENT],
            request_id=ensure_request_id(django_request),
            path=django_request.path,
        )
