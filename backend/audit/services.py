"""Audit rows written by views rather than by the middleware: the auth events
(plan.md 6.9 "every login attempt") and password changes, whose request bodies
must never be stored verbatim.

Each helper marks the request as audited so ``AuditMiddleware`` does not add a
second, generic row for the same request.
"""

from __future__ import annotations

from typing import Any

from audit.dtos import RequestMeta, mark_audited
from audit.models import AuditLog
from common.enums import AuditAction

USERS_ENTITY = "users"
REDACTED = "***"


def record_audit(
    request: Any,
    *,
    action: str,
    actor: Any = None,
    entity_type: str = "",
    entity_id: str = "",
    changes: dict | None = None,
    status_code: int | None = None,
) -> AuditLog:
    """Write one row from the current request and mark the request as audited."""
    meta = RequestMeta.from_request(request)
    row = AuditLog.objects.create(
        actor=actor,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        changes=changes or {},
        ip_address=meta.ip_address,
        user_agent=meta.user_agent,
        request_id=meta.request_id,
        path=meta.path,
        status_code=status_code,
    )
    mark_audited(request)
    return row


def record_login(request: Any, user: Any, *, remember_me: bool = False) -> AuditLog:
    return record_audit(
        request,
        action=AuditAction.LOGIN,
        actor=user,
        entity_type=USERS_ENTITY,
        entity_id=str(user.id),
        changes={"remember_me": remember_me},
        status_code=200,
    )


def record_login_failed(
    request: Any, email: str, *, reason: str = "invalid_credentials", status_code: int = 401
) -> AuditLog:
    return record_audit(
        request,
        action=AuditAction.LOGIN_FAILED,
        entity_type=USERS_ENTITY,
        changes={"email": email, "reason": reason},
        status_code=status_code,
    )


def record_logout(request: Any, user: Any | None) -> AuditLog:
    return record_audit(
        request,
        action=AuditAction.LOGOUT,
        actor=user,
        entity_type=USERS_ENTITY,
        entity_id=str(user.id) if user is not None else "",
        status_code=204,
    )


def record_password_change(request: Any, user: Any) -> AuditLog:
    return record_audit(
        request,
        action=AuditAction.UPDATE,
        actor=user,
        entity_type=USERS_ENTITY,
        entity_id=str(user.id),
        changes={"password": REDACTED},
        status_code=204,
    )
