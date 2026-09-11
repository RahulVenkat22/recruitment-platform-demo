"""Candidates and their child collections (plan.md 6.3 candidates.*).

Rows are created and refreshed by ``CandidateRepository.upsert_from_dto()`` from
whichever source provider surfaced the person; ``CandidateSource`` records each
provider that knows the candidate.
"""

from __future__ import annotations

from decimal import Decimal

from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.db.models.functions import Lower
from django.utils import timezone

from common import enums
from common.models import UUIDTimestampedModel


class Candidate(UUIDTimestampedModel):
    full_name = models.CharField(max_length=160)
    # Stored lowercase (see save() and the Lower("email") constraint); the dedupe key
    # across sources.
    email = models.EmailField(max_length=254, unique=True)
    phone = models.CharField(max_length=32, blank=True)
    location = models.CharField(max_length=160, blank=True)
    # Placeholder photo URL; null triggers the initials fallback in the UI.
    avatar_url = models.TextField(null=True, blank=True)
    # e.g. "Senior Backend Engineer at Zoho"
    headline = models.CharField(max_length=200, blank=True)
    current_company = models.CharField(max_length=160, blank=True)
    current_title = models.CharField(max_length=160, blank=True)
    total_experience_years = models.DecimalField(
        max_digits=4, decimal_places=1, default=Decimal("0.0")
    )
    # Professional summary; input to the responsibility match component.
    summary = models.TextField(blank=True)
    # Placeholder link; resume files are not uploaded in the MVP.
    resume_url = models.TextField(null=True, blank=True)
    resume_text = models.TextField(blank=True)
    linkedin_url = models.TextField(null=True, blank=True)
    github_url = models.TextField(null=True, blank=True)
    notice_period_days = models.PositiveSmallIntegerField(null=True, blank=True)
    # Annual, INR.
    current_ctc = models.PositiveIntegerField(null=True, blank=True)
    expected_ctc = models.PositiveIntegerField(null=True, blank=True)

    class Meta:
        ordering = ["full_name"]
        constraints = [
            # save() lowercases, but bulk_create/update bypass it; the database enforces it.
            models.UniqueConstraint(Lower("email"), name="candidates_candidate_email_ci_unique"),
        ]

    def __str__(self) -> str:
        return self.full_name

    def save(self, *args, **kwargs) -> None:
        self.email = self.email.strip().lower()
        super().save(*args, **kwargs)

    @property
    def initials(self) -> str:
        parts = self.full_name.split()
        return "".join(part[0] for part in (parts[:1] + parts[-1:]) if part).upper()


class CandidateSkill(UUIDTimestampedModel):
    candidate = models.ForeignKey(Candidate, on_delete=models.CASCADE, related_name="skills")
    # Normalised key from matching.skills (e.g. "postgresql"), compared exactly with JD skills.
    skill = models.CharField(max_length=80, db_index=True)
    display_name = models.CharField(max_length=80)
    # 1 (beginner) .. 5 (expert)
    proficiency = models.PositiveSmallIntegerField(
        validators=[MinValueValidator(1), MaxValueValidator(5)]
    )
    years = models.DecimalField(max_digits=3, decimal_places=1, null=True, blank=True)
    is_primary = models.BooleanField(default=False)

    class Meta:
        ordering = ["-is_primary", "-proficiency", "skill"]
        constraints = [
            models.UniqueConstraint(
                fields=["candidate", "skill"], name="candidates_skill_cand_skill_uniq"
            ),
            models.CheckConstraint(
                condition=models.Q(proficiency__gte=1, proficiency__lte=5),
                name="candidates_skill_proficiency_chk",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.candidate.full_name}: {self.display_name} ({self.proficiency}/5)"


class CandidateExperience(UUIDTimestampedModel):
    candidate = models.ForeignKey(Candidate, on_delete=models.CASCADE, related_name="experiences")
    company = models.CharField(max_length=160)
    title = models.CharField(max_length=160)
    # e.g. "fintech"; compared with JobDescription.domain by the match engine.
    domain = models.CharField(max_length=80, null=True, blank=True)
    start_date = models.DateField()
    end_date = models.DateField(null=True, blank=True)
    is_current = models.BooleanField(default=False)
    description = models.TextField(blank=True)

    class Meta:
        ordering = ["-is_current", "-start_date"]

    def __str__(self) -> str:
        return f"{self.title} at {self.company}"


class CandidateEducation(UUIDTimestampedModel):
    candidate = models.ForeignKey(Candidate, on_delete=models.CASCADE, related_name="education")
    # B.Tech, B.E, M.Tech, MCA, B.Sc, M.Sc, MBA, PhD, ...
    degree = models.CharField(max_length=40)
    field = models.CharField(max_length=120)
    institution = models.CharField(max_length=200)
    start_year = models.PositiveSmallIntegerField()
    end_year = models.PositiveSmallIntegerField()
    grade = models.CharField(max_length=40, null=True, blank=True)

    class Meta:
        ordering = ["-end_year"]

    def __str__(self) -> str:
        return f"{self.degree} {self.field}, {self.institution}"


class CandidateCertification(UUIDTimestampedModel):
    candidate = models.ForeignKey(
        Candidate, on_delete=models.CASCADE, related_name="certifications"
    )
    name = models.CharField(max_length=160)
    issuer = models.CharField(max_length=160)
    issued_year = models.PositiveSmallIntegerField()
    credential_url = models.TextField(null=True, blank=True)

    class Meta:
        ordering = ["-issued_year"]

    def __str__(self) -> str:
        return self.name


class CandidateSource(UUIDTimestampedModel):
    """One provider that surfaced this candidate; a candidate can have several."""

    candidate = models.ForeignKey(Candidate, on_delete=models.CASCADE, related_name="sources")
    source = models.CharField(max_length=20, choices=enums.CandidateSource.choices)
    # External id or profile URL at the provider.
    source_reference = models.CharField(max_length=255, blank=True)
    referred_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="referrals",
    )
    discovered_at = models.DateTimeField(default=timezone.now)
    # Reserved for the provider's original record once real providers exist.
    raw_payload = models.JSONField(null=True, blank=True)

    class Meta:
        ordering = ["discovered_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["candidate", "source"], name="candidates_source_cand_src_uniq"
            ),
        ]

    def __str__(self) -> str:
        return f"{self.candidate.full_name} via {self.get_source_display()}"
