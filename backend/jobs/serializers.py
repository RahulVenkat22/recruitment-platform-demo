"""Request and response shapes for the job description endpoints (plan.md 6.10
"Job descriptions"). Reads are ``ModelSerializer``s over ``JobService``
querysets; writes are plain serializers whose ``validated_data`` is exactly
what ``JobService.create`` / ``update`` take."""

from __future__ import annotations

from typing import Any

from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from accounts.models import User
from accounts.serializers import UserSummarySerializer
from common.enums import EmploymentType, JDStatus, ParticipantRole, WorkMode
from common.permissions import (
    can_comment_job,
    can_delete_job,
    can_edit_job,
    can_force_close_job,
    can_manage_job,
    can_manage_participants,
    can_work_pipeline,
)
from jobs.models import (
    JobDescription,
    JobDescriptionUpload,
    JobDescriptionVersion,
    RecruitmentParticipant,
)
from jobs.services import CONTENT_FIELDS, METRIC_KEYS, JobService
from matching.skills import display_name, normalize_skills

PARTICIPANTS_PREVIEW = 4
EXPERIENCE_MAX_YEARS = 50
OPENINGS_MAX = 500
# A PostgreSQL integer column; the form enforces the same ceiling.
SALARY_MAX = 2_000_000_000


def _skill_names(keys: Any) -> list[str]:
    return [display_name(key) for key in (keys or [])]


# --------------------------------------------------------------- participants


class ParticipantSerializer(serializers.ModelSerializer):
    """One row under "People Involved in the Recruitment"."""

    user = UserSummarySerializer(read_only=True)
    added_by = UserSummarySerializer(read_only=True, allow_null=True)
    role_label = serializers.CharField(source="get_role_in_recruitment_display", read_only=True)
    interview_count = serializers.SerializerMethodField()
    activity_count = serializers.SerializerMethodField()

    class Meta:
        model = RecruitmentParticipant
        fields = [
            "id",
            "user",
            "role_in_recruitment",
            "role_label",
            "added_by",
            "created_at",
            "interview_count",
            "activity_count",
        ]
        read_only_fields = fields

    @extend_schema_field(serializers.IntegerField())
    def get_interview_count(self, obj: RecruitmentParticipant) -> int:
        return int(getattr(obj, "interview_count", 0) or 0)

    @extend_schema_field(serializers.IntegerField())
    def get_activity_count(self, obj: RecruitmentParticipant) -> int:
        return int(getattr(obj, "activity_count", 0) or 0)


class ParticipantInputSerializer(serializers.Serializer):
    """``{user_id, role_in_recruitment}``; validates to ``{user, role_in_recruitment}``."""

    user_id = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.filter(is_active=True), source="user"
    )
    role_in_recruitment = serializers.ChoiceField(
        choices=ParticipantRole.choices, default=ParticipantRole.INTERVIEWER
    )


class ParticipantRoleSerializer(serializers.Serializer):
    """``PATCH .../participants/{pid}/``."""

    role_in_recruitment = serializers.ChoiceField(choices=ParticipantRole.choices)


# --------------------------------------------------------------------- reads


class PipelineCountsSerializer(serializers.Serializer):
    """The five numbers in the list's Pipeline column (plan.md 9.4)."""

    candidates = serializers.IntegerField()
    shortlisted = serializers.IntegerField()
    interviewed = serializers.IntegerField()
    selected = serializers.IntegerField()
    onboarded = serializers.IntegerField()


class MetricsSerializer(serializers.Serializer):
    """``GET .../metrics/`` (plan.md 6.10)."""

    total_found = serializers.IntegerField()
    shortlisted = serializers.IntegerField()
    contacted = serializers.IntegerField()
    in_interview = serializers.IntegerField()
    selected = serializers.IntegerField()
    rejected = serializers.IntegerField()
    offers_pending = serializers.IntegerField()
    onboarded = serializers.IntegerField()


class JobPermissionsSerializer(serializers.Serializer):
    """What the requesting user may do with this JD, so the UI shows the right buttons."""

    can_edit = serializers.BooleanField()
    can_delete = serializers.BooleanField()
    can_manage_participants = serializers.BooleanField()
    can_work_pipeline = serializers.BooleanField()
    can_manage = serializers.BooleanField()
    can_force_close = serializers.BooleanField()
    can_comment = serializers.BooleanField()


class JobDescriptionRowSerializer(serializers.ModelSerializer):
    """A list row: header fields, creator, participants preview, pipeline counts,
    plus the homepage columns (Enhancement.md 3): the interviewer-role
    participants, the latest timeline event and the completion percentage."""

    created_by = UserSummarySerializer(read_only=True)
    updated_by = UserSummarySerializer(read_only=True, allow_null=True)
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    work_mode_label = serializers.CharField(source="get_work_mode_display", read_only=True)
    employment_type_label = serializers.CharField(
        source="get_employment_type_display", read_only=True
    )
    required_skill_names = serializers.SerializerMethodField()
    preferred_skill_names = serializers.SerializerMethodField()
    participants_preview = serializers.SerializerMethodField()
    participants_count = serializers.SerializerMethodField()
    counts = serializers.SerializerMethodField()
    interviewers = serializers.SerializerMethodField()
    last_activity_at = serializers.SerializerMethodField()
    completion_pct = serializers.SerializerMethodField()

    class Meta:
        model = JobDescription
        fields = [
            "id",
            "title",
            "department",
            "location",
            "work_mode",
            "work_mode_label",
            "employment_type",
            "employment_type_label",
            "experience_min_years",
            "experience_max_years",
            "salary_min",
            "salary_max",
            "salary_currency",
            "required_skills",
            "required_skill_names",
            "preferred_skills",
            "preferred_skill_names",
            "domain",
            "status",
            "status_label",
            "openings",
            "created_by",
            "updated_by",
            "published_at",
            "current_version",
            "created_at",
            "updated_at",
            "participants_preview",
            "participants_count",
            "counts",
            "interviewers",
            "last_activity_at",
            "completion_pct",
        ]
        read_only_fields = fields

    @extend_schema_field(UserSummarySerializer(many=True))
    def get_interviewers(self, obj: JobDescription) -> list[dict[str, Any]]:
        """Everyone listed with the Interviewer role, in the order they were added."""
        users = [
            row.user
            for row in obj.participants.all()
            if row.role_in_recruitment == ParticipantRole.INTERVIEWER
        ]
        return UserSummarySerializer(users, many=True, context=self.context).data

    @extend_schema_field(serializers.DateTimeField())
    def get_last_activity_at(self, obj: JobDescription) -> str:
        """The latest timeline event (annotated by ``list_queryset``), else the last edit."""
        value = getattr(obj, "last_activity_at", None) or obj.updated_at
        return serializers.DateTimeField().to_representation(value)

    @extend_schema_field(serializers.IntegerField())
    def get_completion_pct(self, obj: JobDescription) -> int:
        return JobService.completion_pct(obj)

    @extend_schema_field(serializers.ListField(child=serializers.CharField()))
    def get_required_skill_names(self, obj: JobDescription) -> list[str]:
        return _skill_names(obj.required_skills)

    @extend_schema_field(serializers.ListField(child=serializers.CharField()))
    def get_preferred_skill_names(self, obj: JobDescription) -> list[str]:
        return _skill_names(obj.preferred_skills)

    @extend_schema_field(ParticipantSerializer(many=True))
    def get_participants_preview(self, obj: JobDescription) -> list[dict[str, Any]]:
        rows = list(obj.participants.all())[:PARTICIPANTS_PREVIEW]
        return ParticipantSerializer(rows, many=True, context=self.context).data

    @extend_schema_field(serializers.IntegerField())
    def get_participants_count(self, obj: JobDescription) -> int:
        return len(obj.participants.all())

    @extend_schema_field(PipelineCountsSerializer())
    def get_counts(self, obj: JobDescription) -> dict[str, int]:
        return {
            "candidates": int(getattr(obj, "count_candidates", 0) or 0),
            "shortlisted": int(getattr(obj, "count_shortlisted", 0) or 0),
            "interviewed": int(getattr(obj, "count_interviewed", 0) or 0),
            "selected": int(getattr(obj, "count_selected", 0) or 0),
            "onboarded": int(getattr(obj, "count_onboarded", 0) or 0),
        }


class JobDescriptionDetailSerializer(JobDescriptionRowSerializer):
    """``GET .../{id}/``: everything on the row plus the long text, every
    participant, the metric row and the caller's permissions."""

    participants = ParticipantSerializer(many=True, read_only=True)
    metrics = serializers.SerializerMethodField()
    permissions = serializers.SerializerMethodField()

    class Meta(JobDescriptionRowSerializer.Meta):
        fields = JobDescriptionRowSerializer.Meta.fields + [
            "education_requirements",
            "responsibilities",
            "qualifications",
            "additional_requirements",
            "description",
            "participants",
            "metrics",
            "permissions",
        ]
        read_only_fields = fields

    @extend_schema_field(MetricsSerializer())
    def get_metrics(self, obj: JobDescription) -> dict[str, int]:
        return JobService.metrics(obj)

    @extend_schema_field(JobPermissionsSerializer())
    def get_permissions(self, obj: JobDescription) -> dict[str, bool]:
        request = self.context.get("request")
        user = getattr(request, "user", None)
        return {
            "can_edit": can_edit_job(user, obj),
            "can_delete": can_delete_job(user, obj),
            "can_manage_participants": can_manage_participants(user, obj),
            "can_work_pipeline": can_work_pipeline(user, obj),
            "can_manage": can_manage_job(user, obj),
            "can_force_close": can_force_close_job(user, obj),
            "can_comment": can_comment_job(user, obj),
        }


class VersionRowSerializer(serializers.ModelSerializer):
    created_by = UserSummarySerializer(read_only=True)
    is_current = serializers.SerializerMethodField()

    class Meta:
        model = JobDescriptionVersion
        fields = ["id", "version", "change_summary", "created_by", "created_at", "is_current"]
        read_only_fields = fields

    @extend_schema_field(serializers.BooleanField())
    def get_is_current(self, obj: JobDescriptionVersion) -> bool:
        current = self.context.get("current_version")
        if current is None:
            current = obj.job_description.current_version
        return obj.version == current


class VersionDetailSerializer(VersionRowSerializer):
    """One snapshot, with skill display names alongside the stored keys."""

    snapshot = serializers.DictField(child=serializers.JSONField(), read_only=True)
    required_skill_names = serializers.SerializerMethodField()
    preferred_skill_names = serializers.SerializerMethodField()

    class Meta(VersionRowSerializer.Meta):
        fields = VersionRowSerializer.Meta.fields + [
            "snapshot",
            "required_skill_names",
            "preferred_skill_names",
        ]
        read_only_fields = fields

    @extend_schema_field(serializers.ListField(child=serializers.CharField()))
    def get_required_skill_names(self, obj: JobDescriptionVersion) -> list[str]:
        return _skill_names(obj.snapshot.get("required_skills"))

    @extend_schema_field(serializers.ListField(child=serializers.CharField()))
    def get_preferred_skill_names(self, obj: JobDescriptionVersion) -> list[str]:
        return _skill_names(obj.snapshot.get("preferred_skills"))


class FacetOptionSerializer(serializers.Serializer):
    key = serializers.CharField()
    label = serializers.CharField()
    count = serializers.IntegerField()


class JobFacetsSerializer(serializers.Serializer):
    """Filter popover options with counts over the JDs the caller can see."""

    statuses = FacetOptionSerializer(many=True)
    departments = FacetOptionSerializer(many=True)
    locations = FacetOptionSerializer(many=True)
    employment_types = FacetOptionSerializer(many=True)
    work_modes = FacetOptionSerializer(many=True)
    # key = user id, label = full name: who raised the JDs (the homepage "Created by" filter).
    creators = FacetOptionSerializer(many=True)


class SkillSuggestionSerializer(serializers.Serializer):
    key = serializers.CharField()
    display_name = serializers.CharField()
    count = serializers.IntegerField()


class JobExtractRequestSerializer(serializers.Serializer):
    """``POST /job-descriptions/extract/``: one job description as a PDF or Word file."""

    file = serializers.FileField(
        help_text="One job description as a PDF or Word (.docx) file, up to 10 MB."
    )


class JobExtractedFieldsSerializer(serializers.Serializer):
    """The create-request fields the model read from the file; one it could not read is left out."""

    title = serializers.CharField(required=False)
    department = serializers.CharField(required=False)
    location = serializers.CharField(required=False)
    work_mode = serializers.ChoiceField(choices=WorkMode.choices, required=False)
    employment_type = serializers.ChoiceField(choices=EmploymentType.choices, required=False)
    experience_min_years = serializers.IntegerField(required=False)
    experience_max_years = serializers.IntegerField(required=False)
    openings = serializers.IntegerField(required=False)
    domain = serializers.CharField(required=False)
    salary_min = serializers.IntegerField(required=False)
    salary_max = serializers.IntegerField(required=False)
    salary_currency = serializers.CharField(required=False)
    required_skills = serializers.ListField(child=serializers.CharField(), required=False)
    preferred_skills = serializers.ListField(child=serializers.CharField(), required=False)
    education_requirements = serializers.CharField(required=False)
    responsibilities = serializers.CharField(required=False)
    qualifications = serializers.CharField(required=False)
    additional_requirements = serializers.CharField(required=False)
    description = serializers.CharField(required=False)


class JobExtractionSerializer(serializers.Serializer):
    file_name = serializers.CharField()
    fields = JobExtractedFieldsSerializer()


class JobUploadRequestSerializer(serializers.Serializer):
    file_name = serializers.CharField(max_length=255)

    def validate_file_name(self, value):
        if value.rsplit(".", 1)[-1].lower() not in ("pdf", "docx"):
            raise serializers.ValidationError("Upload a PDF or Word (.docx) file.")
        return value


class JobUploadSerializer(serializers.ModelSerializer):
    fields = JobExtractedFieldsSerializer(read_only=True)

    class Meta:
        model = JobDescriptionUpload
        fields = ["id", "file_name", "status", "fields", "error", "created_at", "updated_at"]
        read_only_fields = fields


# -------------------------------------------------------------------- writes


class _ContentSerializer(serializers.Serializer):
    """The content fields of plan.md 6.3 jobs.JobDescription, validated the way
    the form validates them (plan.md 9.5)."""

    title = serializers.CharField(max_length=200)
    department = serializers.CharField(max_length=120)
    location = serializers.CharField(max_length=160)
    work_mode = serializers.ChoiceField(choices=WorkMode.choices)
    employment_type = serializers.ChoiceField(choices=EmploymentType.choices)
    experience_min_years = serializers.IntegerField(min_value=0, max_value=EXPERIENCE_MAX_YEARS)
    experience_max_years = serializers.IntegerField(min_value=0, max_value=EXPERIENCE_MAX_YEARS)
    salary_min = serializers.IntegerField(
        required=False, allow_null=True, min_value=0, max_value=SALARY_MAX
    )
    salary_max = serializers.IntegerField(
        required=False, allow_null=True, min_value=0, max_value=SALARY_MAX
    )
    salary_currency = serializers.CharField(
        required=False, min_length=3, max_length=3, default="INR"
    )
    required_skills = serializers.ListField(
        child=serializers.CharField(max_length=80), allow_empty=False
    )
    preferred_skills = serializers.ListField(
        child=serializers.CharField(max_length=80), required=False, default=list
    )
    education_requirements = serializers.CharField(required=False, allow_blank=True, default="")
    responsibilities = serializers.CharField(required=False, allow_blank=True, default="")
    qualifications = serializers.CharField(required=False, allow_blank=True, default="")
    additional_requirements = serializers.CharField(required=False, allow_blank=True, default="")
    description = serializers.CharField(required=False, allow_blank=True, default="")
    domain = serializers.CharField(
        required=False, allow_blank=True, allow_null=True, max_length=120, default=None
    )
    openings = serializers.IntegerField(
        required=False, min_value=1, max_value=OPENINGS_MAX, default=1
    )
    participants = ParticipantInputSerializer(many=True, required=False)

    def validate_required_skills(self, value: list[str]) -> list[str]:
        if not normalize_skills(value):
            raise serializers.ValidationError("Add at least one required skill.", code="required")
        return value

    def validate_salary_currency(self, value: str) -> str:
        value = (value or "").strip().upper()
        if not value.isalpha():
            raise serializers.ValidationError("Use a three-letter currency code.", code="invalid")
        return value

    def _current(self, attrs: dict[str, Any], name: str) -> Any:
        if name in attrs:
            return attrs[name]
        return getattr(self.instance, name, None) if self.instance is not None else None

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        errors: dict[str, list[str]] = {}
        exp_min = self._current(attrs, "experience_min_years")
        exp_max = self._current(attrs, "experience_max_years")
        if exp_min is not None and exp_max is not None and exp_min > exp_max:
            errors["experience_max_years"] = ["Maximum experience must be at least the minimum."]
        salary_min = self._current(attrs, "salary_min")
        salary_max = self._current(attrs, "salary_max")
        if salary_min is not None and salary_max is not None and salary_min > salary_max:
            errors["salary_max"] = ["Maximum salary must be at least the minimum."]
        if errors:
            raise serializers.ValidationError(errors)
        return attrs


class JobDescriptionCreateSerializer(_ContentSerializer):
    """``POST /job-descriptions/``: content, people and the starting status."""

    status = serializers.ChoiceField(
        choices=[(JDStatus.DRAFT, JDStatus.DRAFT.label), (JDStatus.OPEN, JDStatus.OPEN.label)],
        required=False,
        default=JDStatus.DRAFT,
    )


class JobDescriptionUpdateSerializer(_ContentSerializer):
    """``PATCH /job-descriptions/{id}/``: any subset of the content, an optional
    replacement participant list and a change summary for the version note.
    Status changes go through the dedicated endpoints."""

    change_summary = serializers.CharField(required=False, allow_blank=True, max_length=300)

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        attrs = super().validate(attrs)
        unknown = set(self.initial_data) - set(self.fields)
        if "status" in unknown:
            raise serializers.ValidationError(
                {"status": ["Change the status with the publish, status or archive endpoints."]}
            )
        return attrs


class StatusChangeSerializer(serializers.Serializer):
    """``POST .../status/``: the target status and an optional note for the timeline."""

    status = serializers.ChoiceField(choices=JDStatus.choices)
    note = serializers.CharField(required=False, allow_blank=True, max_length=500, default="")


class ForceCloseSerializer(serializers.Serializer):
    """``POST .../force-close/``: an optional reason, shown on the timeline."""

    reason = serializers.CharField(required=False, allow_blank=True, max_length=500, default="")


class JobCommentSerializer(serializers.Serializer):
    """``POST .../comments/``: the remark that becomes a ``jd.comment_added`` event."""

    text = serializers.CharField(max_length=1000)


__all__ = [
    "CONTENT_FIELDS",
    "METRIC_KEYS",
    "FacetOptionSerializer",
    "ForceCloseSerializer",
    "JobCommentSerializer",
    "JobDescriptionCreateSerializer",
    "JobDescriptionDetailSerializer",
    "JobDescriptionRowSerializer",
    "JobDescriptionUpdateSerializer",
    "JobFacetsSerializer",
    "JobPermissionsSerializer",
    "MetricsSerializer",
    "ParticipantInputSerializer",
    "ParticipantRoleSerializer",
    "ParticipantSerializer",
    "PipelineCountsSerializer",
    "SkillSuggestionSerializer",
    "StatusChangeSerializer",
    "VersionDetailSerializer",
    "VersionRowSerializer",
]
