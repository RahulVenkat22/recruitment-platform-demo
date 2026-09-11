"""Read-only aggregates served by the dashboard app. Phase 1 ships the enum
catalogue behind ``GET /api/v1/meta/enums/`` (plan.md 6.4, 7.2); the summary,
funnel and top-candidate aggregates follow in phase 9."""

from __future__ import annotations

from common import enums


def build_enum_catalogue() -> dict:
    """Everything the SPA needs so it never hard-codes an enum (plan.md 6.4, 7.2).

    ``enums``: every choice set as ``[{key, label}]`` in declaration order.
    ``colors``: badge tokens ``{bg, text, name}`` for statuses, sources and categories.
    ``status_order`` / ``status_groups``: the 18 statuses in pipeline order and the
    active / tray / terminal partition used by the transition rules.
    ``status_entry_category``: timeline category recorded when a status is entered.
    ``kanban``: the eight board columns, the tray and the status -> column lookup.
    """
    return {
        "enums": {
            name: [{"key": member.value, "label": member.label} for member in choices]
            for name, choices in enums.ALL_ENUMS.items()
        },
        "colors": {
            "application_status": _color_tokens(enums.STATUS_COLORS),
            "candidate_source": _color_tokens(enums.SOURCE_COLORS),
            "activity_category": _color_tokens(enums.CATEGORY_COLORS),
        },
        "status_order": list(enums.ApplicationStatus.ORDER),
        "status_groups": {
            "active": list(enums.ApplicationStatus.ACTIVE),
            "tray": [s for s in enums.ApplicationStatus.ORDER if s in enums.ApplicationStatus.TRAY],
            "terminal": [
                s for s in enums.ApplicationStatus.ORDER if s in enums.ApplicationStatus.TERMINAL
            ],
        },
        "status_entry_category": {
            str(status): str(category) for status, category in enums.STATUS_ENTRY_CATEGORY.items()
        },
        "kanban": {
            "columns": [
                {
                    "key": column.key,
                    "label": column.label,
                    "statuses": [str(s) for s in column.statuses],
                    "entry_status": str(column.entry_status),
                }
                for column in enums.KANBAN_COLUMNS.values()
            ],
            "tray": {
                "label": enums.KANBAN_TRAY_LABEL,
                "statuses": [
                    str(s)
                    for s in enums.ApplicationStatus.ORDER
                    if s in enums.ApplicationStatus.TRAY
                ],
            },
            "status_to_column": {
                str(status): column for status, column in enums.STATUS_TO_KANBAN_COLUMN.items()
            },
        },
    }


def _color_tokens(colors: dict[str, enums.ColorPair]) -> dict[str, dict[str, str]]:
    return {str(key): pair._asdict() for key, pair in colors.items()}
