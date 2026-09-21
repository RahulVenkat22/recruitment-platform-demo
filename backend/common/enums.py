"""Every enumeration in the data model (plan.md 6.3, 6.4) with its display label,
plus the pipeline helpers (order, Kanban columns, entry categories) and the
colour tokens from plan.md 8.1 that ``GET /api/v1/meta/enums`` serves.

Values are stored as short varchar keys; labels are what the UI shows.
"""

from __future__ import annotations

from typing import NamedTuple

from django.db import models

# --------------------------------------------------------------------------- pipeline


class ApplicationStatus(models.TextChoices):
    """The 18 pipeline statuses, declared in pipeline order (plan.md 6.4)."""

    NEW = "new", "New"
    AI_SHORTLISTED = "ai_shortlisted", "AI Shortlisted"
    HR_REVIEW = "hr_review", "HR Review"
    CONTACT_PENDING = "contact_pending", "Contact Pending"
    CONTACTED = "contacted", "Contacted"
    PHONE_SCREENING = "phone_screening", "Phone Screening"
    INTERVIEW_SCHEDULED = "interview_scheduled", "Interview Scheduled"
    TECHNICAL_INTERVIEW = "technical_interview", "Technical Interview"
    HR_INTERVIEW = "hr_interview", "HR Interview"
    FINAL_INTERVIEW = "final_interview", "Final Interview"
    SELECTED = "selected", "Selected"
    OFFER_SENT = "offer_sent", "Offer Sent"
    OFFER_ACCEPTED = "offer_accepted", "Offer Accepted"
    ONBOARDING = "onboarding", "Onboarding"
    ONBOARDED = "onboarded", "Onboarded"
    REJECTED = "rejected", "Rejected"
    WITHDRAWN = "withdrawn", "Withdrawn"
    ON_HOLD = "on_hold", "On Hold"

    @classmethod
    def order_index(cls, status: str) -> int:
        """Position in the pipeline: new = 0 ... onboarded = 14, tray statuses 15..17."""
        return cls.ORDER.index(str(status))


# Pipeline order used by the transition rules in plan.md 6.5.
ApplicationStatus.ORDER = tuple(ApplicationStatus.values)
# Negative or paused decisions; shown in the Kanban tray, not in a column.
ApplicationStatus.TRAY = frozenset(
    {ApplicationStatus.REJECTED, ApplicationStatus.WITHDRAWN, ApplicationStatus.ON_HOLD}
)
# Statuses that live on the board and can move forward (order index 0..14).
ApplicationStatus.ACTIVE = tuple(
    status for status in ApplicationStatus.ORDER if status not in ApplicationStatus.TRAY
)
# No transition leaves these (plan.md 6.5). Rejected and withdrawn are *not*
# terminal because an HR admin can reopen them into hr_review.
ApplicationStatus.TERMINAL = frozenset({ApplicationStatus.ONBOARDED})


class ActivityCategory(models.TextChoices):
    """The 10 timeline filter chips (plan.md 6.4)."""

    JOB_DESCRIPTION = "job_description", "Job Description"
    CANDIDATE_SEARCH = "candidate_search", "Candidate Search"
    CANDIDATE_SHORTLISTED = "candidate_shortlisted", "Candidate Shortlisted"
    CANDIDATE_CONTACT = "candidate_contact", "Candidate Contact"
    INTERVIEW = "interview", "Interview"
    INTERVIEW_FEEDBACK = "interview_feedback", "Interview Feedback"
    CANDIDATE_SELECTED = "candidate_selected", "Candidate Selected"
    OFFER = "offer", "Offer"
    ONBOARDING = "onboarding", "Onboarding"
    DECISION = "decision", "Rejected / On Hold"


# Timeline category recorded when an application *enters* a status (plan.md 6.4 table).
STATUS_ENTRY_CATEGORY: dict[str, str] = {
    ApplicationStatus.NEW: ActivityCategory.CANDIDATE_SEARCH,
    ApplicationStatus.AI_SHORTLISTED: ActivityCategory.CANDIDATE_SHORTLISTED,
    ApplicationStatus.HR_REVIEW: ActivityCategory.CANDIDATE_SHORTLISTED,
    ApplicationStatus.CONTACT_PENDING: ActivityCategory.CANDIDATE_CONTACT,
    ApplicationStatus.CONTACTED: ActivityCategory.CANDIDATE_CONTACT,
    ApplicationStatus.PHONE_SCREENING: ActivityCategory.CANDIDATE_CONTACT,
    ApplicationStatus.INTERVIEW_SCHEDULED: ActivityCategory.INTERVIEW,
    ApplicationStatus.TECHNICAL_INTERVIEW: ActivityCategory.INTERVIEW,
    ApplicationStatus.HR_INTERVIEW: ActivityCategory.INTERVIEW,
    ApplicationStatus.FINAL_INTERVIEW: ActivityCategory.INTERVIEW,
    ApplicationStatus.SELECTED: ActivityCategory.CANDIDATE_SELECTED,
    ApplicationStatus.OFFER_SENT: ActivityCategory.OFFER,
    ApplicationStatus.OFFER_ACCEPTED: ActivityCategory.OFFER,
    ApplicationStatus.ONBOARDING: ActivityCategory.ONBOARDING,
    ApplicationStatus.ONBOARDED: ActivityCategory.ONBOARDING,
    ApplicationStatus.REJECTED: ActivityCategory.DECISION,
    ApplicationStatus.WITHDRAWN: ActivityCategory.DECISION,
    ApplicationStatus.ON_HOLD: ActivityCategory.DECISION,
}


class KanbanColumn(NamedTuple):
    key: str
    label: str
    statuses: tuple[str, ...]
    # Status applied when a card is dropped into the column (plan.md 9.7).
    entry_status: str


# The eight board columns in display order (plan.md 6.4 column mapping, 9.7 layout).
KANBAN_COLUMNS: dict[str, KanbanColumn] = {
    column.key: column
    for column in (
        KanbanColumn(
            "new",
            "New",
            (ApplicationStatus.NEW, ApplicationStatus.HR_REVIEW),
            ApplicationStatus.NEW,
        ),
        KanbanColumn(
            "shortlisted",
            "Shortlisted",
            (ApplicationStatus.AI_SHORTLISTED,),
            ApplicationStatus.AI_SHORTLISTED,
        ),
        KanbanColumn(
            "contacted",
            "Contacted",
            (ApplicationStatus.CONTACT_PENDING, ApplicationStatus.CONTACTED),
            ApplicationStatus.CONTACT_PENDING,
        ),
        KanbanColumn(
            "screening",
            "Screening",
            (ApplicationStatus.PHONE_SCREENING,),
            ApplicationStatus.PHONE_SCREENING,
        ),
        KanbanColumn(
            "interview",
            "Interview",
            (
                ApplicationStatus.INTERVIEW_SCHEDULED,
                ApplicationStatus.TECHNICAL_INTERVIEW,
                ApplicationStatus.HR_INTERVIEW,
                ApplicationStatus.FINAL_INTERVIEW,
            ),
            ApplicationStatus.INTERVIEW_SCHEDULED,
        ),
        KanbanColumn(
            "selected",
            "Selected",
            (ApplicationStatus.SELECTED,),
            ApplicationStatus.SELECTED,
        ),
        KanbanColumn(
            "offer",
            "Offer",
            (ApplicationStatus.OFFER_SENT, ApplicationStatus.OFFER_ACCEPTED),
            ApplicationStatus.OFFER_SENT,
        ),
        KanbanColumn(
            "onboarding",
            "Onboarding",
            (ApplicationStatus.ONBOARDING, ApplicationStatus.ONBOARDED),
            ApplicationStatus.ONBOARDING,
        ),
    )
}

KANBAN_TRAY_LABEL = "Rejected / On hold"

# status -> column key, or None for the tray.
STATUS_TO_KANBAN_COLUMN: dict[str, str | None] = {
    **{status: column.key for column in KANBAN_COLUMNS.values() for status in column.statuses},
    **dict.fromkeys(ApplicationStatus.TRAY, None),
}

# ------------------------------------------------------------------------ people


class UserRole(models.TextChoices):
    HR_ADMIN = "hr_admin", "HR Admin"
    HR = "hr", "HR"
    INTERVIEWER = "interviewer", "Interviewer"
    EMPLOYEE = "employee", "Employee"


class ParticipantRole(models.TextChoices):
    """Role of a user under "People Involved in the Recruitment" for one JD."""

    OWNER = "owner", "Owner"
    RECRUITER = "recruiter", "Recruiter"
    HIRING_MANAGER = "hiring_manager", "Hiring Manager"
    INTERVIEWER = "interviewer", "Interviewer"
    OBSERVER = "observer", "Observer"


# -------------------------------------------------------------------- candidates


class CandidateSource(models.TextChoices):
    INTERNAL = "internal", "Internal Database"
    REFERRAL = "referral", "Referral"
    NAUKRI = "naukri", "Naukri"
    LINKEDIN = "linkedin", "LinkedIn"


# -------------------------------------------------------------------------- jobs


class JDStatus(models.TextChoices):
    DRAFT = "draft", "Draft"
    OPEN = "open", "Open"
    ON_HOLD = "on_hold", "On Hold"
    CLOSED = "closed", "Closed"
    # Closed early by an HR admin or the owner from draft / open / on hold (Enhancement.md 3).
    FORCE_CLOSED = "force_closed", "Force Closed"
    ARCHIVED = "archived", "Archived"


class WorkMode(models.TextChoices):
    ONSITE = "onsite", "On-site"
    HYBRID = "hybrid", "Hybrid"
    REMOTE = "remote", "Remote"


class EmploymentType(models.TextChoices):
    FULL_TIME = "full_time", "Full-time"
    PART_TIME = "part_time", "Part-time"
    CONTRACT = "contract", "Contract"
    INTERNSHIP = "internship", "Internship"


# -------------------------------------------------------------------- interviews


class InterviewRound(models.TextChoices):
    PHONE_SCREEN = "phone_screen", "Phone Screen"
    TECHNICAL = "technical", "Technical"
    SYSTEM_DESIGN = "system_design", "System Design"
    MANAGERIAL = "managerial", "Managerial"
    HR = "hr", "HR"
    FINAL = "final", "Final"


class InterviewMode(models.TextChoices):
    VIDEO = "video", "Video"
    PHONE = "phone", "Phone"
    ONSITE = "onsite", "On-site"


class InterviewStatus(models.TextChoices):
    SCHEDULED = "scheduled", "Scheduled"
    RESCHEDULED = "rescheduled", "Rescheduled"
    COMPLETED = "completed", "Completed"
    CANCELLED = "cancelled", "Cancelled"
    NO_SHOW = "no_show", "No Show"


class Recommendation(models.TextChoices):
    STRONG_PROCEED = "strong_proceed", "Strong Proceed"
    PROCEED = "proceed", "Proceed"
    HOLD = "hold", "Hold"
    REJECT = "reject", "Reject"


# ---------------------------------------------------------------- communications


class CommunicationChannel(models.TextChoices):
    PHONE = "phone", "Phone"
    EMAIL = "email", "Email"
    LINKEDIN = "linkedin", "LinkedIn"
    WHATSAPP = "whatsapp", "WhatsApp"
    IN_PERSON = "in_person", "In Person"


class CallPurpose(models.TextChoices):
    KNOWLEDGE_TEST = "knowledge_test", "Knowledge test"
    INFORMATION = "information", "Share information"


class CallStatus(models.TextChoices):
    QUEUED = "queued", "Queued"
    RINGING = "ringing", "Ringing"
    IN_PROGRESS = "in_progress", "In progress"
    COMPLETED = "completed", "Completed"
    NO_ANSWER = "no_answer", "No answer"
    FAILED = "failed", "Failed"


class CommunicationDirection(models.TextChoices):
    OUTBOUND = "outbound", "Outbound"
    INBOUND = "inbound", "Inbound"


class CommunicationOutcome(models.TextChoices):
    CONNECTED = "connected", "Connected"
    NO_ANSWER = "no_answer", "No Answer"
    VOICEMAIL = "voicemail", "Voicemail"
    EMAIL_SENT = "email_sent", "Email Sent"
    REPLIED = "replied", "Replied"
    NOT_INTERESTED = "not_interested", "Not Interested"
    CALLBACK_REQUESTED = "callback_requested", "Callback Requested"


# ------------------------------------------------------------ offers, onboarding


class OfferStatus(models.TextChoices):
    DRAFT = "draft", "Draft"
    SENT = "sent", "Sent"
    NEGOTIATING = "negotiating", "Negotiating"
    ACCEPTED = "accepted", "Accepted"
    DECLINED = "declined", "Declined"
    WITHDRAWN = "withdrawn", "Withdrawn"
    EXPIRED = "expired", "Expired"


class OnboardingStatus(models.TextChoices):
    NOT_STARTED = "not_started", "Not Started"
    DOCUMENTS_PENDING = "documents_pending", "Documents Pending"
    IN_PROGRESS = "in_progress", "In Progress"
    COMPLETED = "completed", "Completed"
    DROPPED = "dropped", "Dropped"


# ------------------------------------------------------------------- operations


class SearchRunStatus(models.TextChoices):
    PENDING = "pending", "Pending"
    RUNNING = "running", "Running"
    COMPLETED = "completed", "Completed"
    PARTIAL = "partial", "Partial"
    FAILED = "failed", "Failed"


class NotificationType(models.TextChoices):
    ASSIGNMENT = "assignment", "Assignment"
    STATUS_CHANGE = "status_change", "Status Change"
    INTERVIEW = "interview", "Interview"
    FEEDBACK = "feedback", "Feedback"
    OFFER = "offer", "Offer"
    ONBOARDING = "onboarding", "Onboarding"
    MENTION = "mention", "Mention"
    SYSTEM = "system", "System"


class AuditAction(models.TextChoices):
    LOGIN = "login", "Login"
    LOGOUT = "logout", "Logout"
    LOGIN_FAILED = "login_failed", "Login Failed"
    CREATE = "create", "Create"
    UPDATE = "update", "Update"
    DELETE = "delete", "Delete"
    STATUS_CHANGE = "status_change", "Status Change"
    EXPORT = "export", "Export"


# Registry for GET /api/v1/meta/enums: snake_case key -> choices class.
ALL_ENUMS: dict[str, type[models.TextChoices]] = {
    "application_status": ApplicationStatus,
    "activity_category": ActivityCategory,
    "user_role": UserRole,
    "participant_role": ParticipantRole,
    "candidate_source": CandidateSource,
    "jd_status": JDStatus,
    "work_mode": WorkMode,
    "employment_type": EmploymentType,
    "interview_round": InterviewRound,
    "interview_mode": InterviewMode,
    "interview_status": InterviewStatus,
    "recommendation": Recommendation,
    "communication_channel": CommunicationChannel,
    "communication_direction": CommunicationDirection,
    "communication_outcome": CommunicationOutcome,
    "call_purpose": CallPurpose,
    "call_status": CallStatus,
    "offer_status": OfferStatus,
    "onboarding_status": OnboardingStatus,
    "search_run_status": SearchRunStatus,
    "notification_type": NotificationType,
    "audit_action": AuditAction,
}

# ----------------------------------------------------------------------- colours


class ColorPair(NamedTuple):
    """Badge colours: background hex, text hex, and the palette name used in plan.md."""

    bg: str
    text: str
    name: str


# Status badge colours (plan.md 8.1).
STATUS_COLORS: dict[str, ColorPair] = {
    ApplicationStatus.NEW: ColorPair("#EEF1F5", "#3B4452", "slate"),
    ApplicationStatus.AI_SHORTLISTED: ColorPair("#E8EAFB", "#3F3FB5", "indigo"),
    ApplicationStatus.HR_REVIEW: ColorPair("#F0E8FB", "#6B34A8", "purple"),
    ApplicationStatus.CONTACT_PENDING: ColorPair("#FBF1DC", "#8A5A0B", "amber light"),
    ApplicationStatus.CONTACTED: ColorPair("#E0F0FB", "#0B5C94", "sky"),
    ApplicationStatus.PHONE_SCREENING: ColorPair("#DDF4F6", "#0B6B72", "cyan"),
    ApplicationStatus.INTERVIEW_SCHEDULED: ColorPair("#E4ECFB", "#1D4ED8", "blue"),
    ApplicationStatus.TECHNICAL_INTERVIEW: ColorPair("#DCE6FA", "#1E40AF", "blue deep"),
    ApplicationStatus.HR_INTERVIEW: ColorPair("#E4ECFB", "#2B4FCF", "blue"),
    ApplicationStatus.FINAL_INTERVIEW: ColorPair("#E3E6F9", "#312E81", "indigo deep"),
    ApplicationStatus.SELECTED: ColorPair("#E3F3EA", "#1F7A4D", "emerald"),
    ApplicationStatus.OFFER_SENT: ColorPair("#FBF1DC", "#8F5D12", "amber"),
    ApplicationStatus.OFFER_ACCEPTED: ColorPair("#DCF5E3", "#166534", "green"),
    ApplicationStatus.ONBOARDING: ColorPair("#DDF3EF", "#0F766E", "teal"),
    ApplicationStatus.ONBOARDED: ColorPair("#D1F0DA", "#166534", "green strong"),
    ApplicationStatus.REJECTED: ColorPair("#FCE8E6", "#B42318", "rose"),
    ApplicationStatus.WITHDRAWN: ColorPair("#ECEEF2", "#5C6371", "gray"),
    ApplicationStatus.ON_HOLD: ColorPair("#F6E7D8", "#9A4D12", "warm"),
}

# Source badge colours (plan.md 8.1).
SOURCE_COLORS: dict[str, ColorPair] = {
    CandidateSource.INTERNAL: ColorPair("#ECEEF2", "#0E1013", "ink"),
    CandidateSource.REFERRAL: ColorPair("#E3F3EA", "#1F7A4D", "emerald"),
    CandidateSource.NAUKRI: ColorPair("#EAF0FF", "#2F54EB", "blue"),
    CandidateSource.LINKEDIN: ColorPair("#E1EEF8", "#0A66C2", "linkedin"),
}

# Timeline chip / dot colours. plan.md 6.4 names the palette per category; the
# hex pairs reuse the matching status colours from 8.1 so the two stay in step.
CATEGORY_COLORS: dict[str, ColorPair] = {
    ActivityCategory.JOB_DESCRIPTION: ColorPair("#EEF1F5", "#3B4452", "slate"),
    ActivityCategory.CANDIDATE_SEARCH: ColorPair("#E8EAFB", "#3F3FB5", "indigo"),
    ActivityCategory.CANDIDATE_SHORTLISTED: ColorPair("#F0E8FB", "#6B34A8", "violet"),
    ActivityCategory.CANDIDATE_CONTACT: ColorPair("#E0F0FB", "#0B5C94", "sky"),
    ActivityCategory.INTERVIEW: ColorPair("#E4ECFB", "#1D4ED8", "blue"),
    ActivityCategory.INTERVIEW_FEEDBACK: ColorPair("#DDF4F6", "#0B6B72", "cyan"),
    ActivityCategory.CANDIDATE_SELECTED: ColorPair("#E3F3EA", "#1F7A4D", "emerald"),
    ActivityCategory.OFFER: ColorPair("#FBF1DC", "#8F5D12", "amber"),
    ActivityCategory.ONBOARDING: ColorPair("#DDF3EF", "#0F766E", "teal"),
    ActivityCategory.DECISION: ColorPair("#FCE8E6", "#B42318", "rose"),
}
