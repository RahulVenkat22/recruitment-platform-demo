"""What the assistant can do: one ``Tool`` per capability, each a thin wrapper over
the service the matching screen already calls, with the same permission check.

A tool declares its arguments as a flat Pydantic model (strings, numbers, lists of
strings: nothing the providers' function-calling schemas reject), looks up rows
through the user's visibility, and returns a ``ToolResult`` with a one-line summary
for the model, structured data it may quote, and the route the interface offers
to open. Tools that reach outside the app or are hard to undo (mail, force close,
rejections) are ``confirm`` tools: the agent shows them to the user first and runs
them only on confirmation.
"""

from __future__ import annotations

import re
import uuid
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from django.db.models import Count, Q
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from pydantic import BaseModel, Field
from rest_framework.exceptions import APIException, PermissionDenied

from accounts.models import User
from activity.models import Activity
from candidates.models import Candidate
from common.enums import (
    ApplicationStatus,
    CommunicationChannel,
    CommunicationOutcome,
    EmploymentType,
    InterviewMode,
    InterviewRound,
    JDStatus,
    NotificationType,
    ParticipantRole,
    UserRole,
    WorkMode,
)
from common.permissions import (
    can_comment_job,
    can_create_job,
    can_edit_job,
    can_force_close_job,
    can_log_contact,
    can_manage_participants,
    can_run_search,
    can_schedule_interview,
    can_transition_application,
    is_hr_staff,
    visible_job_descriptions_for,
)
from jobs.models import JobDescription
from jobs.services import JobService
from matching.skills import display_name
from notifications.services import notify_all
from pipeline.models import Application, Interview, MessageTemplate
from pipeline.services.communications import CommunicationService
from pipeline.services.interviews import InterviewService
from pipeline.services.outreach import (
    PLACEHOLDERS,
    OutreachService,
    recipient_for,
    render_text,
)
from pipeline.services.pipeline import PipelineService
from sourcing.services import SearchService

MAX_ROWS = 50
TEXT_PREVIEW = 160


class ToolError(Exception):
    """A tool could not do what was asked; ``str(exc)`` is the sentence for the model."""


@dataclass
class ToolResult:
    summary: str
    data: Any = None
    link: str = ""
    link_label: str = ""
    # True when rows changed, so the interface refreshes what it shows.
    changed: bool = False

    def as_dict(self) -> dict[str, Any]:
        return {
            "summary": self.summary,
            "link": self.link,
            "link_label": self.link_label,
            "changed": self.changed,
        }


@dataclass
class Preview:
    """What a pending action shows before the user confirms it."""

    label: str
    details: list[dict[str, str]] = field(default_factory=list)
    body: str = ""


@dataclass(frozen=True)
class Tool:
    name: str
    description: str
    schema: type[BaseModel]
    run: Callable[[Any, BaseModel], ToolResult]
    # A short label for the action card ("Create job description").
    label: Callable[[BaseModel], str]
    # Shown to the user and run only once they confirm.
    confirm: bool = False
    preview: Callable[[Any, BaseModel], Preview] | None = None
    # Reads never change rows; the interface does not refresh after them.
    write: bool = True


# ------------------------------------------------------------------ helpers


def _text(value: str, limit: int = TEXT_PREVIEW) -> str:
    value = " ".join((value or "").split())
    return value if len(value) <= limit else value[: limit - 1] + "…"


def _lines(items: list[str]) -> str:
    return "\n".join(item.strip() for item in items if item and item.strip())


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise PermissionDenied(message)


def _uuid(value: str, what: str, hint: str) -> str:
    """``value`` as a UUID string, or a ``ToolError`` telling the model where ids come from."""
    try:
        return str(uuid.UUID(str(value or "").strip()))
    except ValueError:
        raise ToolError(
            f"{what} must be an id returned by {hint}; got {value!r}. Never invent ids."
        ) from None


def _uuids(values: list[str], what: str, hint: str) -> list[str]:
    return [_uuid(value, what, hint) for value in values]


def _job(user: Any, job_id: str) -> JobDescription:
    job_id = _uuid(job_id, "job_id", "find_job_descriptions")
    jd = (
        visible_job_descriptions_for(user)
        .select_related("created_by")
        .prefetch_related("participants__user")
        .filter(pk=job_id)
        .first()
    )
    if jd is None:
        raise ToolError(
            f"No job description with id {job_id} is visible to you; find it first with "
            "find_job_descriptions."
        )
    return jd


def _applications(user: Any, ids: list[str]) -> list[Application]:
    ids = _uuids(ids, "application_id", "list_candidates")
    if not ids:
        raise ToolError("Give at least one application_id from list_candidates.")
    visible = visible_job_descriptions_for(user).values("pk")
    rows = list(
        Application.objects.filter(pk__in=ids, job_description_id__in=visible).select_related(
            "candidate", "job_description__created_by", "owner"
        )
    )
    found = {str(row.pk) for row in rows}
    missing = [item for item in ids if item not in found]
    if missing:
        raise ToolError(
            f"{len(missing)} application id(s) were not found: {', '.join(missing[:5])}. Use the "
            "application_id values returned by list_candidates."
        )
    return rows


def _users(ids: list[str]) -> list[User]:
    ids = _uuids(ids, "user_id", "find_people")
    if not ids:
        raise ToolError("Give at least one user_id from find_people.")
    rows = list(User.objects.filter(pk__in=ids, is_active=True))
    found = {str(row.pk) for row in rows}
    missing = [item for item in ids if item not in found]
    if missing:
        raise ToolError(
            f"{len(missing)} user id(s) were not found: {', '.join(missing[:5])}. Use the ids "
            "returned by find_people."
        )
    return rows


def _job_row(jd: JobDescription, counts: dict[str, int] | None = None) -> dict[str, Any]:
    row = {
        "job_id": str(jd.pk),
        "title": jd.title,
        "department": jd.department,
        "location": jd.location,
        "status": str(jd.status),
        "status_label": jd.get_status_display(),
        "work_mode": str(jd.work_mode),
        "employment_type": str(jd.employment_type),
        "experience_years": f"{jd.experience_min_years}-{jd.experience_max_years}",
        "openings": jd.openings,
        "created_by": jd.created_by.full_name,
        "updated_at": jd.updated_at.isoformat(timespec="minutes"),
        "link": f"/jobs/{jd.pk}",
    }
    if counts is not None:
        row.update(counts)
    return row


def _application_row(application: Application) -> dict[str, Any]:
    candidate = application.candidate
    match = getattr(application, "match", None)
    return {
        "application_id": str(application.pk),
        "candidate_id": str(candidate.pk),
        "name": candidate.full_name,
        "status": str(application.status),
        "status_label": application.get_status_display(),
        "match_pct": round(float(match.overall_pct)) if match is not None else None,
        "current_title": candidate.current_title,
        "current_company": candidate.current_company,
        "experience_years": float(candidate.total_experience_years or 0),
        "location": candidate.location,
        "has_email": bool(recipient_for(candidate)),
        "owner": application.owner.full_name if application.owner else "",
        "link": f"/candidates/{candidate.pk}?jd={application.job_description_id}",
    }


def _user_row(user: User) -> dict[str, Any]:
    return {
        "user_id": str(user.pk),
        "name": user.full_name,
        "role": str(user.role),
        "role_label": user.get_role_display(),
        "designation": user.designation,
        "department": user.department,
    }


def _when(value: str) -> datetime:
    parsed = parse_datetime((value or "").strip())
    if parsed is None:
        raise ToolError(
            f"{value!r} is not an ISO 8601 date-time; use e.g. 2026-10-02T10:30:00+05:30."
        )
    if timezone.is_naive(parsed):
        parsed = timezone.make_aware(parsed)
    return parsed


def _choice(value: str, choices: Any, what: str) -> str:
    key = (value or "").strip().lower().replace(" ", "_").replace("-", "_")
    if key not in choices.values:
        raise ToolError(f"{what} must be one of {', '.join(choices.values)}; got {value!r}.")
    return key


# ------------------------------------------------------------- read tools


class FindJobsArgs(BaseModel):
    """Find job descriptions the user can see. Call this before any action on a job the
    user named, and use the returned job_id."""

    query: str = Field("", description="Words from the title or department; empty for all.")
    status: str = Field(
        "", description="Filter: draft, open, on_hold, closed, force_closed or archived."
    )
    limit: int = Field(10, description="Rows to return, at most 50.")


def find_job_descriptions(user: Any, args: FindJobsArgs) -> ToolResult:
    qs = visible_job_descriptions_for(user).select_related("created_by")
    query = args.query.strip()
    if query:
        qs = qs.filter(Q(title__icontains=query) | Q(department__icontains=query))
    if args.status.strip():
        qs = qs.filter(status=_choice(args.status, JDStatus, "status"))
    qs = qs.annotate(
        candidates=Count("applications", distinct=True),
        onboarded=Count(
            "applications",
            filter=Q(applications__status=ApplicationStatus.ONBOARDED),
            distinct=True,
        ),
    ).order_by("-updated_at")
    rows = [
        _job_row(jd, {"candidates": jd.candidates, "onboarded": jd.onboarded})
        for jd in qs[: max(1, min(args.limit, MAX_ROWS))]
    ]
    label = f'matching "{query}"' if query else "visible to you"
    return ToolResult(
        f"{len(rows)} job description(s) {label}.", rows, "/jobs", "Open job descriptions"
    )


class JobIdArgs(BaseModel):
    """One job description in full: every field, the people involved and the pipeline
    counts."""

    job_id: str = Field(description="The job_id from find_job_descriptions.")


def get_job_description(user: Any, args: JobIdArgs) -> ToolResult:
    jd = _job(user, args.job_id)
    data = _job_row(jd, JobService.metrics(jd))
    data.update(
        {
            "salary": (
                f"{jd.salary_min or 0}-{jd.salary_max or 0} {jd.salary_currency}"
                if jd.salary_min or jd.salary_max
                else ""
            ),
            "domain": jd.domain or "",
            "required_skills": [display_name(key) for key in jd.required_skills],
            "preferred_skills": [display_name(key) for key in jd.preferred_skills],
            "education_requirements": jd.education_requirements,
            "responsibilities": jd.responsibilities,
            "qualifications": jd.qualifications,
            "additional_requirements": jd.additional_requirements,
            "description": jd.description[:3000],
            "people": [
                {
                    "user_id": str(row.user_id),
                    "name": row.user.full_name,
                    "role": row.get_role_in_recruitment_display(),
                }
                for row in jd.participants.all()
            ],
            "version": jd.current_version,
        }
    )
    return ToolResult(
        f'"{jd.title}" ({jd.get_status_display()}).', data, f"/jobs/{jd.pk}", "Open job"
    )


class ListCandidatesArgs(BaseModel):
    """Candidates on a job description (with job_id) or in the whole library (without).
    Returns application_id values, which the action tools take."""

    job_id: str = Field("", description="Restrict to this job description's pipeline.")
    status: str = Field(
        "",
        description=(
            "Comma-separated pipeline statuses: new, ai_shortlisted, hr_review, contact_pending, "
            "contacted, phone_screening, interview_scheduled, technical_interview, hr_interview, "
            "final_interview, selected, offer_sent, offer_accepted, onboarding, onboarded, "
            "rejected, withdrawn, on_hold."
        ),
    )
    query: str = Field("", description="Words from the name, title, company, location or a skill.")
    min_match: int = Field(0, description="Only rows with at least this match percentage.")
    limit: int = Field(20, description="Rows to return, at most 50.")


def list_candidates(user: Any, args: ListCandidatesArgs) -> ToolResult:
    visible = visible_job_descriptions_for(user).values("pk")
    qs = Application.objects.filter(job_description_id__in=visible).select_related(
        "candidate", "match", "owner", "job_description"
    )
    if args.job_id.strip():
        jd = _job(user, args.job_id.strip())
        qs = qs.filter(job_description=jd)
    statuses = [
        _choice(s, ApplicationStatus, "status") for s in args.status.split(",") if s.strip()
    ]
    if statuses:
        qs = qs.filter(status__in=statuses)
    query = args.query.strip()
    if query:
        qs = qs.filter(
            Q(candidate__full_name__icontains=query)
            | Q(candidate__current_title__icontains=query)
            | Q(candidate__current_company__icontains=query)
            | Q(candidate__location__icontains=query)
            | Q(candidate__skills__display_name__icontains=query)
        ).distinct()
    if args.min_match > 0:
        qs = qs.filter(match__overall_pct__gte=args.min_match)
    qs = qs.order_by("-match__overall_pct", "-last_activity_at")
    total = qs.count()
    rows = []
    for application in qs[: max(1, min(args.limit, MAX_ROWS))]:
        row = _application_row(application)
        if not args.job_id.strip():
            row["job_title"] = application.job_description.title
            row["job_id"] = str(application.job_description_id)
        rows.append(row)
    shown = f"{len(rows)} of {total}" if total > len(rows) else str(total)
    return ToolResult(f"{shown} candidate(s).", rows, "/candidates", "Open candidates")


class CandidateIdArgs(BaseModel):
    """One candidate's profile: headline, skills, experience and every job they are on."""

    candidate_id: str = Field(description="The candidate_id from list_candidates.")


def get_candidate(user: Any, args: CandidateIdArgs) -> ToolResult:
    candidate = (
        Candidate.objects.filter(pk=_uuid(args.candidate_id, "candidate_id", "list_candidates"))
        .prefetch_related("skills", "experiences", "education")
        .first()
    )
    if candidate is None:
        raise ToolError(f"No candidate with id {args.candidate_id}.")
    visible = visible_job_descriptions_for(user).values("pk")
    applications = candidate.applications.filter(job_description_id__in=visible).select_related(
        "job_description", "match"
    )
    data = {
        "candidate_id": str(candidate.pk),
        "name": candidate.full_name,
        "headline": candidate.headline,
        "current_title": candidate.current_title,
        "current_company": candidate.current_company,
        "location": candidate.location,
        "experience_years": float(candidate.total_experience_years or 0),
        "summary": candidate.summary[:1200],
        "skills": [skill.display_name for skill in candidate.skills.all()[:30]],
        "experience": [
            f"{row.title} at {row.company} ({row.start_date:%Y}-"
            f"{'now' if row.is_current or not row.end_date else row.end_date.year})"
            for row in candidate.experiences.all()[:8]
        ],
        "education": [
            f"{row.degree} {row.field}, {row.institution} ({row.end_year})"
            for row in candidate.education.all()[:4]
        ],
        "has_email": bool(recipient_for(candidate)),
        "jobs": [
            {
                "application_id": str(row.pk),
                "job_id": str(row.job_description_id),
                "job_title": row.job_description.title,
                "status": str(row.status),
                "status_label": row.get_status_display(),
                "match_pct": round(float(row.match.overall_pct))
                if getattr(row, "match", None)
                else None,
            }
            for row in applications
        ],
        "link": f"/candidates/{candidate.pk}",
    }
    return ToolResult(f"{candidate.full_name}.", data, data["link"], "Open candidate")


class FindPeopleArgs(BaseModel):
    """Staff accounts (recruiters, hiring managers, interviewers, employees): who to
    notify, add to a recruitment or assign an interview to."""

    query: str = Field("", description="Words from the name, email, designation or department.")
    role: str = Field("", description="Filter: hr_admin, hr, interviewer, employee or admin.")
    limit: int = Field(10, description="Rows to return, at most 50.")


def find_people(user: Any, args: FindPeopleArgs) -> ToolResult:
    qs = User.objects.filter(is_active=True)
    query = args.query.strip()
    if query:
        qs = qs.filter(
            Q(first_name__icontains=query)
            | Q(last_name__icontains=query)
            | Q(email__icontains=query)
            | Q(designation__icontains=query)
            | Q(department__icontains=query)
        )
    if args.role.strip():
        qs = qs.filter(role=_choice(args.role, UserRole, "role"))
    rows = [_user_row(row) for row in qs[: max(1, min(args.limit, MAX_ROWS))]]
    return ToolResult(f"{len(rows)} person(s).", rows)


class NoArgs(BaseModel):
    """No arguments."""


def list_email_templates(user: Any, args: NoArgs) -> ToolResult:
    rows = [
        {
            "template_id": str(row.pk),
            "name": row.name,
            "subject": row.subject,
            "body_preview": _text(row.body, 200),
            "is_default": row.is_default,
        }
        for row in MessageTemplate.objects.filter(is_active=True)
    ]
    return ToolResult(f"{len(rows)} email template(s).", rows, "/templates", "Open templates")


class JobActivityArgs(BaseModel):
    """The latest timeline events of a job description: comments, status changes,
    candidate moves, interviews."""

    job_id: str = Field(description="The job_id from find_job_descriptions.")
    limit: int = Field(15, description="Rows to return, at most 50.")


def job_activity(user: Any, args: JobActivityArgs) -> ToolResult:
    jd = _job(user, args.job_id)
    rows = [
        {
            "when": row.occurred_at.isoformat(timespec="minutes"),
            "category": row.category,
            "title": row.title,
            "description": _text(row.description, 240),
        }
        for row in Activity.objects.filter(job_description=jd).select_related("actor")[
            : max(1, min(args.limit, MAX_ROWS))
        ]
    ]
    return ToolResult(
        f'{len(rows)} event(s) on "{jd.title}".',
        rows,
        f"/jobs/{jd.pk}?tab=timeline",
        "Open timeline",
    )


class ListInterviewsArgs(BaseModel):
    """Interviews, upcoming by default, on a job description or for a candidate."""

    job_id: str = Field("", description="Restrict to this job description.")
    candidate_id: str = Field("", description="Restrict to this candidate.")
    upcoming_only: bool = Field(True, description="Only interviews that have not happened yet.")
    limit: int = Field(10, description="Rows to return, at most 50.")


def list_interviews(user: Any, args: ListInterviewsArgs) -> ToolResult:
    visible = visible_job_descriptions_for(user).values("pk")
    qs = Interview.objects.filter(application__job_description_id__in=visible).select_related(
        "application__candidate", "application__job_description", "interviewer"
    )
    if args.job_id.strip():
        qs = qs.filter(application__job_description=_job(user, args.job_id))
    if args.candidate_id.strip():
        qs = qs.filter(
            application__candidate_id=_uuid(args.candidate_id, "candidate_id", "list_candidates")
        )
    if args.upcoming_only:
        qs = qs.filter(scheduled_at__gte=timezone.now()).order_by("scheduled_at")
    else:
        qs = qs.order_by("-scheduled_at")
    rows = [
        {
            "interview_id": str(row.pk),
            "candidate": row.application.candidate.full_name,
            "job_title": row.application.job_description.title,
            "round": row.get_round_display(),
            "interviewer": row.interviewer.full_name,
            "scheduled_at": row.scheduled_at.isoformat(timespec="minutes"),
            "status": row.get_status_display(),
            "mode": row.get_mode_display(),
        }
        for row in qs[: max(1, min(args.limit, MAX_ROWS))]
    ]
    return ToolResult(f"{len(rows)} interview(s).", rows, "/interviews", "Open interviews")


# ------------------------------------------------------------ write tools


class CreateJobArgs(BaseModel):
    """Create a job description. Write a complete, professional posting from the user's
    brief: fill EVERY field yourself, do not ask the user for details they did not
    volunteer, and state your assumptions in the reply."""

    title: str = Field(description="Job title, e.g. 'Senior Python Developer'.")
    department: str = Field(description="Team, e.g. 'Engineering'.")
    location: str = Field(description="City and country, e.g. 'Chennai, India', or 'Remote'.")
    work_mode: str = Field("hybrid", description="onsite, hybrid or remote.")
    employment_type: str = Field(
        "full_time", description="full_time, part_time, contract or internship."
    )
    experience_min_years: int = Field(description="Minimum years of experience.")
    experience_max_years: int = Field(
        description="Maximum years of experience; a single figure like '3 years' means 3 to 5."
    )
    required_skills: list[str] = Field(
        description="4-8 must-have skills as short canonical names ('Python', 'PostgreSQL')."
    )
    preferred_skills: list[str] = Field(
        default_factory=list, description="2-5 nice-to-have skills."
    )
    responsibilities: list[str] = Field(
        description="5-8 responsibilities, one sentence each, no bullet characters."
    )
    qualifications: list[str] = Field(
        description="4-6 qualifications, one sentence each, no bullet characters."
    )
    education_requirements: str = Field(
        "", description='Degree asked for, e.g. "Bachelor\'s in Computer Science or equivalent".'
    )
    additional_requirements: list[str] = Field(
        default_factory=list, description="Anything else: shifts, travel, notice period."
    )
    description: str = Field(
        description=(
            "The posting's overview: 2-3 paragraphs (120-220 words) about the role, the team "
            "and what success looks like. Plain text or markdown."
        )
    )
    domain: str = Field("", description="Industry, e.g. fintech, healthcare, ecommerce.")
    openings: int = Field(1, description="Number of positions.")
    salary_min: int = Field(0, description="Annual minimum in salary_currency; 0 when unknown.")
    salary_max: int = Field(0, description="Annual maximum in salary_currency; 0 when unknown.")
    salary_currency: str = Field("INR", description="ISO currency code.")
    publish: bool = Field(
        False, description="True to open the job for hiring straight away; False keeps a draft."
    )


def _job_content(args: BaseModel) -> dict[str, Any]:
    values = args.model_dump()
    content = {
        "title": values["title"].strip(),
        "department": values["department"].strip(),
        "location": values["location"].strip(),
        "work_mode": _choice(values["work_mode"], WorkMode, "work_mode"),
        "employment_type": _choice(values["employment_type"], EmploymentType, "employment_type"),
        "experience_min_years": max(0, int(values["experience_min_years"])),
        "experience_max_years": max(0, int(values["experience_max_years"])),
        "required_skills": [s for s in values["required_skills"] if s.strip()],
        "preferred_skills": [s for s in values["preferred_skills"] if s.strip()],
        "responsibilities": _lines(values["responsibilities"]),
        "qualifications": _lines(values["qualifications"]),
        "education_requirements": values["education_requirements"].strip(),
        "additional_requirements": _lines(values["additional_requirements"]),
        "description": values["description"].strip(),
        "domain": values["domain"].strip() or None,
        "openings": max(1, int(values["openings"])),
        "salary_min": int(values["salary_min"]) or None,
        "salary_max": int(values["salary_max"]) or None,
        "salary_currency": (values["salary_currency"].strip().upper() or "INR")[:3],
    }
    if content["experience_max_years"] < content["experience_min_years"]:
        content["experience_max_years"] = content["experience_min_years"] + 2
    if not content["required_skills"]:
        raise ToolError("required_skills needs at least one skill.")
    if (
        content["salary_min"]
        and content["salary_max"]
        and content["salary_max"] < content["salary_min"]
    ):
        content["salary_min"], content["salary_max"] = content["salary_max"], content["salary_min"]
    return content


def create_job_description(user: Any, args: CreateJobArgs) -> ToolResult:
    _require(can_create_job(user), "Only HR staff can create job descriptions.")
    content = _job_content(args)
    content["status"] = JDStatus.OPEN if args.publish else JDStatus.DRAFT
    jd = JobService.create(content, [], user)
    return ToolResult(
        f'Created "{jd.title}" as {jd.get_status_display().lower()} (id {jd.pk}).',
        _job_row(jd),
        f"/jobs/{jd.pk}",
        "Open job description",
        changed=True,
    )


class UpdateJobArgs(BaseModel):
    """Change fields of an existing job description; only the fields given are changed.
    A new version is recorded automatically."""

    job_id: str = Field(description="The job_id from find_job_descriptions.")
    title: str = ""
    department: str = ""
    location: str = ""
    work_mode: str = Field("", description="onsite, hybrid or remote.")
    employment_type: str = Field("", description="full_time, part_time, contract or internship.")
    experience_min_years: int = Field(-1, description="-1 leaves it unchanged.")
    experience_max_years: int = Field(-1, description="-1 leaves it unchanged.")
    required_skills: list[str] = Field(default_factory=list, description="Full replacement list.")
    preferred_skills: list[str] = Field(default_factory=list, description="Full replacement list.")
    responsibilities: list[str] = Field(default_factory=list, description="Full replacement list.")
    qualifications: list[str] = Field(default_factory=list, description="Full replacement list.")
    education_requirements: str = ""
    additional_requirements: list[str] = Field(default_factory=list)
    description: str = ""
    domain: str = ""
    openings: int = Field(0, description="0 leaves it unchanged.")
    salary_min: int = Field(0, description="0 leaves it unchanged.")
    salary_max: int = Field(0, description="0 leaves it unchanged.")
    salary_currency: str = ""
    change_summary: str = Field("", description="One line saying what changed and why.")


def update_job_description(user: Any, args: UpdateJobArgs) -> ToolResult:
    jd = _job(user, args.job_id)
    _require(can_edit_job(user, jd), "You cannot edit this job description.")
    data: dict[str, Any] = {}
    for name in ("title", "department", "location", "education_requirements", "description"):
        if getattr(args, name).strip():
            data[name] = getattr(args, name).strip()
    if args.work_mode.strip():
        data["work_mode"] = _choice(args.work_mode, WorkMode, "work_mode")
    if args.employment_type.strip():
        data["employment_type"] = _choice(args.employment_type, EmploymentType, "employment_type")
    if args.experience_min_years >= 0:
        data["experience_min_years"] = args.experience_min_years
    if args.experience_max_years >= 0:
        data["experience_max_years"] = args.experience_max_years
    for name in ("required_skills", "preferred_skills"):
        if getattr(args, name):
            data[name] = [s for s in getattr(args, name) if s.strip()]
    for name in ("responsibilities", "qualifications", "additional_requirements"):
        if getattr(args, name):
            data[name] = _lines(getattr(args, name))
    if args.domain.strip():
        data["domain"] = args.domain.strip()
    if args.openings > 0:
        data["openings"] = args.openings
    if args.salary_min > 0:
        data["salary_min"] = args.salary_min
    if args.salary_max > 0:
        data["salary_max"] = args.salary_max
    if args.salary_currency.strip():
        data["salary_currency"] = args.salary_currency.strip().upper()[:3]
    if not data:
        raise ToolError("Nothing to change: give at least one field.")
    before = jd.current_version
    jd = JobService.update(jd, data, user, args.change_summary)
    what = ", ".join(name.replace("_", " ") for name in data)
    if jd.current_version == before:
        return ToolResult(f'"{jd.title}" already had these values; nothing changed.', _job_row(jd))
    return ToolResult(
        f'Updated {what} on "{jd.title}" (now v{jd.current_version}).',
        _job_row(jd),
        f"/jobs/{jd.pk}",
        "Open job description",
        changed=True,
    )


class JobStatusArgs(BaseModel):
    """Publish, put on hold, close, reopen or archive a job description."""

    job_id: str = Field(description="The job_id from find_job_descriptions.")
    status: str = Field(
        description="open (publishes a draft or reopens), on_hold, closed or archived."
    )
    note: str = Field("", description="Why, shown on the timeline.")


def change_job_status(user: Any, args: JobStatusArgs) -> ToolResult:
    jd = _job(user, args.job_id)
    _require(can_edit_job(user, jd), "You cannot change this job description's status.")
    target = _choice(args.status, JDStatus, "status")
    if target == JDStatus.DRAFT and jd.status == JDStatus.ARCHIVED:
        jd = JobService.unarchive(jd, user)
    else:
        jd = JobService.set_status(jd, target, user, args.note)
    return ToolResult(
        f'"{jd.title}" is now {jd.get_status_display()}.',
        _job_row(jd),
        f"/jobs/{jd.pk}",
        "Open job description",
        changed=True,
    )


class ForceCloseArgs(BaseModel):
    """End a recruitment early (force close). Everyone involved is notified."""

    job_id: str = Field(description="The job_id from find_job_descriptions.")
    reason: str = Field(description="Why the job is being closed, shown on the timeline.")


def force_close_job(user: Any, args: ForceCloseArgs) -> ToolResult:
    jd = _job(user, args.job_id)
    _require(can_force_close_job(user, jd), "You cannot force close this job description.")
    jd = JobService.force_close(jd, user, args.reason)
    return ToolResult(
        f'Force closed "{jd.title}".', _job_row(jd), f"/jobs/{jd.pk}", "Open job description", True
    )


def _force_close_preview(user: Any, args: ForceCloseArgs) -> Preview:
    jd = _job(user, args.job_id)
    return Preview(
        f'Force close "{jd.title}"',
        [
            {"label": "Current status", "value": jd.get_status_display()},
            {"label": "Reason", "value": args.reason},
        ],
    )


class CommentArgs(BaseModel):
    """Add a comment to a job description's timeline; everyone involved is notified."""

    job_id: str = Field(description="The job_id from find_job_descriptions.")
    text: str = Field(description="The comment, as the user would write it.")


def add_job_comment(user: Any, args: CommentArgs) -> ToolResult:
    jd = _job(user, args.job_id)
    _require(can_comment_job(user, jd), "You cannot comment on this job description.")
    text = args.text.strip()
    if not text:
        raise ToolError("The comment is empty.")
    JobService.add_comment(jd, text[:1000], user)
    return ToolResult(
        f'Comment added to "{jd.title}".',
        {"job_id": str(jd.pk), "comment": text[:1000]},
        f"/jobs/{jd.pk}?tab=timeline",
        "Open timeline",
        changed=True,
    )


class AddParticipantsArgs(BaseModel):
    """Add people to "People involved in the recruitment" of a job description."""

    job_id: str = Field(description="The job_id from find_job_descriptions.")
    user_ids: list[str] = Field(description="user_id values from find_people.")
    role: str = Field(
        "interviewer", description="recruiter, hiring_manager, interviewer or observer."
    )


def add_participants(user: Any, args: AddParticipantsArgs) -> ToolResult:
    jd = _job(user, args.job_id)
    _require(can_manage_participants(user, jd), "You cannot change who is involved in this job.")
    role = _choice(args.role, ParticipantRole, "role")
    if role == ParticipantRole.OWNER:
        raise ToolError(
            "The owner is the creator; add people as recruiter, hiring_manager, interviewer "
            "or observer."
        )
    people = _users(args.user_ids)
    added = JobService.add_participants(
        jd, [{"user": person, "role_in_recruitment": role} for person in people], user
    )
    names = ", ".join(row.user.full_name for row in added)
    return ToolResult(
        f'Added {names} to "{jd.title}" as {ParticipantRole(role).label}.',
        [_user_row(row.user) for row in added],
        f"/jobs/{jd.pk}",
        "Open job description",
        changed=True,
    )


class MoveCandidatesArgs(BaseModel):
    """Move candidates to another pipeline status (shortlist, reject, put on hold, mark
    selected, ...). Rejections, withdrawals, holds and backward moves need a note."""

    application_ids: list[str] = Field(description="application_id values from list_candidates.")
    status: str = Field(
        description=(
            "Target: hr_review (shortlist), contact_pending, contacted, phone_screening, "
            "interview_scheduled, technical_interview, hr_interview, final_interview, selected, "
            "offer_sent, offer_accepted, onboarding, onboarded, rejected, withdrawn or on_hold."
        )
    )
    note: str = Field("", description="The reason or note for the timeline.")


def move_candidates(user: Any, args: MoveCandidatesArgs) -> ToolResult:
    applications = _applications(user, args.application_ids)
    for application in applications:
        _require(
            can_transition_application(user, application.job_description),
            f"You cannot change candidates on {application.job_description.title}.",
        )
    target = _choice(args.status, ApplicationStatus, "status")
    moved, skipped, _activities = PipelineService.bulk_transition(
        applications, target, user, note=args.note
    )
    label = ApplicationStatus(target).label
    names = ", ".join(row.candidate.full_name for row in moved)
    summary = f"Moved {len(moved)} candidate(s) to {label}" + (f": {names}." if names else ".")
    if skipped:
        summary += f" Skipped {len(skipped)}: " + "; ".join(
            f"{next(a.candidate.full_name for a in applications if a.pk == pk)} ({why})"
            for pk, why in skipped.items()
        )
    first = moved[0] if moved else applications[0]
    return ToolResult(
        summary,
        {
            "moved": [str(row.pk) for row in moved],
            "skipped": {str(k): v for k, v in skipped.items()},
        },
        f"/jobs/{first.job_description_id}?tab=candidates",
        "Open candidates",
        changed=bool(moved),
    )


def _move_preview(user: Any, args: MoveCandidatesArgs) -> Preview:
    applications = _applications(user, args.application_ids)
    label = ApplicationStatus(_choice(args.status, ApplicationStatus, "status")).label
    return Preview(
        f"Move {len(applications)} candidate(s) to {label}",
        [
            {
                "label": "Candidates",
                "value": ", ".join(a.candidate.full_name for a in applications),
            },
            {"label": "Note", "value": args.note or "—"},
        ],
    )


class SendEmailArgs(BaseModel):
    """Email candidates about the job they are on. Write the subject and body yourself in
    the user's voice; use these placeholders where the value belongs, they are filled per
    candidate: {candidate_first_name}, {candidate_name}, {job_title}, {job_location},
    {company}, {recruiter_name}, {recruiter_email}."""

    application_ids: list[str] = Field(description="application_id values from list_candidates.")
    subject: str = Field(description="Subject line, placeholders allowed.")
    body: str = Field(description="Plain-text body, 80-200 words, placeholders allowed.")


def send_email(user: Any, args: SendEmailArgs) -> ToolResult:
    applications = _applications(user, args.application_ids)
    for application in applications:
        _require(
            can_log_contact(user, application.job_description),
            f"You cannot email candidates on {application.job_description.title}.",
        )
    sent, skipped = OutreachService.send_bulk(
        applications, actor=user, subject=args.subject, body=args.body
    )
    by_id = {str(a.pk): a for a in applications}
    summary = f"Sent {len(sent)} email(s)"
    if sent:
        summary += ": " + ", ".join(
            by_id[str(row.application_id)].candidate.full_name for row in sent
        )
    summary += "."
    if skipped:
        summary += " Not sent to " + "; ".join(
            f"{by_id[pk].candidate.full_name} ({why})" for pk, why in skipped.items()
        )
    return ToolResult(
        summary,
        {"sent": [str(row.application_id) for row in sent], "skipped": skipped},
        f"/jobs/{applications[0].job_description_id}?tab=candidates",
        "Open candidates",
        changed=bool(sent),
    )


def _email_preview(user: Any, args: SendEmailArgs) -> Preview:
    """The mail as the first recipient will read it; the rest get their own placeholders."""
    applications = _applications(user, args.application_ids)
    with_address = [a for a in applications if recipient_for(a.candidate)]
    first = with_address[0] if with_address else applications[0]
    subject, body = render_text(args.subject, args.body, first, user)
    details = [
        {
            "label": "To",
            "value": ", ".join(a.candidate.full_name for a in with_address) or "nobody",
        },
        {"label": "Subject", "value": subject},
    ]
    if len(with_address) > 1:
        details.append(
            {
                "label": "Preview",
                "value": f"Shown as {first.candidate.full_name} will read it; each candidate "
                "gets their own name and role.",
            }
        )
    without = [a.candidate.full_name for a in applications if a not in with_address]
    if without:
        details.append({"label": "No email address", "value": ", ".join(without)})
    return Preview(f"Send email to {len(with_address)} candidate(s)", details, body)


class NotifyArgs(BaseModel):
    """Send an in-app notification to staff (it shows under their bell)."""

    user_ids: list[str] = Field(description="user_id values from find_people.")
    title: str = Field(description="One line, at most 200 characters.")
    message: str = Field("", description="The notification text.")
    link_url: str = Field(
        "", description="In-app route to open, e.g. /jobs/<job_id>; empty for none."
    )


def notify_people(user: Any, args: NotifyArgs) -> ToolResult:
    people = _users(args.user_ids)
    link = args.link_url.strip()
    if link and not link.startswith("/"):
        raise ToolError("link_url must be an in-app route starting with '/'.")
    rows = notify_all(
        people, NotificationType.SYSTEM, args.title.strip()[:200], args.message.strip(), link, user
    )
    names = [row.recipient.full_name for row in rows]
    skipped = len(people) - len(rows)
    summary = f"Notified {len(rows)} person(s)" + (f": {', '.join(names)}." if names else ".")
    if skipped:
        summary += " (You are never notified by yourself.)"
    return ToolResult(summary, {"notified": names}, "/notifications", "Open notifications", True)


class ScheduleInterviewArgs(BaseModel):
    """Schedule an interview for a candidate; the interviewer and the owners are notified
    and the candidate moves to Interview Scheduled."""

    application_id: str = Field(description="The application_id from list_candidates.")
    interviewer_id: str = Field(description="user_id from find_people.")
    round: str = Field(
        "technical", description="phone_screen, technical, system_design, managerial, hr or final."
    )
    scheduled_at: str = Field(
        description="ISO 8601 date-time with offset, e.g. 2026-10-02T10:30:00+05:30."
    )
    duration_minutes: int = Field(60, description="Length in minutes.")
    mode: str = Field("video", description="video, phone or onsite.")
    meeting_link: str = Field("", description="Video link, when known.")
    location: str = Field("", description="Room or address for on-site interviews.")


def schedule_interview(user: Any, args: ScheduleInterviewArgs) -> ToolResult:
    application = _applications(user, [args.application_id])[0]
    _require(
        can_schedule_interview(user, application.job_description),
        "You cannot schedule interviews for this job description.",
    )
    interviewer = _users([args.interviewer_id])[0]
    interview = InterviewService.schedule(
        application,
        round=_choice(args.round, InterviewRound, "round"),
        interviewer=interviewer,
        scheduled_at=_when(args.scheduled_at),
        actor=user,
        duration_minutes=max(15, args.duration_minutes),
        mode=_choice(args.mode, InterviewMode, "mode"),
        meeting_link=args.meeting_link.strip() or None,
        location=args.location.strip() or None,
    )
    when = timezone.localtime(interview.scheduled_at).strftime("%d %b %Y, %H:%M")
    return ToolResult(
        f"{interview.get_round_display()} interview for {application.candidate.full_name} with "
        f"{interviewer.full_name} on {when}.",
        {"interview_id": str(interview.pk)},
        "/interviews",
        "Open interviews",
        changed=True,
    )


class LogContactArgs(BaseModel):
    """Record a call, message or meeting with a candidate on their contact log."""

    application_id: str = Field(description="The application_id from list_candidates.")
    channel: str = Field(description="phone, email, linkedin, whatsapp or in_person.")
    outcome: str = Field(
        description=(
            "connected, no_answer, voicemail, email_sent, replied, not_interested or "
            "callback_requested."
        )
    )
    summary: str = Field(description="One line, what happened.")
    notes: str = Field("", description="Details.")


def log_contact(user: Any, args: LogContactArgs) -> ToolResult:
    application = _applications(user, [args.application_id])[0]
    _require(
        can_log_contact(user, application.job_description),
        "You cannot log contact for this job description.",
    )
    CommunicationService.log(
        application,
        channel=_choice(args.channel, CommunicationChannel, "channel"),
        outcome=_choice(args.outcome, CommunicationOutcome, "outcome"),
        summary=args.summary,
        notes=args.notes,
        actor=user,
    )
    return ToolResult(
        f"Logged the contact with {application.candidate.full_name}.",
        None,
        f"/candidates/{application.candidate_id}?jd={application.job_description_id}",
        "Open candidate",
        changed=True,
    )


class StartSearchArgs(BaseModel):
    """Run the AI candidate search for a job description (it takes a minute; the
    results appear on the Search Candidates page)."""

    job_id: str = Field(description="The job_id from find_job_descriptions.")


def start_candidate_search(user: Any, args: StartSearchArgs) -> ToolResult:
    jd = _job(user, args.job_id)
    _require(can_run_search(user, jd), "You cannot run searches for this job description.")
    outcome = SearchService.start(jd, None, user)
    return ToolResult(
        f'Candidate search started for "{jd.title}".',
        {"run_id": str(outcome.run.pk)},
        f"/search?jd={jd.pk}",
        "Follow the search",
        changed=True,
    )


class AddCandidateArgs(BaseModel):
    """Attach a candidate from the library to a job description's pipeline."""

    candidate_id: str = Field(description="The candidate_id from list_candidates or get_candidate.")
    job_id: str = Field(description="The job_id from find_job_descriptions.")


def add_candidate_to_job(user: Any, args: AddCandidateArgs) -> ToolResult:
    jd = _job(user, args.job_id)
    _require(can_transition_application(user, jd), "You cannot add candidates to this job.")
    candidate = Candidate.objects.filter(
        pk=_uuid(args.candidate_id, "candidate_id", "list_candidates")
    ).first()
    if candidate is None:
        raise ToolError(f"No candidate with id {args.candidate_id}.")
    application = PipelineService.add_manually(candidate, jd, user)
    return ToolResult(
        f'Added {candidate.full_name} to "{jd.title}" '
        f"({float(application.match.overall_pct):.0f}% match).",
        _application_row(application),
        f"/candidates/{candidate.pk}?jd={jd.pk}",
        "Open candidate",
        changed=True,
    )


class CreateTemplateArgs(BaseModel):
    """Save a reusable email template (HR only). Placeholders as in send_email."""

    name: str = Field(description="Template name, unique.")
    subject: str = Field(description="Subject line with placeholders.")
    body: str = Field(description="Plain-text body with placeholders.")


def create_email_template(user: Any, args: CreateTemplateArgs) -> ToolResult:
    _require(is_hr_staff(user), "Only HR staff can save email templates.")
    name = args.name.strip()[:120]
    if MessageTemplate.objects.filter(name__iexact=name).exists():
        raise ToolError(f'A template named "{name}" already exists.')
    template = MessageTemplate.objects.create(
        name=name, subject=args.subject.strip()[:200], body=args.body.strip()
    )
    return ToolResult(
        f'Saved the template "{template.name}".',
        {"template_id": str(template.pk)},
        "/templates",
        "Open templates",
        changed=True,
    )


# ------------------------------------------------------------- the registry


def _static(label: str) -> Callable[[BaseModel], str]:
    return lambda args: label


TOOLS: tuple[Tool, ...] = (
    Tool(
        "find_job_descriptions",
        "",
        FindJobsArgs,
        find_job_descriptions,
        lambda a: (
            f'Find job descriptions "{a.query}"' if a.query.strip() else "List job descriptions"
        ),
        write=False,
    ),
    Tool(
        "get_job_description",
        "",
        JobIdArgs,
        get_job_description,
        _static("Read job description"),
        write=False,
    ),
    Tool(
        "list_candidates",
        "",
        ListCandidatesArgs,
        list_candidates,
        _static("List candidates"),
        write=False,
    ),
    Tool(
        "get_candidate",
        "",
        CandidateIdArgs,
        get_candidate,
        _static("Read candidate profile"),
        write=False,
    ),
    Tool(
        "find_people",
        "",
        FindPeopleArgs,
        find_people,
        lambda a: f'Find people "{a.query}"' if a.query.strip() else "List people",
        write=False,
    ),
    Tool(
        "list_email_templates",
        "",
        NoArgs,
        list_email_templates,
        _static("List email templates"),
        write=False,
    ),
    Tool(
        "job_activity", "", JobActivityArgs, job_activity, _static("Read the timeline"), write=False
    ),
    Tool(
        "list_interviews",
        "",
        ListInterviewsArgs,
        list_interviews,
        _static("List interviews"),
        write=False,
    ),
    Tool(
        "create_job_description",
        "",
        CreateJobArgs,
        create_job_description,
        lambda a: f'Create job description "{a.title}"',
    ),
    Tool(
        "update_job_description",
        "",
        UpdateJobArgs,
        update_job_description,
        _static("Update job description"),
    ),
    Tool(
        "change_job_status",
        "",
        JobStatusArgs,
        change_job_status,
        lambda a: f"Set job status to {a.status.replace('_', ' ')}",
    ),
    Tool(
        "force_close_job",
        "",
        ForceCloseArgs,
        force_close_job,
        _static("Force close job description"),
        confirm=True,
        preview=_force_close_preview,
    ),
    Tool("add_job_comment", "", CommentArgs, add_job_comment, _static("Add comment")),
    Tool(
        "add_participants",
        "",
        AddParticipantsArgs,
        add_participants,
        _static("Add people to the recruitment"),
    ),
    Tool(
        "move_candidates",
        "",
        MoveCandidatesArgs,
        move_candidates,
        lambda a: f"Move {len(a.application_ids)} candidate(s) to {a.status.replace('_', ' ')}",
        confirm=True,
        preview=_move_preview,
    ),
    Tool(
        "send_email",
        "",
        SendEmailArgs,
        send_email,
        lambda a: f"Send email to {len(a.application_ids)} candidate(s)",
        confirm=True,
        preview=_email_preview,
    ),
    Tool(
        "notify_people",
        "",
        NotifyArgs,
        notify_people,
        lambda a: f"Notify {len(a.user_ids)} person(s)",
    ),
    Tool(
        "schedule_interview",
        "",
        ScheduleInterviewArgs,
        schedule_interview,
        _static("Schedule interview"),
    ),
    Tool("log_contact", "", LogContactArgs, log_contact, _static("Log contact")),
    Tool(
        "start_candidate_search",
        "",
        StartSearchArgs,
        start_candidate_search,
        _static("Start candidate search"),
    ),
    Tool(
        "add_candidate_to_job",
        "",
        AddCandidateArgs,
        add_candidate_to_job,
        _static("Add candidate to job"),
    ),
    Tool(
        "create_email_template",
        "",
        CreateTemplateArgs,
        create_email_template,
        _static("Save email template"),
    ),
)
TOOLS_BY_NAME: dict[str, Tool] = {tool.name: tool for tool in TOOLS}
# Statuses that only need confirmation when moving candidates out of the pipeline;
# forward moves run straight away.
CONFIRM_MOVES: frozenset[str] = frozenset(
    {ApplicationStatus.REJECTED, ApplicationStatus.WITHDRAWN, ApplicationStatus.ON_HOLD}
)


def needs_confirmation(tool: Tool, args: BaseModel) -> bool:
    if tool.name == "move_candidates":
        key = re.sub(r"[\s-]+", "_", args.status.strip().lower())
        return key in CONFIRM_MOVES
    return tool.confirm


def openai_tool(tool: Tool) -> dict[str, Any]:
    """The function declaration both providers accept (LangChain converts it)."""
    from langchain_core.utils.function_calling import convert_to_openai_tool

    declaration = convert_to_openai_tool(tool.schema)
    declaration["function"]["name"] = tool.name
    declaration["function"]["description"] = tool.description or (tool.schema.__doc__ or "").strip()
    return declaration


def run_tool(tool: Tool, user: Any, args: BaseModel) -> ToolResult:
    """Run one tool, turning every domain refusal into a ``ToolError`` sentence."""
    try:
        return tool.run(user, args)
    except ToolError:
        raise
    except APIException as exc:
        detail = exc.detail
        if isinstance(detail, dict):
            detail = "; ".join(
                f"{k}: {v[0] if isinstance(v, list) else v}" for k, v in detail.items()
            )
        elif isinstance(detail, list):
            detail = "; ".join(str(item) for item in detail)
        raise ToolError(str(detail)) from exc


__all__ = [
    "CONFIRM_MOVES",
    "PLACEHOLDERS",
    "TOOLS",
    "TOOLS_BY_NAME",
    "Preview",
    "Tool",
    "ToolError",
    "ToolResult",
    "needs_confirmation",
    "openai_tool",
    "run_tool",
]
