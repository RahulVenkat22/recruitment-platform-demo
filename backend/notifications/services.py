"""``notify()``: the only writer of in-app notifications (plan.md 6.8)."""

from __future__ import annotations

from collections.abc import Iterable
from datetime import datetime
from typing import Any

from notifications.models import Notification


def notify(
    recipient: Any,
    type: str,  # noqa: A002 - mirrors the model column
    title: str,
    message: str = "",
    link_url: str = "",
    actor: Any = None,
    occurred_at: datetime | None = None,
) -> Notification | None:
    """Create one notification; the actor never notifies themself.

    ``occurred_at`` backdates the row (seeded history); live callers leave it
    ``None`` so ``created_at`` is the moment of the request.
    """
    if recipient is None or not getattr(recipient, "pk", None):
        return None
    if actor is not None and getattr(actor, "pk", None) == recipient.pk:
        return None
    row = Notification.objects.create(
        recipient=recipient,
        actor=actor,
        type=type,
        title=title[:200],
        message=message or "",
        link_url=link_url or "",
    )
    if occurred_at is not None:
        Notification.objects.filter(pk=row.pk).update(
            created_at=occurred_at, updated_at=occurred_at
        )
        row.created_at = row.updated_at = occurred_at
    return row


def notify_all(
    recipients: Iterable[Any],
    type: str,  # noqa: A002
    title: str,
    message: str = "",
    link_url: str = "",
    actor: Any = None,
    occurred_at: datetime | None = None,
) -> list[Notification]:
    """One notification per distinct recipient (skipping the actor and ``None``)."""
    seen: set[Any] = set()
    rows: list[Notification] = []
    for recipient in recipients:
        pk = getattr(recipient, "pk", None)
        if recipient is None or pk is None or pk in seen:
            continue
        seen.add(pk)
        row = notify(recipient, type, title, message, link_url, actor, occurred_at)
        if row is not None:
            rows.append(row)
    return rows
