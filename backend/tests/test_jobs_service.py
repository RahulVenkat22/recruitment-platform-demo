"""jobs.services.JobService (plan.md 6.1 jobs row, 6.3 jobs tables, 6.10 Job
descriptions rows, section 11 "jobs" bullet): create with participants inserts
the owner first, update writes a version only when content changes, publish and
status rules, archive / unarchive, duplicate copies participants, the delete
guard, participant management, metrics, list annotations and the skills
dictionary. Every mutation records the plan.md 6.4 job_description events."""

from __future__ import annotations

import pytest
from django.utils import timezone

from activity.models import Activity
from candidates.models import CandidateSkill
from common.enums import ActivityCategory as AC
from common.enums import ApplicationStatus as AS
from common.enums import JDStatus, OfferStatus
from common.enums import ParticipantRole as PR
from common.enums import UserRole as UR
from jobs import services
from jobs.exceptions import (
    ConfirmationRequired,
    CreatorProtected,
    InvalidStatusTransition,
    ParticipantExists,
)
from jobs.models import JobDescription, JobDescriptionVersion, RecruitmentParticipant
from jobs.services import CONTENT_FIELDS, JobService
from tests.test_jobs_support import (
    add_participant,
    jd_payload,
    make_application,
    make_candidate,
    make_jd,
    make_offer,
)

pytestmark = pytest.mark.django_db


# ------------------------------------------------------------------ fixtures


@pytest.fixture
def rahul(user_factory):
    return user_factory(first_name="Rahul", last_name="Venkat", role=UR.HR_ADMIN)


@pytest.fixture
def priya(user_factory):
    return user_factory(first_name="Priya", last_name="Sharma", role=UR.HR)


@pytest.fixture
def arun(user_factory):
    return user_factory(first_name="Arun", last_name="Kumar", role=UR.INTERVIEWER)


@pytest.fixture
def divya(user_factory):
    return user_factory(first_name="Divya", last_name="Raman", role=UR.INTERVIEWER)


def participants_of(jd) -> list[tuple[str, str]]:
    return [
        (p.user.first_name, p.role_in_recruitment)
        for p in jd.participants.select_related("user").order_by("created_at")
    ]


def activities_of(jd, event_type: str | None = None):
    qs = Activity.objects.filter(job_description=jd).order_by("occurred_at", "created_at")
    return qs.filter(event_type=event_type) if event_type else qs


# -------------------------------------------------------------------- create


def test_content_fields_cover_the_plan_columns():
    assert CONTENT_FIELDS == (
        "title",
        "department",
        "location",
        "work_mode",
        "employment_type",
        "experience_min_years",
        "experience_max_years",
        "salary_min",
        "salary_max",
        "salary_currency",
        "required_skills",
        "preferred_skills",
        "education_requirements",
        "responsibilities",
        "qualifications",
        "additional_requirements",
        "description",
        "domain",
        "openings",
    )


def test_create_inserts_the_creator_as_owner_first(rahul, priya, arun, divya):
    jd = JobService.create(
        jd_payload(),
        [
            {"user": priya, "role_in_recruitment": PR.RECRUITER},
            {"user": arun, "role_in_recruitment": PR.HIRING_MANAGER},
            {"user": divya, "role_in_recruitment": PR.INTERVIEWER},
        ],
        rahul,
    )

    assert jd.created_by == rahul and jd.updated_by == rahul
    assert jd.status == JDStatus.DRAFT and jd.published_at is None
    assert jd.current_version == 1
    assert participants_of(jd) == [
        ("Rahul", PR.OWNER),
        ("Priya", PR.RECRUITER),
        ("Arun", PR.HIRING_MANAGER),
        ("Divya", PR.INTERVIEWER),
    ]
    assert all(p.added_by == rahul for p in jd.participants.all())


def test_create_keeps_the_creator_owner_even_when_listed_with_another_role(rahul, priya):
    jd = JobService.create(
        jd_payload(),
        [
            {"user": priya, "role_in_recruitment": PR.RECRUITER},
            {"user": rahul, "role_in_recruitment": PR.OBSERVER},
            {"user": priya, "role_in_recruitment": PR.INTERVIEWER},  # duplicate: first wins
        ],
        rahul,
    )

    assert participants_of(jd) == [("Rahul", PR.OWNER), ("Priya", PR.RECRUITER)]


def test_create_writes_version_one_with_the_full_snapshot(rahul):
    jd = JobService.create(jd_payload(), [], rahul)

    version = JobDescriptionVersion.objects.get(job_description=jd)
    assert version.version == 1
    assert version.change_summary == "Created"
    assert version.created_by == rahul
    assert set(version.snapshot) == set(CONTENT_FIELDS)
    assert version.snapshot == JobService.snapshot(jd)
    assert version.snapshot["title"] == "Senior Python Developer"
    assert version.snapshot["required_skills"] == ["python", "django", "postgresql"]


def test_create_normalises_skills(rahul):
    jd = JobService.create(
        jd_payload(
            required_skills=["Python 3", "Postgres", "python", " Django "],
            preferred_skills=["ReactJS", "k8s", "postgres"],
        ),
        [],
        rahul,
    )

    assert jd.required_skills == ["python", "postgresql", "django"]
    # A skill listed as required is dropped from preferred.
    assert jd.preferred_skills == ["react", "kubernetes"]


def test_create_as_open_sets_published_at(rahul):
    before = timezone.now()

    jd = JobService.create(jd_payload(status=JDStatus.OPEN), [], rahul)

    assert jd.status == JDStatus.OPEN
    assert jd.published_at is not None and jd.published_at >= before


def test_create_records_created_and_one_participant_added_activity(rahul, priya, arun):
    jd = JobService.create(
        jd_payload(),
        [
            {"user": priya, "role_in_recruitment": PR.RECRUITER},
            {"user": arun, "role_in_recruitment": PR.HIRING_MANAGER},
        ],
        rahul,
    )

    created, added = activities_of(jd)
    assert created.event_type == "jd.created"
    assert created.category == AC.JOB_DESCRIPTION
    assert created.actor == rahul
    assert created.title == 'Rahul Venkat created the job description "Senior Python Developer"'
    assert created.metadata == {"version": 1, "status": "draft"}

    assert added.event_type == "jd.participant_added"
    assert added.category == AC.JOB_DESCRIPTION
    assert added.actor == rahul
    assert (
        added.title == "Rahul Venkat added Priya Sharma (Recruiter) and "
        "Arun Kumar (Hiring Manager) to the recruitment"
    )
    assert added.metadata == {
        "participants": [
            {"user_id": str(priya.id), "name": "Priya Sharma", "role": "recruiter"},
            {"user_id": str(arun.id), "name": "Arun Kumar", "role": "hiring_manager"},
        ]
    }


def test_create_without_other_people_records_only_created(rahul):
    jd = JobService.create(jd_payload(), [], rahul)

    assert [a.event_type for a in activities_of(jd)] == ["jd.created"]


# -------------------------------------------------------------------- update


@pytest.fixture
def jd(rahul, priya):
    return JobService.create(
        jd_payload(status=JDStatus.OPEN),
        [{"user": priya, "role_in_recruitment": PR.RECRUITER}],
        rahul,
    )


def test_update_with_no_content_change_writes_nothing(jd, priya):
    same = {"title": jd.title, "required_skills": ["Postgres", "python", "Django"], "openings": 1}

    result = JobService.update(jd, same, priya, change_summary="nothing")

    assert result.current_version == 1
    assert JobDescriptionVersion.objects.filter(job_description=jd).count() == 1
    assert not activities_of(jd, "jd.updated").exists()
    jd.refresh_from_db()
    assert jd.updated_by is not None and jd.updated_by.id != priya.id
    assert jd.required_skills == ["python", "django", "postgresql"]


def test_update_with_content_change_writes_the_next_version(jd, priya):
    result = JobService.update(
        jd,
        {"title": "Lead Python Developer", "experience_max_years": 10, "openings": 1},
        priya,
        change_summary="Raised experience to 4–10 yrs",
    )

    assert result.title == "Lead Python Developer"
    assert result.experience_max_years == 10
    assert result.current_version == 2
    assert result.updated_by == priya
    version = JobDescriptionVersion.objects.get(job_description=jd, version=2)
    assert version.change_summary == "Raised experience to 4–10 yrs"
    assert version.created_by == priya
    assert version.snapshot["title"] == "Lead Python Developer"
    assert version.snapshot["experience_max_years"] == 10
    assert version.snapshot["required_skills"] == ["python", "django", "postgresql"]

    activity = activities_of(jd, "jd.updated").get()
    assert activity.category == AC.JOB_DESCRIPTION
    assert activity.actor == priya
    assert activity.title == "Priya Sharma updated the job description (v2)"
    assert activity.description == "Raised experience to 4–10 yrs"
    assert activity.metadata == {
        "changed_fields": ["title", "experience_max_years"],
        "version": 2,
        "change_summary": "Raised experience to 4–10 yrs",
    }


def test_changed_fields_follow_the_content_field_order(jd, rahul):
    JobService.update(
        jd,
        {"openings": 3, "description": "New body", "department": "Platform"},
        rahul,
    )

    activity = activities_of(jd, "jd.updated").get()
    assert activity.metadata["changed_fields"] == ["department", "description", "openings"]


def test_update_ignores_non_content_keys_and_generates_a_summary(jd, rahul):
    JobService.update(
        jd, {"location": "Bengaluru", "status": "closed", "current_version": 99, "id": "x"}, rahul
    )

    jd.refresh_from_db()
    assert jd.location == "Bengaluru"
    assert jd.status == JDStatus.OPEN
    assert jd.current_version == 2
    assert JobDescriptionVersion.objects.get(job_description=jd, version=2).change_summary == (
        "Updated location"
    )


def test_update_versions_stack_up(jd, rahul, priya):
    JobService.update(jd, {"title": "A"}, rahul)
    JobService.update(jd, {"title": "B"}, priya)
    JobService.update(jd, {"title": "B"}, priya)

    jd.refresh_from_db()
    assert jd.current_version == 3
    assert list(
        JobDescriptionVersion.objects.filter(job_description=jd).values_list("version", flat=True)
    ) == [3, 2, 1]


def test_update_syncs_participants_when_given(jd, rahul, priya, arun, divya):
    JobService.update(
        jd,
        {
            "participants": [
                {"user": arun, "role_in_recruitment": PR.HIRING_MANAGER},
                {"user": divya, "role_in_recruitment": PR.INTERVIEWER},
            ]
        },
        rahul,
    )

    # Creator stays owner; Priya was dropped; Arun and Divya were added.
    assert participants_of(jd) == [
        ("Rahul", PR.OWNER),
        ("Arun", PR.HIRING_MANAGER),
        ("Divya", PR.INTERVIEWER),
    ]
    assert jd.current_version == 1
    events = [a.event_type for a in activities_of(jd)]
    assert events == [
        "jd.created",
        "jd.participant_added",
        "jd.participant_added",
        "jd.participant_removed",
    ]
    removed = activities_of(jd, "jd.participant_removed").get()
    assert removed.title == "Rahul Venkat removed Priya Sharma from the recruitment"

    # A role change during a sync is recorded too.
    JobService.update(
        jd,
        {
            "participants": [
                {"user": arun, "role_in_recruitment": PR.INTERVIEWER},
                {"user": divya, "role_in_recruitment": PR.INTERVIEWER},
            ]
        },
        rahul,
    )
    assert participants_of(jd)[1] == ("Arun", PR.INTERVIEWER)
    updated = activities_of(jd, "jd.participant_updated").get()
    assert updated.title == "Rahul Venkat changed Arun Kumar's role to Interviewer"
    assert updated.metadata == {
        "user_id": str(arun.id),
        "name": "Arun Kumar",
        "from": "hiring_manager",
        "to": "interviewer",
    }


# ------------------------------------------------------------ status changes


def test_publish_moves_draft_to_open(rahul):
    jd = JobService.create(jd_payload(), [], rahul)

    result = JobService.publish(jd, rahul)

    assert result.status == JDStatus.OPEN
    assert result.published_at is not None
    activity = activities_of(jd, "jd.published").get()
    assert activity.category == AC.JOB_DESCRIPTION
    assert activity.title == 'Rahul Venkat published the job description "Senior Python Developer"'
    assert activity.metadata == {"from": "draft", "to": "open"}


def test_publish_requires_a_draft(jd, rahul):
    with pytest.raises(InvalidStatusTransition):
        JobService.publish(jd, rahul)


@pytest.mark.parametrize(
    ("start", "target"),
    [
        (JDStatus.OPEN, JDStatus.ON_HOLD),
        (JDStatus.OPEN, JDStatus.CLOSED),
        (JDStatus.ON_HOLD, JDStatus.OPEN),
        (JDStatus.ON_HOLD, JDStatus.CLOSED),
        (JDStatus.CLOSED, JDStatus.OPEN),
    ],
)
def test_set_status_allowed_moves(rahul, start, target):
    jd = make_jd(rahul, status=start)

    result = JobService.set_status(jd, target, rahul, note="because")

    assert result.status == target
    assert result.updated_by == rahul
    activity = activities_of(jd, "jd.status_changed").get()
    assert activity.category == AC.JOB_DESCRIPTION
    assert activity.metadata == {"from": start, "to": target, "note": "because"}
    assert activity.description == "because"
    assert activity.title == (
        f"Rahul Venkat changed the status from {JDStatus(start).label} to {JDStatus(target).label}"
    )


@pytest.mark.parametrize(
    ("start", "target"),
    [
        (JDStatus.OPEN, JDStatus.OPEN),
        (JDStatus.DRAFT, JDStatus.ON_HOLD),
        (JDStatus.DRAFT, JDStatus.CLOSED),
        (JDStatus.ARCHIVED, JDStatus.OPEN),
        (JDStatus.ARCHIVED, JDStatus.CLOSED),
        (JDStatus.OPEN, JDStatus.DRAFT),
        (JDStatus.CLOSED, JDStatus.ON_HOLD),
        (JDStatus.OPEN, "made_up"),
    ],
)
def test_set_status_refused_moves(rahul, start, target):
    jd = make_jd(rahul, status=start)

    with pytest.raises(InvalidStatusTransition):
        JobService.set_status(jd, target, rahul)

    jd.refresh_from_db()
    assert jd.status == start
    assert not activities_of(jd).exists()


def test_set_status_open_on_a_draft_publishes(rahul):
    jd = JobService.create(jd_payload(), [], rahul)

    JobService.set_status(jd, JDStatus.OPEN, rahul)

    jd.refresh_from_db()
    assert jd.status == JDStatus.OPEN and jd.published_at is not None
    assert activities_of(jd, "jd.published").exists()
    assert not activities_of(jd, "jd.status_changed").exists()


def test_set_status_archived_delegates_to_archive(jd, rahul):
    JobService.set_status(jd, JDStatus.ARCHIVED, rahul)

    jd.refresh_from_db()
    assert jd.status == JDStatus.ARCHIVED
    assert activities_of(jd, "jd.archived").exists()


def test_archive_and_unarchive(jd, rahul):
    published_at = jd.published_at

    JobService.archive(jd, rahul)
    jd.refresh_from_db()
    assert jd.status == JDStatus.ARCHIVED
    archived = activities_of(jd, "jd.archived").get()
    assert archived.title == 'Rahul Venkat archived the job description "Senior Python Developer"'
    assert archived.metadata == {"from": "open", "to": "archived"}
    with pytest.raises(InvalidStatusTransition):
        JobService.archive(jd, rahul)

    JobService.unarchive(jd, rahul)
    jd.refresh_from_db()
    assert jd.status == JDStatus.OPEN
    assert jd.published_at == published_at
    restored = activities_of(jd, "jd.status_changed").get()
    assert restored.metadata == {"from": "archived", "to": "open", "note": ""}
    with pytest.raises(InvalidStatusTransition):
        JobService.unarchive(jd, rahul)


def test_unarchive_restores_a_never_published_jd_to_draft(rahul):
    jd = JobService.create(jd_payload(), [], rahul)
    JobService.archive(jd, rahul)

    JobService.unarchive(jd, rahul)

    jd.refresh_from_db()
    assert jd.status == JDStatus.DRAFT


# ----------------------------------------------------------------- duplicate


def test_duplicate_creates_a_draft_copy_with_participants(jd, rahul, priya, arun):
    add_participant(jd, arun, PR.HIRING_MANAGER)
    JobService.update(jd, {"title": "Senior Python Developer II"}, rahul)

    copy = JobService.duplicate(jd, priya)

    assert copy.pk != jd.pk
    assert copy.title == "Copy of Senior Python Developer II"
    assert copy.status == JDStatus.DRAFT
    assert copy.published_at is None
    assert copy.current_version == 1
    assert copy.created_by == priya and copy.updated_by == priya
    for name in CONTENT_FIELDS:
        if name != "title":
            assert getattr(copy, name) == getattr(jd, name), name
    # The duplicating user becomes owner (first), the others keep their roles.
    assert participants_of(copy) == [
        ("Priya", PR.OWNER),
        ("Rahul", PR.OWNER),
        ("Arun", PR.HIRING_MANAGER),
    ]
    version = JobDescriptionVersion.objects.get(job_description=copy)
    assert version.version == 1
    assert version.change_summary == 'Duplicated from "Senior Python Developer II"'
    assert version.snapshot == JobService.snapshot(copy)

    events = list(activities_of(copy))
    assert [a.event_type for a in events] == ["jd.duplicated", "jd.participant_added"]
    assert events[0].category == AC.JOB_DESCRIPTION
    assert events[0].actor == priya
    assert events[0].title == (
        'Priya Sharma duplicated "Senior Python Developer II" as '
        '"Copy of Senior Python Developer II"'
    )
    assert events[0].metadata == {
        "source_id": str(jd.id),
        "source_title": "Senior Python Developer II",
        "version": 1,
    }
    # The source is untouched.
    jd.refresh_from_db()
    assert jd.title == "Senior Python Developer II"
    assert jd.current_version == 2
    assert not activities_of(jd, "jd.duplicated").exists()


# -------------------------------------------------------------------- delete


def test_delete_requires_confirmation(jd, rahul):
    with pytest.raises(ConfirmationRequired):
        JobService.delete(jd, rahul, confirm=False)

    assert JobDescription.objects.filter(pk=jd.pk).exists()


def test_delete_with_confirmation_cascades(jd, rahul):
    make_application(jd, AS.NEW)

    JobService.delete(jd, rahul, confirm=True)

    assert not JobDescription.objects.filter(pk=jd.pk).exists()
    assert not RecruitmentParticipant.objects.filter(job_description_id=jd.pk).exists()
    assert not JobDescriptionVersion.objects.filter(job_description_id=jd.pk).exists()
    assert not Activity.objects.filter(job_description_id=jd.pk).exists()


# -------------------------------------------------------------- participants


def test_add_participant(jd, rahul, arun):
    row = JobService.add_participant(jd, arun, PR.HIRING_MANAGER, rahul)

    assert row.job_description == jd and row.user == arun
    assert row.role_in_recruitment == PR.HIRING_MANAGER
    assert row.added_by == rahul
    activity = activities_of(jd, "jd.participant_added").last()
    assert activity.title == "Rahul Venkat added Arun Kumar (Hiring Manager) to the recruitment"
    assert activity.metadata["participants"] == [
        {"user_id": str(arun.id), "name": "Arun Kumar", "role": "hiring_manager"}
    ]


def test_add_participant_twice_is_a_conflict(jd, rahul, priya):
    with pytest.raises(ParticipantExists):
        JobService.add_participant(jd, priya, PR.OBSERVER, rahul)

    assert jd.participants.filter(user=priya).get().role_in_recruitment == PR.RECRUITER


def test_update_participant_role(jd, rahul, priya):
    participant = jd.participants.get(user=priya)

    row = JobService.update_participant(participant, PR.HIRING_MANAGER, rahul)

    assert row.role_in_recruitment == PR.HIRING_MANAGER
    activity = activities_of(jd, "jd.participant_updated").get()
    assert activity.title == "Rahul Venkat changed Priya Sharma's role to Hiring Manager"
    assert activity.metadata == {
        "user_id": str(priya.id),
        "name": "Priya Sharma",
        "from": "recruiter",
        "to": "hiring_manager",
    }
    # Same role again: nothing recorded.
    JobService.update_participant(row, PR.HIRING_MANAGER, rahul)
    assert activities_of(jd, "jd.participant_updated").count() == 1


def test_creator_keeps_the_owner_role_and_cannot_be_removed(jd, rahul, priya):
    owner = jd.participants.get(user=rahul)

    with pytest.raises(CreatorProtected):
        JobService.update_participant(owner, PR.OBSERVER, priya)
    with pytest.raises(CreatorProtected):
        JobService.remove_participant(owner, priya)

    owner.refresh_from_db()
    assert owner.role_in_recruitment == PR.OWNER


def test_remove_participant(jd, rahul, priya):
    participant = jd.participants.get(user=priya)

    JobService.remove_participant(participant, rahul)

    assert not jd.participants.filter(user=priya).exists()
    activity = activities_of(jd, "jd.participant_removed").get()
    assert activity.category == AC.JOB_DESCRIPTION
    assert activity.title == "Rahul Venkat removed Priya Sharma from the recruitment"
    assert activity.metadata == {
        "participants": [{"user_id": str(priya.id), "name": "Priya Sharma", "role": "recruiter"}]
    }


# ------------------------------------------------------------------- metrics

METRIC_KEYS = [
    "total_found",
    "shortlisted",
    "contacted",
    "in_interview",
    "selected",
    "rejected",
    "offers_pending",
    "onboarded",
]


def test_metrics_are_zero_for_an_empty_jd(jd):
    assert JobService.metrics(jd) == dict.fromkeys(METRIC_KEYS, 0)


def test_metrics_count_the_pipeline(jd, django_assert_num_queries):
    for status in (AS.NEW, AS.NEW, AS.AI_SHORTLISTED, AS.HR_REVIEW, AS.CONTACT_PENDING):
        make_application(jd, status)
    make_application(jd, AS.CONTACTED)
    make_application(jd, AS.PHONE_SCREENING)
    make_application(jd, AS.INTERVIEW_SCHEDULED)
    make_application(jd, AS.TECHNICAL_INTERVIEW)
    make_application(jd, AS.FINAL_INTERVIEW)
    selected = make_application(jd, AS.SELECTED)
    make_offer(selected, OfferStatus.DRAFT)
    sent = make_application(jd, AS.OFFER_SENT)
    make_offer(sent, OfferStatus.SENT)
    accepted = make_application(jd, AS.OFFER_ACCEPTED)
    make_offer(accepted, OfferStatus.ACCEPTED)
    make_application(jd, AS.ONBOARDING)
    make_application(jd, AS.ONBOARDED)
    make_application(jd, AS.REJECTED)
    make_application(jd, AS.REJECTED)
    make_application(jd, AS.WITHDRAWN)
    make_application(jd, AS.ON_HOLD)

    with django_assert_num_queries(1):
        metrics = JobService.metrics(jd)

    assert metrics == {
        "total_found": 19,
        # everything past "new" that is still on the board
        "shortlisted": 13,
        # contacted onwards (contact_pending is not yet contacted)
        "contacted": 10,
        # currently in one of the four interview statuses
        "in_interview": 3,
        # selected onwards
        "selected": 5,
        "rejected": 2,
        # draft + sent offers; the accepted one is no longer pending
        "offers_pending": 2,
        "onboarded": 1,
    }


def test_metrics_only_look_at_the_given_jd(jd, rahul):
    other = make_jd(rahul)
    make_application(other, AS.SELECTED)
    make_application(jd, AS.NEW)

    assert JobService.metrics(jd)["total_found"] == 1
    assert JobService.metrics(jd)["selected"] == 0
    assert JobService.metrics(other)["selected"] == 1


# ------------------------------------------------------------ list queryset


def test_list_queryset_is_scoped_and_annotated(rahul, priya, arun, user_factory):
    mine = make_jd(priya, title="Mine")
    joined = make_jd(rahul, title="Joined")
    add_participant(joined, priya, PR.RECRUITER)
    add_participant(joined, arun, PR.INTERVIEWER)
    hidden = make_jd(rahul, title="Hidden")
    for status in (
        AS.NEW,
        AS.AI_SHORTLISTED,
        AS.HR_INTERVIEW,
        AS.SELECTED,
        AS.ONBOARDED,
        AS.REJECTED,
    ):
        make_application(joined, status)

    admin_rows = {jd.title for jd in JobService.list_queryset(rahul)}
    assert admin_rows == {"Mine", "Joined", "Hidden"}
    assert {jd.title for jd in JobService.list_queryset(priya)} == {"Mine", "Joined"}
    assert {jd.title for jd in JobService.list_queryset(arun)} == {"Joined"}
    assert list(JobService.list_queryset(user_factory(role=UR.EMPLOYEE))) == []
    assert list(JobService.list_queryset(None)) == []

    row = JobService.list_queryset(priya).get(pk=joined.pk)
    # Three participants must not multiply the counts.
    assert row.count_candidates == 6
    assert row.count_shortlisted == 4
    assert row.count_interviewed == 3
    assert row.count_selected == 2
    assert row.count_onboarded == 1
    assert JobService.list_queryset(priya).get(pk=mine.pk).count_candidates == 0
    assert JobService.list_queryset(rahul).get(pk=hidden.pk).count_candidates == 0


def test_list_queryset_defaults_to_most_recently_updated_first(rahul):
    older = make_jd(rahul, title="Older")
    newer = make_jd(rahul, title="Newer")
    JobService.update(older, {"title": "Older, touched"}, rahul)

    assert [jd.pk for jd in JobService.list_queryset(rahul)] == [older.pk, newer.pk]


# ------------------------------------------------------------------- skills


def test_search_skills_unions_candidate_and_jd_skills(rahul):
    make_jd(rahul, required_skills=["python", "django"], preferred_skills=["aws"])
    make_jd(rahul, required_skills=["python"], preferred_skills=["pytorch"])
    for _index in range(3):
        CandidateSkill.objects.create(
            candidate=make_candidate(), skill="python", display_name="Python", proficiency=4
        )
    CandidateSkill.objects.create(
        candidate=make_candidate(), skill="postgresql", display_name="PostgreSQL", proficiency=3
    )

    rows = services.search_skills("py")

    assert rows == [
        {"key": "python", "display_name": "Python", "count": 5},
        {"key": "pytorch", "display_name": "PyTorch", "count": 1},
    ]
    assert services.search_skills("postgres") == [
        {"key": "postgresql", "display_name": "PostgreSQL", "count": 1}
    ]
    # Synonyms go through the normaliser: "k8s" finds kubernetes, "js" javascript.
    make_jd(rahul, required_skills=["kubernetes", "javascript"])
    assert [r["key"] for r in services.search_skills("k8s")] == ["kubernetes"]
    assert [r["key"] for r in services.search_skills("JS")] == ["javascript"]
    assert services.search_skills("zzz") == []


def test_search_skills_empty_query_returns_the_most_common_first_and_caps_at_twenty(rahul):
    make_jd(rahul, required_skills=[f"skill{n:02d}" for n in range(25)], preferred_skills=[])
    make_jd(rahul, required_skills=["skill07"], preferred_skills=[])

    rows = services.search_skills("")

    assert len(rows) == 20
    assert rows[0] == {"key": "skill07", "display_name": "Skill07", "count": 2}
    assert [r["key"] for r in rows[1:]] == sorted(r["key"] for r in rows[1:])
    assert services.search_skills("skill", limit=3) == [
        {"key": "skill07", "display_name": "Skill07", "count": 2},
        {"key": "skill00", "display_name": "Skill00", "count": 1},
        {"key": "skill01", "display_name": "Skill01", "count": 1},
    ]
