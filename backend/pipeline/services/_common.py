"""Helpers shared by the pipeline services: naming, backdating, and the silent
forward move that domain events (interview scheduled, offer sent, ...) trigger
as a side effect (plan.md 6.5 "Specific triggers")."""

from __future__ import annotations

from collections.abc import Sequence
from datetime import datetime
from typing import Any

from django.utils import timezone

from common.enums import ApplicationStatus, NotificationType
from notifications.services import notify_all
from pipeline.exceptions import InvalidTransition
from pipeline.models import Application


def actor_name(actor: Any) -> str:
    return getattr(actor, "full_name", None) or "System"


def join_names(names: Sequence[str]) -> str:
    if len(names) <= 1:
        return "".join(names)
    return ", ".join(names[:-1]) + " and " + names[-1]


def status_label(status: str) -> str:
    return str(ApplicationStatus(status).label)


def person_ref(user: Any) -> dict[str, Any] | None:
    """``{id, name, avatar_url}`` for activity metadata (rendered as a UserChip)."""
    if user is None:
        return None
    return {
        "id": str(user.pk),
        "name": user.full_name,
        "avatar_url": getattr(user, "avatar_url", None),
    }


def stamp(row: Any, when: datetime | None) -> None:
    """Backdate ``created_at``/``updated_at`` to ``when`` (seeded history only)."""
    if when is None:
        return
    type(row).objects.filter(pk=row.pk).update(created_at=when, updated_at=when)
    row.created_at = row.updated_at = when


def candidate_link(application: Application) -> str:
    return f"/candidates/{application.candidate_id}?jd={application.job_description_id}"


def owners_of(application: Application) -> list[Any]:
    """The application owner and the JD owner (plan.md 6.8 "status change")."""
    return [application.owner, application.job_description.created_by]


def participants_of(application: Application) -> list[Any]:
    jd = application.job_description
    people = [jd.created_by]
    people.extend(row.user for row in jd.participants.select_related("user"))
    return people


def require_active(application: Application, what: str) -> None:
    """Domain actions need an application that is still on the board."""
    if str(application.status) not in ApplicationStatus.ACTIVE:
        raise InvalidTransition(
            f"{what} is not possible while the candidate is "
            f"{status_label(str(application.status))}. Resume or reopen them first."
        )


def touch(application: Application, when: datetime | None = None) -> None:
    """Bump ``last_activity_at`` without changing the status."""
    application.last_activity_at = when or timezone.now()
    application.save(update_fields=["last_activity_at", "updated_at"])


def advance(
    application: Application,
    target: str,
    actor: Any,
    *,
    when: datetime | None = None,
    notify: bool = True,
) -> bool:
    """Move the application forward to ``target`` if it is earlier in the pipeline.

    No activity row is written: the calling domain event (``interview.scheduled``,
    ``offer.sent``, ...) carries ``from``/``to`` in its metadata and lands under
    the same timeline category the status entry would. Owners are still notified
    (plan.md 6.8). Returns ``True`` when the status changed.
    """
    from pipeline.services.pipeline import PipelineService

    current = str(application.status)
    if current not in ApplicationStatus.ACTIVE:
        return False
    if ApplicationStatus.order_index(target) <= ApplicationStatus.order_index(current):
        touch(application, when)
        return False
    PipelineService.transition(
        application, target, actor, occurred_at=when, notify=False, record=False
    )
    if notify:
        candidate = application.candidate
        notify_all(
            owners_of(application),
            NotificationType.STATUS_CHANGE,
            f"{candidate.full_name}: {status_label(current)} → {status_label(target)}",
            "",
            candidate_link(application),
            actor,
            occurred_at=when,
        )
    return True
