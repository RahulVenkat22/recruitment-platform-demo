"""``manage.py seed_demo`` version 1 (plan.md section 10, phase 1 of section 12):
users, job descriptions with versions and participants, and about 180 candidates
with their child rows and sources. Later phases add applications and history.

The command is run once per module (it is deterministic), the read-only tests
share that data, and the idempotency / reset tests run it again inside their
own transaction so nothing leaks to other modules.
"""

from __future__ import annotations

import io
import re
import time
from dataclasses import dataclass
from datetime import datetime, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

import pytest
from django.conf import settings
from django.core.management import call_command
from django.db.models import Count

from accounts.models import User
from candidates.models import (
    Candidate,
    CandidateCertification,
    CandidateEducation,
    CandidateExperience,
    CandidateSkill,
    CandidateSource,
)
from common import enums
from jobs.models import JobDescription, JobDescriptionVersion, RecruitmentParticipant
from matching.skills import normalize_skill
from seed.models import SeedMarker
from seed.pools import jobs as job_pools
from seed.pools import journey
from seed.pools import skills as skill_pools
from seed.pools import users as user_pools

IST = ZoneInfo("Asia/Kolkata")
PHONE_RE = re.compile(r"^\+91 \d{5} \d{5}$")
NAUKRI_REF_RE = re.compile(r"^NK-[0-9A-F]{6}$")
PORTRAIT_RE = re.compile(r"^https://randomuser\.me/api/portraits/(men|women)/\d{1,2}\.jpg$")
RESUME_URL_RE = re.compile(r"^https://files\.aimious\.demo/resumes/[a-z0-9-]+\.pdf$")
YEARS_RE = re.compile(r"^(1 year|\d+(\.\d)? years)$")
MAX_STINT_DAYS = 6 * 365.25 + 31  # six years, allowing for whole-month rounding

EXPECTED_USERS = {
    "rahul@aimious.demo": ("Rahul", "Venkat", "hr_admin", "HR Manager", "Human Resources"),
    "priya@aimious.demo": ("Priya", "Sharma", "hr", "HR Executive", "Human Resources"),
    "karthik@aimious.demo": (
        "Karthik",
        "Iyer",
        "hr",
        "Talent Acquisition Specialist",
        "Human Resources",
    ),
    "anitha@aimious.demo": ("Anitha", "Rajan", "hr", "HR Business Partner", "Human Resources"),
    "arun@aimious.demo": ("Arun", "Kumar", "interviewer", "Engineering Manager", "Engineering"),
    "divya@aimious.demo": (
        "Divya",
        "Raman",
        "interviewer",
        "Senior Software Engineer",
        "Engineering",
    ),
    "suresh@aimious.demo": ("Suresh", "Menon", "interviewer", "Lead Data Scientist", "Data"),
    "nisha@aimious.demo": ("Nisha", "Patel", "interviewer", "DevOps Lead", "Platform"),
    "vikram@aimious.demo": ("Vikram", "Shah", "employee", "Product Manager", "Product"),
    "lakshmi@aimious.demo": ("Lakshmi", "Narayanan", "employee", "Frontend Lead", "Engineering"),
}

# plan.md section 10 "Job descriptions" table: title -> {email: participant role}.
EXPECTED_PARTICIPANTS = {
    "Senior Python Developer": {
        "rahul@aimious.demo": "owner",
        "priya@aimious.demo": "recruiter",
        "arun@aimious.demo": "hiring_manager",
        "divya@aimious.demo": "interviewer",
    },
    "React Developer": {
        "priya@aimious.demo": "owner",
        "karthik@aimious.demo": "recruiter",
        "lakshmi@aimious.demo": "hiring_manager",
        "divya@aimious.demo": "interviewer",
    },
    "AI Engineer": {
        "rahul@aimious.demo": "owner",
        "anitha@aimious.demo": "recruiter",
        "suresh@aimious.demo": "hiring_manager",
    },
    "Data Scientist": {"karthik@aimious.demo": "owner", "suresh@aimious.demo": "hiring_manager"},
    "DevOps Engineer": {
        "anitha@aimious.demo": "owner",
        "nisha@aimious.demo": "hiring_manager",
        "arun@aimious.demo": "interviewer",
    },
    "QA Automation Engineer": {"priya@aimious.demo": "owner"},
}

EXPECTED_JD_FACTS = {
    # title: (department, location, work_mode, exp_min, exp_max, status, domain)
    "Senior Python Developer": ("Engineering", "Chennai", "hybrid", 4, 8, "open", "fintech"),
    "React Developer": ("Engineering", "Bengaluru", "onsite", 2, 5, "open", "ecommerce"),
    "AI Engineer": ("Data", "Remote", "remote", 3, 7, "open", "healthcare"),
    "Data Scientist": ("Data", "Hyderabad", "hybrid", 2, 6, "open", "saas"),
    "DevOps Engineer": ("Platform", "Chennai", "onsite", 3, 6, "open", "fintech"),
    "QA Automation Engineer": ("Engineering", "Pune", "hybrid", 2, 5, "archived", "ecommerce"),
}


@dataclass(frozen=True)
class SeedRun:
    elapsed_seconds: float
    output: str


def _run_seed(*args: str) -> SeedRun:
    out = io.StringIO()
    started = time.perf_counter()
    call_command("seed_demo", *args, stdout=out)
    return SeedRun(time.perf_counter() - started, out.getvalue())


def _counts() -> dict[str, int]:
    return {
        "users": User.objects.count(),
        "jobs": JobDescription.objects.count(),
        "versions": JobDescriptionVersion.objects.count(),
        "participants": RecruitmentParticipant.objects.count(),
        "candidates": Candidate.objects.count(),
        "skills": CandidateSkill.objects.count(),
        "experiences": CandidateExperience.objects.count(),
        "education": CandidateEducation.objects.count(),
        "certifications": CandidateCertification.objects.count(),
        "sources": CandidateSource.objects.count(),
        "markers": SeedMarker.objects.count(),
    }


@pytest.fixture(scope="module")
def seeded(django_db_setup, django_db_blocker):
    """Run the command once for the module; wipe the demo data again afterwards so
    modules that expect empty tables are unaffected."""
    from seed.services import wipe_demo_data

    with django_db_blocker.unblock():
        wipe_demo_data()
        run = _run_seed()
    try:
        yield run
    finally:
        with django_db_blocker.unblock():
            wipe_demo_data()


def _anchor() -> datetime:
    return datetime.combine(settings.SEED_ANCHOR_DATE, datetime.min.time(), tzinfo=IST).replace(
        hour=18
    )


# ------------------------------------------------------------------------ users


@pytest.mark.django_db
def test_seeds_the_ten_demo_users_with_roles_and_password(seeded):
    users = {user.email: user for user in User.objects.filter(email__endswith="@aimious.demo")}
    assert set(users) == set(EXPECTED_USERS)
    for email, (first, last, role, designation, department) in EXPECTED_USERS.items():
        user = users[email]
        assert (user.first_name, user.last_name) == (first, last)
        assert user.role == role
        assert user.designation == designation
        assert user.department == department
        assert user.is_active
        assert user.check_password(user_pools.PASSWORD)
        assert user.timezone == "Asia/Kolkata"
        assert user.phone and PHONE_RE.match(user.phone)
    rahul = users["rahul@aimious.demo"]
    assert rahul.is_staff and rahul.is_superuser
    others = [u for email, u in users.items() if email != "rahul@aimious.demo"]
    assert not any(u.is_staff or u.is_superuser for u in others)
    # Vikram has no avatar so the UI's initials fallback is exercised.
    assert users["vikram@aimious.demo"].avatar_url is None
    for email, user in users.items():
        if email != "vikram@aimious.demo":
            assert user.avatar_url and PORTRAIT_RE.match(user.avatar_url), email


# ------------------------------------------------------------------------- jobs


@pytest.mark.django_db
def test_seeds_six_job_descriptions_matching_the_plan(seeded):
    jobs = {jd.title: jd for jd in JobDescription.objects.all()}
    assert set(jobs) == set(EXPECTED_JD_FACTS)
    for title, (
        dept,
        location,
        mode,
        exp_min,
        exp_max,
        status,
        domain,
    ) in EXPECTED_JD_FACTS.items():
        jd = jobs[title]
        assert jd.department == dept
        assert jd.location == location
        assert jd.work_mode == mode
        assert (jd.experience_min_years, jd.experience_max_years) == (exp_min, exp_max)
        assert jd.status == status
        assert jd.domain == domain
        assert jd.employment_type == enums.EmploymentType.FULL_TIME
        assert jd.salary_min and jd.salary_max and jd.salary_min < jd.salary_max
        assert jd.salary_currency == "INR"
        assert jd.description and jd.responsibilities and jd.qualifications
        assert jd.education_requirements
        assert jd.published_at is not None
        assert jd.current_version == 3
        assert jd.created_by.email == job_pools.JOBS_BY_TITLE[title].created_by
        assert jd.updated_by is not None


@pytest.mark.django_db
def test_jd_skill_keys_are_normalised(seeded):
    for jd in JobDescription.objects.all():
        for key in [*jd.required_skills, *jd.preferred_skills]:
            assert normalize_skill(key) == key, (jd.title, key)
        assert len(set(jd.required_skills)) == len(jd.required_skills)
        assert not set(jd.required_skills) & set(jd.preferred_skills)
    spd = JobDescription.objects.get(title="Senior Python Developer")
    assert spd.required_skills == ["python", "django", "postgresql", "rest", "docker", "git"]
    assert spd.preferred_skills == ["fastapi", "aws", "redis", "celery", "kubernetes"]


@pytest.mark.django_db
def test_jd_created_at_is_backdated_five_to_seven_weeks_before_the_anchor(seeded):
    anchor = _anchor()
    for jd in JobDescription.objects.all():
        age = anchor - jd.created_at
        assert timedelta(weeks=5) <= age <= timedelta(weeks=7), (jd.title, age)
        assert jd.published_at >= jd.created_at
        assert jd.updated_at >= jd.created_at
    spd = JobDescription.objects.get(title="Senior Python Developer")
    # plan.md 9.6: created 09:30, last modified 14:10 (v3 is 280 minutes after v1).
    assert spd.created_at.astimezone(IST).strftime("%H:%M") == "09:30"
    assert spd.updated_at.astimezone(IST).strftime("%H:%M") == "14:10"


@pytest.mark.django_db
def test_each_jd_has_three_versions_reflecting_the_pool_deltas(seeded):
    for jd in JobDescription.objects.all():
        spec = job_pools.JOBS_BY_TITLE[jd.title]
        versions = list(jd.versions.order_by("version"))
        assert [v.version for v in versions] == [1, 2, 3]
        for version, version_spec in zip(versions, spec.versions, strict=True):
            assert version.change_summary == version_spec.change_summary
            assert version.created_by.email == version_spec.author_email
            assert version.snapshot == spec.snapshot(version.version)
            assert set(version.snapshot) == set(job_pools.CONTENT_FIELDS)
            expected_at = jd.created_at + timedelta(minutes=version_spec.offset_minutes)
            assert abs(version.created_at - expected_at) < timedelta(seconds=1)
        assert versions[0].created_at < versions[1].created_at < versions[2].created_at
        assert jd.updated_at == versions[-1].created_at
        current = {name: getattr(jd, name) for name in job_pools.CONTENT_FIELDS}
        assert versions[-1].snapshot == current
    spd = JobDescription.objects.get(title="Senior Python Developer")
    v1 = spd.versions.get(version=1).snapshot
    v2 = spd.versions.get(version=2).snapshot
    assert (v1["experience_min_years"], v1["experience_max_years"]) == (3, 6)
    assert "aws" not in v1["preferred_skills"]
    assert "aws" in v2["preferred_skills"]


@pytest.mark.django_db
def test_participants_match_the_plan_exactly_with_the_owner_first(seeded):
    for jd in JobDescription.objects.all():
        rows = list(jd.participants.order_by("created_at"))
        found = {row.user.email: row.role_in_recruitment for row in rows}
        assert found == EXPECTED_PARTICIPANTS[jd.title], jd.title
        assert rows[0].role_in_recruitment == enums.ParticipantRole.OWNER
        assert rows[0].user == jd.created_by
        for row in rows[1:]:
            assert row.added_by == jd.created_by
            assert row.created_at > rows[0].created_at


# ------------------------------------------------------------------- candidates


@pytest.mark.django_db
def test_candidate_count_and_unique_lowercase_emails(seeded):
    emails = list(Candidate.objects.values_list("email", flat=True))
    assert 170 <= len(emails) <= 200
    assert len(set(emails)) == len(emails)
    assert all(email == email.lower() and "@" in email for email in emails)
    names = list(Candidate.objects.values_list("full_name", flat=True))
    assert len(set(names)) == len(names)


@pytest.mark.django_db
def test_candidate_profiles_are_complete_and_consistent(seeded):
    anchor_date = settings.SEED_ANCHOR_DATE
    candidates = Candidate.objects.prefetch_related(
        "skills", "experiences", "education", "certifications", "sources"
    )
    with_avatar = without_avatar = 0
    for candidate in candidates:
        assert PHONE_RE.match(candidate.phone), candidate.phone
        assert candidate.location and candidate.headline and candidate.summary
        assert candidate.resume_text and candidate.full_name in candidate.resume_text
        assert candidate.current_company and candidate.current_title
        assert candidate.headline == f"{candidate.current_title} at {candidate.current_company}"
        assert candidate.notice_period_days is not None
        assert candidate.current_ctc and candidate.expected_ctc
        assert candidate.expected_ctc >= candidate.current_ctc
        if candidate.avatar_url is None:
            without_avatar += 1
        else:
            with_avatar += 1
            assert PORTRAIT_RE.match(candidate.avatar_url)

        skills = list(candidate.skills.all())
        assert 4 <= len(skills) <= 11, candidate.full_name
        assert any(skill.is_primary for skill in skills)
        for skill in skills:
            assert 1 <= skill.proficiency <= 5
            assert normalize_skill(skill.skill) == skill.skill
            assert skill.display_name
            assert skill.years is None or Decimal("0") < skill.years <= (
                candidate.total_experience_years + Decimal("0.5")
            )

        experiences = list(candidate.experiences.order_by("start_date"))
        assert 1 <= len(experiences) <= 3
        assert sum(exp.is_current for exp in experiences) == 1
        assert experiences[-1].is_current and experiences[-1].end_date is None
        assert experiences[-1].company == candidate.current_company
        assert experiences[-1].title == candidate.current_title
        total_days = 0
        for exp in experiences:
            end = exp.end_date or anchor_date
            assert exp.start_date < end
            assert exp.description
            total_days += (end - exp.start_date).days
        for earlier, later in zip(experiences, experiences[1:], strict=False):
            assert earlier.end_date is not None and earlier.end_date <= later.start_date
        assert abs(total_days / 365.25 - float(candidate.total_experience_years)) < 0.35

        education = list(candidate.education.all())
        assert 1 <= len(education) <= 2
        for row in education:
            assert row.start_year < row.end_year <= anchor_date.year
            assert row.degree and row.field and row.institution

        assert candidate.certifications.count() <= 2
        for cert in candidate.certifications.all():
            assert cert.issuer and cert.issued_year <= anchor_date.year

        sources = list(candidate.sources.all())
        assert 1 <= len(sources) <= 2
        assert len({row.source for row in sources}) == len(sources)
    assert with_avatar > without_avatar > 0


@pytest.mark.django_db
def test_every_candidate_has_a_unique_placeholder_resume_link(seeded):
    """plan.md 6.3: resume_url is a placeholder link (files are not uploaded in the MVP)."""
    urls = list(Candidate.objects.values_list("resume_url", flat=True))
    assert all(url and RESUME_URL_RE.match(url) for url in urls), urls[:3]
    assert len(set(urls)) == len(urls)
    john = Candidate.objects.get(full_name="John Doe")
    assert john.resume_url == "https://files.aimious.demo/resumes/john-doe.pdf"


@pytest.mark.django_db
def test_no_single_employer_stint_exceeds_six_years(seeded):
    """A stint carries one title, so a decade at one company would show a lead title
    from day one; long careers are split across employers instead."""
    anchor_date = settings.SEED_ANCHOR_DATE
    for candidate in Candidate.objects.prefetch_related("experiences"):
        experiences = list(candidate.experiences.all())
        for exp in experiences:
            end = exp.end_date or anchor_date
            assert (end - exp.start_date).days <= MAX_STINT_DAYS, (candidate.full_name, exp)
        if candidate.total_experience_years >= 6:
            assert len(experiences) >= 2, candidate.full_name


@pytest.mark.django_db
def test_summaries_read_naturally(seeded):
    """Singular years, and the primary skill is not repeated in the skill list that
    follows it."""
    for candidate in Candidate.objects.prefetch_related("skills"):
        blob = f"{candidate.summary}\n{candidate.resume_text}"
        assert not re.search(r"\b1 years\b", blob), candidate.full_name
        assert not re.search(r"\b1\.0 years?\b", blob), candidate.full_name
        primaries = [skill.display_name for skill in candidate.skills.all() if skill.is_primary]
        assert 2 <= len(primaries) <= 3, candidate.full_name
        for lead_in in ("Strong in", "centred on", "Deep experience in", "strongest in"):
            match = re.search(rf"{lead_in} ([^.;]+)[.;]([^.;]*)", candidate.summary)
            if match and match.group(1) in primaries:
                listed = {item.strip() for item in match.group(2).split(",")}
                assert match.group(1) not in listed, candidate.summary
    singular = Candidate.objects.filter(total_experience_years=Decimal("1.0"))
    for candidate in singular:
        assert "1 year " in candidate.summary or "(1 year)" in candidate.summary, candidate.summary


@pytest.mark.django_db
def test_candidate_skills_spread_across_every_role_pool(seeded):
    """Each JD's required skills should be common among candidates so the later match
    scores spread from weak to near-perfect."""
    for jd in JobDescription.objects.all():
        holders = (
            CandidateSkill.objects.filter(skill__in=jd.required_skills)
            .values("candidate")
            .distinct()
            .count()
        )
        assert holders >= 25, jd.title
        strong = (
            CandidateSkill.objects.filter(skill=jd.required_skills[0], proficiency__gte=4)
            .values("candidate")
            .distinct()
            .count()
        )
        assert strong >= 8, jd.title


@pytest.mark.django_db
def test_sources_are_balanced_and_shaped_like_real_references(seeded):
    # The resume library is filled by `ingest_resumes`, never by the seed.
    per_source = {
        key: CandidateSource.objects.filter(source=key).count()
        for key in enums.CandidateSource.values
        if key != enums.CandidateSource.RESUME
    }
    assert all(count >= 45 for count in per_source.values()), per_source

    total = Candidate.objects.count()
    two_sources = (
        Candidate.objects.filter(sources__isnull=False)
        .values("id")
        .annotate(n=Count("sources"))
        .filter(n=2)
        .count()
    )
    assert 0.5 <= two_sources / total <= 0.7, two_sources / total

    for row in CandidateSource.objects.select_related("referred_by"):
        if row.source == enums.CandidateSource.REFERRAL:
            assert row.referred_by is not None
            assert row.referred_by.role in {enums.UserRole.EMPLOYEE, enums.UserRole.HR}
        else:
            assert row.referred_by is None
        if row.source == enums.CandidateSource.NAUKRI:
            assert NAUKRI_REF_RE.match(row.source_reference), row.source_reference
        if row.source == enums.CandidateSource.LINKEDIN:
            assert "linkedin.com/in/" in row.source_reference, row.source_reference
        assert row.discovered_at <= _anchor()


@pytest.mark.django_db
def test_john_doe_is_a_near_perfect_senior_python_developer(seeded):
    john = Candidate.objects.get(full_name="John Doe")
    assert john.email == journey.JOHN_DOE.email
    assert john.total_experience_years == Decimal("6.0")
    assert john.avatar_url == journey.JOHN_DOE.avatar_url
    skills = {skill.skill: skill for skill in john.skills.all()}
    for key, proficiency in {
        "python": 5,
        "django": 5,
        "postgresql": 4,
        "fastapi": 4,
        "aws": 4,
        "kubernetes": 2,
    }.items():
        assert skills[key].proficiency == proficiency, key
    assert {key for key, skill in skills.items() if skill.is_primary} == {
        "python",
        "django",
        "postgresql",
    }
    assert set(john.sources.values_list("source", flat=True)) == set(journey.JOHN_DOE.sources)
    linkedin = john.sources.get(source="linkedin")
    assert "linkedin.com/in/john-doe-demo" in linkedin.source_reference
    assert "fintech" in set(john.experiences.values_list("domain", flat=True))
    current = john.experiences.get(is_current=True)
    assert (current.company, current.title) == ("Freshworks", "Senior Backend Engineer")
    degree = john.education.get()
    assert (degree.degree, degree.field) == ("B.Tech", "Computer Science and Engineering")
    assert john.certifications.get().name == "AWS Solutions Architect Associate"


@pytest.mark.django_db
def test_jane_smith_and_alex_kumar_are_strong_senior_python_matches(seeded):
    spd = JobDescription.objects.get(title="Senior Python Developer")
    required = set(spd.required_skills)
    for example in journey.RANKED_EXAMPLES[1:]:  # Jane Smith, Alex Kumar, David Raj
        name = example.full_name
        candidate = Candidate.objects.get(full_name=name)
        assert spd.experience_min_years <= candidate.total_experience_years
        assert candidate.total_experience_years == example.experience_years
        skills = {s.skill: s.proficiency for s in candidate.skills.all()}
        assert required <= set(skills), (name, required - set(skills))
        assert all(skills[key] >= 3 for key in required), name
        # Exactly the one source the prompt's ranking table shows (John alone has two).
        assert list(candidate.sources.values_list("source", flat=True)) == [example.source], name
        assert candidate.linkedin_url is not None or name == "David Raj"


# ------------------------------------------------------------- idempotency etc


@pytest.mark.django_db
def test_marker_written_and_rerun_without_reset_skips(seeded):
    marker = SeedMarker.objects.get()
    assert marker.version >= 1
    before = _counts()
    run = _run_seed()
    assert _counts() == before
    assert "already" in run.output.lower() and "--reset" in run.output
    assert Candidate.objects.count() == before["candidates"]


@pytest.mark.django_db
def test_reset_wipes_and_reseeds_to_identical_counts(seeded):
    before = _counts()
    john_id = Candidate.objects.get(full_name="John Doe").id
    run = _run_seed("--reset")
    assert _counts() == before
    assert SeedMarker.objects.count() == 1
    # Rows really were recreated, not kept.
    assert Candidate.objects.get(full_name="John Doe").id != john_id
    assert "Candidates" in run.output and str(before["candidates"]) in run.output


@pytest.mark.django_db
def test_quiet_flag_suppresses_output(seeded):
    run = _run_seed("--reset", "--quiet")
    assert run.output == ""


@pytest.mark.django_db
def test_run_prints_a_summary_table_and_finishes_quickly(seeded):
    assert seeded.elapsed_seconds < 45, seeded.elapsed_seconds
    for label in ("Users", "Job descriptions", "Versions", "Participants", "Candidates"):
        assert label in seeded.output, label
    assert "10" in seeded.output and "6" in seeded.output


# ---------------------------------------------------------------- determinism


def test_candidate_drafts_are_deterministic_for_a_seed():
    """Same seed and anchor -> identical population, without touching the database."""
    from seed.context import SeedContext
    from seed.generators.candidates import build_candidate_drafts

    first = build_candidate_drafts(SeedContext.build(42, settings.SEED_ANCHOR_DATE))
    second = build_candidate_drafts(SeedContext.build(42, settings.SEED_ANCHOR_DATE))
    assert first == second
    assert 170 <= len(first) <= 200
    different = build_candidate_drafts(SeedContext.build(7, settings.SEED_ANCHOR_DATE))
    assert [draft.email for draft in different] != [draft.email for draft in first]
    # The scripted candidates never change with the seed.
    assert [draft.full_name for draft in different[:4]] == [
        "John Doe",
        "Jane Smith",
        "Alex Kumar",
        "David Raj",
    ]


def test_primary_skills_belong_to_the_role_and_template_values_are_clean():
    """Primaries lead the summary, so they come from the role's core or adjacent pool
    (stray skills only when fewer than two others exist); ``other_skills`` never
    repeats the primary and ``years`` carries its own unit."""
    from seed.context import SeedContext
    from seed.generators.candidates import build_candidate_drafts, template_values

    stray_by_title = {
        title: {entry.key for entry in pool if entry.tier == "stray"}
        for title, pool in skill_pools.ROLE_SKILL_POOLS.items()
    }
    title_by_family = {job.role_family: job.title for job in job_pools.JOBS}
    drafts = build_candidate_drafts(SeedContext.build(42, settings.SEED_ANCHOR_DATE))
    for draft in drafts[4:]:  # generated candidates; the scripted four are hand-written
        stray = stray_by_title[title_by_family[draft.family]]
        primaries = [skill for skill in draft.skills if skill.is_primary]
        assert draft.skills[: len(primaries)] == primaries, "primaries lead the skill list"
        eligible = [skill for skill in draft.skills if skill.key not in stray]
        if len(eligible) >= 2:
            assert all(skill.key not in stray for skill in primaries), draft.full_name
        values = template_values(draft, draft.location.split(",")[0])
        assert YEARS_RE.match(values["years"]), values["years"]
        assert values["primary_skill"] == primaries[0].display
        assert values["primary_skill"] not in values["other_skills"].split(", ")
        assert values["skills"].split(", ")[0] == values["primary_skill"]
        assert draft.resume_url and RESUME_URL_RE.match(draft.resume_url)
