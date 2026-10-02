"""Leased, at-least-once jobs with transactional publication and fenced writes.

Enqueue inside the transaction that creates the business record. SQS is an
optional wake-up transport: a periodic database sweep recovers missed messages.
Only identifiers belong in payloads; never upload bytes, tokens or resume text.
"""

from contextlib import contextmanager
from contextvars import ContextVar
from datetime import timedelta
from uuid import uuid4

from django.conf import settings
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from workqueue.models import WorkItem

_lease = ContextVar("work_lease", default=None)


class LeaseLost(Exception):
    pass


@transaction.atomic
def enqueue(kind, key, payload, *, reschedule=False):
    item, _ = WorkItem.objects.get_or_create(key=key, defaults={"kind": kind, "payload": payload})
    if reschedule:
        item = WorkItem.objects.select_for_update().get(pk=item.pk)
        if item.status in {WorkItem.Status.SUCCEEDED, WorkItem.Status.DEAD}:
            item.status = WorkItem.Status.PENDING
            item.attempts = 0
            item.available_at = timezone.now()
            item.lease_token = item.lease_until = item.published_at = None
            item.error = ""
            item.save()
    return item


def due():
    now = timezone.now()
    return WorkItem.objects.filter(
        Q(status=WorkItem.Status.PENDING, available_at__lte=now)
        | Q(status=WorkItem.Status.RUNNING, lease_until__lt=now)
    )


@transaction.atomic
def claim(item_id=None):
    rows = due().select_for_update(skip_locked=True).order_by("available_at", "created_at")
    item = (rows.filter(pk=item_id) if item_id else rows).first()
    if item is None:
        return None
    if item.attempts >= settings.WORK_MAX_ATTEMPTS:
        item.status = WorkItem.Status.DEAD
        item.error = "attempt limit reached; inspect worker logs before retrying"
    else:
        item.status = WorkItem.Status.RUNNING
        item.attempts += 1
        item.lease_token = uuid4()
        item.lease_until = timezone.now() + timedelta(seconds=settings.WORK_LEASE_SECONDS)
    item.save()
    return item if item.status == WorkItem.Status.RUNNING else None


def owned(item):
    return WorkItem.objects.filter(
        pk=item.pk,
        status=WorkItem.Status.RUNNING,
        lease_token=item.lease_token,
        lease_until__gt=timezone.now(),
    )


def heartbeat(item):
    return bool(
        owned(item).update(
            lease_until=timezone.now() + timedelta(seconds=settings.WORK_LEASE_SECONDS)
        )
    )


@contextmanager
def job_context(item):
    token = _lease.set(item)
    try:
        yield
    finally:
        _lease.reset(token)


@contextmanager
def write_guard():
    """Fence a business transaction against a worker whose lease has expired."""
    with transaction.atomic():
        item = _lease.get()
        if item is not None and owned(item).select_for_update().first() is None:
            raise LeaseLost("worker lease expired")
        yield


def finish(item, error=None):
    if error is None:
        values = {"status": WorkItem.Status.SUCCEEDED, "error": ""}
    else:
        values = {
            "status": (
                WorkItem.Status.DEAD
                if item.attempts >= settings.WORK_MAX_ATTEMPTS
                else WorkItem.Status.PENDING
            ),
            "error": type(error).__name__,
            "available_at": timezone.now() + timedelta(seconds=min(300, 10 * 2**item.attempts)),
        }
    return owned(item).update(**values, lease_until=None, lease_token=None, published_at=None)
