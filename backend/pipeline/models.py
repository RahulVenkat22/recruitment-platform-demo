"""One candidate's journey on one JD: the application, its AI match, the search
that found it, interviews, communications, the offer and onboarding
(plan.md 6.3 pipeline.*). ``Application.status`` is the single source of truth
for where a candidate stands; ``PipelineService.transition`` is the only writer.
"""

from __future__ import annotations

from django.conf import settings
from django.contrib.postgres.fields import ArrayField
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.utils import timezone

from common import enums
from common.models import UUIDTimestampedModel

# (key, label) pairs of the default onboarding checklist (plan.md 6.3 Onboarding).
DEFAULT_ONBOARDING_CHECKLIST: tuple[tuple[str, str], ...] = (
    ("offer_letter_signed", "Offer letter signed"),
    ("documents_collected", "Documents collected"),
    ("background_check", "Background check"),
    ("laptop_and_accounts", "Laptop and accounts"),
    ("day_one_orientation", "Day-one orientation"),
)


def default_onboarding_checklist() -> list[dict]:
    """Fresh ``[{key, label, done, done_at}]`` list for ``Onboarding.checklist``."""
    return [
        {"key": key, "label": label, "done": False, "done_at": None}
        for key, label in DEFAULT_ONBOARDING_CHECKLIST
    ]


class SearchRun(UUIDTimestampedModel):
    """One "Search candidates" execution. Worker-ready: a future task queue only
    changes who sets ``status``."""

    job_description = models.ForeignKey(
        "jobs.JobDescription", on_delete=models.CASCADE, related_name="search_runs"
    )
    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="search_runs",
    )
    # Provider keys that were queried (enums.CandidateSource values).
    sources = ArrayField(models.TextField(), default=list, blank=True)
    status = models.CharField(
        max_length=20,
        choices=enums.SearchRunStatus.choices,
        default=enums.SearchRunStatus.PENDING,
    )
    total_found = models.PositiveIntegerField(default=0)
    new_candidates = models.PositiveIntegerField(default=0)
    existing_candidates = models.PositiveIntegerField(default=0)
    shortlisted = models.PositiveIntegerField(default=0)
    started_at = models.DateTimeField(default=timezone.now)
    finished_at = models.DateTimeField(null=True, blank=True)
    duration_ms = models.PositiveIntegerField(null=True, blank=True)
    error = models.TextField(null=True, blank=True)
    # Where an in-flight run is (queued, analysing, retrieving, scoring, evaluating,
    # finalising, done) and a human-readable line for the loader; the run executes
    # in a background thread and the UI polls these.
    phase = models.CharField(max_length=20, blank=True, default="")
    progress = models.JSONField(null=True, blank=True)
    # The JD analysis behind this run (resumes.engines.planner.QueryPlan.as_dict()).
    query_plan = models.JSONField(null=True, blank=True)

    class Meta:
        ordering = ["-started_at"]

    def __str__(self) -> str:
        return (
            f"Search on {self.job_description.title} "
            f"({self.get_status_display()}, {self.total_found} found)"
        )


class Application(UUIDTimestampedModel):
    """One candidate on one JD."""

    candidate = models.ForeignKey(
        "candidates.Candidate", on_delete=models.CASCADE, related_name="applications"
    )
    job_description = models.ForeignKey(
        "jobs.JobDescription", on_delete=models.CASCADE, related_name="applications"
    )
    status = models.CharField(
        max_length=32,
        choices=enums.ApplicationStatus.choices,
        default=enums.ApplicationStatus.NEW,
    )
    # Restored when leaving on_hold.
    previous_status = models.CharField(
        max_length=32, choices=enums.ApplicationStatus.choices, null=True, blank=True
    )
    # Recruiter responsible for this candidate.
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="owned_applications",
    )
    # Which search surfaced the candidate for this JD.
    search_run = models.ForeignKey(
        SearchRun,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="applications",
    )
    # Provider that surfaced the candidate for this JD.
    entry_source = models.CharField(
        max_length=20,
        choices=enums.CandidateSource.choices,
        default=enums.CandidateSource.INTERNAL,
    )
    stage_entered_at = models.DateTimeField(default=timezone.now)
    last_activity_at = models.DateTimeField(default=timezone.now)
    rejection_reason = models.TextField(null=True, blank=True)
    hold_reason = models.TextField(null=True, blank=True)
    notes = models.TextField(blank=True)
    is_starred = models.BooleanField(default=False)

    class Meta:
        ordering = ["-last_activity_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["candidate", "job_description"], name="pipeline_app_cand_jd_uniq"
            ),
        ]
        # (owner) is covered by the index Django creates for every ForeignKey.
        indexes = [
            models.Index(fields=["job_description", "status"], name="pipeline_app_jd_status_idx"),
            models.Index(fields=["last_activity_at"], name="pipeline_app_last_activity_idx"),
        ]

    def __str__(self) -> str:
        return (
            f"{self.candidate.full_name} for {self.job_description.title} "
            f"({self.get_status_display()})"
        )


class CandidateMatch(UUIDTimestampedModel):
    """The match engine's verdict for one application; recomputed by ``rematch``."""

    application = models.OneToOneField(Application, on_delete=models.CASCADE, related_name="match")
    overall_pct = models.DecimalField(max_digits=5, decimal_places=2)
    skills_score = models.DecimalField(max_digits=5, decimal_places=2)
    experience_score = models.DecimalField(max_digits=5, decimal_places=2)
    education_score = models.DecimalField(max_digits=5, decimal_places=2)
    domain_score = models.DecimalField(max_digits=5, decimal_places=2)
    responsibility_score = models.DecimalField(max_digits=5, decimal_places=2)
    matched_required_skills = ArrayField(models.TextField(), default=list, blank=True)
    missing_required_skills = ArrayField(models.TextField(), default=list, blank=True)
    matched_preferred_skills = ArrayField(models.TextField(), default=list, blank=True)
    # Templated sentences, at most five each (plan.md 6.6).
    strengths = models.JSONField(default=list, blank=True)
    gaps = models.JSONField(default=list, blank=True)
    engine = models.CharField(max_length=40)
    engine_version = models.CharField(max_length=20)
    computed_at = models.DateTimeField(default=timezone.now)
    # Semantic search signals (null when the match came from the rules alone):
    # how strongly the resume text matched the job (0..1) and the LLM's score (0..100).
    retrieval_score = models.DecimalField(max_digits=5, decimal_places=4, null=True, blank=True)
    rerank_score = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    # The LLM's grounded explanation, plus its matched/missing skills, concerns,
    # the resume excerpts it was shown and the model that wrote it.
    explanation = models.TextField(blank=True, default="")
    semantic_details = models.JSONField(null=True, blank=True)

    class Meta:
        ordering = ["-overall_pct"]

    def __str__(self) -> str:
        return f"{self.overall_pct}% match for {self.application.candidate.full_name}"


class Interview(UUIDTimestampedModel):
    application = models.ForeignKey(
        Application, on_delete=models.CASCADE, related_name="interviews"
    )
    round = models.CharField(max_length=20, choices=enums.InterviewRound.choices)
    # Position of this round in the candidate's sequence of interviews.
    sequence = models.PositiveSmallIntegerField(default=1)
    interviewer = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="interviews"
    )
    scheduled_at = models.DateTimeField()
    duration_minutes = models.PositiveSmallIntegerField(default=60)
    mode = models.CharField(
        max_length=10, choices=enums.InterviewMode.choices, default=enums.InterviewMode.VIDEO
    )
    meeting_link = models.TextField(null=True, blank=True)
    location = models.CharField(max_length=160, null=True, blank=True)
    status = models.CharField(
        max_length=20,
        choices=enums.InterviewStatus.choices,
        default=enums.InterviewStatus.SCHEDULED,
    )
    # 0 to 10, one decimal.
    score = models.DecimalField(
        max_digits=3,
        decimal_places=1,
        null=True,
        blank=True,
        validators=[MinValueValidator(0), MaxValueValidator(10)],
    )
    feedback = models.TextField(blank=True)
    recommendation = models.CharField(
        max_length=20, choices=enums.Recommendation.choices, null=True, blank=True
    )
    feedback_submitted_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_interviews",
    )

    class Meta:
        ordering = ["scheduled_at"]
        indexes = [
            models.Index(fields=["scheduled_at"], name="pipeline_interview_sched_idx"),
        ]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(score__isnull=True) | models.Q(score__gte=0, score__lte=10),
                name="pipeline_interview_score_chk",
            ),
        ]

    def __str__(self) -> str:
        return (
            f"{self.get_round_display()} interview: {self.application.candidate.full_name} "
            f"with {self.interviewer.full_name}"
        )


class Communication(UUIDTimestampedModel):
    """A logged contact with the candidate (call, email, message, meeting)."""

    application = models.ForeignKey(
        Application, on_delete=models.CASCADE, related_name="communications"
    )
    channel = models.CharField(max_length=20, choices=enums.CommunicationChannel.choices)
    direction = models.CharField(
        max_length=10,
        choices=enums.CommunicationDirection.choices,
        default=enums.CommunicationDirection.OUTBOUND,
    )
    outcome = models.CharField(max_length=20, choices=enums.CommunicationOutcome.choices)
    summary = models.CharField(max_length=300)
    notes = models.TextField(blank=True)
    next_action = models.CharField(max_length=200, null=True, blank=True)
    next_action_at = models.DateTimeField(null=True, blank=True)
    performed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="communications",
    )
    occurred_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["-occurred_at"]

    def __str__(self) -> str:
        return (
            f"{self.get_direction_display()} {self.get_channel_display().lower()} "
            f"with {self.application.candidate.full_name}: {self.summary}"
        )


class Offer(UUIDTimestampedModel):
    application = models.OneToOneField(Application, on_delete=models.CASCADE, related_name="offer")
    status = models.CharField(
        max_length=20, choices=enums.OfferStatus.choices, default=enums.OfferStatus.DRAFT
    )
    designation = models.CharField(max_length=120)
    annual_ctc = models.PositiveIntegerField()
    currency = models.CharField(max_length=3, default="INR")
    joining_date = models.DateField()
    expires_at = models.DateTimeField(null=True, blank=True)
    sent_at = models.DateTimeField(null=True, blank=True)
    responded_at = models.DateTimeField(null=True, blank=True)
    notes = models.TextField(blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_offers",
    )

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return (
            f"Offer to {self.application.candidate.full_name}: {self.designation} "
            f"({self.get_status_display()})"
        )


class Onboarding(UUIDTimestampedModel):
    application = models.OneToOneField(
        Application, on_delete=models.CASCADE, related_name="onboarding"
    )
    status = models.CharField(
        max_length=20,
        choices=enums.OnboardingStatus.choices,
        default=enums.OnboardingStatus.NOT_STARTED,
    )
    start_date = models.DateField()
    buddy = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="buddy_onboardings",
    )
    hr_contact = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="hr_contact_onboardings",
    )
    # [{key, label, done, done_at}], see default_onboarding_checklist().
    checklist = models.JSONField(default=default_onboarding_checklist, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["-start_date"]

    def __str__(self) -> str:
        return f"Onboarding of {self.application.candidate.full_name} ({self.get_status_display()})"
