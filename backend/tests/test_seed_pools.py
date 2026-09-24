"""seed.pools holds the pure-Python data the seed_demo generators draw from
(plan.md section 10). These tests pin the invariants the generators rely on.
"""

from __future__ import annotations

import ast
import json
import re
import string
import sys
from datetime import date, timedelta
from pathlib import Path

import pytest

import seed.pools as pools_package
from common import enums
from matching.skills import display_name, normalize_skill
from seed.pools import jobs, journey, people, skills, text, users

PORTRAIT_RE = re.compile(r"^https://randomuser\.me/api/portraits/(men|women)/(\d{1,2})\.jpg$")


def _placeholders(template: str) -> set[str]:
    return {
        field.split(".")[0].split("[")[0]
        for _, field, _, _ in string.Formatter().parse(template)
        if field is not None and field != ""
    }


# ------------------------------------------------------------------ package


def _imported_modules(module) -> set[str]:
    tree = ast.parse(Path(module.__file__).read_text(encoding="utf-8"))
    names: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            names.update(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module:
            names.add(node.module)
    return names


@pytest.mark.parametrize("module", [pools_package, users, jobs, skills, people, text, journey])
def test_pools_do_not_import_django(module):
    """Pools import only the standard library, each other and the pure-Python skill
    normaliser (``matching.skills`` is the one dictionary for skill keys and spellings)."""
    imported = _imported_modules(module)
    assert imported, module.__name__
    for name in imported:
        top = name.split(".")[0]
        assert top != "django", f"{module.__name__} must stay Django-free"
        assert top in {"seed", "matching", *sys.stdlib_module_names}, (
            f"{module.__name__} imports {name}"
        )
        if top == "seed":
            assert name == "seed.pools" or name.startswith("seed.pools."), (
                f"{module.__name__} imports {name}"
            )
        if top == "matching":
            assert name == "matching.skills", f"{module.__name__} imports {name}"


def test_package_exports_every_pool_module():
    assert pools_package.__all__ == ["jobs", "journey", "people", "skills", "text", "users"]
    for name in pools_package.__all__:
        module = getattr(pools_package, name)
        assert module.__name__ == f"seed.pools.{name}"


# -------------------------------------------------------------------- users


def test_ten_users_with_unique_lowercase_demo_emails():
    assert len(users.USERS) == 12
    emails = [user.email for user in users.USERS]
    assert len(set(emails)) == 12
    for user in users.USERS:
        assert user.email == f"{user.first_name.lower()}@aimious.demo"
        assert users.USERS_BY_EMAIL[user.email] is user


def test_users_match_plan_section_10_table():
    expected = {
        "rahul@aimious.demo": ("Rahul Venkat", "hr_admin", "HR Manager", "Human Resources"),
        "priya@aimious.demo": ("Priya Sharma", "hr", "HR Executive", "Human Resources"),
        "karthik@aimious.demo": (
            "Karthik Iyer",
            "hr",
            "Talent Acquisition Specialist",
            "Human Resources",
        ),
        "anitha@aimious.demo": ("Anitha Rajan", "hr", "HR Business Partner", "Human Resources"),
        "arun@aimious.demo": ("Arun Kumar", "interviewer", "Engineering Manager", "Engineering"),
        "divya@aimious.demo": (
            "Divya Raman",
            "interviewer",
            "Senior Software Engineer",
            "Engineering",
        ),
        "suresh@aimious.demo": ("Suresh Menon", "interviewer", "Lead Data Scientist", "Data"),
        "nisha@aimious.demo": ("Nisha Patel", "interviewer", "DevOps Lead", "Platform"),
        "vikram@aimious.demo": ("Vikram Shah", "employee", "Product Manager", "Product"),
        "lakshmi@aimious.demo": ("Lakshmi Narayanan", "employee", "Frontend Lead", "Engineering"),
        "meera@aimious.demo": ("Meera Nair", "admin", "IT Support Lead", "IT Support"),
        "arjun@aimious.demo": ("Arjun Pillai", "admin", "Support Engineer", "IT Support"),
    }
    assert {user.email for user in users.USERS} == set(expected)
    for user in users.USERS:
        name, role, designation, department = expected[user.email]
        assert user.full_name == name
        assert user.role == role
        assert user.designation == designation
        assert user.department == department
        assert user.role in enums.UserRole.values


def test_user_avatars_are_distinct_randomuser_portraits_except_vikram():
    indexes = []
    for user in users.USERS:
        if user.email == users.VIKRAM:
            assert user.avatar_url is None
            continue
        match = PORTRAIT_RE.match(user.avatar_url or "")
        assert match, user.avatar_url
        folder = "men" if user.gender == "male" else "women"
        assert match.group(1) == folder
        indexes.append(int(match.group(2)))
    assert len(indexes) == 11
    assert len(set(indexes)) == 11


def test_password_constant():
    assert users.PASSWORD == "Demo@1234"


# --------------------------------------------------------------------- jobs

EXPECTED_JOBS = [
    # title, department, location, work_mode, exp, status, domain
    ("Senior Python Developer", "Engineering", "Chennai", "hybrid", (4, 8), "open", "fintech"),
    ("React Developer", "Engineering", "Bengaluru", "onsite", (2, 5), "open", "ecommerce"),
    ("AI Engineer", "Data", "Remote", "remote", (3, 7), "open", "healthcare"),
    ("Data Scientist", "Data", "Hyderabad", "hybrid", (2, 6), "open", "saas"),
    ("DevOps Engineer", "Platform", "Chennai", "onsite", (3, 6), "open", "fintech"),
    ("QA Automation Engineer", "Engineering", "Pune", "hybrid", (2, 5), "archived", "ecommerce"),
]


def test_six_jobs_match_plan_table():
    assert [job.title for job in jobs.JOBS] == [row[0] for row in EXPECTED_JOBS]
    for job, row in zip(jobs.JOBS, EXPECTED_JOBS, strict=True):
        _, department, location, work_mode, (exp_min, exp_max), status, domain = row
        assert job.department == department
        assert job.location == location
        assert job.work_mode == work_mode
        assert (job.experience_min_years, job.experience_max_years) == (exp_min, exp_max)
        assert job.status == status
        assert job.domain == domain
        assert jobs.JOBS_BY_TITLE[job.title] is job


@pytest.mark.parametrize("job", jobs.JOBS, ids=lambda job: job.title)
def test_job_has_every_field_filled_realistically(job):
    assert job.work_mode in enums.WorkMode.values
    assert job.employment_type in enums.EmploymentType.values
    assert job.status in enums.JDStatus.values
    assert 0 < job.experience_min_years < job.experience_max_years
    assert job.salary_currency == "INR"
    assert 500_000 <= job.salary_min < job.salary_max <= 5_000_000
    assert 5 <= len(job.required_skills) <= 7
    assert 3 <= len(job.preferred_skills) <= 5
    assert not set(job.required_skills) & set(job.preferred_skills)
    assert job.education_requirements.strip()
    assert 6 <= len(job.responsibilities) <= 8
    assert 4 <= len(job.qualifications) <= 6
    assert all(line.strip() and "\n" not in line for line in job.responsibilities)
    assert all(line.strip() and "\n" not in line for line in job.qualifications)
    assert job.additional_requirements.strip()
    assert 250 <= len(job.description.split()) <= 400
    assert job.openings >= 1
    assert job.role_family in people.ROLE_FAMILIES


@pytest.mark.parametrize("job", jobs.JOBS, ids=lambda job: job.title)
def test_job_content_fields_render_one_line_per_entry(job):
    content = job.content_fields()
    assert set(content) == set(jobs.CONTENT_FIELDS)
    assert content["responsibilities"].split("\n") == list(job.responsibilities)
    assert content["qualifications"].split("\n") == list(job.qualifications)
    assert content["required_skills"] == list(job.required_skills)


@pytest.mark.parametrize("job", jobs.JOBS, ids=lambda job: job.title)
def test_job_participants_reference_demo_users_with_one_owner(job):
    emails = [participant.email for participant in job.participants]
    assert emails, "every JD lists at least the owner"
    assert len(set(emails)) == len(emails)
    for participant in job.participants:
        assert participant.email in users.USERS_BY_EMAIL
        assert participant.role in enums.ParticipantRole.values
    owners = [p.email for p in job.participants if p.role == "owner"]
    assert owners == [job.created_by]


def test_participants_follow_plan_table():
    by_title = {job.title: {(p.email, p.role) for p in job.participants} for job in jobs.JOBS}
    assert by_title["Senior Python Developer"] == {
        (users.RAHUL, "owner"),
        (users.PRIYA, "recruiter"),
        (users.ARUN, "hiring_manager"),
        (users.DIVYA, "interviewer"),
    }
    assert by_title["React Developer"] == {
        (users.PRIYA, "owner"),
        (users.KARTHIK, "recruiter"),
        (users.LAKSHMI, "hiring_manager"),
        (users.DIVYA, "interviewer"),
    }
    assert by_title["AI Engineer"] == {
        (users.RAHUL, "owner"),
        (users.ANITHA, "recruiter"),
        (users.SURESH, "hiring_manager"),
    }
    assert by_title["Data Scientist"] == {
        (users.KARTHIK, "owner"),
        (users.SURESH, "hiring_manager"),
    }
    assert by_title["DevOps Engineer"] == {
        (users.ANITHA, "owner"),
        (users.NISHA, "hiring_manager"),
        (users.ARUN, "interviewer"),
    }
    assert by_title["QA Automation Engineer"] == {(users.PRIYA, "owner")}


@pytest.mark.parametrize("job", jobs.JOBS, ids=lambda job: job.title)
def test_job_has_three_versions_that_materialise(job):
    assert [version.version for version in job.versions] == [1, 2, 3]
    participant_emails = {p.email for p in job.participants}
    offsets = [version.offset_minutes for version in job.versions]
    assert offsets[0] == 0 and offsets == sorted(offsets) and len(set(offsets)) == 3
    for version in job.versions:
        assert 0 < len(version.change_summary) <= 300
        assert version.author_email in participant_emails
        assert set(version.overrides) <= set(jobs.CONTENT_FIELDS)
    assert job.versions[0].author_email == job.created_by
    assert job.versions[2].overrides == {}, "v3 is the current content"
    assert job.versions[0].overrides, "v1 differs from the current content"
    assert job.versions[1].overrides, "v2 differs from the current content"
    snapshots = [job.snapshot(version.version) for version in job.versions]
    assert snapshots[2] == job.content_fields()
    assert snapshots[0] != snapshots[1] != snapshots[2]
    for snapshot in snapshots:
        assert set(snapshot) == set(jobs.CONTENT_FIELDS)


def test_senior_python_versions_match_the_jd_detail_example():
    job = jobs.JOBS_BY_TITLE["Senior Python Developer"]
    v1, v2, v3 = job.versions
    assert v1.change_summary == "Created"
    assert "aws" in job.snapshot(2)["preferred_skills"]
    assert "aws" not in job.snapshot(1)["preferred_skills"]
    assert (job.snapshot(2)["experience_min_years"], job.snapshot(2)["experience_max_years"]) != (
        4,
        8,
    )
    assert v3.change_summary.startswith("Raised experience")
    assert (v1.author_email, v2.author_email, v3.author_email) == (
        users.RAHUL,
        users.RAHUL,
        users.PRIYA,
    )


def test_senior_python_snapshot_matches_plan_9_6():
    """The JD detail mock in plan.md 9.6 pins salary, openings and the three versions."""
    job = jobs.JOBS_BY_TITLE["Senior Python Developer"]
    assert (job.salary_min, job.salary_max) == (1_800_000, 2_800_000)
    assert job.openings == 1
    assert job.employment_type == "full_time"
    assert job.education_requirements.startswith("B.Tech / B.E")
    # v1 09:30, v2 11:40, v3 14:10 on the creation day
    assert [version.offset_minutes for version in job.versions] == [0, 130, 280]
    assert [version.change_summary for version in job.versions] == [
        "Created",
        "Added AWS to preferred skills",
        "Raised experience to 4–8 yrs",
    ]


# ------------------------------------------------------------------- skills


def test_skill_keys_are_fixed_points_of_the_matching_normaliser():
    """plan.md 6.6: one normaliser for JD, candidate and seed skills, so every key the
    pools store must survive ``matching.skills.normalize_skill`` unchanged."""
    for key, display in skills.SKILL_DISPLAY.items():
        assert normalize_skill(display) == key, display
        assert normalize_skill(key) == key, key
    for title, pool in skills.ROLE_SKILL_POOLS.items():
        for entry in pool:
            assert normalize_skill(entry.display) == entry.key, (title, entry.display)
    for job in jobs.JOBS:
        for key in (*job.required_skills, *job.preferred_skills):
            assert normalize_skill(key) == key, (job.title, key)
        for version in job.versions:
            for field in ("required_skills", "preferred_skills"):
                for key in version.overrides.get(field, ()):
                    assert normalize_skill(key) == key, (job.title, version.version, key)
    for cert in skills.CERTIFICATIONS:
        for key in cert.related_skills:
            assert normalize_skill(key) == key, (cert.name, key)
    for skill in journey.JOHN_DOE.skills:
        assert normalize_skill(skill.display) == skill.key


def test_skill_display_keys_are_normalised():
    assert len(set(skills.SKILL_KEYS)) == len(skills.SKILL_KEYS)
    assert set(skills.SKILL_DISPLAY) == set(skills.SKILL_KEYS)
    assert skills.SKILL_DISPLAY["python"] == "Python"
    assert skills.SKILL_DISPLAY["postgresql"] == "PostgreSQL"
    for key, display in skills.SKILL_DISPLAY.items():
        assert key == key.strip().lower()
        assert not re.search(r"[./+#]", key), f"{key!r} should not carry punctuation"
        assert display.strip()
        assert skills.skill_key(display) == key


def test_skill_display_is_the_matching_display_name():
    """plan.md 6.6: one dictionary. JD skills are stored as keys and rendered through
    ``matching.skills.display_name``, so candidate chips must use the same spelling."""
    for key, display in skills.SKILL_DISPLAY.items():
        assert display == display_name(key), key
    for curated in ("Vue.js", "LLMs", "LangChain", "dbt", "BigQuery", "Power BI", "TestNG"):
        assert curated in skills.SKILL_DISPLAY.values(), curated


def test_skill_key_is_the_project_normaliser():
    for raw in ("Node.js", "Postgres", "CI/CD", "Python 3", "k8s", "Vue.js"):
        assert skills.skill_key(raw) == normalize_skill(raw), raw


def test_role_skill_pools_cover_every_jd_and_all_three_tiers():
    assert set(skills.ROLE_SKILL_POOLS) == {job.title for job in jobs.JOBS}
    for title, pool in skills.ROLE_SKILL_POOLS.items():
        assert len(pool) >= 20, title
        tiers = {entry.tier for entry in pool}
        assert tiers == {"core", "adjacent", "stray"}
        displays = [entry.display for entry in pool]
        assert len(set(displays)) == len(displays), f"duplicate skill in {title} pool"
        for entry in pool:
            assert entry.weight > 0
            assert entry.key in skills.SKILL_DISPLAY, entry.display
        core = max(entry.weight for entry in pool if entry.tier == "core")
        stray = max(entry.weight for entry in pool if entry.tier == "stray")
        adjacent = max(entry.weight for entry in pool if entry.tier == "adjacent")
        assert core > adjacent > stray


@pytest.mark.parametrize("job", jobs.JOBS, ids=lambda job: job.title)
def test_jd_skills_are_known_keys_inside_the_role_core_pool(job):
    pool = skills.ROLE_SKILL_POOLS[job.title]
    core_keys = {entry.key for entry in pool if entry.tier == "core"}
    for key in (*job.required_skills, *job.preferred_skills):
        assert key in skills.SKILL_DISPLAY, key
        assert key == skills.skill_key(skills.SKILL_DISPLAY[key])
    assert set(job.required_skills) <= core_keys
    assert set(job.preferred_skills) <= core_keys
    for version in job.versions:
        for field in ("required_skills", "preferred_skills"):
            for key in version.overrides.get(field, ()):
                assert key in skills.SKILL_DISPLAY, key


def test_domain_adjacency_matches_plan_6_6_and_is_symmetric():
    for domain_a, domain_b in (
        ("fintech", "banking"),
        ("healthcare", "pharma"),
        ("ecommerce", "retail"),
        ("saas", "enterprise software"),
    ):
        assert domain_b in skills.DOMAIN_ADJACENCY[domain_a]
        assert domain_a in skills.DOMAIN_ADJACENCY[domain_b]
    for domain, neighbours in skills.DOMAIN_ADJACENCY.items():
        assert domain in skills.DOMAINS
        for neighbour in neighbours:
            assert domain in skills.DOMAIN_ADJACENCY[neighbour]
    assert {job.domain for job in jobs.JOBS} <= set(skills.DOMAINS)


def test_certification_pool():
    names = [cert.name for cert in skills.CERTIFICATIONS]
    assert len(names) == 8 and len(set(names)) == 8
    for expected in (
        "AWS Solutions Architect Associate",
        "CKA",
        "GCP Professional Data Engineer",
        "PMP",
        "Azure Fundamentals",
        "TensorFlow Developer",
        "ISTQB",
        "Scrum Master",
    ):
        assert any(expected in name for name in names), expected
    for cert in skills.CERTIFICATIONS:
        assert cert.issuer.strip()
        assert cert.related_skills
        assert set(cert.related_skills) <= set(skills.SKILL_DISPLAY)


# ------------------------------------------------------------------- people


def test_name_pools_are_large_and_unique():
    assert len(people.MALE_FIRST_NAMES) >= 80
    assert len(people.FEMALE_FIRST_NAMES) >= 80
    assert len(people.LAST_NAMES) >= 60
    for pool in (people.MALE_FIRST_NAMES, people.FEMALE_FIRST_NAMES, people.LAST_NAMES):
        assert len(set(pool)) == len(pool)
        assert all(name[0].isupper() for name in pool)
    assert not set(people.MALE_FIRST_NAMES) & set(people.FEMALE_FIRST_NAMES)


def test_cities_with_states():
    expected = {
        "Chennai": "Tamil Nadu",
        "Bengaluru": "Karnataka",
        "Hyderabad": "Telangana",
        "Pune": "Maharashtra",
        "Mumbai": "Maharashtra",
        "Delhi NCR": "Delhi",
        "Kolkata": "West Bengal",
        "Coimbatore": "Tamil Nadu",
        "Kochi": "Kerala",
        "Ahmedabad": "Gujarat",
    }
    assert {city.name: city.state for city in people.CITIES} == expected
    assert people.location_label(people.CITIES[0]) == "Chennai, Tamil Nadu"


def test_companies_by_tier_include_the_named_employers_and_startups():
    names = {company.name for company in people.COMPANIES}
    for expected in (
        "Zoho",
        "Freshworks",
        "Infosys",
        "TCS",
        "Wipro",
        "HCL",
        "Razorpay",
        "Swiggy",
        "Zomato",
        "Flipkart",
        "PhonePe",
        "CRED",
        "Paytm",
        "Chargebee",
        "Kissflow",
        "Mindtree",
        "Cognizant",
        "Accenture",
        "ThoughtWorks",
    ):
        assert expected in names
    assert len(names) == len(people.COMPANIES)
    assert {company.tier for company in people.COMPANIES} == set(people.COMPANY_TIERS)
    assert sum(company.tier == "startup" for company in people.COMPANIES) >= 15
    city_names = {city.name for city in people.CITIES}
    for company in people.COMPANIES:
        assert company.tier in people.COMPANY_TIERS
        assert company.domain in skills.DOMAINS
        assert company.city in city_names


def test_job_titles_by_seniority_cover_every_role_family():
    assert set(people.JOB_TITLES_BY_FAMILY) == set(people.ROLE_FAMILIES)
    assert {job.role_family for job in jobs.JOBS} == set(people.ROLE_FAMILIES)
    levels = {"junior", "mid", "senior", "lead"}
    for family, by_level in people.JOB_TITLES_BY_FAMILY.items():
        assert set(by_level) == levels, family
        for titles in by_level.values():
            assert len(titles) >= 2
    assert {people.seniority_for(years) for years in range(0, 20)} == levels
    assert people.seniority_for(1) == "junior"
    assert people.seniority_for(3.5) == "mid"
    assert people.seniority_for(6) == "senior"
    assert people.seniority_for(12) == "lead"


def test_education_pools():
    assert set(people.DEGREES) == {"B.Tech", "B.E", "M.Tech", "MCA", "B.Sc", "M.Sc", "MBA", "PhD"}
    assert set(people.DEGREE_LEVELS) == set(people.DEGREES)
    assert set(people.DEGREE_YEARS) == set(people.DEGREES)
    assert all(1 <= years <= 6 for years in people.DEGREE_YEARS.values())
    assert set(people.DEGREE_LEVELS.values()) == {"bachelor", "master", "phd"}
    # Every degree resolves to a field on both study tracks.
    assert set(people.SCIENCE_FIELDS_BY_TRACK) == set(people.STUDY_TRACKS)
    assert set(people.ENGINEERING_FIELD_WEIGHTS_BY_TRACK) == set(people.STUDY_TRACKS)
    assert set(people.FIXED_FIELDS) == {"MBA", "MCA"}
    assert people.SCIENCE_DEGREES == {"B.Sc", "M.Sc"}
    for track in people.STUDY_TRACKS:
        assert len(people.SCIENCE_FIELDS_BY_TRACK[track]) >= 3
        weights = people.ENGINEERING_FIELD_WEIGHTS_BY_TRACK[track]
        assert len(weights) >= 5 and all(weight > 0 for weight in weights.values())
        assert set(people.SCIENCE_FIELDS_BY_TRACK[track]) <= set(people.FIELDS_OF_STUDY)
        assert set(weights) <= set(people.FIELDS_OF_STUDY)
    assert len(people.FIELDS_OF_STUDY) >= 8
    assert list(people.FIELDS_OF_STUDY) == sorted(set(people.FIELDS_OF_STUDY))
    institutions = " ".join(people.INSTITUTIONS)
    for expected in ("IIT", "NIT", "Anna University", "VIT", "BITS", "SRM", "PSG", "Amrita"):
        assert expected in institutions
    assert "IIIT" in institutions and "Manipal" in institutions
    assert len(people.INSTITUTIONS) >= 20
    assert len(people.EMAIL_DOMAINS) >= 5
    assert all("." in domain and "@" not in domain for domain in people.EMAIL_DOMAINS)


def test_portrait_url_helper_wraps_at_99():
    assert people.portrait_url("male", 5) == "https://randomuser.me/api/portraits/men/5.jpg"
    assert people.portrait_url("female", 98) == "https://randomuser.me/api/portraits/women/98.jpg"
    assert people.portrait_url("female", 99) == "https://randomuser.me/api/portraits/women/0.jpg"
    assert people.portrait_url("male", 250) == people.portrait_url("male", 250 % 99)
    assert PORTRAIT_RE.match(people.portrait_url("male", 1234))
    with pytest.raises(ValueError):
        people.portrait_url("other", 1)


# --------------------------------------------------------------------- text


@pytest.mark.parametrize("family", people.ROLE_FAMILIES)
def test_candidate_text_templates_per_role_family(family):
    for pool in (text.SUMMARY_TEMPLATES, text.RESUME_TEMPLATES, text.EXPERIENCE_TEMPLATES):
        assert family in pool
        assert len(pool[family]) >= 2
    for template in text.SUMMARY_TEMPLATES[family]:
        placeholders = _placeholders(template)
        assert placeholders <= text.CANDIDATE_PLACEHOLDERS
        assert "years" in placeholders
        assert placeholders & {"skills", "other_skills"}
        # {years} renders as "6 years" / "1 year"; templates must not add the unit.
        assert "{years} years" not in template and "{years} yrs" not in template
        if "{primary_skill}" in template:
            assert "{skills}" not in template, "primary would be repeated in the list"
    for template in text.RESUME_TEMPLATES[family]:
        assert _placeholders(template) <= text.RESUME_PLACEHOLDERS
        assert {"experience_section", "education_section", "skills"} <= _placeholders(template)
    for template in text.EXPERIENCE_TEMPLATES[family]:
        assert _placeholders(template) <= text.EXPERIENCE_PLACEHOLDERS
        assert "company" in _placeholders(template) or "domain" in _placeholders(template)
        if "{primary_skill}" in template:
            assert "{skills}" not in template
    for template in text.RESUME_TEMPLATES[family]:
        assert "{years} years" not in template


def test_communication_templates_cover_every_outcome():
    assert set(text.COMMUNICATION_TEMPLATES) == set(enums.CommunicationOutcome.values)
    assert set(text.OUTCOME_CHANNELS) == set(enums.CommunicationOutcome.values)
    for outcome, templates in text.COMMUNICATION_TEMPLATES.items():
        assert len(templates) >= 2, outcome
        for template in templates:
            assert 0 < len(template.summary) <= 300
            assert _placeholders(template.summary) <= text.COMMUNICATION_PLACEHOLDERS
            assert _placeholders(template.notes) <= text.COMMUNICATION_PLACEHOLDERS
            if template.next_action is not None:
                assert 0 < len(template.next_action) <= 200
        assert set(text.OUTCOME_CHANNELS[outcome]) <= set(enums.CommunicationChannel.values)
    assert all(t.next_action for t in text.COMMUNICATION_TEMPLATES["connected"])


def test_feedback_bands_are_contiguous_and_consistent_with_recommendations():
    bands = text.FEEDBACK_BANDS
    assert bands[0].low == 0.0 and bands[-1].high == 10.0
    for previous, current in zip(bands, bands[1:], strict=False):
        assert previous.high == current.low
    assert [band.recommendation for band in bands] == [
        "reject",
        "hold",
        "proceed",
        "strong_proceed",
    ]
    for band in bands:
        assert band.recommendation in enums.Recommendation.values
        assert len(band.templates) >= 2
        for template in band.templates:
            assert _placeholders(template) <= text.FEEDBACK_PLACEHOLDERS
    assert text.feedback_band(8.5).recommendation == "proceed"
    assert text.feedback_band(10).recommendation == "strong_proceed"
    assert text.feedback_band(5.5).recommendation == "hold"
    assert text.feedback_band(0).recommendation == "reject"


def test_jd_activity_descriptions_cover_the_jd_event_types():
    expected = {
        "jd.created",
        "jd.updated",
        "jd.published",
        "jd.status_changed",
        "jd.participant_added",
        "jd.participant_removed",
        "jd.duplicated",
        "jd.archived",
    }
    assert set(text.JD_ACTIVITY_DESCRIPTIONS) == expected
    for event_type, activity in text.JD_ACTIVITY_DESCRIPTIONS.items():
        assert 0 < len(activity.title) <= 200, event_type
        assert _placeholders(activity.title) <= text.JD_ACTIVITY_PLACEHOLDERS
        assert _placeholders(activity.description) <= text.JD_ACTIVITY_PLACEHOLDERS
    rendered = text.JD_ACTIVITY_DESCRIPTIONS["jd.created"].title.format(
        actor="Rahul", title="Senior Python Developer"
    )
    assert rendered == "Rahul created the Job Description."


# Event types grouped by category, copied from plan.md 6.4.
PLAN_6_4_EVENT_TYPES: dict[str, set[str]] = {
    "job_description": {
        "jd.created",
        "jd.updated",
        "jd.published",
        "jd.status_changed",
        "jd.participant_added",
        "jd.participant_removed",
        "jd.duplicated",
        "jd.archived",
    },
    "candidate_search": {"search.completed", "application.added_manually"},
    "candidate_shortlisted": {
        "application.ai_shortlisted",
        "application.shortlisted",
        "application.status_changed",
    },
    "candidate_contact": {"communication.logged", "application.status_changed"},
    "interview": {
        "interview.scheduled",
        "interview.rescheduled",
        "interview.cancelled",
        "application.status_changed",
    },
    "interview_feedback": {"interview.feedback_submitted"},
    "candidate_selected": {"application.status_changed"},
    "offer": {"offer.created", "offer.sent", "offer.accepted", "offer.declined", "offer.withdrawn"},
    "onboarding": {"onboarding.started", "onboarding.checklist_updated", "onboarding.completed"},
    "decision": {
        "application.rejected",
        "application.withdrawn",
        "application.on_hold",
        "application.resumed",
    },
}


def test_event_type_categories_cover_plan_6_4():
    every_type = set().union(*PLAN_6_4_EVENT_TYPES.values())
    fixed = {
        event_type: category
        for category, event_types in PLAN_6_4_EVENT_TYPES.items()
        for event_type in event_types
        if event_type not in text.STATUS_DEPENDENT_EVENT_TYPES
    }
    assert text.STATUS_DEPENDENT_EVENT_TYPES == {"application.status_changed"}
    assert set(text.EVENT_TYPE_CATEGORIES) | text.STATUS_DEPENDENT_EVENT_TYPES == every_type
    assert not set(text.EVENT_TYPE_CATEGORIES) & text.STATUS_DEPENDENT_EVENT_TYPES
    for event_type, category in text.EVENT_TYPE_CATEGORIES.items():
        assert category == fixed[event_type], event_type
        assert category in enums.ActivityCategory.values
    for event in journey.JOURNEY_EVENTS:
        if event.event_type in text.STATUS_DEPENDENT_EVENT_TYPES:
            assert event.category == enums.STATUS_ENTRY_CATEGORY[event.status_after], event.key
        else:
            assert event.category == text.EVENT_TYPE_CATEGORIES[event.event_type], event.key


def test_application_activity_descriptions_cover_the_candidate_level_event_types():
    every_type = set().union(*PLAN_6_4_EVENT_TYPES.values())
    jd_types = set(text.JD_ACTIVITY_DESCRIPTIONS)
    app_types = set(text.APPLICATION_ACTIVITY_DESCRIPTIONS)
    assert jd_types | app_types == every_type
    assert not jd_types & app_types
    for event_type, activity in text.APPLICATION_ACTIVITY_DESCRIPTIONS.items():
        assert 0 < len(activity.title) <= 200, event_type
        if event_type != "search.completed":  # "Priya searched for candidates."
            assert {"candidate", "names", "count"} & _placeholders(activity.title), event_type
        assert _placeholders(activity.title) <= text.APPLICATION_ACTIVITY_PLACEHOLDERS
        assert _placeholders(activity.description) <= text.APPLICATION_ACTIVITY_PLACEHOLDERS
    contacted = text.APPLICATION_ACTIVITY_DESCRIPTIONS["communication.logged"]
    assert contacted.title.format(actor="Priya", candidate="John Doe") == (
        journey.JOURNEY_EVENTS_BY_KEY["contacted"].title
    )
    feedback = text.APPLICATION_ACTIVITY_DESCRIPTIONS["interview.feedback_submitted"]
    assert feedback.title.format(actor="Arun", candidate="John Doe") == (
        journey.JOURNEY_EVENTS_BY_KEY["feedback_submitted"].title
    )
    scheduled = text.APPLICATION_ACTIVITY_DESCRIPTIONS["interview.scheduled"]
    assert scheduled.title.format(round="Technical Interview", candidate="John Doe") == (
        journey.JOURNEY_EVENTS_BY_KEY["interview_scheduled"].title
    )
    assert set(text.STATUS_ENTRY_TITLES) <= set(enums.ApplicationStatus.values)
    assert text.STATUS_ENTRY_TITLES["selected"].format(candidate="John Doe") == (
        journey.JOURNEY_EVENTS_BY_KEY["selected"].title
    )
    assert text.STATUS_ENTRY_TITLES["onboarded"].format(candidate="John Doe") == (
        journey.JOURNEY_EVENTS_BY_KEY["onboarded"].title
    )


def test_decision_reason_pools_cover_the_tray_statuses():
    assert set(text.DECISION_REASONS) == set(enums.ApplicationStatus.TRAY)
    assert text.DECISION_REASONS["rejected"] is text.REJECTION_REASONS
    assert text.DECISION_REASONS["withdrawn"] is text.WITHDRAWAL_REASONS
    assert text.DECISION_REASONS["on_hold"] is text.HOLD_REASONS
    for status, reasons in text.DECISION_REASONS.items():
        assert len(reasons) >= 4, status
        assert len(set(reasons)) == len(reasons), status
        assert all(reason.strip() and len(reason) <= 200 for reason in reasons), status


# ------------------------------------------------------------------ journey


def test_journey_activity_metadata_is_json_safe_and_keeps_offsets_in_metadata():
    for event in journey.JOURNEY_EVENTS:
        json.dumps(event.activity_metadata)  # what goes into Activity.metadata (jsonb)
        offsets = {key for key, value in event.metadata.items() if isinstance(value, timedelta)}
        assert set(event.activity_metadata) == set(event.metadata) - offsets, event.key
    contacted = journey.JOURNEY_EVENTS_BY_KEY["contacted"]
    interview = journey.JOURNEY_EVENTS_BY_KEY["interview_scheduled"]
    assert contacted.metadata["next_action_offset"] == interview.offset
    assert interview.metadata["scheduled_offset"] == interview.offset
    assert "next_action_offset" not in contacted.activity_metadata
    assert contacted.activity_metadata["outcome"] == "connected"


def test_ranked_examples_carry_a_gender_for_portraits():
    by_name = {example.full_name: example for example in journey.RANKED_EXAMPLES}
    assert by_name["Jane Smith"].gender == "female"
    assert by_name["John Doe"].gender == journey.JOHN_DOE.gender == "male"
    for example in journey.RANKED_EXAMPLES:
        assert example.gender in {"male", "female"}
        assert 0 < example.match_pct <= 100
        assert example.experience_years > 0


def test_journey_events_are_chronological_and_end_on_the_anchor():
    offsets = [event.offset for event in journey.JOURNEY_EVENTS]
    assert offsets == sorted(offsets)
    assert len(set(offsets)) == len(offsets)
    assert offsets[-1] == timedelta(0)
    assert journey.JOURNEY_EVENTS[0].event_type == "jd.created"
    assert journey.JOURNEY_EVENTS[-1].event_type == "onboarding.completed"
    anchor = date(2026, 9, 11)
    schedule = journey.schedule(anchor)
    assert [event for _, event in schedule] == list(journey.JOURNEY_EVENTS)
    times = [moment for moment, _ in schedule]
    assert times == sorted(times)
    assert times[-1].date() == anchor
    assert (times[-1].hour, times[-1].minute) == (9, 0)
    assert times[-1].tzinfo is not None
    assert times[0].date() == anchor - timedelta(days=9)
    assert (times[0].hour, times[0].minute) == (9, 30)


def test_journey_reproduces_the_prompt_timeline_example():
    example = [
        (e.event_type, e.offset, e.actor_email) for e in journey.JOURNEY_EVENTS if e.from_prompt
    ]
    assert len(example) == 9
    prompt_day_zero = date(2026, 9, 11)
    by_type = {e.event_type: e for e in journey.JOURNEY_EVENTS if e.from_prompt}
    schedule = dict((event.key, moment) for moment, event in journey.schedule(date(2026, 9, 20)))

    def at(key, day, hour, minute):
        moment = schedule[key]
        assert (moment.date(), moment.hour, moment.minute) == (
            prompt_day_zero + timedelta(days=day),
            hour,
            minute,
        ), key

    created = by_type["jd.created"]
    assert created.actor_email == users.RAHUL
    at(created.key, 0, 9, 30)

    searched = by_type["search.completed"]
    assert searched.actor_email == users.PRIYA
    assert searched.metadata["total_found"] == 127
    assert set(searched.metadata["sources"]) == {"naukri", "linkedin"}
    at(searched.key, 0, 10, 15)

    shortlisted = by_type["application.shortlisted"]
    assert shortlisted.actor_email == users.RAHUL
    assert shortlisted.metadata["candidate_names"] == ["John Doe", "Jane Smith", "Alex Kumar"]
    at(shortlisted.key, 0, 11, 0)

    contacted = by_type["communication.logged"]
    assert contacted.actor_email == users.PRIYA
    assert contacted.metadata["outcome"] == "connected"
    assert contacted.metadata["channel"] in enums.CommunicationChannel.values
    at(contacted.key, 0, 14, 30)

    interview = by_type["interview.scheduled"]
    assert interview.metadata["interviewer_email"] == users.ARUN
    assert interview.metadata["round"] == "technical"
    assert interview.metadata["mode"] in enums.InterviewMode.values
    at(interview.key, 1, 15, 0)

    feedback = by_type["interview.feedback_submitted"]
    assert feedback.actor_email == users.ARUN
    assert feedback.metadata["score"] == 8.5
    assert feedback.metadata["recommendation"] == "proceed"
    at(feedback.key, 1, 17, 0)

    selected = by_type["application.status_changed"]
    assert selected.metadata["to"] == "selected"
    at(selected.key, 3, 11, 0)

    offer = by_type["offer.sent"]
    assert offer.metadata["annual_ctc"] > 0
    at(offer.key, 4, 10, 0)

    onboarded = by_type["onboarding.completed"]
    at(onboarded.key, 9, 9, 0)


def test_journey_events_use_known_actors_categories_and_statuses():
    statuses = []
    for event in journey.JOURNEY_EVENTS:
        assert event.category in enums.ActivityCategory.values, event.key
        if event.actor_email is not None:
            assert event.actor_email in users.USERS_BY_EMAIL
        assert 0 < len(event.title) <= 200
        if event.status_after is not None:
            assert event.status_after in enums.ApplicationStatus.values
            statuses.append(event.status_after)
        assert event.key.isidentifier()
    keys = [event.key for event in journey.JOURNEY_EVENTS]
    assert len(set(keys)) == len(keys)
    assert statuses[-1] == "onboarded"
    order = [enums.ApplicationStatus.order_index(status) for status in statuses]
    assert order == sorted(order), "John Doe only moves forward"
    assert {"contacted", "interview_scheduled", "selected", "offer_sent", "offer_accepted"} <= set(
        statuses
    )
    assert journey.JOURNEY_JD_TITLE in jobs.JOBS_BY_TITLE


def test_john_doe_profile_matches_the_prompt_sample():
    john = journey.JOHN_DOE
    assert john.full_name == "John Doe"
    assert john.total_experience_years == 6
    assert set(john.sources) == {"internal", "linkedin"}
    assert set(john.sources) <= set(enums.CandidateSource.values)
    skill_keys = [skill.key for skill in john.skills]
    for expected in ("python", "django", "fastapi", "postgresql", "aws"):
        assert expected in skill_keys
    assert len(set(skill_keys)) == len(skill_keys)
    for skill in john.skills:
        assert skill.key in skills.SKILL_DISPLAY
        assert 1 <= skill.proficiency <= 5
    kubernetes = next(skill for skill in john.skills if skill.key == "kubernetes")
    assert kubernetes.proficiency <= 2, "prompt lists 'Limited Kubernetes experience' as a gap"
    job = jobs.JOBS_BY_TITLE[journey.JOURNEY_JD_TITLE]
    assert set(job.required_skills) <= set(skill_keys)
    assert john.email == john.email.lower()
    assert john.avatar_url and PORTRAIT_RE.match(john.avatar_url)
    assert any(exp.domain == job.domain for exp in john.experiences)
    assert john.education[0].degree in people.DEGREES
    names = [candidate.full_name for candidate in journey.RANKED_EXAMPLES]
    assert names == ["John Doe", "Jane Smith", "Alex Kumar", "David Raj"]
    for candidate in journey.RANKED_EXAMPLES:
        assert candidate.source in enums.CandidateSource.values
        assert candidate.status in enums.ApplicationStatus.values
    assert journey.SHORTLISTED_NAMES == ("John Doe", "Jane Smith", "Alex Kumar")
