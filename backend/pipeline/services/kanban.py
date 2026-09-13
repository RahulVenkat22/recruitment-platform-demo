"""``KanbanService.board``: the plan.md 9.7 board for one JD in one query pass:
eight columns with their cards, the rejected / withdrawn / on-hold tray, and
both filtered and unfiltered counts so headers can read "3 of 12"."""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass, field
from typing import Any

from django.db.models import Q, QuerySet

from common.enums import (
    KANBAN_COLUMNS,
    KANBAN_TRAY_LABEL,
    STATUS_TO_KANBAN_COLUMN,
    ApplicationStatus,
    CandidateSource,
)
from pipeline.models import Application
from pipeline.services.queries import application_queryset, with_next_actions

TRAY_KEY = "tray"


@dataclass
class BoardColumn:
    key: str
    label: str
    statuses: list[str]
    entry_status: str
    total: int = 0
    count: int = 0
    cards: list[Application] = field(default_factory=list)


@dataclass
class Board:
    columns: list[BoardColumn]
    tray: BoardColumn
    total: int
    count: int


def _csv(value: str | None) -> list[str]:
    return [item.strip() for item in (value or "").split(",") if item.strip()]


def apply_filters(qs: QuerySet[Application], params: dict[str, Any]) -> QuerySet[Application]:
    """The board filters (plan.md 9.7): ``search``, ``source``, ``min_match``, ``owner``."""
    term = (params.get("search") or "").strip()
    if term:
        qs = qs.filter(
            Q(candidate__full_name__icontains=term)
            | Q(candidate__headline__icontains=term)
            | Q(candidate__current_company__icontains=term)
            | Q(candidate__skills__skill__icontains=term)
        ).distinct()
    sources = [key for key in _csv(params.get("source")) if key in CandidateSource.values]
    if sources:
        qs = qs.filter(
            Q(entry_source__in=sources) | Q(candidate__sources__source__in=sources)
        ).distinct()
    min_match = params.get("min_match")
    if min_match not in (None, ""):
        try:
            qs = qs.filter(match__overall_pct__gte=float(min_match))
        except (TypeError, ValueError):
            pass
    owner = params.get("owner")
    if owner:
        qs = qs.filter(owner_id=owner)
    return qs


class KanbanService:
    @staticmethod
    def board(jd: Any, user: Any, params: dict[str, Any] | None = None) -> Board:
        params = params or {}
        base = application_queryset(user).filter(job_description=jd)
        totals = Counter(base.values_list("status", flat=True))
        rows = list(
            with_next_actions(apply_filters(base, params)).order_by(
                "-match__overall_pct", "-last_activity_at"
            )
        )
        columns = {
            column.key: BoardColumn(
                key=column.key,
                label=column.label,
                statuses=[str(status) for status in column.statuses],
                entry_status=str(column.entry_status),
                total=sum(totals[str(status)] for status in column.statuses),
            )
            for column in KANBAN_COLUMNS.values()
        }
        tray = BoardColumn(
            key=TRAY_KEY,
            label=KANBAN_TRAY_LABEL,
            statuses=[str(status) for status in ApplicationStatus.TRAY],
            entry_status=str(ApplicationStatus.ON_HOLD),
            total=sum(totals[str(status)] for status in ApplicationStatus.TRAY),
        )
        for row in rows:
            key = STATUS_TO_KANBAN_COLUMN.get(str(row.status))
            bucket = columns[key] if key else tray
            bucket.cards.append(row)
            bucket.count += 1
        return Board(
            columns=list(columns.values()),
            tray=tray,
            total=sum(totals.values()),
            count=len(rows),
        )
