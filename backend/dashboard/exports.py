"""The dashboard as a file: every figure and table the page shows, for the same
window and people, as one CSV or one Excel workbook. The PDF is drawn in
``dashboard.pdf`` from the same snapshot."""

import csv
import io
from dataclasses import dataclass
from datetime import date, datetime
from typing import Any

from openpyxl import Workbook
from openpyxl.chart import BarChart, DoughnutChart, LineChart, Reference
from openpyxl.chart.label import DataLabelList
from openpyxl.chart.series import DataPoint
from openpyxl.formatting.rule import ColorScaleRule
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.worksheet import Worksheet

from accounts.models import User
from common import enums
from dashboard import services
from dashboard.services import Scope

Cell = str | int | float | date | datetime | None

# ------------------------------------------------------------------ palette
# The app's own colours (frontend/src/index.css and charts/theme.ts), used by
# the PDF drawings and the workbook charts alike.

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

ROLE_STAGES = ("shortlisted", "contacted", "interviewed", "selected", "onboarded")
ACTIVE_ROLE_STATUSES = (enums.JDStatus.OPEN, enums.JDStatus.ON_HOLD)
UNITS = {"count": "", "percent": "%", "days": " days"}
DELTA_UNITS = {"count": "", "percent": " pp", "days": " days"}


@dataclass(frozen=True)
class Snapshot:
    """Everything the dashboard shows for one scope, straight from the services."""

    scope: Scope
    window: str
    # "Last 30 days" or "26 Aug to 24 Sep 2026": the window where space is short.
    short_window: str
    # "Job descriptions of Priya Nair, Arun Kumar"; None for everything the viewer sees.
    people: str | None
    exported: str
    summary: dict[str, Any]
    attention: dict[str, int]
    trends: dict[str, Any]
    insights: dict[str, Any]
    pipeline: dict[str, Any]
    funnel: dict[str, Any]
    funnel_job: Any | None
    interviews: dict[str, Any]
    team: list[dict[str, Any]]
    upcoming: list[Any]

    @property
    def jobs(self) -> list[Any]:
        """The roles being hired for, busiest first, as the Open roles widget lists them."""
        jobs = [job for job in self.pipeline["jobs"] if job.status in ACTIVE_ROLE_STATUSES]
        jobs.sort(key=lambda job: (-sum(getattr(job, key) for key in ROLE_STAGES), -job.total))
        return jobs

    @property
    def lines(self) -> list[str]:
        return [self.window, *([self.people] if self.people else []), self.exported]


def window_label(scope: Scope) -> str:
    """Last 30 days (26 Aug to 24 Sep 2026); a custom window is just its dates."""
    dates = scope.dates
    span = f"{dates[0]:%d %b %Y} to {dates[-1]:%d %b %Y}"
    return span if scope.start and scope.end else f"Last {scope.days} days ({span})"


def short_window_label(scope: Scope) -> str:
    dates = scope.dates
    if not (scope.start and scope.end):
        return f"Last {scope.days} days"
    first = f"{dates[0]:%d %b}" if dates[0].year == dates[-1].year else f"{dates[0]:%d %b %Y}"
    return f"{first} to {dates[-1]:%d %b %Y}"


def filename(scope: Scope, kind: str) -> str:
    dates = scope.dates
    return f"dashboard-{dates[0]:%Y-%m-%d}-to-{dates[-1]:%Y-%m-%d}.{kind}"


def snapshot(scope: Scope, job_description: str | None = None) -> Snapshot:
    pipeline = services.pipeline(scope)
    people = None
    if scope.user_ids:
        users = User.objects.filter(pk__in=scope.user_ids).order_by("first_name", "last_name")
        people = f"Job descriptions of {', '.join(user.full_name for user in users)}"
    return Snapshot(
        scope=scope,
        window=window_label(scope),
        short_window=short_window_label(scope),
        people=people,
        exported=(
            f"Exported {scope.now.astimezone(scope.tz):%d %b %Y, %H:%M} by {scope.viewer.full_name}"
        ),
        summary=services.summary(scope),
        attention=services.attention(scope),
        trends=services.trends(scope),
        insights=services.insights(scope),
        pipeline=pipeline,
        funnel=services.funnel(scope, job_description),
        funnel_job=next((job for job in pipeline["jobs"] if str(job.id) == job_description), None),
        interviews=services.interview_insights(scope),
        team=services.team(scope),
        upcoming=services.upcoming_interviews(scope),
    )


# ------------------------------------------------------------------ figures


def number(value: float | None) -> float | int | None:
    if value is None:
        return None
    return int(value) if float(value).is_integer() else round(value, 1)


def figure(metric: dict[str, Any]) -> Cell:
    """The value with its unit: 1284 stays a number, 62.5% and 18.5 days read as text."""
    value = number(metric["value"])
    if value is None:
        return None
    return value if metric["unit"] == "count" else f"{value}{UNITS[metric['unit']]}"


def change_label(metric: dict[str, Any]) -> str:
    """The change against the previous window: "+362", "-3.5 pp", "+2.1 days"."""
    delta = number(metric["delta"])
    if delta is None:
        return ""
    sign = "+" if delta > 0 else ""
    return f"{sign}{delta}{DELTA_UNITS[metric['unit']]}"


def cell_text(cell: Cell) -> str:
    if cell is None:
        return ""
    if isinstance(cell, datetime):
        return f"{cell:%a, %d %b %Y %H:%M}"
    if isinstance(cell, date):
        return f"{cell:%a, %d %b %Y}"
    return str(cell)


# ------------------------------------------------------------------ tables


@dataclass(frozen=True)
class Chart:
    """How a table is drawn as a native Excel chart: which columns are the
    series, in which colours, over which rows. The first column is always the
    category axis."""

    kind: str  # column | bar | line | doughnut | stacked-bar
    values: tuple[int, ...]  # 1-based table columns holding the series
    # One colour per series, or one per category when a single series is coloured by point.
    colors: tuple[str, ...] = ()
    by_point: bool = False
    rows: tuple[int, int | None] = (0, None)  # the slice of table rows to plot
    title: str = ""


@dataclass(frozen=True)
class Table:
    title: str
    columns: list[str]
    rows: list[list[Cell]]
    # One line under the title: what "now" means, the role the funnel is narrowed to…
    note: str = ""
    chart: Chart | None = None


ATTENTION_ITEMS = (
    ("overdue_follow_ups", "Overdue follow-ups", "Contacted candidates, next action past due"),
    ("feedback_pending", "Interview feedback owed", "Held, but no feedback submitted yet"),
    ("offers_expiring", "Offers expiring", "Past expiry or due within 3 days"),
    ("stale_candidates", "Stuck for a week", "No stage change in 7 days"),
    ("quiet_roles", "Quiet roles", "Nothing logged in 7 days"),
)
HEADLINE_FIGURES = (
    ("open_roles", "Open roles", "now"),
    ("in_pipeline", "In pipeline", "now"),
    ("new_candidates", "New candidates", "window"),
    ("interviews", "Interviews", "window"),
    ("offers_pending", "Offers pending", "now"),
    ("hires", "Hires", "window"),
    ("offer_acceptance", "Offer acceptance", "window"),
    ("recruitment_tat", "Recruitment TAT", "window"),
    ("time_to_hire", "Candidate TAT", "window"),
)
TREND_SERIES = (
    ("candidates", "Candidates found"),
    ("shortlisted", "Shortlisted"),
    ("interviews", "Interviews"),
    ("offers", "Offers sent"),
    ("hires", "Hires"),
)
WEEKDAYS = ("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")


ROLE_LIMIT = 12


def stage_colors(rows: list[dict[str, Any]]) -> tuple[str, ...]:
    return tuple(
        STAGE.get(row["key"], ORDINAL[index % len(ORDINAL)]) for index, row in enumerate(rows)
    )


def cycle(colors: tuple[str, ...], count: int) -> tuple[str, ...]:
    return tuple(colors[index % len(colors)] for index in range(count))


def tables(snap: Snapshot) -> list[Table]:
    """Every widget on the page as a table, in the page's order."""
    window, summary, attention, insights = snap.window, snap.summary, snap.attention, snap.insights
    match, offers, outreach, searches = (
        insights["match"],
        insights["offers"],
        insights["outreach"],
        insights["searches"],
    )
    avg_response = number(offers["avg_response_days"])
    tz = snap.scope.tz
    return [
        Table(
            "Headline figures",
            ["Figure", "Value", "Change vs previous window", "Covers", "Note"],
            [
                [
                    label,
                    figure(summary[key]),
                    change_label(summary[key]),
                    "Right now" if covers == "now" else window,
                    summary[key]["detail"] or "",
                ]
                for key, label, covers in HEADLINE_FIGURES
            ],
        ),
        Table(
            "Stage TAT",
            ["Stage", "Average days per hire", "Hires visiting stage"],
            [
                [stage["label"], stage["avg_days"], stage["hires"]]
                for stage in insights["tat"]["stages"]
            ],
            note=f"{window}: completed hires. Calendar days include holds and repeat visits. "
            f"{insights['tat']['incomplete_histories']} incomplete histories excluded.",
            chart=Chart("column", (2,), stage_colors(insights["tat"]["stages"]), by_point=True),
        ),
        Table(
            "Needs attention",
            ["Item", "What it means", "Count"],
            [[label, meaning, attention[key]] for key, label, meaning in ATTENTION_ITEMS],
            note="Right now",
            chart=Chart("bar", (3,), (WARNING,)),
        ),
        Table(
            "Hiring activity",
            ["Day", *(label for _key, label in TREND_SERIES)],
            [
                [point["date"], *(point[key] for key, _label in TREND_SERIES)]
                for point in snap.trends["points"]
            ],
            note=f"{window}, by day",
            chart=Chart("line", (2, 3, 4, 5, 6), SERIES),
        ),
        Table(
            "Pipeline health",
            ["Stage", "Candidates", "Avg days in stage", "Over a week"],
            [
                [stage["label"], stage["value"], number(stage["avg_days"]), stage["stuck"]]
                for stage in insights["stages"]
            ],
            note="Right now",
            chart=Chart("column", (2,), stage_colors(insights["stages"]), by_point=True),
        ),
        Table(
            "Recruitment funnel",
            ["Stage", "Candidates", "Of previous (%)"],
            [
                [stage["label"], stage["value"], stage["conversion_pct"]]
                for stage in snap.funnel["stages"]
            ],
            note=snap.funnel_job.title if snap.funnel_job else "All roles",
            chart=Chart("bar", (2,), stage_colors(snap.funnel["stages"]), by_point=True),
        ),
        Table(
            "Open roles",
            [
                "Role",
                "Department",
                "Status",
                "Openings",
                "Awaiting",
                "Shortlisted",
                "Contacted",
                "Interviewing",
                "Selected",
                "Onboarding",
                "Parked",
                "Total",
            ],
            [
                [
                    job.title,
                    job.department,
                    job.get_status_display(),
                    job.openings,
                    job.awaiting,
                    *(getattr(job, key) for key in ROLE_STAGES),
                    job.parked,
                    job.total,
                ]
                for job in snap.jobs
            ],
            note="Right now, candidates in play per role",
            chart=Chart(
                "stacked-bar",
                (6, 7, 8, 9, 10),
                tuple(STAGE[key] for key in ROLE_STAGES),
                rows=(0, ROLE_LIMIT),
            ),
        ),
        Table(
            "Skills in demand",
            ["Skill", "Open roles asking", "Candidates who have it"],
            [[skill["label"], skill["roles"], skill["candidates"]] for skill in insights["skills"]],
            chart=Chart("bar", (2, 3), (SERIES[1], SERIES[0])),
        ),
        Table(
            "Match quality",
            ["Match score", "Candidates"],
            [[band["label"], band["value"]] for band in match["bands"]],
            note=(
                f"Right now, {match['scored']} scored candidates"
                + (f", {match['avg_pct']}% on average" if match["avg_pct"] is not None else "")
            ),
            chart=Chart("column", (2,), ORDINAL[1:5], by_point=True),
        ),
        Table(
            "Experience mix",
            ["Experience", "Candidates"],
            [[band["label"], band["value"]] for band in insights["experience"]],
            note="Right now",
            chart=Chart("doughnut", (2,), ORDINAL[1:5], by_point=True),
        ),
        Table(
            "AI searches",
            ["Figure", "Value"],
            [
                ["Searches run", searches["runs"]],
                ["Profiles found", searches["found"]],
                ["AI shortlisted", searches["shortlisted"]],
                ["New to the database", searches["new"]],
                [
                    "Average search time (s)",
                    None
                    if searches["avg_duration_ms"] is None
                    else round(searches["avg_duration_ms"] / 1000),
                ],
            ],
            note=window,
            chart=Chart("column", (2,), (SERIES[0],), rows=(0, 4)),
        ),
        Table(
            "Candidates by source",
            ["Source", "Candidates"],
            [[source["label"], source["value"]] for source in snap.pipeline["sources"]],
            note="Right now",
            chart=Chart(
                "doughnut", (2,), cycle(SERIES, len(snap.pipeline["sources"])), by_point=True
            ),
        ),
        Table(
            "Departments",
            ["Department", "Open roles", "Openings", "Candidates"],
            [
                [row["label"], row["roles"], row["openings"], row["candidates"]]
                for row in insights["departments"]
            ],
            note="Right now",
            chart=Chart("bar", (4, 2), (SERIES[0], SERIES[1])),
        ),
        Table(
            "Offers",
            ["Status", "Offers"],
            [[row["label"], row["value"]] for row in offers["statuses"]],
            note=(
                f"Right now; {offers['responded']} answered in the window"
                + (
                    f", {avg_response} days to answer on average"
                    if avg_response is not None
                    else ""
                )
            ),
            chart=Chart(
                "doughnut",
                (2,),
                tuple(OFFER.get(row["key"], SUBTLE) for row in offers["statuses"]),
                by_point=True,
            ),
        ),
        Table(
            "Outreach",
            ["Channel or outcome", "Logged"],
            [
                *([row["label"], row["value"]] for row in outreach["channels"]),
                *([f"Outcome: {row['label']}", row["value"]] for row in outreach["outcomes"]),
            ],
            note=window,
            chart=Chart("bar", (2,), (SERIES[1],)),
        ),
        Table(
            "Interviews",
            ["Figure", "Value"],
            [
                ["Held", snap.interviews["total"]],
                ["Completed", snap.interviews["completed"]],
                ["Cancelled", snap.interviews["cancelled"]],
                ["No-show", snap.interviews["no_show"]],
                ["Average score", snap.interviews["avg_score"]],
                ["Upcoming (right now)", snap.interviews["upcoming"]],
                ["Feedback owed (right now)", snap.interviews["feedback_pending"]],
                *(
                    [f"Recommendation: {row['label']}", row["value"]]
                    for row in snap.interviews["recommendations"]
                ),
            ],
            note=window,
            chart=Chart(
                "bar",
                (2,),
                tuple(
                    OUTCOME.get(row["key"], LINE_STRONG)
                    for row in snap.interviews["recommendations"]
                ),
                by_point=True,
                rows=(7, None),
                title="Interview recommendations",
            ),
        ),
        Table(
            "Interviewer load",
            ["Interviewer", "Held", "Completed", "Avg score"],
            [
                [row["user"].full_name, row["total"], row["completed"], row["avg_score"]]
                for row in snap.interviews["interviewers"]
            ],
            note=window,
            chart=Chart("bar", (2, 3), (SERIES[1], SERIES[0])),
        ),
        Table(
            "When the team works",
            ["Hour", *WEEKDAYS],
            [[f"{hour:02d}:00", *(row[hour] for row in insights["heatmap"])] for hour in range(24)],
            note=f"{window}, actions by hour of the day in your time zone",
        ),
        Table(
            "Team activity",
            ["Person", "Roles", "Sourcing", "Outreach", "Interviews", "Closing", "Total"],
            [
                [
                    member["user"].full_name,
                    member["roles"],
                    member["sourcing"],
                    member["outreach"],
                    member["interviews"],
                    member["closing"],
                    member["total"],
                ]
                for member in snap.team
            ],
            note=f"{window}, across everything you can see",
            chart=Chart("stacked-bar", (3, 4, 5, 6), SERIES[:4]),
        ),
        Table(
            "Upcoming interviews",
            ["When", "Round", "Candidate", "Role", "Interviewer"],
            [
                [
                    interview.scheduled_at.astimezone(tz).replace(tzinfo=None),
                    interview.get_round_display(),
                    interview.application.candidate.full_name,
                    interview.application.job_description.title,
                    interview.interviewer.full_name,
                ]
                for interview in snap.upcoming
            ],
            note="The next five, in your time zone",
        ),
    ]


# ------------------------------------------------------------------ writers


def to_csv(snap: Snapshot) -> bytes:
    """One file, each table under its title, with a byte-order mark so Excel reads UTF-8."""
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(["Dashboard"])
    writer.writerows([line] for line in snap.lines)
    for table in tables(snap):
        writer.writerow([])
        writer.writerow([table.title, table.note] if table.note else [table.title])
        writer.writerow(table.columns)
        writer.writerows([cell_text(cell) for cell in row] for row in table.rows)
    return ("﻿" + buffer.getvalue()).encode("utf-8")


HEADER_FILL = PatternFill("solid", fgColor="E8EDF5")
TILE_FILL = PatternFill("solid", fgColor="F4F5EF")
TILE_EDGE = Border(
    left=Side(style="medium", color="FFFFFF"), right=Side(style="medium", color="FFFFFF")
)
# Figures where a fall is the good news.
LOWER_IS_BETTER = {"recruitment_tat", "time_to_hire"}
# Overview geometry: two charts per band, nine tiles of two columns across the same width.
GRID_COLUMNS = 18
CHART_WIDTH, CHART_HEIGHT = 18.5, 7.5  # cm
BAND_ROWS = 16


def hex_color(color: str) -> str:
    return color.lstrip("#").upper()


def value_labels() -> DataLabelList:
    """Just the number on each bar or slice. Excel treats every flag left unset as on,
    which would print the series and category names next to the value."""
    return DataLabelList(
        showVal=True,
        showSerName=False,
        showCatName=False,
        showLegendKey=False,
        showPercent=False,
        showBubbleSize=False,
        showLeaderLines=False,
    )


def finish(chart: BarChart | LineChart | DoughnutChart, title: str) -> None:
    """Title and legend in their own space rather than drawn over the plot."""
    chart.title = title
    chart.title.overlay = False
    chart.width, chart.height = CHART_WIDTH, CHART_HEIGHT
    if chart.legend is not None:
        chart.legend.position = "b"
        chart.legend.overlay = False


def write_table(sheet: Worksheet, table: Table) -> int:
    """The note, a bold frozen header row and the rows; returns the header row number."""
    if table.note:
        sheet.append([table.note])
        sheet["A1"].font = Font(italic=True, color="666666")
    sheet.append(table.columns)
    header = sheet.max_row
    for cell in sheet[header]:
        cell.font = Font(bold=True)
        cell.fill = HEADER_FILL
    for row in table.rows:
        sheet.append(row)
        for cell in sheet[sheet.max_row]:
            if isinstance(cell.value, datetime):
                cell.number_format = "ddd, d mmm yyyy hh:mm"
            elif isinstance(cell.value, date):
                cell.number_format = "ddd, d mmm yyyy"
    sheet.freeze_panes = sheet.cell(row=header + 1, column=1)
    for index, column in enumerate(table.columns, start=1):
        longest = max([len(column), *(len(cell_text(row[index - 1])) for row in table.rows)])
        sheet.column_dimensions[get_column_letter(index)].width = min(longest, 60) + 3
    return header


def build_chart(
    sheet: Worksheet, table: Table, header: int
) -> BarChart | LineChart | DoughnutChart | None:
    """A native chart over the table's cells on `sheet`; None when there is nothing to plot."""
    spec = table.chart
    if spec is None:
        return None
    start, stop = spec.rows
    stop = len(table.rows) if stop is None else min(stop, len(table.rows))
    if stop <= start:
        return None
    first, last = header + 1 + start, header + stop

    chart: BarChart | LineChart | DoughnutChart
    if spec.kind == "line":
        chart = LineChart()
    elif spec.kind == "doughnut":
        chart = DoughnutChart()
        chart.holeSize = 55
    else:
        chart = BarChart()
        chart.type = "bar" if spec.kind in ("bar", "stacked-bar") else "col"
        chart.gapWidth = 60
        if spec.kind == "stacked-bar":
            chart.grouping = "stacked"
            chart.overlap = 100
    if spec.kind == "doughnut" or len(spec.values) == 1:
        chart.dataLabels = value_labels()
    if spec.kind != "doughnut" and len(spec.values) == 1:
        chart.legend = None
    finish(chart, spec.title or table.title)
    for column in spec.values:
        chart.add_data(
            Reference(sheet, min_col=column, min_row=header, max_row=last), titles_from_data=True
        )
    chart.set_categories(Reference(sheet, min_col=1, min_row=first, max_row=last))

    if spec.by_point:
        series = chart.series[0]
        for index, color in enumerate(spec.colors[: stop - start]):
            point = DataPoint(idx=index)
            point.graphicalProperties.solidFill = hex_color(color)
            series.dPt.append(point)
    else:
        for series, color in zip(chart.series, spec.colors, strict=False):
            if spec.kind == "line":
                series.graphicalProperties.line.solidFill = hex_color(color)
                series.graphicalProperties.line.width = 22000
                series.marker.symbol = "none"
                series.smooth = False
            else:
                series.graphicalProperties.solidFill = hex_color(color)

    if spec.kind != "doughnut":
        # Newer Excel hides axes that are not explicitly kept.
        chart.x_axis.delete = False
        chart.y_axis.delete = False
        if spec.kind == "line":
            chart.x_axis.number_format = "d mmm"
            chart.x_axis.tickLblSkip = max(1, (stop - start) // 8)
        if spec.kind in ("bar", "stacked-bar"):
            # First row at the top, as the table reads; the value axis stays along the bottom.
            chart.x_axis.scaling.orientation = "maxMin"
            chart.y_axis.crosses = "max"
    return chart


def write_heatmap(sheet: Worksheet, table: Table, header: int) -> int:
    """Colour the hour-by-weekday grid quiet to busy and add a totals row (its number returned)."""
    grid_first, grid_last = header + 1, header + len(table.rows)
    sheet.conditional_formatting.add(
        f"B{grid_first}:H{grid_last}",
        ColorScaleRule(
            start_type="num",
            start_value=0,
            start_color=hex_color(SURFACE),
            mid_type="percentile",
            mid_value=60,
            mid_color=hex_color(HEAT[2]),
            end_type="max",
            end_color=hex_color(HEAT[4]),
        ),
    )
    for row in sheet.iter_rows(min_row=grid_first, max_row=grid_last, min_col=2, max_col=8):
        for cell in row:
            cell.alignment = Alignment(horizontal="center")
    sheet.append(["Total", *(sum(row[day] for row in table.rows) for day in range(1, 8))])
    total = sheet.max_row
    for cell in sheet[total]:
        cell.font = Font(bold=True)
        cell.alignment = Alignment(horizontal="center")
    sheet["A" + str(total)].alignment = Alignment(horizontal="left")
    return total


def weekday_chart(sheet: Worksheet, header: int, total: int) -> BarChart:
    chart = BarChart()
    chart.type = "col"
    chart.gapWidth = 60
    chart.legend = None
    chart.dataLabels = value_labels()
    finish(chart, "Actions by weekday")
    chart.add_data(
        Reference(sheet, min_col=1, max_col=8, min_row=total), from_rows=True, titles_from_data=True
    )
    chart.set_categories(Reference(sheet, min_col=2, max_col=8, min_row=header))
    chart.series[0].graphicalProperties.solidFill = hex_color(SERIES[0])
    chart.x_axis.delete = False
    chart.y_axis.delete = False
    return chart


def write_tiles(sheet: Worksheet, snap: Snapshot, top: int) -> None:
    """The headline figures as a row of tiles: label, value, change and what it covers."""
    sheet.row_dimensions[top + 1].height = 30
    for index, (key, label, covers) in enumerate(HEADLINE_FIGURES):
        metric = snap.summary[key]
        left = 1 + index * 2
        for offset in range(4):
            sheet.merge_cells(
                start_row=top + offset, start_column=left, end_row=top + offset, end_column=left + 1
            )
            for column in (left, left + 1):
                cell = sheet.cell(row=top + offset, column=column)
                cell.fill = TILE_FILL
                cell.border = TILE_EDGE
        sheet.cell(row=top, column=left, value=label.upper()).font = Font(
            size=8, bold=True, color=hex_color(SUBTLE)
        )
        sheet.cell(row=top + 1, column=left, value=figure(metric)).font = Font(size=16, bold=True)
        change = change_label(metric)
        delta = metric["delta"]
        tone = (
            SUBTLE
            if not change or delta == 0
            else SUCCESS
            if (delta > 0) == (key not in LOWER_IS_BETTER)
            else DANGER
        )
        sheet.cell(row=top + 2, column=left, value=change or None).font = Font(
            size=9, bold=True, color=hex_color(tone)
        )
        detail = metric["detail"] or (
            f"vs last {snap.scope.span} days" if change else "Right now" if covers == "now" else ""
        )
        sheet.cell(row=top + 3, column=left, value=detail).font = Font(
            size=8, color=hex_color(SUBTLE)
        )
        for offset in range(4):
            sheet.cell(row=top + offset, column=left).alignment = Alignment(
                horizontal="left", vertical="center", indent=1
            )


def to_xlsx(snap: Snapshot) -> bytes:
    """A Dashboard sheet of KPI tiles and every chart, then one sheet per table with
    the table beside its own native chart; the heatmap is a colour scale over its grid."""
    book = Workbook()
    overview = book.active
    overview.title = "Dashboard"
    overview.sheet_view.showGridLines = False
    for column in range(1, GRID_COLUMNS + 1):
        overview.column_dimensions[get_column_letter(column)].width = 11
    overview["A1"] = "Dashboard"
    overview["A1"].font = Font(bold=True, size=18)
    for index, line in enumerate(snap.lines, start=2):
        overview.cell(row=index, column=1, value=line).font = Font(
            size=10, color=hex_color(SUBTLE if index > 2 else INK)
        )
    tiles_top = len(snap.lines) + 3
    write_tiles(overview, snap, tiles_top)

    charts = []
    for table in tables(snap):
        sheet = book.create_sheet(table.title)
        header = write_table(sheet, table)
        beside = f"{get_column_letter(len(table.columns) + 2)}{header}"
        if table.title == "When the team works":
            total = write_heatmap(sheet, table, header)
            sheet.add_chart(weekday_chart(sheet, header, total), beside)
            charts.append(
                lambda sheet=sheet, header=header, total=total: weekday_chart(sheet, header, total)
            )
        elif build_chart(sheet, table, header) is not None:
            sheet.add_chart(build_chart(sheet, table, header), beside)
            charts.append(
                lambda sheet=sheet, table=table, header=header: build_chart(sheet, table, header)
            )

    # The overview shows every chart in two columns, in the page's order.
    for index, make in enumerate(charts):
        row = tiles_top + 5 + (index // 2) * BAND_ROWS
        column = get_column_letter(1 + (index % 2) * (GRID_COLUMNS // 2))
        overview.add_chart(make(), f"{column}{row}")

    buffer = io.BytesIO()
    book.save(buffer)
    return buffer.getvalue()
