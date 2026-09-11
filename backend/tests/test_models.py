"""Every table from plan.md 6.3: one row of each through the FK chain, the unique
constraints, on_delete behaviour, related names and the admin registrations."""

from __future__ import annotations

import uuid
from datetime import date, timedelta
from decimal import Decimal

import pytest
from django.contrib import admin
from django.contrib.postgres.fields import ArrayField
from django.contrib.postgres.indexes import GinIndex
from django.core.exceptions import ValidationError
from django.db import IntegrityError, connection, transaction
from django.db.models import ProtectedError
from django.urls import reverse
from django.utils import timezone

from accounts.models import PasswordResetRequest, User
from activity.models import Activity
from audit.models import AuditLog
from candidates.models import (
    Candidate,
    CandidateCertification,
    CandidateEducation,
    CandidateExperience,
    CandidateSkill,
    CandidateSource,
)
from common import enums
from common.models import UUIDTimestampedModel
from jobs.models import JobDescription, JobDescriptionVersion, RecruitmentParticipant
from notifications.models import Notification
from pipeline.models import (
    DEFAULT_ONBOARDING_CHECKLIST,
    Application,
    CandidateMatch,
    Communication,
    Interview,
    Offer,
    Onboarding,
    SearchRun,
)

pytestmark = pytest.mark.django_db

ALL_MODELS = [
    PasswordResetRequest,
    JobDescription,
    JobDescriptionVersion,
    RecruitmentParticipant,
    Candidate,
    CandidateSkill,
    CandidateExperience,
    CandidateEducation,
    CandidateCertification,
    CandidateSource,
    Application,
    CandidateMatch,
    SearchRun,
    Interview,
    Communication,
    Offer,
    Onboarding,
    Activity,
    Notification,
    AuditLog,
]


# ------------------------------------------------------------------ fixtures


@pytest.fixture
def hr(user_factory) -> User:
    return user_factory(
        first_name="Priya", last_name="Sharma", role=enums.UserRole.HR, designation="HR Executive"
    )


@pytest.fixture
def interviewer(user_factory) -> User:
    return user_factory(
        first_name="Arun",
        last_name="Kumar",
        role=enums.UserRole.INTERVIEWER,
        designation="Engineering Manager",
        department="Engineering",
    )


@pytest.fixture
def jd(hr) -> JobDescription:
    return JobDescription.objects.create(
        title="Senior Python Developer",
        department="Engineering",
        location="Chennai",
        work_mode=enums.WorkMode.HYBRID,
        employment_type=enums.EmploymentType.FULL_TIME,
        experience_min_years=4,
        experience_max_years=8,
        salary_min=1_800_000,
        salary_max=3_000_000,
        required_skills=["python", "django", "postgresql"],
        preferred_skills=["docker", "aws"],
        education_requirements="Bachelor's degree in Computer Science",
        responsibilities="Design APIs\nMentor engineers",
        qualifications="4+ years with Python",
        description="Backend role on the fintech platform.",
        domain="fintech",
        status=enums.JDStatus.OPEN,
        created_by=hr,
        updated_by=hr,
        published_at=timezone.now(),
    )


@pytest.fixture
def version(jd, hr) -> JobDescriptionVersion:
    return JobDescriptionVersion.objects.create(
        job_description=jd,
        version=1,
        snapshot={"title": jd.title, "required_skills": jd.required_skills},
        change_summary="Created",
        created_by=hr,
    )


@pytest.fixture
def participant(jd, hr, interviewer) -> RecruitmentParticipant:
    RecruitmentParticipant.objects.create(
        job_description=jd,
        user=hr,
        role_in_recruitment=enums.ParticipantRole.OWNER,
        added_by=hr,
    )
    return RecruitmentParticipant.objects.create(
        job_description=jd,
        user=interviewer,
        role_in_recruitment=enums.ParticipantRole.HIRING_MANAGER,
        added_by=hr,
    )


@pytest.fixture
def candidate() -> Candidate:
    return Candidate.objects.create(
        full_name="John Doe",
        email="John.Doe@Example.com",
        phone="+91 98765 43210",
        location="Chennai",
        headline="Senior Backend Engineer at Zoho",
        current_company="Zoho",
        current_title="Senior Backend Engineer",
        total_experience_years=Decimal("6.5"),
        summary="Builds payment APIs in Python.",
        resume_text="John Doe. Python, Django, PostgreSQL.",
        notice_period_days=30,
        current_ctc=2_400_000,
        expected_ctc=3_000_000,
    )


@pytest.fixture
def skill(candidate) -> CandidateSkill:
    return CandidateSkill.objects.create(
        candidate=candidate,
        skill="python",
        display_name="Python",
        proficiency=5,
        years=Decimal("6.0"),
        is_primary=True,
    )


@pytest.fixture
def experience(candidate) -> CandidateExperience:
    return CandidateExperience.objects.create(
        candidate=candidate,
        company="Zoho",
        title="Senior Backend Engineer",
        domain="fintech",
        start_date=date(2021, 4, 1),
        is_current=True,
        description="Payments platform.",
    )


@pytest.fixture
def education(candidate) -> CandidateEducation:
    return CandidateEducation.objects.create(
        candidate=candidate,
        degree="B.Tech",
        field="Computer Science",
        institution="Anna University",
        start_year=2014,
        end_year=2018,
        grade="8.4 CGPA",
    )


@pytest.fixture
def certification(candidate) -> CandidateCertification:
    return CandidateCertification.objects.create(
        candidate=candidate,
        name="AWS Solutions Architect Associate",
        issuer="Amazon Web Services",
        issued_year=2023,
    )


@pytest.fixture
def source(candidate, hr) -> CandidateSource:
    return CandidateSource.objects.create(
        candidate=candidate,
        source=enums.CandidateSource.REFERRAL,
        source_reference="referral:priya",
        referred_by=hr,
    )


@pytest.fixture
def search_run(jd, hr) -> SearchRun:
    return SearchRun.objects.create(
        job_description=jd,
        requested_by=hr,
        sources=["internal", "referral", "naukri", "linkedin"],
        status=enums.SearchRunStatus.COMPLETED,
        total_found=42,
        new_candidates=30,
        existing_candidates=12,
        shortlisted=9,
        finished_at=timezone.now(),
        duration_ms=850,
    )


@pytest.fixture
def application(candidate, jd, hr, search_run) -> Application:
    return Application.objects.create(
        candidate=candidate,
        job_description=jd,
        status=enums.ApplicationStatus.AI_SHORTLISTED,
        owner=hr,
        search_run=search_run,
        entry_source=enums.CandidateSource.REFERRAL,
        notes="Strong profile.",
        is_starred=True,
    )


@pytest.fixture
def match(application) -> CandidateMatch:
    return CandidateMatch.objects.create(
        application=application,
        overall_pct=Decimal("95.00"),
        skills_score=Decimal("98.00"),
        experience_score=Decimal("100.00"),
        education_score=Decimal("100.00"),
        domain_score=Decimal("100.00"),
        responsibility_score=Decimal("80.00"),
        matched_required_skills=["python", "django", "postgresql"],
        missing_required_skills=[],
        matched_preferred_skills=["docker"],
        strengths=["Strong Python experience (6 yrs, expert level)"],
        gaps=["No AWS experience listed"],
        engine="rule_based",
        engine_version="1.0",
    )


@pytest.fixture
def interview(application, interviewer, hr) -> Interview:
    return Interview.objects.create(
        application=application,
        round=enums.InterviewRound.TECHNICAL,
        sequence=1,
        interviewer=interviewer,
        scheduled_at=timezone.now() + timedelta(days=2),
        duration_minutes=60,
        mode=enums.InterviewMode.VIDEO,
        meeting_link="https://meet.example.com/abc",
        status=enums.InterviewStatus.SCHEDULED,
        created_by=hr,
    )


@pytest.fixture
def communication(application, hr) -> Communication:
    return Communication.objects.create(
        application=application,
        channel=enums.CommunicationChannel.PHONE,
        direction=enums.CommunicationDirection.OUTBOUND,
        outcome=enums.CommunicationOutcome.CONNECTED,
        summary="Discussed the role, candidate is interested.",
        next_action="Schedule technical round",
        next_action_at=timezone.now() + timedelta(days=1),
        performed_by=hr,
    )


@pytest.fixture
def offer(application, hr) -> Offer:
    return Offer.objects.create(
        application=application,
        status=enums.OfferStatus.SENT,
        designation="Senior Software Engineer",
        annual_ctc=2_800_000,
        joining_date=date(2026, 10, 15),
        sent_at=timezone.now(),
        created_by=hr,
    )


@pytest.fixture
def onboarding(application, hr, interviewer) -> Onboarding:
    return Onboarding.objects.create(
        application=application,
        status=enums.OnboardingStatus.IN_PROGRESS,
        start_date=date(2026, 10, 15),
        buddy=interviewer,
        hr_contact=hr,
    )


@pytest.fixture
def activity(jd, application, candidate, hr) -> Activity:
    return Activity.objects.create(
        job_description=jd,
        application=application,
        candidate=candidate,
        category=enums.ActivityCategory.CANDIDATE_SHORTLISTED,
        event_type="application.ai_shortlisted",
        title="AI shortlisted John Doe",
        actor=hr,
        metadata={"score": 95},
    )


@pytest.fixture
def notification(hr, interviewer) -> Notification:
    return Notification.objects.create(
        recipient=interviewer,
        actor=hr,
        type=enums.NotificationType.ASSIGNMENT,
        title="You were added to Senior Python Developer",
        message="Priya added you as Hiring Manager.",
        link_url="/jobs/123",
    )


@pytest.fixture
def audit_log(hr) -> AuditLog:
    return AuditLog.objects.create(
        actor=hr,
        action=enums.AuditAction.CREATE,
        entity_type="jobs.JobDescription",
        entity_id=str(uuid.uuid4()),
        changes={"title": [None, "Senior Python Developer"]},
        ip_address="127.0.0.1",
        user_agent="pytest",
        request_id=uuid.uuid4(),
        path="/api/v1/job-descriptions/",
        status_code=201,
    )


@pytest.fixture
def reset_request() -> PasswordResetRequest:
    return PasswordResetRequest.objects.create(
        email="priya@aimious.demo",
        token_hash="a" * 64,
        expires_at=timezone.now() + timedelta(hours=1),
        ip_address="127.0.0.1",
    )


@pytest.fixture
def world(
    version,
    participant,
    skill,
    experience,
    education,
    certification,
    source,
    match,
    interview,
    communication,
    offer,
    onboarding,
    activity,
    notification,
    audit_log,
    reset_request,
) -> dict:
    """One persisted row of every model in plan.md 6.3."""
    return {
        "version": version,
        "participant": participant,
        "skill": skill,
        "experience": experience,
        "education": education,
        "certification": certification,
        "source": source,
        "match": match,
        "interview": interview,
        "communication": communication,
        "offer": offer,
        "onboarding": onboarding,
        "activity": activity,
        "notification": notification,
        "audit_log": audit_log,
        "reset_request": reset_request,
    }


# --------------------------------------------------------------- base model


def test_every_model_inherits_the_uuid_timestamped_base():
    for model in ALL_MODELS:
        assert issubclass(model, UUIDTimestampedModel), model.__name__
        assert model._meta.pk.name == "id"


def test_one_row_of_every_model_exists_with_uuid_and_timestamps(world):
    for model in ALL_MODELS:
        assert model.objects.count() >= 1, model.__name__
        row = model.objects.first()
        assert isinstance(row.id, uuid.UUID)
        assert row.created_at is not None and row.updated_at is not None
        assert str(row), model.__name__


# ------------------------------------------------------------ field details


def test_job_description_defaults_and_array_fields(jd):
    jd.refresh_from_db()
    assert jd.salary_currency == "INR"
    assert jd.openings == 1
    assert jd.current_version == 1
    assert jd.required_skills == ["python", "django", "postgresql"]
    assert jd.preferred_skills == ["docker", "aws"]
    assert isinstance(JobDescription._meta.get_field("required_skills"), ArrayField)
    assert JobDescription().status == enums.JDStatus.DRAFT
    assert str(jd) == "Senior Python Developer"


def test_job_description_indexes_include_status_department_and_gin_on_required_skills():
    indexed_fields = {tuple(index.fields) for index in JobDescription._meta.indexes}
    assert ("status",) in indexed_fields
    assert ("department",) in indexed_fields
    gin_indexes = [index for index in JobDescription._meta.indexes if isinstance(index, GinIndex)]
    assert any(index.fields == ["required_skills"] for index in gin_indexes)

    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT indexdef FROM pg_indexes WHERE tablename = %s",
            [JobDescription._meta.db_table],
        )
        definitions = [row[0].lower() for row in cursor.fetchall()]
    assert any("using gin" in d and "required_skills" in d for d in definitions)
    assert any("gin_trgm_ops" in d and "title" in d for d in definitions)


def test_candidate_email_is_stored_lowercase_and_unique(candidate):
    candidate.refresh_from_db()
    assert candidate.email == "john.doe@example.com"
    assert candidate.total_experience_years == Decimal("6.5")

    with pytest.raises(IntegrityError), transaction.atomic():
        Candidate.objects.create(full_name="Other", email="JOHN.DOE@example.com")


def test_choice_fields_reject_unknown_values(jd, application):
    application.status = "not_a_status"
    with pytest.raises(ValidationError) as excinfo:
        application.full_clean()
    assert "status" in excinfo.value.error_dict

    jd.work_mode = "underwater"
    with pytest.raises(ValidationError):
        jd.full_clean()


def test_candidate_skill_proficiency_is_checked_between_1_and_5(candidate):
    with pytest.raises(IntegrityError), transaction.atomic():
        CandidateSkill.objects.create(
            candidate=candidate, skill="go", display_name="Go", proficiency=6
        )
    with pytest.raises(IntegrityError), transaction.atomic():
        CandidateSkill.objects.create(
            candidate=candidate, skill="rust", display_name="Rust", proficiency=0
        )


def test_interview_score_is_checked_between_0_and_10(application, interviewer):
    with pytest.raises(IntegrityError), transaction.atomic():
        Interview.objects.create(
            application=application,
            round=enums.InterviewRound.HR,
            interviewer=interviewer,
            scheduled_at=timezone.now(),
            score=Decimal("10.5"),
        )


def test_application_defaults(candidate, jd):
    application = Application.objects.create(candidate=candidate, job_description=jd)

    assert application.status == enums.ApplicationStatus.NEW
    assert application.previous_status is None
    assert application.entry_source == enums.CandidateSource.INTERNAL
    assert application.stage_entered_at is not None
    assert application.last_activity_at is not None
    assert application.is_starred is False
    assert application.notes == ""


def test_application_indexes_cover_the_plan():
    indexed_fields = {tuple(index.fields) for index in Application._meta.indexes}
    assert ("job_description", "status") in indexed_fields
    assert ("last_activity_at",) in indexed_fields


def test_onboarding_gets_the_default_checklist(onboarding):
    onboarding.refresh_from_db()
    assert [item["key"] for item in onboarding.checklist] == [
        key for key, _label in DEFAULT_ONBOARDING_CHECKLIST
    ]
    assert len(onboarding.checklist) == 5
    for item in onboarding.checklist:
        assert set(item) == {"key", "label", "done", "done_at"}
        assert item["done"] is False and item["done_at"] is None
    assert Onboarding().checklist is not Onboarding().checklist, "default must be a fresh list"


def test_activity_defaults_and_indexes(activity):
    activity.refresh_from_db()
    assert activity.occurred_at is not None
    assert activity.metadata == {"score": 95}
    assert Activity().metadata == {}

    indexed_fields = {tuple(index.fields) for index in Activity._meta.indexes}
    assert ("job_description", "-occurred_at") in indexed_fields
    assert ("application", "-occurred_at") in indexed_fields
    assert ("candidate", "-occurred_at") in indexed_fields
    assert ("category",) in indexed_fields


def test_notification_index_and_defaults(notification):
    assert notification.is_read is False and notification.read_at is None
    indexed_fields = {tuple(index.fields) for index in Notification._meta.indexes}
    assert ("recipient", "is_read", "-created_at") in indexed_fields


def test_password_reset_request_fields(reset_request):
    reset_request.refresh_from_db()
    assert reset_request.used_at is None
    assert reset_request.requested_at is not None
    assert reset_request.ip_address == "127.0.0.1"
    assert "priya@aimious.demo" in str(reset_request)


# ---------------------------------------------------------- unique constraints


def test_application_is_unique_per_candidate_and_jd(application):
    with pytest.raises(IntegrityError), transaction.atomic():
        Application.objects.create(
            candidate=application.candidate, job_description=application.job_description
        )


def test_participant_is_unique_per_jd_and_user(participant):
    with pytest.raises(IntegrityError), transaction.atomic():
        RecruitmentParticipant.objects.create(
            job_description=participant.job_description,
            user=participant.user,
            role_in_recruitment=enums.ParticipantRole.OBSERVER,
        )


def test_candidate_skill_is_unique_per_candidate_and_skill(skill):
    with pytest.raises(IntegrityError), transaction.atomic():
        CandidateSkill.objects.create(
            candidate=skill.candidate, skill="python", display_name="Python 3", proficiency=3
        )


def test_candidate_source_is_unique_per_candidate_and_source(source):
    with pytest.raises(IntegrityError), transaction.atomic():
        CandidateSource.objects.create(
            candidate=source.candidate, source=enums.CandidateSource.REFERRAL
        )
    # A second, different source for the same candidate is fine (60% have two).
    CandidateSource.objects.create(candidate=source.candidate, source=enums.CandidateSource.NAUKRI)
    assert source.candidate.sources.count() == 2


def test_jd_version_is_unique_per_jd_and_version(version):
    with pytest.raises(IntegrityError), transaction.atomic():
        JobDescriptionVersion.objects.create(
            job_description=version.job_description, version=1, snapshot={}
        )


def test_candidate_match_is_one_to_one_with_application(match):
    application = match.application
    assert application.match == match
    assert CandidateMatch._meta.get_field("application").one_to_one

    with pytest.raises(IntegrityError), transaction.atomic():
        CandidateMatch.objects.create(
            application=application,
            overall_pct=Decimal("10.00"),
            skills_score=0,
            experience_score=0,
            education_score=0,
            domain_score=0,
            responsibility_score=0,
            engine="rule_based",
            engine_version="1.0",
        )


def test_offer_and_onboarding_are_one_to_one_with_application(offer, onboarding):
    assert offer.application.offer == offer
    assert onboarding.application.onboarding == onboarding
    with pytest.raises(IntegrityError), transaction.atomic():
        Offer.objects.create(
            application=offer.application,
            designation="Dup",
            annual_ctc=1,
            joining_date=date(2026, 1, 1),
        )


# ------------------------------------------------------------------ on_delete


def test_deleting_an_application_keeps_the_activity_with_a_null_application(activity):
    activity.application.delete()
    activity.refresh_from_db()

    assert activity.application is None
    assert activity.candidate is not None
    assert activity.job_description is not None


def test_deleting_a_candidate_nulls_activity_candidate_and_cascades_children(world, candidate):
    activity = world["activity"]
    candidate.delete()

    activity.refresh_from_db()
    assert activity.candidate is None
    assert activity.application is None  # application cascaded away with the candidate
    assert Application.objects.count() == 0
    assert CandidateSkill.objects.count() == 0
    assert CandidateExperience.objects.count() == 0
    assert CandidateEducation.objects.count() == 0
    assert CandidateCertification.objects.count() == 0
    assert CandidateSource.objects.count() == 0
    assert CandidateMatch.objects.count() == 0
    assert Interview.objects.count() == 0
    assert Communication.objects.count() == 0
    assert Offer.objects.count() == 0
    assert Onboarding.objects.count() == 0


def test_deleting_a_jd_cascades_versions_participants_applications_runs_activities(world, jd):
    jd.delete()

    assert JobDescriptionVersion.objects.count() == 0
    assert RecruitmentParticipant.objects.count() == 0
    assert Application.objects.count() == 0
    assert SearchRun.objects.count() == 0
    assert Activity.objects.count() == 0
    assert Candidate.objects.count() == 1  # candidates outlive JDs


def test_deleting_the_jd_creator_is_protected(jd, hr):
    with pytest.raises(ProtectedError), transaction.atomic():
        hr.delete()


def test_deleting_an_interviewer_with_interviews_is_protected(interview, interviewer):
    with pytest.raises(ProtectedError), transaction.atomic():
        interviewer.delete()


def test_deleting_a_user_sets_null_on_soft_references(world, user_factory):
    other = user_factory(first_name="Karthik", last_name="Iyer")
    application = world["match"].application
    application.owner = other
    application.save()
    activity = world["activity"]
    activity.actor = other
    activity.save()
    notification = Notification.objects.create(
        recipient=application.owner, actor=other, type="system", title="hello"
    )
    log = AuditLog.objects.create(actor=other, action="login")

    other.delete()

    application.refresh_from_db()
    activity.refresh_from_db()
    log.refresh_from_db()
    assert application.owner is None
    assert activity.actor is None
    assert log.actor is None
    assert not Notification.objects.filter(pk=notification.pk).exists()  # recipient CASCADE


def test_deleting_a_search_run_keeps_applications(application, search_run):
    search_run.delete()
    application.refresh_from_db()
    assert application.search_run is None


# ----------------------------------------------------------- related names


def test_related_names_read_well(world, jd, candidate):
    application = world["match"].application
    hr = jd.created_by

    assert list(jd.participants.all()) and world["participant"] in jd.participants.all()
    assert application in jd.applications.all()
    assert world["version"] in jd.versions.all()
    assert world["activity"] in jd.activities.all()
    assert application.search_run in jd.search_runs.all()

    assert world["skill"] in candidate.skills.all()
    assert world["experience"] in candidate.experiences.all()
    assert world["education"] in candidate.education.all()
    assert world["certification"] in candidate.certifications.all()
    assert world["source"] in candidate.sources.all()
    assert application in candidate.applications.all()
    assert world["activity"] in candidate.activities.all()

    assert world["interview"] in application.interviews.all()
    assert world["communication"] in application.communications.all()
    assert world["activity"] in application.activities.all()
    assert application.match == world["match"]
    assert application.offer == world["offer"]
    assert application.onboarding == world["onboarding"]

    assert jd in hr.created_job_descriptions.all()
    assert application in hr.owned_applications.all()
    assert world["interview"] in world["interview"].interviewer.interviews.all()
    assert world["notification"] in world["notification"].recipient.notifications.all()
    assert world["audit_log"] in hr.audit_logs.all()


def test_str_methods_mention_the_human_facing_names(world, jd, candidate):
    application = world["match"].application
    assert str(jd) == "Senior Python Developer"
    assert str(candidate) == "John Doe"
    assert "Senior Python Developer" in str(world["version"]) and "v1" in str(world["version"])
    assert "Arun Kumar" in str(world["participant"])
    assert str(world["skill"]) == "John Doe: Python (5/5)"
    assert "John Doe" in str(application) and "Senior Python Developer" in str(application)
    assert "95" in str(world["match"])
    assert "Technical" in str(world["interview"])
    assert str(world["source"]) == "John Doe via Referral"
    assert "Offer" in str(world["offer"]) or "John Doe" in str(world["offer"])
    assert "AI shortlisted John Doe" in str(world["activity"])


# ---------------------------------------------------------------------- admin


@pytest.mark.parametrize("model", [User, *ALL_MODELS])
def test_every_model_is_registered_in_the_admin_with_list_display_and_search(model):
    assert admin.site.is_registered(model), model.__name__
    model_admin = admin.site._registry[model]
    assert model_admin.list_display and model_admin.list_display != ("__str__",)
    assert model_admin.search_fields, model.__name__


@pytest.mark.parametrize("model", [User, *ALL_MODELS])
def test_admin_changelist_renders_for_every_model(client, world, user_factory, model):
    admin_user = user_factory(is_superuser=True, email="admin@aimious.demo")
    client.force_login(admin_user)
    url = reverse(f"admin:{model._meta.app_label}_{model._meta.model_name}_changelist")

    response = client.get(url)

    assert response.status_code == 200, url
