"""Shapes for searches, sources and applications (plan.md 6.10 Searches and
Applications rows). Candidate contact details go through ``PIIMaskingMixin``."""

from __future__ import annotations

from typing import Any

from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from accounts.models import User
from accounts.serializers import UserSummarySerializer
from activity.serializers import ActivitySerializer, CandidateRefSerializer
from candidates.models import Candidate
from common.enums import (
    ApplicationStatus,
    CommunicationChannel,
    CommunicationDirection,
    CommunicationOutcome,
    InterviewMode,
    InterviewRound,
    InterviewStatus,
    OfferStatus,
    OnboardingStatus,
    Recommendation,
)
from common.masking import PIIMaskingMixin
from common.permissions import (
    can_manage_job,
    can_manage_offers,
    can_manage_onboarding,
    can_schedule_interview,
    can_submit_feedback,
    can_transition_application,
)
from jobs.models import JobDescription
from matching.skills import display_name
from pipeline.models import (
    Application,
    CandidateMatch,
    Communication,
    Interview,
    Offer,
    Onboarding,
    SearchRun,
)
from pipeline.services import checklist_progress, format_ctc


class ProviderHealthSerializer(serializers.Serializer):
    key = serializers.CharField()
    display_name = serializers.CharField()
    available = serializers.BooleanField()
    profile_count = serializers.IntegerField()
    note = serializers.CharField(allow_blank=True)


class SearchRunSerializer(serializers.ModelSerializer):
    requested_by = UserSummarySerializer(read_only=True, allow_null=True)
    status_label = serializers.CharField(source="get_status_display", read_only=True)

    class Meta:
        model = SearchRun
        fields = [
            "id",
            "job_description",
            "requested_by",
            "sources",
            "status",
            "status_label",
            "total_found",
            "new_candidates",
            "existing_candidates",
            "shortlisted",
            "started_at",
            "finished_at",
            "duration_ms",
            "error",
        ]
        read_only_fields = fields


class SearchRequestSerializer(serializers.Serializer):
    """``POST /searches/``: ``{job_description_id, sources: ["naukri", "linkedin"] | ["all"]}``."""

    job_description_id = serializers.PrimaryKeyRelatedField(
        queryset=JobDescription.objects.all(), source="job_description"
    )
    sources = serializers.ListField(
        child=serializers.CharField(max_length=20), allow_empty=False, default=lambda: ["all"]
    )


class CandidateSkillRefSerializer(serializers.Serializer):
    key = serializers.CharField()
    name = serializers.CharField()
    proficiency = serializers.IntegerField()
    is_primary = serializers.BooleanField()


class CandidateSummarySerializer(PIIMaskingMixin, serializers.ModelSerializer):
    """The candidate columns of a ranked row (plan.md 9.8); contact details masked by role."""

    total_experience_years = serializers.FloatField(read_only=True)
    skills = serializers.SerializerMethodField()
    sources = serializers.SerializerMethodField()

    class Meta:
        model = Candidate
        fields = [
            "id",
            "full_name",
            "email",
            "phone",
            "avatar_url",
            "headline",
            "current_company",
            "current_title",
            "location",
            "total_experience_years",
            "skills",
            "sources",
        ]
        read_only_fields = fields

    @extend_schema_field(CandidateSkillRefSerializer(many=True))
    def get_skills(self, obj: Candidate) -> list[dict[str, Any]]:
        return [
            {
                "key": row.skill,
                "name": row.display_name or display_name(row.skill),
                "proficiency": int(row.proficiency),
                "is_primary": bool(row.is_primary),
            }
            for row in obj.skills.all()
        ]

    @extend_schema_field(serializers.ListField(child=serializers.CharField()))
    def get_sources(self, obj: Candidate) -> list[str]:
        return [row.source for row in obj.sources.all()]


class CandidateMatchSerializer(serializers.ModelSerializer):
    overall_pct = serializers.FloatField(read_only=True)
    skills_score = serializers.FloatField(read_only=True)
    experience_score = serializers.FloatField(read_only=True)
    education_score = serializers.FloatField(read_only=True)
    domain_score = serializers.FloatField(read_only=True)
    responsibility_score = serializers.FloatField(read_only=True)
    matched_required_skill_names = serializers.SerializerMethodField()
    missing_required_skill_names = serializers.SerializerMethodField()
    matched_preferred_skill_names = serializers.SerializerMethodField()
    strengths = serializers.ListField(child=serializers.CharField(), read_only=True)
    gaps = serializers.ListField(child=serializers.CharField(), read_only=True)

    class Meta:
        model = CandidateMatch
        fields = [
            "overall_pct",
            "skills_score",
            "experience_score",
            "education_score",
            "domain_score",
            "responsibility_score",
            "matched_required_skills",
            "matched_required_skill_names",
            "missing_required_skills",
            "missing_required_skill_names",
            "matched_preferred_skills",
            "matched_preferred_skill_names",
            "strengths",
            "gaps",
            "engine",
            "engine_version",
            "computed_at",
        ]
        read_only_fields = fields

    @extend_schema_field(serializers.ListField(child=serializers.CharField()))
    def get_matched_required_skill_names(self, obj: CandidateMatch) -> list[str]:
        return [display_name(key) for key in obj.matched_required_skills]

    @extend_schema_field(serializers.ListField(child=serializers.CharField()))
    def get_missing_required_skill_names(self, obj: CandidateMatch) -> list[str]:
        return [display_name(key) for key in obj.missing_required_skills]

    @extend_schema_field(serializers.ListField(child=serializers.CharField()))
    def get_matched_preferred_skill_names(self, obj: CandidateMatch) -> list[str]:
        return [display_name(key) for key in obj.matched_preferred_skills]


class ApplicationPermissionsSerializer(serializers.Serializer):
    can_transition = serializers.BooleanField()
    can_manage = serializers.BooleanField()


class JobRefSerializer(serializers.ModelSerializer):
    class Meta:
        model = JobDescription
        fields = ["id", "title", "status", "department", "location"]
        read_only_fields = fields


class ApplicationRowSerializer(serializers.ModelSerializer):
    """A ranked row (plan.md 9.8 results, 9.6 Candidates tab)."""

    candidate = CandidateSummarySerializer(read_only=True)
    job = JobRefSerializer(source="job_description", read_only=True)
    owner = UserSummarySerializer(read_only=True, allow_null=True)
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    match = serializers.SerializerMethodField()
    permissions = serializers.SerializerMethodField()

    class Meta:
        model = Application
        fields = [
            "id",
            "job_description",
            "job",
            "candidate",
            "status",
            "status_label",
            "previous_status",
            "owner",
            "entry_source",
            "search_run",
            "match",
            "is_starred",
            "stage_entered_at",
            "last_activity_at",
            "created_at",
            "permissions",
        ]
        read_only_fields = fields

    @extend_schema_field(CandidateMatchSerializer(allow_null=True))
    def get_match(self, obj: Application) -> dict[str, Any] | None:
        match = getattr(obj, "match", None)
        if match is None:
            return None
        return CandidateMatchSerializer(match, context=self.context).data

    @extend_schema_field(ApplicationPermissionsSerializer())
    def get_permissions(self, obj: Application) -> dict[str, bool]:
        request = self.context.get("request")
        user = getattr(request, "user", None)
        jd = obj.job_description
        return {
            "can_transition": can_transition_application(user, jd),
            "can_manage": can_manage_job(user, jd),
        }


class ApplicationUpdateSerializer(serializers.Serializer):
    """``PATCH /applications/{id}``: owner, star, notes."""

    owner_id = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.filter(is_active=True),
        source="owner",
        required=False,
        allow_null=True,
    )
    is_starred = serializers.BooleanField(required=False)
    notes = serializers.CharField(required=False, allow_blank=True, max_length=5000)


class ManualApplicationSerializer(serializers.Serializer):
    """``POST /applications/``: ``{candidate_id, job_description_id}``."""

    candidate_id = serializers.PrimaryKeyRelatedField(
        queryset=Candidate.objects.all(), source="candidate"
    )
    job_description_id = serializers.PrimaryKeyRelatedField(
        queryset=JobDescription.objects.all(), source="job_description"
    )


class TransitionSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=ApplicationStatus.choices)
    note = serializers.CharField(required=False, allow_blank=True, max_length=1000, default="")
    reason = serializers.CharField(required=False, allow_blank=True, max_length=1000, default="")


class BulkTransitionSerializer(serializers.Serializer):
    ids = serializers.ListField(child=serializers.UUIDField(), allow_empty=False, max_length=200)
    status = serializers.ChoiceField(choices=ApplicationStatus.choices)
    note = serializers.CharField(required=False, allow_blank=True, max_length=1000, default="")


class MoveSerializer(serializers.Serializer):
    status = serializers.CharField()
    label = serializers.CharField()
    kind = serializers.CharField()
    requires = serializers.CharField(allow_null=True)


class BulkTransitionResponseSerializer(serializers.Serializer):
    moved = ApplicationRowSerializer(many=True)
    skipped = serializers.DictField(child=serializers.CharField())
    activities = ActivitySerializer(many=True)


class SearchResponseSerializer(serializers.Serializer):
    run = SearchRunSerializer()
    results = ApplicationRowSerializer(many=True)
    errors = serializers.DictField(child=serializers.CharField())


# ------------------------------------------------------ interviews, comms, offers, onboardings


class ApplicationRefSerializer(serializers.ModelSerializer):
    """Enough of an application to render an interview or offer row on its own
    (the candidate chip, the JD title, the current status)."""

    candidate = CandidateRefSerializer(read_only=True)
    job = JobRefSerializer(source="job_description", read_only=True)
    owner = UserSummarySerializer(read_only=True, allow_null=True)
    status_label = serializers.CharField(source="get_status_display", read_only=True)

    class Meta:
        model = Application
        fields = ["id", "job_description", "job", "candidate", "owner", "status", "status_label"]
        read_only_fields = fields


class InterviewPermissionsSerializer(serializers.Serializer):
    can_manage = serializers.BooleanField()
    can_submit_feedback = serializers.BooleanField()


class InterviewSerializer(serializers.ModelSerializer):
    application = ApplicationRefSerializer(read_only=True)
    interviewer = UserSummarySerializer(read_only=True)
    created_by = UserSummarySerializer(read_only=True, allow_null=True)
    round_label = serializers.CharField(source="get_round_display", read_only=True)
    mode_label = serializers.CharField(source="get_mode_display", read_only=True)
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    recommendation_label = serializers.SerializerMethodField()
    score = serializers.FloatField(read_only=True, allow_null=True)
    permissions = serializers.SerializerMethodField()

    class Meta:
        model = Interview
        fields = [
            "id",
            "application",
            "round",
            "round_label",
            "sequence",
            "interviewer",
            "scheduled_at",
            "duration_minutes",
            "mode",
            "mode_label",
            "meeting_link",
            "location",
            "status",
            "status_label",
            "score",
            "feedback",
            "recommendation",
            "recommendation_label",
            "feedback_submitted_at",
            "created_by",
            "created_at",
            "updated_at",
            "permissions",
        ]
        read_only_fields = fields

    @extend_schema_field(serializers.CharField(allow_null=True))
    def get_recommendation_label(self, obj: Interview) -> str | None:
        return obj.get_recommendation_display() if obj.recommendation else None

    @extend_schema_field(InterviewPermissionsSerializer())
    def get_permissions(self, obj: Interview) -> dict[str, bool]:
        user = getattr(self.context.get("request"), "user", None)
        return {
            "can_manage": can_schedule_interview(user, obj.application.job_description),
            "can_submit_feedback": can_submit_feedback(user, obj),
        }


class InterviewCreateSerializer(serializers.Serializer):
    """``POST /interviews``."""

    application_id = serializers.PrimaryKeyRelatedField(
        queryset=Application.objects.select_related("candidate", "job_description__created_by"),
        source="application",
    )
    round = serializers.ChoiceField(choices=InterviewRound.choices)
    interviewer_id = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.filter(is_active=True), source="interviewer"
    )
    scheduled_at = serializers.DateTimeField()
    duration_minutes = serializers.IntegerField(min_value=15, max_value=480, default=60)
    mode = serializers.ChoiceField(choices=InterviewMode.choices, default=InterviewMode.VIDEO)
    meeting_link = serializers.URLField(required=False, allow_blank=True, allow_null=True)
    location = serializers.CharField(
        required=False, allow_blank=True, allow_null=True, max_length=160
    )


class InterviewUpdateSerializer(serializers.Serializer):
    """``PATCH /interviews/{id}``: everything but the time (see reschedule)."""

    interviewer_id = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.filter(is_active=True), source="interviewer", required=False
    )
    duration_minutes = serializers.IntegerField(min_value=15, max_value=480, required=False)
    mode = serializers.ChoiceField(choices=InterviewMode.choices, required=False)
    meeting_link = serializers.URLField(required=False, allow_blank=True, allow_null=True)
    location = serializers.CharField(
        required=False, allow_blank=True, allow_null=True, max_length=160
    )
    status = serializers.ChoiceField(choices=[(InterviewStatus.NO_SHOW, "No Show")], required=False)


class InterviewRescheduleSerializer(serializers.Serializer):
    scheduled_at = serializers.DateTimeField()
    duration_minutes = serializers.IntegerField(min_value=15, max_value=480, required=False)
    mode = serializers.ChoiceField(choices=InterviewMode.choices, required=False)
    meeting_link = serializers.URLField(required=False, allow_blank=True, allow_null=True)
    location = serializers.CharField(
        required=False, allow_blank=True, allow_null=True, max_length=160
    )
    note = serializers.CharField(required=False, allow_blank=True, max_length=500, default="")


class InterviewCancelSerializer(serializers.Serializer):
    reason = serializers.CharField(required=False, allow_blank=True, max_length=500, default="")


class FeedbackSerializer(serializers.Serializer):
    """``POST /interviews/{id}/feedback``: score in half points, 0 to 10."""

    score = serializers.DecimalField(max_digits=3, decimal_places=1, min_value=0, max_value=10)
    feedback = serializers.CharField(allow_blank=True, max_length=5000)
    recommendation = serializers.ChoiceField(choices=Recommendation.choices)

    def validate_score(self, value):
        if (value * 2) % 1 != 0:
            raise serializers.ValidationError("Score in steps of 0.5.")
        return value


class CommunicationSerializer(serializers.ModelSerializer):
    application = ApplicationRefSerializer(read_only=True)
    performed_by = UserSummarySerializer(read_only=True, allow_null=True)
    channel_label = serializers.CharField(source="get_channel_display", read_only=True)
    direction_label = serializers.CharField(source="get_direction_display", read_only=True)
    outcome_label = serializers.CharField(source="get_outcome_display", read_only=True)

    class Meta:
        model = Communication
        fields = [
            "id",
            "application",
            "channel",
            "channel_label",
            "direction",
            "direction_label",
            "outcome",
            "outcome_label",
            "summary",
            "notes",
            "next_action",
            "next_action_at",
            "performed_by",
            "occurred_at",
            "created_at",
        ]
        read_only_fields = fields


class CommunicationCreateSerializer(serializers.Serializer):
    application_id = serializers.PrimaryKeyRelatedField(
        queryset=Application.objects.select_related("candidate", "job_description__created_by"),
        source="application",
    )
    channel = serializers.ChoiceField(choices=CommunicationChannel.choices)
    direction = serializers.ChoiceField(
        choices=CommunicationDirection.choices, default=CommunicationDirection.OUTBOUND
    )
    outcome = serializers.ChoiceField(choices=CommunicationOutcome.choices)
    summary = serializers.CharField(max_length=300)
    notes = serializers.CharField(required=False, allow_blank=True, max_length=5000, default="")
    next_action = serializers.CharField(
        required=False, allow_blank=True, allow_null=True, max_length=200
    )
    next_action_at = serializers.DateTimeField(required=False, allow_null=True)
    occurred_at = serializers.DateTimeField(required=False, allow_null=True)


class OfferPermissionsSerializer(serializers.Serializer):
    can_manage = serializers.BooleanField()


class OfferSerializer(serializers.ModelSerializer):
    application = ApplicationRefSerializer(read_only=True)
    created_by = UserSummarySerializer(read_only=True, allow_null=True)
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    annual_ctc_display = serializers.SerializerMethodField()
    permissions = serializers.SerializerMethodField()

    class Meta:
        model = Offer
        fields = [
            "id",
            "application",
            "status",
            "status_label",
            "designation",
            "annual_ctc",
            "annual_ctc_display",
            "currency",
            "joining_date",
            "expires_at",
            "sent_at",
            "responded_at",
            "notes",
            "created_by",
            "created_at",
            "updated_at",
            "permissions",
        ]
        read_only_fields = fields

    @extend_schema_field(serializers.CharField())
    def get_annual_ctc_display(self, obj: Offer) -> str:
        return format_ctc(obj.annual_ctc, obj.currency)

    @extend_schema_field(OfferPermissionsSerializer())
    def get_permissions(self, obj: Offer) -> dict[str, bool]:
        user = getattr(self.context.get("request"), "user", None)
        return {"can_manage": can_manage_offers(user, obj.application.job_description)}


class OfferCreateSerializer(serializers.Serializer):
    application_id = serializers.PrimaryKeyRelatedField(
        queryset=Application.objects.select_related("candidate", "job_description__created_by"),
        source="application",
    )
    designation = serializers.CharField(max_length=120)
    annual_ctc = serializers.IntegerField(min_value=1)
    currency = serializers.CharField(max_length=3, default="INR")
    joining_date = serializers.DateField()
    expires_at = serializers.DateTimeField(required=False, allow_null=True)
    notes = serializers.CharField(required=False, allow_blank=True, max_length=5000, default="")
    send = serializers.BooleanField(default=False, help_text="Send immediately instead of drafting")


class OfferUpdateSerializer(serializers.Serializer):
    designation = serializers.CharField(max_length=120, required=False)
    annual_ctc = serializers.IntegerField(min_value=1, required=False)
    currency = serializers.CharField(max_length=3, required=False)
    joining_date = serializers.DateField(required=False)
    expires_at = serializers.DateTimeField(required=False, allow_null=True)
    notes = serializers.CharField(required=False, allow_blank=True, max_length=5000)
    status = serializers.ChoiceField(
        choices=[(OfferStatus.SENT, "Sent"), (OfferStatus.NEGOTIATING, "Negotiating")],
        required=False,
    )


class OfferReasonSerializer(serializers.Serializer):
    reason = serializers.CharField(required=False, allow_blank=True, max_length=1000, default="")
    note = serializers.CharField(required=False, allow_blank=True, max_length=1000, default="")


class ChecklistItemSerializer(serializers.Serializer):
    key = serializers.CharField()
    label = serializers.CharField()
    done = serializers.BooleanField()
    done_at = serializers.DateTimeField(allow_null=True)


class OnboardingProgressSerializer(serializers.Serializer):
    done = serializers.IntegerField()
    total = serializers.IntegerField()


class OnboardingSerializer(serializers.ModelSerializer):
    application = ApplicationRefSerializer(read_only=True)
    buddy = UserSummarySerializer(read_only=True, allow_null=True)
    hr_contact = UserSummarySerializer(read_only=True, allow_null=True)
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    checklist = ChecklistItemSerializer(many=True, read_only=True)
    progress = serializers.SerializerMethodField()
    permissions = serializers.SerializerMethodField()

    class Meta:
        model = Onboarding
        fields = [
            "id",
            "application",
            "status",
            "status_label",
            "start_date",
            "buddy",
            "hr_contact",
            "checklist",
            "progress",
            "completed_at",
            "notes",
            "created_at",
            "updated_at",
            "permissions",
        ]
        read_only_fields = fields

    @extend_schema_field(OnboardingProgressSerializer())
    def get_progress(self, obj: Onboarding) -> dict[str, int]:
        done, total = checklist_progress(obj.checklist)
        return {"done": done, "total": total}

    @extend_schema_field(OfferPermissionsSerializer())
    def get_permissions(self, obj: Onboarding) -> dict[str, bool]:
        user = getattr(self.context.get("request"), "user", None)
        return {"can_manage": can_manage_onboarding(user, obj.application.job_description)}


class OnboardingCreateSerializer(serializers.Serializer):
    application_id = serializers.PrimaryKeyRelatedField(
        queryset=Application.objects.select_related("candidate", "job_description__created_by"),
        source="application",
    )
    start_date = serializers.DateField()
    buddy_id = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.filter(is_active=True),
        source="buddy",
        required=False,
        allow_null=True,
    )
    hr_contact_id = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.filter(is_active=True),
        source="hr_contact",
        required=False,
        allow_null=True,
    )
    notes = serializers.CharField(required=False, allow_blank=True, max_length=5000, default="")


class ChecklistToggleSerializer(serializers.Serializer):
    key = serializers.CharField(max_length=60)
    done = serializers.BooleanField(default=True)


class OnboardingUpdateSerializer(serializers.Serializer):
    checklist = ChecklistToggleSerializer(many=True, required=False)
    notes = serializers.CharField(required=False, allow_blank=True, max_length=5000)
    start_date = serializers.DateField(required=False)
    buddy_id = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.filter(is_active=True),
        source="buddy",
        required=False,
        allow_null=True,
    )
    hr_contact_id = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.filter(is_active=True),
        source="hr_contact",
        required=False,
        allow_null=True,
    )
    status = serializers.ChoiceField(
        choices=[(OnboardingStatus.DROPPED, "Dropped")], required=False
    )


class ApplicationDetailSerializer(ApplicationRowSerializer):
    interview_count = serializers.SerializerMethodField()
    communication_count = serializers.SerializerMethodField()
    offer = serializers.SerializerMethodField()
    onboarding = serializers.SerializerMethodField()

    class Meta(ApplicationRowSerializer.Meta):
        fields = ApplicationRowSerializer.Meta.fields + [
            "notes",
            "rejection_reason",
            "hold_reason",
            "interview_count",
            "communication_count",
            "offer",
            "onboarding",
        ]
        read_only_fields = fields

    @extend_schema_field(OfferSerializer(allow_null=True))
    def get_offer(self, obj: Application) -> dict[str, Any] | None:
        offer = getattr(obj, "offer", None)
        return OfferSerializer(offer, context=self.context).data if offer is not None else None

    @extend_schema_field(OnboardingSerializer(allow_null=True))
    def get_onboarding(self, obj: Application) -> dict[str, Any] | None:
        row = getattr(obj, "onboarding", None)
        return OnboardingSerializer(row, context=self.context).data if row is not None else None

    @extend_schema_field(serializers.IntegerField())
    def get_interview_count(self, obj: Application) -> int:
        return obj.interviews.count()

    @extend_schema_field(serializers.IntegerField())
    def get_communication_count(self, obj: Application) -> int:
        return obj.communications.count()


class TransitionResponseSerializer(serializers.Serializer):
    application = ApplicationDetailSerializer()
    activity = ActivitySerializer()


# ------------------------------------------------------------------------- kanban


class KanbanCardSerializer(ApplicationRowSerializer):
    """A ranked row plus the pending next action (the amber clock on a card)."""

    next_action = serializers.SerializerMethodField()
    next_action_at = serializers.SerializerMethodField()

    class Meta(ApplicationRowSerializer.Meta):
        fields = ApplicationRowSerializer.Meta.fields + ["next_action", "next_action_at"]
        read_only_fields = fields

    def _pending(self, obj: Application):
        """The newest next action logged during the current stage; older ones are
        assumed done once the candidate moved on."""
        rows = getattr(obj, "pending_actions", None)
        if not rows:
            return None
        row = rows[0]
        return row if row.occurred_at >= obj.stage_entered_at else None

    @extend_schema_field(serializers.CharField(allow_null=True))
    def get_next_action(self, obj: Application) -> str | None:
        row = self._pending(obj)
        return row.next_action if row is not None else None

    @extend_schema_field(serializers.DateTimeField(allow_null=True))
    def get_next_action_at(self, obj: Application):
        row = self._pending(obj)
        return row.next_action_at if row is not None else None


class KanbanColumnDataSerializer(serializers.Serializer):
    key = serializers.CharField()
    label = serializers.CharField()
    statuses = serializers.ListField(child=serializers.CharField())
    entry_status = serializers.CharField()
    total = serializers.IntegerField(help_text="Cards in the column before filters")
    count = serializers.IntegerField(help_text="Cards after filters")
    cards = KanbanCardSerializer(many=True)


class KanbanBoardSerializer(serializers.Serializer):
    columns = KanbanColumnDataSerializer(many=True)
    tray = KanbanColumnDataSerializer()
    total = serializers.IntegerField()
    count = serializers.IntegerField()
