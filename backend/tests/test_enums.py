"""common.enums mirrors plan.md 6.3, 6.4 and 8.1 exactly."""

from common import enums
from common.enums import (
    ActivityCategory,
    ApplicationStatus,
    CandidateSource,
    KanbanColumn,
)

EXPECTED_STATUS_ORDER = [
    "new",
    "ai_shortlisted",
    "hr_review",
    "contact_pending",
    "contacted",
    "phone_screening",
    "interview_scheduled",
    "technical_interview",
    "hr_interview",
    "final_interview",
    "selected",
    "offer_sent",
    "offer_accepted",
    "onboarding",
    "onboarded",
    "rejected",
    "withdrawn",
    "on_hold",
]

EXPECTED_CATEGORIES = [
    "job_description",
    "candidate_search",
    "candidate_shortlisted",
    "candidate_contact",
    "interview",
    "interview_feedback",
    "candidate_selected",
    "offer",
    "onboarding",
    "decision",
]


def test_eighteen_application_statuses_in_pipeline_order():
    assert list(ApplicationStatus.values) == EXPECTED_STATUS_ORDER
    assert list(ApplicationStatus.ORDER) == EXPECTED_STATUS_ORDER
    assert len(ApplicationStatus) == 18


def test_status_order_index_matches_plan_section_6_5():
    assert ApplicationStatus.order_index("new") == 0
    assert ApplicationStatus.order_index(ApplicationStatus.ONBOARDED) == 14
    assert ApplicationStatus.order_index("on_hold") == 17


def test_status_labels_are_human_readable():
    assert ApplicationStatus.AI_SHORTLISTED.label == "AI Shortlisted"
    assert ApplicationStatus.HR_REVIEW.label == "HR Review"
    assert ApplicationStatus.ON_HOLD.label == "On Hold"


def test_active_tray_and_terminal_partition_the_statuses():
    assert ApplicationStatus.TRAY == frozenset({"rejected", "withdrawn", "on_hold"})
    assert ApplicationStatus.TERMINAL == frozenset({"onboarded"})
    assert set(ApplicationStatus.ACTIVE) | ApplicationStatus.TRAY == set(EXPECTED_STATUS_ORDER)
    assert ApplicationStatus.ACTIVE == tuple(EXPECTED_STATUS_ORDER[:15])


def test_ten_activity_categories_in_plan_order():
    assert list(ActivityCategory.values) == EXPECTED_CATEGORIES
    assert len(ActivityCategory) == 10
    assert ActivityCategory.DECISION.label == "Rejected / On Hold"


def test_every_status_maps_to_a_kanban_column_or_the_tray():
    column_statuses = [
        status for column in enums.KANBAN_COLUMNS.values() for status in column.statuses
    ]
    assert len(column_statuses) == len(set(column_statuses)), "a status sits in two columns"
    assert set(column_statuses) | ApplicationStatus.TRAY == set(EXPECTED_STATUS_ORDER)
    assert set(column_statuses).isdisjoint(ApplicationStatus.TRAY)
    for status in EXPECTED_STATUS_ORDER:
        column_key = enums.STATUS_TO_KANBAN_COLUMN[status]
        if status in ApplicationStatus.TRAY:
            assert column_key is None
        else:
            assert status in enums.KANBAN_COLUMNS[column_key].statuses


def test_kanban_board_has_the_eight_columns_from_plan_9_7():
    assert list(enums.KANBAN_COLUMNS) == [
        "new",
        "shortlisted",
        "contacted",
        "screening",
        "interview",
        "selected",
        "offer",
        "onboarding",
    ]
    interview = enums.KANBAN_COLUMNS["interview"]
    assert isinstance(interview, KanbanColumn)
    assert interview.label == "Interview"
    assert interview.entry_status == "interview_scheduled"
    assert enums.KANBAN_COLUMNS["offer"].entry_status == "offer_sent"
    assert enums.KANBAN_COLUMNS["onboarding"].entry_status == "onboarding"
    assert enums.KANBAN_COLUMNS["new"].statuses == ("new", "hr_review")
    for column in enums.KANBAN_COLUMNS.values():
        assert column.entry_status in column.statuses


def test_every_status_has_an_entry_timeline_category():
    assert set(enums.STATUS_ENTRY_CATEGORY) == set(EXPECTED_STATUS_ORDER)
    assert set(enums.STATUS_ENTRY_CATEGORY.values()) <= set(ActivityCategory.values)
    assert enums.STATUS_ENTRY_CATEGORY["new"] == ActivityCategory.CANDIDATE_SEARCH
    assert enums.STATUS_ENTRY_CATEGORY["hr_review"] == ActivityCategory.CANDIDATE_SHORTLISTED
    assert enums.STATUS_ENTRY_CATEGORY["selected"] == ActivityCategory.CANDIDATE_SELECTED
    assert enums.STATUS_ENTRY_CATEGORY["on_hold"] == ActivityCategory.DECISION


def test_colours_exist_for_every_status_source_and_category():
    assert set(enums.STATUS_COLORS) == set(EXPECTED_STATUS_ORDER)
    assert set(enums.SOURCE_COLORS) == set(CandidateSource.values)
    assert set(enums.CATEGORY_COLORS) == set(EXPECTED_CATEGORIES)
    for pair in [
        *enums.STATUS_COLORS.values(),
        *enums.SOURCE_COLORS.values(),
        *enums.CATEGORY_COLORS.values(),
    ]:
        assert pair.bg.startswith("#") and len(pair.bg) == 7
        assert pair.text.startswith("#") and len(pair.text) == 7
        assert pair.name
    assert enums.STATUS_COLORS["new"] == enums.ColorPair("#EEF1F5", "#3B4452", "slate")
    assert enums.STATUS_COLORS["on_hold"] == enums.ColorPair("#F6E7D8", "#9A4D12", "warm")
    assert enums.SOURCE_COLORS["linkedin"].text == "#0A66C2"
    assert enums.CATEGORY_COLORS["decision"].name == "rose"


def test_other_enums_have_the_plan_values():
    assert list(enums.UserRole.values) == ["hr_admin", "hr", "interviewer", "employee"]
    assert list(enums.ParticipantRole.values) == [
        "owner",
        "recruiter",
        "hiring_manager",
        "interviewer",
        "observer",
    ]
    assert list(CandidateSource.values) == ["internal", "referral", "naukri", "linkedin"]
    assert list(enums.JDStatus.values) == [
        "draft",
        "open",
        "on_hold",
        "closed",
        "force_closed",
        "archived",
    ]
    assert list(enums.WorkMode.values) == ["onsite", "hybrid", "remote"]
    assert list(enums.EmploymentType.values) == [
        "full_time",
        "part_time",
        "contract",
        "internship",
    ]
    assert list(enums.InterviewRound.values) == [
        "phone_screen",
        "technical",
        "system_design",
        "managerial",
        "hr",
        "final",
    ]
    assert list(enums.InterviewMode.values) == ["video", "phone", "onsite"]
    assert list(enums.InterviewStatus.values) == [
        "scheduled",
        "rescheduled",
        "completed",
        "cancelled",
        "no_show",
    ]
    assert list(enums.Recommendation.values) == ["strong_proceed", "proceed", "hold", "reject"]
    assert list(enums.CommunicationChannel.values) == [
        "phone",
        "email",
        "linkedin",
        "whatsapp",
        "in_person",
    ]
    assert list(enums.CommunicationDirection.values) == ["outbound", "inbound"]
    assert list(enums.CommunicationOutcome.values) == [
        "connected",
        "no_answer",
        "voicemail",
        "email_sent",
        "replied",
        "not_interested",
        "callback_requested",
    ]
    assert list(enums.OfferStatus.values) == [
        "draft",
        "sent",
        "negotiating",
        "accepted",
        "declined",
        "withdrawn",
        "expired",
    ]
    assert list(enums.OnboardingStatus.values) == [
        "not_started",
        "documents_pending",
        "in_progress",
        "completed",
        "dropped",
    ]
    assert list(enums.SearchRunStatus.values) == [
        "pending",
        "running",
        "completed",
        "partial",
        "failed",
    ]
    assert list(enums.NotificationType.values) == [
        "assignment",
        "status_change",
        "interview",
        "feedback",
        "offer",
        "onboarding",
        "mention",
        "system",
    ]
    assert list(enums.AuditAction.values) == [
        "login",
        "logout",
        "login_failed",
        "create",
        "update",
        "delete",
        "status_change",
        "export",
    ]


def test_all_enums_registry_covers_every_choice_class():
    assert set(enums.ALL_ENUMS) == {
        "application_status",
        "activity_category",
        "user_role",
        "participant_role",
        "candidate_source",
        "jd_status",
        "work_mode",
        "employment_type",
        "interview_round",
        "interview_mode",
        "interview_status",
        "recommendation",
        "communication_channel",
        "communication_direction",
        "communication_outcome",
        "call_purpose",
        "call_status",
        "offer_status",
        "onboarding_status",
        "search_run_status",
        "notification_type",
        "audit_action",
    }
    for choices in enums.ALL_ENUMS.values():
        assert len(choices) > 0
        assert all(isinstance(member.label, str) and member.label for member in choices)
