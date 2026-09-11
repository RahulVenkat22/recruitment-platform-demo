"""Job descriptions, their version history and the people involved in the
recruitment (plan.md 6.3 jobs.*)."""

from __future__ import annotations

from django.conf import settings
from django.contrib.postgres.fields import ArrayField
from django.contrib.postgres.indexes import GinIndex, OpClass
from django.db import models
from django.db.models.functions import Upper

from common import enums
from common.models import UUIDTimestampedModel


class JobDescription(UUIDTimestampedModel):
    """A hiring requirement. Content fields are snapshotted into
    ``JobDescriptionVersion`` on create and on every content change."""

    title = models.CharField(max_length=200)
    department = models.CharField(max_length=120)
    location = models.CharField(max_length=160)
    work_mode = models.CharField(max_length=20, choices=enums.WorkMode.choices)
    employment_type = models.CharField(max_length=20, choices=enums.EmploymentType.choices)
    experience_min_years = models.PositiveSmallIntegerField()
    experience_max_years = models.PositiveSmallIntegerField()
    # Annual, in salary_currency.
    salary_min = models.PositiveIntegerField(null=True, blank=True)
    salary_max = models.PositiveIntegerField(null=True, blank=True)
    salary_currency = models.CharField(max_length=3, default="INR")
    # Normalised lowercase skill keys (matching.skills); display uses the skill dictionary.
    required_skills = ArrayField(models.TextField(), default=list, blank=True)
    preferred_skills = ArrayField(models.TextField(), default=list, blank=True)
    education_requirements = models.TextField(blank=True)
    # One item per line.
    responsibilities = models.TextField(blank=True)
    qualifications = models.TextField(blank=True)
    additional_requirements = models.TextField(blank=True)
    # Full JD body.
    description = models.TextField(blank=True)
    # e.g. "healthcare", "fintech"; used by the domain match component.
    domain = models.CharField(max_length=120, null=True, blank=True)
    status = models.CharField(
        max_length=20, choices=enums.JDStatus.choices, default=enums.JDStatus.DRAFT
    )
    openings = models.PositiveSmallIntegerField(default=1)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="created_job_descriptions",
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="updated_job_descriptions",
    )
    # Set on the draft -> open transition.
    published_at = models.DateTimeField(null=True, blank=True)
    current_version = models.PositiveIntegerField(default=1)

    class Meta:
        ordering = ["-created_at"]
        # (created_by) is covered by the index Django creates for every ForeignKey.
        indexes = [
            models.Index(fields=["status"], name="jobs_jd_status_idx"),
            models.Index(fields=["department"], name="jobs_jd_department_idx"),
            GinIndex(fields=["required_skills"], name="jobs_jd_required_skills_gin"),
            # Trigram index so `title__icontains` (UPPER(title) LIKE ...) stays indexed.
            GinIndex(OpClass(Upper("title"), name="gin_trgm_ops"), name="jobs_jd_title_trgm_gin"),
        ]

    def __str__(self) -> str:
        return self.title


class JobDescriptionVersion(UUIDTimestampedModel):
    """Immutable snapshot of a JD's content fields; v1 on create, +1 per content change."""

    job_description = models.ForeignKey(
        JobDescription, on_delete=models.CASCADE, related_name="versions"
    )
    version = models.PositiveIntegerField()
    snapshot = models.JSONField(default=dict)
    change_summary = models.CharField(max_length=300, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="job_description_versions",
    )

    class Meta:
        ordering = ["-version"]
        constraints = [
            models.UniqueConstraint(
                fields=["job_description", "version"], name="jobs_jdversion_jd_version_uniq"
            ),
        ]

    def __str__(self) -> str:
        return f"{self.job_description.title} v{self.version}"


class RecruitmentParticipant(UUIDTimestampedModel):
    """One person under "People Involved in the Recruitment" for one JD.

    The JD creator is inserted automatically as ``owner`` by ``JobService``.
    """

    job_description = models.ForeignKey(
        JobDescription, on_delete=models.CASCADE, related_name="participants"
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="recruitment_participations",
    )
    # The PeoplePicker falls back to Interviewer when no better default applies (plan.md 8.4).
    role_in_recruitment = models.CharField(
        max_length=20,
        choices=enums.ParticipantRole.choices,
        default=enums.ParticipantRole.INTERVIEWER,
    )
    added_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="added_recruitment_participants",
    )

    class Meta:
        ordering = ["created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["job_description", "user"], name="jobs_participant_jd_user_uniq"
            ),
        ]

    def __str__(self) -> str:
        return (
            f"{self.user.full_name} as {self.get_role_in_recruitment_display()} "
            f"on {self.job_description.title}"
        )
