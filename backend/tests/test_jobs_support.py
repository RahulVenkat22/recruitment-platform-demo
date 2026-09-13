"""Row builders shared by the ``test_jobs_*`` modules (no tests in here).

Plain functions rather than fixtures so every module can import exactly what it
needs; ``conftest.py`` stays the home of the user fixtures.
"""

from __future__ import annotations

import itertools
from typing import Any

from candidates.models import Candidate
from common import enums
from jobs.models import JobDescription, RecruitmentParticipant
from pipeline.models import Application, Offer

_candidate_sequence = itertools.count(1)
_title_sequence = itertools.count(1)


def jd_payload(**overrides: Any) -> dict[str, Any]:
    """A valid JD content payload in API / service shape (skills already normalised)."""
    payload: dict[str, Any] = {
        "title": "Senior Python Developer",
        "department": "Engineering",
        "location": "Chennai",
        "work_mode": enums.WorkMode.HYBRID,
        "employment_type": enums.EmploymentType.FULL_TIME,
        "experience_min_years": 4,
        "experience_max_years": 8,
        "salary_min": 1_800_000,
        "salary_max": 2_800_000,
        "salary_currency": "INR",
        "required_skills": ["python", "django", "postgresql"],
        "preferred_skills": ["fastapi", "aws"],
        "education_requirements": "B.Tech / B.E in Computer Science",
        "responsibilities": "Design APIs\nMentor engineers",
        "qualifications": "4+ years with Python",
        "additional_requirements": "Hybrid, three days a week in Chennai.",
        "description": "Backend role on the fintech platform.",
        "domain": "fintech",
        "openings": 1,
    }
    payload.update(overrides)
    return payload


def make_jd(creator, *, with_owner: bool = True, **overrides: Any) -> JobDescription:
    """Persist a JD straight through the ORM (no service, no activities).

    ``with_owner`` also inserts the creator as the owner participant, the way
    ``JobService.create`` would have.
    """
    fields = jd_payload(title=f"Job {next(_title_sequence)}")
    fields.update(
        {"status": enums.JDStatus.OPEN, "created_by": creator, "updated_by": creator},
    )
    fields.update(overrides)
    jd = JobDescription.objects.create(**fields)
    if with_owner:
        RecruitmentParticipant.objects.create(
            job_description=jd,
            user=creator,
            role_in_recruitment=enums.ParticipantRole.OWNER,
            added_by=creator,
        )
    return jd


def add_participant(jd: JobDescription, user, role: str, added_by=None) -> RecruitmentParticipant:
    return RecruitmentParticipant.objects.create(
        job_description=jd,
        user=user,
        role_in_recruitment=role,
        added_by=added_by or jd.created_by,
    )


def make_candidate(**overrides: Any) -> Candidate:
    index = next(_candidate_sequence)
    fields: dict[str, Any] = {
        "full_name": f"Candidate {index}",
        "email": f"candidate{index}@example.com",
        "phone": "+91 98765 43210",
        "location": "Chennai",
        "headline": "Backend Engineer",
        "total_experience_years": 5,
    }
    fields.update(overrides)
    return Candidate.objects.create(**fields)


def make_application(jd: JobDescription, status: str, **overrides: Any) -> Application:
    fields: dict[str, Any] = {
        "candidate": make_candidate(),
        "job_description": jd,
        "status": status,
    }
    fields.update(overrides)
    return Application.objects.create(**fields)


def make_offer(application: Application, status: str, **overrides: Any) -> Offer:
    fields: dict[str, Any] = {
        "application": application,
        "status": status,
        "designation": "Senior Engineer",
        "annual_ctc": 2_500_000,
        "joining_date": "2026-10-01",
        "created_by": application.job_description.created_by,
    }
    fields.update(overrides)
    return Offer.objects.create(**fields)
