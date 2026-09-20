"""Shapes for ``GET/POST/PATCH /api/v1/candidates/`` (plan.md 6.10 Candidates rows).
Contact details are masked for interviewer and employee roles; the resume text
is only sent by the detail endpoint (plan.md 6.9 PII)."""

from __future__ import annotations

from typing import Any

from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from accounts.serializers import UserSummarySerializer
from candidates.models import (
    Candidate,
    CandidateCertification,
    CandidateEducation,
    CandidateExperience,
    CandidateSkill,
    CandidateSource,
)
from common.masking import PIIMaskingMixin
from common.permissions import is_hr_staff
from pipeline.models import Application
from pipeline.serializers import JobRefSerializer
from resumes.models import ResumeStatus
from resumes.serializers import ResumeDocumentSummarySerializer

ROW_SKILLS = 6


class CandidateSkillSerializer(serializers.ModelSerializer):
    years = serializers.FloatField(read_only=True, allow_null=True)

    class Meta:
        model = CandidateSkill
        fields = ["id", "skill", "display_name", "proficiency", "years", "is_primary"]
        read_only_fields = fields


class CandidateExperienceSerializer(serializers.ModelSerializer):
    class Meta:
        model = CandidateExperience
        fields = [
            "id",
            "company",
            "title",
            "domain",
            "start_date",
            "end_date",
            "is_current",
            "description",
        ]
        read_only_fields = fields


class CandidateEducationSerializer(serializers.ModelSerializer):
    class Meta:
        model = CandidateEducation
        fields = ["id", "degree", "field", "institution", "start_year", "end_year", "grade"]
        read_only_fields = fields


class CandidateCertificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = CandidateCertification
        fields = ["id", "name", "issuer", "issued_year", "credential_url"]
        read_only_fields = fields


class CandidateSourceSerializer(serializers.ModelSerializer):
    source_label = serializers.CharField(source="get_source_display", read_only=True)
    referred_by = UserSummarySerializer(read_only=True, allow_null=True)

    class Meta:
        model = CandidateSource
        fields = ["source", "source_label", "source_reference", "referred_by", "discovered_at"]
        read_only_fields = fields


class CandidateApplicationSerializer(serializers.ModelSerializer):
    """One JD the candidate is attached to, with the headline numbers."""

    job = JobRefSerializer(source="job_description", read_only=True)
    owner = UserSummarySerializer(read_only=True, allow_null=True)
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    match_pct = serializers.SerializerMethodField()

    class Meta:
        model = Application
        fields = [
            "id",
            "job_description",
            "job",
            "status",
            "status_label",
            "owner",
            "entry_source",
            "match_pct",
            "is_starred",
            "stage_entered_at",
            "last_activity_at",
            "created_at",
        ]
        read_only_fields = fields

    @extend_schema_field(serializers.FloatField(allow_null=True))
    def get_match_pct(self, obj: Application) -> float | None:
        match = getattr(obj, "match", None)
        return float(match.overall_pct) if match is not None else None


class CandidatePermissionsSerializer(serializers.Serializer):
    can_edit = serializers.BooleanField()
    can_view_contact = serializers.BooleanField()


class CandidateRowSerializer(PIIMaskingMixin, serializers.ModelSerializer):
    """A row of ``GET /candidates/`` (plan.md 9.9)."""

    total_experience_years = serializers.FloatField(read_only=True)
    skills = serializers.SerializerMethodField()
    sources = serializers.SerializerMethodField()
    applications = CandidateApplicationSerializer(many=True, read_only=True)
    last_activity_at = serializers.SerializerMethodField()

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
            "notice_period_days",
            "skills",
            "sources",
            "applications",
            "last_activity_at",
            "created_at",
        ]
        read_only_fields = fields

    @extend_schema_field(CandidateSkillSerializer(many=True))
    def get_skills(self, obj: Candidate) -> list[dict[str, Any]]:
        rows = list(obj.skills.all())
        limit = None if self.context.get("all_skills") else ROW_SKILLS
        return CandidateSkillSerializer(rows[:limit], many=True).data

    @extend_schema_field(serializers.ListField(child=serializers.CharField()))
    def get_sources(self, obj: Candidate) -> list[str]:
        return [row.source for row in obj.sources.all()]

    @extend_schema_field(serializers.DateTimeField(allow_null=True))
    def get_last_activity_at(self, obj: Candidate):
        value = getattr(obj, "last_activity", None)
        if value is None:
            stamps = [row.last_activity_at for row in obj.applications.all()]
            value = max(stamps) if stamps else None
        return value


class CandidateDetailSerializer(CandidateRowSerializer):
    """``GET /candidates/{id}/``: the whole profile with every child collection."""

    experiences = CandidateExperienceSerializer(many=True, read_only=True)
    education = CandidateEducationSerializer(many=True, read_only=True)
    certifications = CandidateCertificationSerializer(many=True, read_only=True)
    source_details = CandidateSourceSerializer(source="sources", many=True, read_only=True)
    resume = serializers.SerializerMethodField()
    permissions = serializers.SerializerMethodField()

    class Meta(CandidateRowSerializer.Meta):
        fields = CandidateRowSerializer.Meta.fields + [
            "summary",
            "resume_text",
            "resume_url",
            "resume",
            "linkedin_url",
            "github_url",
            "current_ctc",
            "expected_ctc",
            "experiences",
            "education",
            "certifications",
            "source_details",
            "permissions",
            "updated_at",
        ]
        read_only_fields = fields

    @extend_schema_field(ResumeDocumentSummarySerializer(allow_null=True))
    def get_resume(self, obj: Candidate) -> dict[str, Any] | None:
        """The ingested PDF behind this profile (opened through ``/resume-link/``)."""
        documents = [row for row in obj.resume_documents.all() if row.status == ResumeStatus.PARSED]
        if not documents:
            return None
        latest = max(documents, key=lambda row: row.ingested_at or row.created_at)
        return ResumeDocumentSummarySerializer(latest).data

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)
        self.context.setdefault("all_skills", True)

    @extend_schema_field(CandidatePermissionsSerializer())
    def get_permissions(self, obj: Candidate) -> dict[str, bool]:
        request = self.context.get("request")
        user = getattr(request, "user", None)
        return {"can_edit": is_hr_staff(user), "can_view_contact": is_hr_staff(user)}


class CandidateSkillInputSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=80)
    proficiency = serializers.IntegerField(min_value=1, max_value=5, default=3)
    years = serializers.FloatField(required=False, allow_null=True, min_value=0, max_value=60)
    is_primary = serializers.BooleanField(default=False)


class CandidateWriteSerializer(serializers.Serializer):
    """``POST`` (all required fields) and ``PATCH`` (partial) for manual entry."""

    full_name = serializers.CharField(max_length=160)
    email = serializers.EmailField(max_length=254)
    phone = serializers.CharField(required=False, allow_blank=True, max_length=32, default="")
    location = serializers.CharField(required=False, allow_blank=True, max_length=160, default="")
    avatar_url = serializers.URLField(
        required=False, allow_blank=True, allow_null=True, default=None
    )
    headline = serializers.CharField(required=False, allow_blank=True, max_length=200, default="")
    current_company = serializers.CharField(
        required=False, allow_blank=True, max_length=160, default=""
    )
    current_title = serializers.CharField(
        required=False, allow_blank=True, max_length=160, default=""
    )
    total_experience_years = serializers.FloatField(
        required=False, min_value=0, max_value=60, default=0
    )
    summary = serializers.CharField(required=False, allow_blank=True, default="")
    resume_url = serializers.URLField(
        required=False, allow_blank=True, allow_null=True, default=None
    )
    linkedin_url = serializers.URLField(
        required=False, allow_blank=True, allow_null=True, default=None
    )
    github_url = serializers.URLField(
        required=False, allow_blank=True, allow_null=True, default=None
    )
    notice_period_days = serializers.IntegerField(
        required=False, allow_null=True, min_value=0, max_value=365, default=None
    )
    current_ctc = serializers.IntegerField(
        required=False, allow_null=True, min_value=0, default=None
    )
    expected_ctc = serializers.IntegerField(
        required=False, allow_null=True, min_value=0, default=None
    )
    skills = CandidateSkillInputSerializer(many=True, required=False)

    def validate_email(self, value: str) -> str:
        return value.strip().lower()

    def validate_avatar_url(self, value: str | None) -> str | None:
        return value or None
