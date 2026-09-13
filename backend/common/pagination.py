from __future__ import annotations

import datetime
from dataclasses import dataclass
from typing import Any

from django.db.models import Q, QuerySet
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework.exceptions import ValidationError
from rest_framework.pagination import PageNumberPagination
from rest_framework.request import Request


class StandardPagination(PageNumberPagination):
    """``?page=&page_size=`` pagination: default 20 rows, never more than 100 (plan.md 6.10)."""

    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 100


# ------------------------------------------------------------ keyset cursor


@dataclass(frozen=True)
class CursorPage:
    """One page of a keyset-paginated timeline (plan.md 6.10 activities)."""

    results: list[Any]
    next_before: datetime.datetime | None
    next_before_id: str | None
    has_more: bool


class CursorActivityPagination:
    """``?before=<iso datetime>&before_id=<uuid>&limit=<n>`` over a queryset ordered
    ``-occurred_at, -id``. ``before`` alone is enough; ``before_id`` breaks ties
    between rows that share an ``occurred_at``. Each page reports the cursor for
    the next older page, so "Load older events" never skips or repeats a row.
    """

    default_limit = 200
    max_limit = 200
    order_by: tuple[str, ...] = ("-occurred_at", "-id")

    def limit(self, request: Request) -> int:
        raw = request.query_params.get("limit", "")
        if not raw:
            return self.default_limit
        try:
            value = int(raw)
        except ValueError as exc:
            raise ValidationError({"limit": ["Enter a whole number."]}) from exc
        return max(1, min(value, self.max_limit))

    def before(self, request: Request) -> datetime.datetime | None:
        raw = request.query_params.get("before", "").strip()
        if not raw:
            return None
        parsed = parse_datetime(raw)
        if parsed is None:
            raise ValidationError({"before": ["Enter an ISO 8601 date and time."]})
        if timezone.is_naive(parsed):
            parsed = timezone.make_aware(parsed, datetime.UTC)
        return parsed

    def paginate(self, queryset: QuerySet, request: Request) -> CursorPage:
        limit = self.limit(request)
        before = self.before(request)
        before_id = request.query_params.get("before_id", "").strip()
        queryset = queryset.order_by(*self.order_by)
        if before is not None:
            condition = Q(occurred_at__lt=before)
            if before_id:
                condition |= Q(occurred_at=before, id__lt=before_id)
            queryset = queryset.filter(condition)
        rows = list(queryset[: limit + 1])
        has_more = len(rows) > limit
        rows = rows[:limit]
        last = rows[-1] if rows and has_more else None
        return CursorPage(
            results=rows,
            next_before=last.occurred_at if last is not None else None,
            next_before_id=str(last.id) if last is not None else None,
            has_more=has_more,
        )
