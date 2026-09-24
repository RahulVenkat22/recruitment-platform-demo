"""The dashboard as a designed PDF: A4 pages drawn straight with PyMuPDF in the
app's own palette (frontend/src/index.css and charts/theme.ts). A title band,
eight KPI tiles with deltas and sparklines, then every widget as a card: bar
rows, stacked bars, a trend line, a donut, a heatmap and tables."""

from __future__ import annotations

import math
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from typing import Any

import pymupdf

from dashboard import exports
from dashboard.exports import ATTENTION_ITEMS, ROLE_STAGES, WEEKDAYS, Snapshot

# ------------------------------------------------------------------ palette

INK = "#0a0a0a"
MUTED = "#4a4d48"
SUBTLE = "#5d615c"
LINE = "#e1e1db"
LINE_STRONG = "#b7b7ae"
SURFACE = "#ffffff"
SURFACE_2 = "#f0f0ec"
ACCENT = "#c4d600"
ON_DARK = "#c9cbc3"
SUCCESS, SUCCESS_SOFT = "#1f7a4d", "#e3f3ea"
WARNING, WARNING_SOFT = "#8f5d12", "#fbf1dc"
DANGER, DANGER_SOFT = "#d50032", "#fce7ec"
SERIES = ("#6b7500", "#3f3fb5", "#b7791f", "#1d4ed8", "#b42318")
ORDINAL = ("#abac0c", "#949507", "#7e7f03", "#696900", "#545400", "#404005")
STAGE = {
    "found": ORDINAL[0],
    "awaiting": ORDINAL[0],
    "shortlisted": ORDINAL[1],
    "contacted": ORDINAL[2],
    "interviewed": ORDINAL[3],
    "selected": ORDINAL[4],
    "onboarded": ORDINAL[5],
}
OUTCOME = {
    "strong_proceed": "#1f7a4d",
    "proceed": "#4c9d6f",
    "hold": "#b7b7ae",
    "reject": "#d50032",
}
OFFER = {
    "draft": "#b7b7ae",
    "sent": "#1d4ed8",
    "negotiating": "#b7791f",
    "accepted": "#1f7a4d",
    "declined": "#d50032",
    "withdrawn": "#5d615c",
    "expired": "#5d615c",
}
HEAT = ("#f3f7d2", "#dde48a", "#c4d600", "#8fa000", "#6b7500")

# ------------------------------------------------------------------ geometry, in points

PAGE_W, PAGE_H = 595.0, 842.0
MARGIN = 36.0
CONTENT_W = PAGE_W - 2 * MARGIN
BOTTOM = PAGE_H - 44.0
GAP = 12.0
BAND_H = 132.0
PAD = 14.0
HEAD = 44.0
ROW = 16.0
LEGEND_ROW = 12.0
TILE_H = 78.0
PLOT_H = 146.0
ROLE_LIMIT = 12

REGULAR = pymupdf.Font("helv")
BOLD = pymupdf.Font("hebo")
# Droid Sans Fallback ships with PyMuPDF and covers the scripts Helvetica lacks.
FALLBACK = pymupdf.Font("cjk")


def rgb(color: str) -> tuple[float, float, float]:
    return tuple(int(color[i : i + 2], 16) / 255 for i in (1, 3, 5))  # type: ignore[return-value]


def font_for(text: str, bold: bool) -> pymupdf.Font:
    font = BOLD if bold else REGULAR
    missing = [ch for ch in text if not font.has_glyph(ord(ch))]
    if missing and all(FALLBACK.has_glyph(ord(ch)) for ch in missing):
        return FALLBACK
    return font


def width_of(text: str, size: float, bold: bool = False) -> float:
    return font_for(text, bold).text_length(text, fontsize=size)


def fit_text(text: str, width: float, size: float, bold: bool = False) -> str:
    """The text, or as much of it as fits followed by an ellipsis."""
    if width_of(text, size, bold) <= width:
        return text
    while text and width_of(text + "…", size, bold) > width:
        text = text[:-1]
    return text.rstrip() + "…"


def wrap_text(text: str, width: float, size: float, bold: bool = False) -> list[str]:
    lines: list[str] = []
    current = ""
    for word in text.split():
        trial = f"{current} {word}".strip()
        if not current or width_of(trial, size, bold) <= width:
            current = trial
        else:
            lines.append(current)
            current = word
    return [*lines, current] if current else [""]


def count(value: Any) -> str:
    """1,284 · 12.9 · 77.8% · an em dash for nothing."""
    if value is None:
        return "—"
    if isinstance(value, str):
        return value
    return f"{int(value):,}" if float(value).is_integer() else f"{value:,.1f}"


def nice_max(value: float) -> float:
    if value <= 0:
        return 1
    scale = 10 ** math.floor(math.log10(value))
    return next(step * scale for step in (1, 2, 4, 5, 10) if step * scale >= value)


Legend = Sequence[tuple[str, str]]


def legend_rows(width: float, items: Legend) -> list[list[tuple[str, str]]]:
    """The legend entries split into rows that fit the width."""
    rows: list[list[tuple[str, str]]] = [[]]
    used = 0.0
    for label, color in items:
        item_w = 11 + width_of(label, 7.5) + 12
        if rows[-1] and used + item_w > width:
            rows.append([])
            used = 0.0
        rows[-1].append((label, color))
        used += item_w
    return rows


class Sheet:
    """Text and shape helpers on one page, in points from the top-left corner.

    Every shape goes into one ``Shape`` and every colour of text into one
    ``TextWriter``; ``flush()`` writes them to the page. PyMuPDF re-reads the
    whole content stream on each commit, so committing mark by mark is quadratic."""

    def __init__(self, page: pymupdf.Page) -> None:
        self.page = page
        self.shape = page.new_shape()
        self.writers: dict[str, pymupdf.TextWriter] = {}

    def flush(self) -> None:
        self.shape.commit()
        for writer in self.writers.values():
            writer.write_text(self.page)
        self.shape = self.page.new_shape()
        self.writers = {}

    def text(
        self,
        x: float,
        y: float,
        text: str,
        *,
        size: float = 8.5,
        bold: bool = False,
        color: str = INK,
        align: str = "left",
    ) -> float:
        """Queue one line with its baseline at ``y``; returns the width it takes."""
        if not text:
            return 0.0
        font = font_for(text, bold)
        width = font.text_length(text, fontsize=size)
        if align == "right":
            x -= width
        elif align == "center":
            x -= width / 2
        writer = self.writers.get(color)
        if writer is None:
            writer = self.writers[color] = pymupdf.TextWriter(self.page.rect, color=rgb(color))
        writer.append((x, y), text, font=font, fontsize=size)
        return width

    def rect(
        self,
        x0: float,
        y0: float,
        x1: float,
        y1: float,
        *,
        fill: str | None = None,
        stroke: str | None = None,
        width: float = 0.75,
        radius: float = 0.0,
        opacity: float = 1.0,
    ) -> None:
        rect = pymupdf.Rect(x0, y0, x1, y1)
        rounded = None
        if radius and rect.width > 0 and rect.height > 0:
            rounded = (min(radius / rect.width, 0.5), min(radius / rect.height, 0.5))
        self.shape.draw_rect(rect, radius=rounded)
        self.shape.finish(
            color=rgb(stroke) if stroke else None,
            fill=rgb(fill) if fill else None,
            width=width,
            fill_opacity=opacity,
        )

    def line(
        self, x0: float, y0: float, x1: float, y1: float, *, color: str = LINE, width: float = 0.75
    ) -> None:
        self.shape.draw_line((x0, y0), (x1, y1))
        self.shape.finish(color=rgb(color), width=width, closePath=False)

    def polyline(
        self,
        points: Sequence[tuple[float, float]],
        *,
        color: str | None = None,
        width: float = 1.5,
        fill: str | None = None,
        opacity: float = 1.0,
        close: bool = False,
    ) -> None:
        self.shape.draw_polyline(points)
        self.shape.finish(
            color=rgb(color) if color else None,
            fill=rgb(fill) if fill else None,
            width=width,
            fill_opacity=opacity,
            closePath=close,
            lineCap=1,
            lineJoin=1,
        )

    def circle(self, cx: float, cy: float, radius: float, fill: str) -> None:
        self.shape.draw_circle((cx, cy), radius)
        self.shape.finish(color=None, fill=rgb(fill), width=0)

    def sector(
        self, cx: float, cy: float, radius: float, start: float, sweep: float, fill: str
    ) -> None:
        """A pie slice: ``start`` degrees clockwise from twelve o'clock, sweeping clockwise."""
        angle = math.radians(90 - start)
        point = (cx + radius * math.cos(angle), cy - radius * math.sin(angle))
        self.shape.draw_sector((cx, cy), point, -sweep, fullSector=True)
        self.shape.finish(color=None, fill=rgb(fill), width=0)

    def swatch(self, x: float, y: float, color: str, size: float = 7.0) -> None:
        self.rect(x, y, x + size, y + size, fill=color, radius=2)

    def pill(
        self,
        x: float,
        y: float,
        text: str,
        *,
        fill: str,
        color: str,
        size: float = 6.5,
        height: float = 11.0,
    ) -> float:
        width = width_of(text, size, True) + 8
        self.rect(x, y, x + width, y + height, fill=fill, radius=height / 2)
        self.text(x + 4, y + height - 3, text, size=size, bold=True, color=color)
        return width

    def legend(self, x: float, y: float, width: float, items: Legend, align: str = "left") -> float:
        """Swatches and labels, wrapped into rows; returns the height used."""
        rows = legend_rows(width, items)
        for row_index, row in enumerate(rows):
            ry = y + row_index * LEGEND_ROW
            row_w = sum(11 + width_of(label, 7.5) + 12 for label, _ in row) - 12
            lx = x + width - row_w if align == "right" else x
            for label, color in row:
                self.swatch(lx, ry + 1.5, color)
                lx += 11 + self.text(lx + 11, ry + 8, label, size=7.5, color=MUTED) + 12
        return len(rows) * LEGEND_ROW

    def note(self, x: float, y: float, text: str) -> None:
        self.text(x, y + 12, text, size=8.5, color=SUBTLE)


# ------------------------------------------------------------------ panels

Draw = Callable[[Sheet, float, float, float], None]


@dataclass(frozen=True)
class Panel:
    """One card: a title, a one-line subtitle and a body drawn at a given width."""

    title: str
    subtitle: str
    measure: Callable[[float], float]
    draw: Draw
    card: bool = True

    def height(self, width: float) -> float:
        if not self.card:
            return self.measure(width)
        return HEAD + self.measure(width - 2 * PAD) + PAD

    def render(self, sheet: Sheet, x: float, y: float, width: float, height: float) -> None:
        if not self.card:
            self.draw(sheet, x, y, width)
            return
        sheet.rect(x, y, x + width, y + height, fill=SURFACE, stroke=LINE, radius=8)
        sheet.text(x + PAD, y + PAD + 9, self.title, size=10.5, bold=True)
        subtitle = fit_text(self.subtitle, width - 2 * PAD, 7.5)
        sheet.text(x + PAD, y + PAD + 21, subtitle, size=7.5, color=SUBTLE)
        self.draw(sheet, x + PAD, y + HEAD, width - 2 * PAD)


def fixed(height: float) -> Callable[[float], float]:
    return lambda _width: height


# --- bar rows


@dataclass(frozen=True)
class Bar:
    label: str
    value: float
    color: str
    # A quiet qualifier between the bar and the value: "51% of previous", "3 roles ask".
    note: str = ""


def draw_bars(sheet: Sheet, x: float, y: float, width: float, bars: Sequence[Bar]) -> None:
    label_w = min(max(width_of(bar.label, 8.5) for bar in bars) + 10, width * 0.4)
    value_w = max(width_of(count(bar.value), 8.5, True) for bar in bars) + 8
    note_w = max(width_of(bar.note, 7) for bar in bars) + 10 if any(bar.note for bar in bars) else 0
    track_x0, track_x1 = x + label_w, x + width - value_w - note_w
    top = max(bar.value for bar in bars) or 1
    for index, bar in enumerate(bars):
        cy = y + index * ROW + ROW / 2
        sheet.text(x, cy + 3, fit_text(bar.label, label_w - 10, 8.5), size=8.5)
        sheet.rect(track_x0, cy - 4, track_x1, cy + 4, fill=SURFACE_2, radius=2)
        if bar.value > 0:
            length = max((track_x1 - track_x0) * bar.value / top, 3)
            sheet.rect(track_x0, cy - 4, track_x0 + length, cy + 4, fill=bar.color, radius=2)
        if bar.note:
            sheet.text(
                track_x1 + note_w - 4, cy + 2.5, bar.note, size=7, color=SUBTLE, align="right"
            )
        sheet.text(x + width, cy + 3, count(bar.value), size=8.5, bold=True, align="right")


def bars_panel(title: str, subtitle: str, bars: Sequence[Bar], empty: str) -> Panel:
    def draw(sheet: Sheet, x: float, y: float, width: float) -> None:
        if bars:
            draw_bars(sheet, x, y, width, bars)
        else:
            sheet.note(x, y, empty)

    return Panel(title, subtitle, fixed(max(len(bars), 1) * ROW), draw)


# --- stacked rows


@dataclass(frozen=True)
class Segment:
    key: str
    label: str
    color: str


@dataclass(frozen=True)
class Stack:
    label: str
    sublabel: str
    values: dict[str, float]
    # Plain figures to the right of the bar, one per header.
    extras: tuple[str, ...]


def draw_stacked(
    sheet: Sheet,
    x: float,
    y: float,
    width: float,
    stacks: Sequence[Stack],
    segments: Sequence[Segment],
    headers: Sequence[str],
) -> None:
    sheet.legend(x, y, width, [(segment.label, segment.color) for segment in segments])
    two_line = any(stack.sublabel for stack in stacks)
    row_h = 24.0 if two_line else 18.0
    extra_w = 44.0
    extras_x = x + width - extra_w * len(headers)
    label_w = min(width * 0.36, max(width_of(stack.label, 8.5, True) for stack in stacks) + 10)
    bar_x0, bar_x1 = x + label_w, extras_x - 8
    for index, header in enumerate(headers):
        hx = extras_x + extra_w * (index + 1)
        sheet.text(hx, y + 24, header, size=7, color=SUBTLE, align="right")
    top = max(sum(stack.values.values()) for stack in stacks) or 1
    scale = (bar_x1 - bar_x0) / top
    ry = y + 30
    for stack in stacks:
        cy = ry + row_h / 2
        if two_line:
            label = fit_text(stack.label, label_w - 10, 8.5, True)
            sheet.text(x, ry + 10, label, size=8.5, bold=True)
            sublabel = fit_text(stack.sublabel, label_w - 10, 7)
            sheet.text(x, ry + 19.5, sublabel, size=7, color=SUBTLE)
        else:
            sheet.text(x, cy + 3, fit_text(stack.label, label_w - 10, 8.5), size=8.5)
        sheet.rect(bar_x0, cy - 4, bar_x1, cy + 4, fill=SURFACE_2, radius=2)
        bx = bar_x0
        for segment in segments:
            value = stack.values.get(segment.key, 0)
            if value <= 0:
                continue
            length = value * scale
            sheet.rect(
                bx, cy - 4, bx + max(length - 1.5, 1), cy + 4, fill=segment.color, radius=1.5
            )
            bx += length
        for index, extra in enumerate(stack.extras):
            last = index == len(stack.extras) - 1
            ex = extras_x + extra_w * (index + 1)
            sheet.text(ex, cy + 3, extra, size=8.5, bold=last, align="right")
        ry += row_h


def stacked_panel(
    title: str,
    subtitle: str,
    stacks: Sequence[Stack],
    segments: Sequence[Segment],
    headers: Sequence[str],
    empty: str,
) -> Panel:
    row_h = 24.0 if any(stack.sublabel for stack in stacks) else 18.0

    def draw(sheet: Sheet, x: float, y: float, width: float) -> None:
        if stacks:
            draw_stacked(sheet, x, y, width, stacks, segments, headers)
        else:
            sheet.note(x, y, empty)

    return Panel(title, subtitle, fixed(30 + len(stacks) * row_h if stacks else ROW), draw)


# --- tables


@dataclass(frozen=True)
class Column:
    header: str
    fraction: float
    align: str = "left"


def table_row_lines(width: float, columns: Sequence[Column], row: Sequence[str]) -> int:
    lines = 1
    for column, cell in zip(columns, row, strict=True):
        if column.align == "left":
            lines = max(lines, len(wrap_text(cell, width * column.fraction - 8, 8.5)))
    return lines


def table_height(width: float, columns: Sequence[Column], rows: Sequence[Sequence[str]]) -> float:
    return 16 + sum(table_row_lines(width, columns, row) * 11 + 6 for row in rows)


def draw_table(
    sheet: Sheet,
    x: float,
    y: float,
    width: float,
    columns: Sequence[Column],
    rows: Sequence[Sequence[str]],
) -> None:
    cx = x
    for column in columns:
        cw = width * column.fraction
        anchor = cx + cw - 4 if column.align == "right" else cx
        sheet.text(
            anchor, y + 10, column.header, size=7, bold=True, color=MUTED, align=column.align
        )
        cx += cw
    sheet.line(x, y + 15, x + width, y + 15, color=LINE_STRONG)
    ry = y + 16
    for row in rows:
        cx = x
        for column, cell in zip(columns, row, strict=True):
            cw = width * column.fraction
            if column.align == "right":
                sheet.text(cx + cw - 4, ry + 12, cell, size=8.5, align="right")
            else:
                for index, line in enumerate(wrap_text(cell, cw - 8, 8.5)):
                    sheet.text(cx, ry + 12 + index * 11, line, size=8.5)
            cx += cw
        ry += table_row_lines(width, columns, row) * 11 + 6
        sheet.line(x, ry - 1, x + width, ry - 1)


def table_panel(
    title: str,
    subtitle: str,
    columns: Sequence[Column],
    rows: Sequence[Sequence[str]],
    empty: str,
) -> Panel:
    def draw(sheet: Sheet, x: float, y: float, width: float) -> None:
        if rows:
            draw_table(sheet, x, y, width, columns, rows)
        else:
            sheet.note(x, y, empty)

    return Panel(
        title,
        subtitle,
        lambda width: table_height(width, columns, rows) if rows else ROW,
        draw,
    )


# --- figures in a grid


def draw_stats(
    sheet: Sheet, x: float, y: float, width: float, stats: Sequence[tuple[str, str]], columns: int
) -> None:
    cell_w = width / columns
    for index, (label, value) in enumerate(stats):
        cx = x + (index % columns) * cell_w
        cy = y + (index // columns) * 36
        sheet.text(cx, cy + 9, fit_text(label, cell_w - 8, 7), size=7, color=SUBTLE)
        sheet.text(cx, cy + 27, value, size=14, bold=True)


def stats_height(stats: Sequence[Any], columns: int) -> float:
    return math.ceil(len(stats) / columns) * 36


# --- sparkline


def spark(sheet: Sheet, x: float, y: float, w: float, h: float, series: Sequence[int]) -> None:
    top = max(series) or 1
    step = w / max(len(series) - 1, 1)
    points = [(x + index * step, y + h - value / top * h) for index, value in enumerate(series)]
    if len(points) == 1:
        points.append((x + w, points[0][1]))
    area = [*points, (points[-1][0], y + h), (points[0][0], y + h)]
    sheet.polyline(area, fill=SERIES[0], opacity=0.12, width=0, close=True)
    sheet.polyline(points, color=SERIES[0], width=1.2)


# ------------------------------------------------------------------ the widgets

TILES = (
    ("open_roles", "Open roles", "now", "up"),
    ("in_pipeline", "In pipeline", "now", "up"),
    ("new_candidates", "New candidates", "window", "up"),
    ("interviews", "Interviews", "window", "up"),
    ("offers_pending", "Offers pending", "now", "up"),
    ("hires", "Hires", "window", "up"),
    ("offer_acceptance", "Offer acceptance", "window", "up"),
    ("time_to_hire", "Time to hire", "window", "down"),
)
TONES = {"good": (SUCCESS_SOFT, SUCCESS), "bad": (DANGER_SOFT, DANGER), "flat": (SURFACE_2, SUBTLE)}


def kpi_panel(snap: Snapshot) -> Panel:
    def draw(sheet: Sheet, x: float, y: float, width: float) -> None:
        tile_w = (width - 3 * GAP) / 4
        for index, (key, label, covers, good) in enumerate(TILES):
            metric = snap.summary[key]
            tx = x + (index % 4) * (tile_w + GAP)
            ty = y + (index // 4) * (TILE_H + GAP)
            sheet.rect(tx, ty, tx + tile_w, ty + TILE_H, fill=SURFACE, stroke=LINE, radius=8)
            sheet.text(tx + 12, ty + 16, label.upper(), size=6.5, color=SUBTLE)
            value = count(exports.figure(metric))
            value_w = sheet.text(tx + 12, ty + 40, value, size=17, bold=True)
            change = exports.change_label(metric)
            if change:
                delta = metric["delta"]
                tone = "flat" if delta == 0 else "good" if (delta > 0) == (good == "up") else "bad"
                fill, color = TONES[tone]
                sheet.pill(tx + 12 + value_w + 6, ty + 29.5, change, fill=fill, color=color)
            detail = metric["detail"] or (
                f"vs last {snap.scope.span} days"
                if change
                else "Right now"
                if covers == "now"
                else ""
            )
            sheet.text(tx + 12, ty + 53, fit_text(detail, tile_w - 24, 7), size=7, color=SUBTLE)
            if metric["series"]:
                spark(sheet, tx + 12, ty + 58, tile_w - 24, 12, metric["series"])

    return Panel("", "", fixed(2 * TILE_H + GAP), draw, card=False)


TREND = (
    ("candidates", "Candidates found", SERIES[0]),
    ("shortlisted", "Shortlisted", SERIES[1]),
    ("interviews", "Interviews", SERIES[2]),
    ("offers", "Offers sent", SERIES[3]),
    ("hires", "Hires", SERIES[4]),
)


def trend_panel(snap: Snapshot) -> Panel:
    points = snap.trends["points"]
    legend = [(f"{label} {sum(p[key] for p in points):,}", color) for key, label, color in TREND]

    def draw(sheet: Sheet, x: float, y: float, width: float) -> None:
        legend_h = sheet.legend(x, y, width, legend)
        px0, px1 = x + 28, x + width
        py0, py1 = y + legend_h + 14, y + legend_h + PLOT_H - 16
        top = nice_max(max((p[key] for p in points for key, _, _ in TREND), default=0))
        ticks = list(range(int(top) + 1)) if top <= 5 else [0, top / 2, top]
        for tick in ticks:
            gy = py1 - (py1 - py0) * tick / top
            sheet.line(px0, gy, px1, gy, color=LINE_STRONG if tick == 0 else LINE)
            sheet.text(px0 - 5, gy + 2.5, count(tick), size=6.5, color=SUBTLE, align="right")
        n = len(points)
        step = (px1 - px0) / max(n - 1, 1)
        for i in sorted({round(k * (n - 1) / 5) for k in range(6)}):
            label = f"{points[i]['date']:%d %b}"
            align = "left" if i == 0 else "right" if i == n - 1 else "center"
            sheet.text(px0 + i * step, py1 + 11, label, size=6.5, color=SUBTLE, align=align)
        for key, _, color in TREND:
            line = [
                (px0 + i * step, py1 - (py1 - py0) * p[key] / top) for i, p in enumerate(points)
            ]
            if n == 1:
                sheet.circle(line[0][0], line[0][1], 2.5, color)
            else:
                sheet.polyline(line, color=color, width=1.4)

    return Panel(
        "Hiring activity",
        f"{snap.short_window}, by day",
        lambda width: len(legend_rows(width, legend)) * LEGEND_ROW + PLOT_H,
        draw,
    )


def attention_panel(snap: Snapshot) -> Panel:
    def rows(width: float) -> list[tuple[str, str, int, list[str]]]:
        return [
            (key, label, snap.attention[key], wrap_text(meaning, width - 44, 7))
            for key, label, meaning in ATTENTION_ITEMS
        ]

    def draw(sheet: Sheet, x: float, y: float, width: float) -> None:
        ry = y
        waiting = 0
        for index, (_key, label, value, lines) in enumerate(rows(width)):
            waiting += value
            sheet.text(x, ry + 10, label, size=8.5, bold=True, color=MUTED if value == 0 else INK)
            for line_index, line in enumerate(lines):
                sheet.text(x, ry + 20 + line_index * 9, line, size=7, color=SUBTLE)
            fill, color = (SURFACE_2, SUBTLE) if value == 0 else (WARNING_SOFT, WARNING)
            pill_w = width_of(count(value), 7, True) + 10
            sheet.pill(
                x + width - pill_w, ry + 5, count(value), fill=fill, color=color, size=7, height=13
            )
            ry += 15 + len(lines) * 9 + 3
            if index < len(ATTENTION_ITEMS) - 1:
                sheet.line(x, ry, x + width, ry)
        summary = (
            "All clear right now." if waiting == 0 else f"{waiting:,} things waiting right now."
        )
        sheet.text(x, ry + 12, summary, size=7.5, color=SUBTLE)

    return Panel(
        "Needs attention",
        "Right now",
        lambda width: sum(15 + len(lines) * 9 + 3 for *_, lines in rows(width)) + 16,
        draw,
    )


def pipeline_panel(snap: Snapshot) -> Panel:
    bars = [
        Bar(
            stage["label"],
            stage["value"],
            STAGE.get(stage["key"], SERIES[0]),
            f"avg {count(stage['avg_days'])}d · {stage['stuck']} stuck"
            if stage["avg_days"] is not None
            else "",
        )
        for stage in snap.insights["stages"]
    ]
    return bars_panel(
        "Pipeline health",
        "Right now, who is where and for how long",
        bars,
        "Nobody in the pipeline",
    )


def funnel_panel(snap: Snapshot) -> Panel:
    bars = [
        Bar(
            stage["label"],
            stage["value"],
            STAGE.get(stage["key"], SERIES[0]),
            f"{stage['conversion_pct']}% of previous"
            if stage["conversion_pct"] is not None
            else "",
        )
        for stage in snap.funnel["stages"]
    ]
    role = snap.funnel_job.title if snap.funnel_job else "All roles"
    return bars_panel(
        "Recruitment funnel",
        f"{role} · candidates who reached each stage",
        bars,
        "No candidates yet",
    )


ROLE_SEGMENTS = (
    Segment("shortlisted", "Shortlisted", STAGE["shortlisted"]),
    Segment("contacted", "Contacted", STAGE["contacted"]),
    Segment("interviewed", "Interviewing", STAGE["interviewed"]),
    Segment("selected", "Selected", STAGE["selected"]),
    Segment("onboarded", "Onboarding", STAGE["onboarded"]),
)


def roles_panel(snap: Snapshot) -> Panel:
    jobs = snap.jobs[:ROLE_LIMIT]
    stacks = [
        Stack(
            job.title,
            f"{job.department} · {job.openings} {'opening' if job.openings == 1 else 'openings'}",
            {key: getattr(job, key) for key in ROLE_STAGES},
            (count(job.awaiting), count(job.parked), count(job.total)),
        )
        for job in jobs
    ]
    subtitle = "Right now, candidates in play per role"
    if len(snap.jobs) > len(jobs):
        subtitle += f", the busiest {len(jobs)} of {len(snap.jobs)}"
    return stacked_panel(
        "Open roles",
        subtitle,
        stacks,
        ROLE_SEGMENTS,
        ("Awaiting", "Parked", "Total"),
        "No open roles",
    )


def skills_panel(snap: Snapshot) -> Panel:
    bars = [
        Bar(
            skill["label"],
            skill["candidates"],
            SERIES[0],
            f"{skill['roles']} {'role asks' if skill['roles'] == 1 else 'roles ask'}",
        )
        for skill in snap.insights["skills"]
    ]
    return bars_panel(
        "Skills in demand",
        "Candidates in the pipeline who have what open roles require",
        bars,
        "No open role asks for skills yet",
    )


def searches_panel(snap: Snapshot) -> Panel:
    searches = snap.insights["searches"]
    seconds = (
        None if searches["avg_duration_ms"] is None else round(searches["avg_duration_ms"] / 1000)
    )
    stats = [
        ("Searches run", count(searches["runs"])),
        ("Profiles found", count(searches["found"])),
        ("AI shortlisted", count(searches["shortlisted"])),
        ("New to the database", count(searches["new"])),
        ("Average search time", "—" if seconds is None else f"{seconds}s"),
    ]
    return Panel(
        "AI searches",
        f"{snap.short_window}, what the searches brought in",
        fixed(stats_height(stats, 2)),
        lambda sheet, x, y, width: draw_stats(sheet, x, y, width, stats, 2),
    )


def match_panel(snap: Snapshot) -> Panel:
    match = snap.insights["match"]
    bars = [
        Bar(band["label"], band["value"], ORDINAL[min(index, len(ORDINAL) - 1)])
        for index, band in enumerate(match["bands"])
    ]
    subtitle = f"Right now, {match['scored']:,} scored candidates"
    if match["avg_pct"] is not None:
        subtitle += f", {match['avg_pct']}% on average"
    return bars_panel("Match quality", subtitle, bars, "No scored candidates yet")


def experience_panel(snap: Snapshot) -> Panel:
    bars = [
        Bar(band["label"], band["value"], ORDINAL[min(index, len(ORDINAL) - 1)])
        for index, band in enumerate(snap.insights["experience"])
    ]
    return bars_panel(
        "Experience mix", "Right now, candidates by years of experience", bars, "No candidates yet"
    )


def sources_panel(snap: Snapshot) -> Panel:
    slices = [
        (source["label"], source["value"], SERIES[index % len(SERIES)])
        for index, source in enumerate(snap.pipeline["sources"])
    ]
    total = sum(value for _, value, _ in slices)
    radius, hole, legend_x = 36.0, 22.0, 88.0

    def draw(sheet: Sheet, x: float, y: float, width: float) -> None:
        if total == 0:
            sheet.note(x, y, "No candidates yet")
            return
        cx, cy = x + radius + 2, y + radius + 6
        start = 0.0
        for _, value, color in slices:
            if value > 0:
                sheet.sector(cx, cy, radius, start, 360 * value / total, color)
                start += 360 * value / total
        if sum(1 for _, value, _ in slices if value > 0) > 1:
            start = 0.0
            for _, value, _ in slices:
                angle = math.radians(90 - start)
                edge = (cx + radius * math.cos(angle), cy - radius * math.sin(angle))
                sheet.line(cx, cy, edge[0], edge[1], color=SURFACE, width=2)
                start += 360 * value / total
        sheet.circle(cx, cy, hole, SURFACE)
        sheet.text(cx, cy + 4, count(total), size=12, bold=True, align="center")
        sheet.text(cx, cy + 13, "candidates", size=6, color=SUBTLE, align="center")
        lx = x + legend_x
        for index, (label, value, color) in enumerate(slices):
            ly = y + 14 + index * 18
            sheet.swatch(lx, ly - 6, color)
            sheet.text(lx + 12, ly + 1, fit_text(label, width - legend_x - 70, 8), size=8)
            share = f"{round(100 * value / total)}%"
            sheet.text(x + width - 32, ly + 1, share, size=7, color=SUBTLE, align="right")
            sheet.text(x + width, ly + 1, count(value), size=8.5, bold=True, align="right")

    height = max(2 * radius + 12, 8 + len(slices) * 18) if total else ROW
    return Panel(
        "Candidates by source", "Right now, where the pipeline came from", fixed(height), draw
    )


def departments_panel(snap: Snapshot) -> Panel:
    columns = (
        Column("Department", 0.4),
        Column("Open roles", 0.2, "right"),
        Column("Openings", 0.2, "right"),
        Column("Candidates", 0.2, "right"),
    )
    rows = [
        [row["label"], count(row["roles"]), count(row["openings"]), count(row["candidates"])]
        for row in snap.insights["departments"]
    ]
    return table_panel(
        "Departments", "Right now, open roles and their candidates", columns, rows, "No open roles"
    )


def offers_panel(snap: Snapshot) -> Panel:
    offers = snap.insights["offers"]
    bars = [
        Bar(row["label"], row["value"], OFFER.get(row["key"], LINE_STRONG))
        for row in offers["statuses"]
    ]
    subtitle = f"Right now; {offers['responded']:,} answered in the window"
    if offers["avg_response_days"] is not None:
        subtitle += f", {count(offers['avg_response_days'])} days to reply on average"
    return bars_panel("Offers", subtitle, bars, "No offers yet")


def outreach_panel(snap: Snapshot) -> Panel:
    outreach = snap.insights["outreach"]
    channels = [Bar(row["label"], row["value"], SERIES[0]) for row in outreach["channels"]]
    outcomes = [Bar(row["label"], row["value"], SERIES[1]) for row in outreach["outcomes"]]

    def draw(sheet: Sheet, x: float, y: float, width: float) -> None:
        if outreach["total"] == 0:
            sheet.note(x, y, "Nothing logged in this window")
            return
        sheet.text(x, y + 8, "BY CHANNEL", size=6.5, color=SUBTLE)
        draw_bars(sheet, x, y + 12, width, channels)
        oy = y + 12 + len(channels) * ROW + 10
        sheet.text(x, oy + 8, "BY OUTCOME", size=6.5, color=SUBTLE)
        draw_bars(sheet, x, oy + 12, width, outcomes)

    height = (
        (12 + len(channels) * ROW + 10 + 12 + len(outcomes) * ROW) if outreach["total"] else ROW
    )
    return Panel(
        "Outreach",
        f"{snap.short_window}, {outreach['total']:,} calls, emails and messages",
        fixed(height),
        draw,
    )


def interviews_panel(snap: Snapshot) -> Panel:
    data = snap.interviews
    stats = [
        ("Held", count(data["total"])),
        ("Completed", count(data["completed"])),
        ("Average score", count(data["avg_score"])),
        ("Cancelled", count(data["cancelled"])),
        ("No-show", count(data["no_show"])),
        ("Feedback owed now", count(data["feedback_pending"])),
    ]
    bars = [
        Bar(row["label"], row["value"], OUTCOME.get(row["key"], LINE_STRONG))
        for row in data["recommendations"]
    ]
    empty = data["total"] == 0 and data["feedback_pending"] == 0 and data["upcoming"] == 0

    def draw(sheet: Sheet, x: float, y: float, width: float) -> None:
        if empty:
            sheet.note(x, y, "No interviews in this window")
            return
        draw_stats(sheet, x, y, width, stats, 3)
        ry = y + stats_height(stats, 3) + 8
        sheet.text(x, ry + 8, "RECOMMENDATIONS", size=6.5, color=SUBTLE)
        draw_bars(sheet, x, ry + 12, width, bars)

    height = (stats_height(stats, 3) + 8 + 12 + len(bars) * ROW) if not empty else ROW
    return Panel("Interviews", f"{snap.short_window}, outcomes", fixed(height), draw)


def interviewers_panel(snap: Snapshot) -> Panel:
    columns = (
        Column("Interviewer", 0.4),
        Column("Held", 0.2, "right"),
        Column("Completed", 0.2, "right"),
        Column("Avg score", 0.2, "right"),
    )
    rows = [
        [
            row["user"].full_name,
            count(row["total"]),
            count(row["completed"]),
            count(row["avg_score"]),
        ]
        for row in snap.interviews["interviewers"]
    ]
    return table_panel(
        "Interviewer load",
        f"{snap.short_window}, who carried the load",
        columns,
        rows,
        "No interviews held",
    )


def heatmap_panel(snap: Snapshot) -> Panel:
    grid = snap.insights["heatmap"]
    label_w, cell_h = 26.0, 11.0
    top = max(max(row) for row in grid)
    busiest = max(
        (value, day, hour) for day, row in enumerate(grid) for hour, value in enumerate(row)
    )
    subtitle = f"{snap.short_window}, actions by hour of the day in your time zone"
    if top:
        subtitle += f" · busiest {WEEKDAYS[busiest[1]]} {busiest[2]:02d}:00 with {busiest[0]:,}"

    def draw(sheet: Sheet, x: float, y: float, width: float) -> None:
        busy_w = width_of("busy", 6.5)
        lx = x + width - busy_w - 4 - 5 * 9
        sheet.text(lx - 4, y + 7, "quiet", size=6.5, color=SUBTLE, align="right")
        for index, color in enumerate(HEAT):
            sheet.rect(lx + index * 9, y, lx + index * 9 + 8, y + 8, fill=color, radius=1.5)
        sheet.text(lx + 5 * 9 + 4, y + 7, "busy", size=6.5, color=SUBTLE)
        gy = y + 14
        cell_w = (width - label_w) / 24
        for day, row in enumerate(grid):
            ry = gy + day * cell_h
            sheet.text(x, ry + 8.5, WEEKDAYS[day], size=7, color=SUBTLE)
            for hour, value in enumerate(row):
                level = min(len(HEAT), math.ceil(value / top * len(HEAT))) if top else 0
                cx = x + label_w + hour * cell_w
                fill = SURFACE_2 if level == 0 else HEAT[level - 1]
                sheet.rect(
                    cx + 0.75,
                    ry + 0.75,
                    cx + cell_w - 0.75,
                    ry + cell_h - 0.75,
                    fill=fill,
                    radius=1.5,
                )
        ly = gy + 7 * cell_h + 10
        for hour in range(0, 24, 3):
            hx = x + label_w + (hour + 0.5) * cell_w
            sheet.text(hx, ly, f"{hour:02d}", size=6.5, color=SUBTLE, align="center")

    return Panel("When the team works", subtitle, fixed(14 + 7 * cell_h + 14), draw)


TEAM_SEGMENTS = (
    Segment("sourcing", "Sourcing", SERIES[0]),
    Segment("outreach", "Outreach", SERIES[1]),
    Segment("interviews", "Interviews", SERIES[2]),
    Segment("closing", "Closing", SERIES[3]),
)


def team_panel(snap: Snapshot) -> Panel:
    stacks = [
        Stack(
            member["user"].full_name,
            "",
            {segment.key: member[segment.key] for segment in TEAM_SEGMENTS},
            (count(member["roles"]), count(member["total"])),
        )
        for member in snap.team
    ]
    return stacked_panel(
        "Team activity",
        f"{snap.short_window}, across everything you can see",
        stacks,
        TEAM_SEGMENTS,
        ("Roles", "Total"),
        "Nothing logged in this window",
    )


def upcoming_panel(snap: Snapshot) -> Panel:
    interviews = snap.upcoming
    tz = snap.scope.tz

    def draw(sheet: Sheet, x: float, y: float, width: float) -> None:
        if not interviews:
            sheet.note(x, y, "Nothing scheduled")
            return
        for index, interview in enumerate(interviews):
            ry = y + index * 30
            application = interview.application
            when = f"{interview.scheduled_at.astimezone(tz):%a, %d %b · %H:%M}"
            when_w = sheet.text(x, ry + 10, when, size=8.5, bold=True)
            round_label = fit_text(interview.get_round_display(), width - when_w - 8, 7.5)
            sheet.text(x + when_w + 6, ry + 10, round_label, size=7.5, color=SUBTLE)
            who = f"{application.candidate.full_name} · {application.job_description.title}"
            interviewer = interview.interviewer.full_name
            interviewer_w = sheet.text(
                x + width, ry + 21, interviewer, size=7, color=SUBTLE, align="right"
            )
            sheet.text(
                x, ry + 21, fit_text(who, width - interviewer_w - 8, 7.5), size=7.5, color=MUTED
            )
            if index < len(interviews) - 1:
                sheet.line(x, ry + 28, x + width, ry + 28)

    return Panel(
        "Upcoming interviews",
        "The next five, in your time zone",
        fixed(len(interviews) * 30 - 4 if interviews else ROW),
        draw,
    )


# ------------------------------------------------------------------ the document


class Document:
    def __init__(self, snap: Snapshot) -> None:
        self.snap = snap
        self.doc = pymupdf.open()
        self.sheet = Sheet(self.doc.new_page(width=PAGE_W, height=PAGE_H))
        self.y = self.title_band() + GAP + 2

    def new_page(self) -> None:
        self.sheet.flush()
        self.sheet = Sheet(self.doc.new_page(width=PAGE_W, height=PAGE_H))
        self.y = self.slim_header() + GAP + 2

    def title_band(self) -> float:
        sheet, snap = self.sheet, self.snap
        sheet.rect(0, 0, PAGE_W, BAND_H, fill=INK)
        sheet.rect(0, BAND_H, PAGE_W, BAND_H + 3, fill=ACCENT)
        sheet.rect(MARGIN, 30, MARGIN + 10, 40, fill=ACCENT, radius=2)
        wordmark_w = sheet.text(MARGIN + 16, 39.5, "Talent", size=12.5, bold=True, color=SURFACE)
        sheet.text(MARGIN + 16 + wordmark_w, 39.5, "OS", size=12.5, bold=True, color=ACCENT)
        sheet.text(MARGIN, 80, "Hiring dashboard", size=25, bold=True, color=SURFACE)
        sheet.text(MARGIN, 100, snap.window, size=9.5, color=SURFACE)
        scope = snap.people or "Every job description you can see"
        sheet.text(MARGIN, 114, fit_text(scope, CONTENT_W - 200, 8.5), size=8.5, color=ON_DARK)
        sheet.text(PAGE_W - MARGIN, 114, snap.exported, size=8, color=ON_DARK, align="right")
        return BAND_H + 3

    def slim_header(self) -> float:
        sheet = self.sheet
        width = sheet.text(MARGIN, 24, "TalentOS", size=8.5, bold=True)
        sheet.text(MARGIN + width + 5, 24, "· Hiring dashboard", size=8.5, color=SUBTLE)
        sheet.text(PAGE_W - MARGIN, 24, self.snap.window, size=8, color=SUBTLE, align="right")
        sheet.line(MARGIN, 32, PAGE_W - MARGIN, 32)
        return 32

    def row(self, *items: tuple[Panel, float]) -> None:
        """Panels side by side, each taking its fraction of the width; a row that
        does not fit below the cursor starts a new page."""
        widths = [(CONTENT_W - GAP * (len(items) - 1)) * fraction for _, fraction in items]
        height = max(panel.height(width) for (panel, _), width in zip(items, widths, strict=True))
        if self.y + height > BOTTOM:
            self.new_page()
        x = MARGIN
        for (panel, _), width in zip(items, widths, strict=True):
            panel.render(self.sheet, x, self.y, width, height)
            x += width + GAP
        self.y += height + GAP

    def footers(self) -> None:
        self.sheet.flush()
        total = len(self.doc)
        for number, page in enumerate(self.doc, start=1):
            sheet = Sheet(page)
            sheet.line(MARGIN, PAGE_H - 30, PAGE_W - MARGIN, PAGE_H - 30)
            left = f"TalentOS · Hiring dashboard · {self.snap.exported}"
            sheet.text(MARGIN, PAGE_H - 18, left, size=7, color=SUBTLE)
            right = f"Page {number} of {total}"
            sheet.text(PAGE_W - MARGIN, PAGE_H - 18, right, size=7, color=SUBTLE, align="right")
            sheet.flush()


def render(snap: Snapshot) -> bytes:
    document = Document(snap)
    document.row((kpi_panel(snap), 1.0))
    document.row((trend_panel(snap), 0.6), (attention_panel(snap), 0.4))
    document.row((pipeline_panel(snap), 0.5), (funnel_panel(snap), 0.5))
    document.row((roles_panel(snap), 1.0))
    document.row((skills_panel(snap), 0.58), (searches_panel(snap), 0.42))
    document.row((match_panel(snap), 0.5), (experience_panel(snap), 0.5))
    document.row((sources_panel(snap), 0.5), (departments_panel(snap), 0.5))
    document.row((offers_panel(snap), 0.5), (outreach_panel(snap), 0.5))
    document.row((interviews_panel(snap), 0.5), (interviewers_panel(snap), 0.5))
    document.row((heatmap_panel(snap), 1.0))
    document.row((team_panel(snap), 0.6), (upcoming_panel(snap), 0.4))
    document.footers()
    return document.doc.tobytes(deflate=True)
