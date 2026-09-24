"""The dashboard as a file: every figure and table the page shows, for the same
window and people, as one CSV or one Excel workbook. The PDF is drawn in
``dashboard.pdf`` from the same snapshot."""

import csv
import io
from dataclasses import dataclass
from datetime import date, datetime
from typing import Any

from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill
from openpyxl.utils import get_column_letter

from accounts.models import User
from common import enums
from dashboard import services
from dashboard.services import Scope

Cell = str | int | float | date | datetime | None

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
class Table:
    title: str
    columns: list[str]
    rows: list[list[Cell]]
    # One line under the title: what "now" means, the role the funnel is narrowed to…
    note: str = ""


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
    ("time_to_hire", "Time to hire", "window"),
)
TREND_SERIES = (
    ("candidates", "Candidates found"),
    ("shortlisted", "Shortlisted"),
    ("interviews", "Interviews"),
    ("offers", "Offers sent"),
    ("hires", "Hires"),
)
WEEKDAYS = ("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")


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
            "Needs attention",
            ["Item", "What it means", "Count"],
            [[label, meaning, attention[key]] for key, label, meaning in ATTENTION_ITEMS],
            note="Right now",
        ),
        Table(
            "Hiring activity",
            ["Day", *(label for _key, label in TREND_SERIES)],
            [
                [point["date"], *(point[key] for key, _label in TREND_SERIES)]
                for point in snap.trends["points"]
            ],
            note=f"{window}, by day",
        ),
        Table(
            "Pipeline health",
            ["Stage", "Candidates", "Avg days in stage", "Over a week"],
            [
                [stage["label"], stage["value"], number(stage["avg_days"]), stage["stuck"]]
                for stage in insights["stages"]
            ],
            note="Right now",
        ),
        Table(
            "Recruitment funnel",
            ["Stage", "Candidates", "Of previous (%)"],
            [
                [stage["label"], stage["value"], stage["conversion_pct"]]
                for stage in snap.funnel["stages"]
            ],
            note=snap.funnel_job.title if snap.funnel_job else "All roles",
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
        ),
        Table(
            "Skills in demand",
            ["Skill", "Open roles asking", "Candidates who have it"],
            [[skill["label"], skill["roles"], skill["candidates"]] for skill in insights["skills"]],
        ),
        Table(
            "Match quality",
            ["Match score", "Candidates"],
            [[band["label"], band["value"]] for band in match["bands"]],
            note=(
                f"Right now, {match['scored']} scored candidates"
                + (f", {match['avg_pct']}% on average" if match["avg_pct"] is not None else "")
            ),
        ),
        Table(
            "Experience mix",
            ["Experience", "Candidates"],
            [[band["label"], band["value"]] for band in insights["experience"]],
            note="Right now",
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
        ),
        Table(
            "Candidates by source",
            ["Source", "Candidates"],
            [[source["label"], source["value"]] for source in snap.pipeline["sources"]],
            note="Right now",
        ),
        Table(
            "Departments",
            ["Department", "Open roles", "Openings", "Candidates"],
            [
                [row["label"], row["roles"], row["openings"], row["candidates"]]
                for row in insights["departments"]
            ],
            note="Right now",
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
        ),
        Table(
            "Outreach",
            ["Channel or outcome", "Logged"],
            [
                *([row["label"], row["value"]] for row in outreach["channels"]),
                *([f"Outcome: {row['label']}", row["value"]] for row in outreach["outcomes"]),
            ],
            note=window,
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
        ),
        Table(
            "Interviewer load",
            ["Interviewer", "Held", "Completed", "Avg score"],
            [
                [row["user"].full_name, row["total"], row["completed"], row["avg_score"]]
                for row in snap.interviews["interviewers"]
            ],
            note=window,
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


def to_xlsx(snap: Snapshot) -> bytes:
    """One sheet per table, a bold frozen header row and dates as real dates."""
    book = Workbook()
    about = book.active
    about.title = "About"
    about.append(["Dashboard"])
    about["A1"].font = Font(bold=True, size=14)
    for line in snap.lines:
        about.append([line])
    about.column_dimensions["A"].width = 80

    for table in tables(snap):
        sheet = book.create_sheet(table.title)
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

    buffer = io.BytesIO()
    book.save(buffer)
    return buffer.getvalue()
