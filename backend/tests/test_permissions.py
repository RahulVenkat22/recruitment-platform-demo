"""common.permissions: the plan.md 6.9 role matrix as pure predicates, checked for
every row with each of the four roles and every relationship a user can have
with a JD (none, creator, participant with each participant role), plus the
DRF permission classes that wrap them."""

from __future__ import annotations

import pytest
from django.contrib.auth.models import AnonymousUser
from django.utils import timezone
from rest_framework.test import APIRequestFactory

from accounts.models import User
from candidates.models import Candidate
from common import enums, permissions
from common.enums import ParticipantRole as PR
from common.enums import UserRole as UR
from jobs.models import JobDescription, RecruitmentParticipant
from pipeline.models import Application, Interview

pytestmark = pytest.mark.django_db

ROLES = [UR.HR_ADMIN, UR.HR, UR.INTERVIEWER, UR.EMPLOYEE]
# How the user under test relates to the JD.
RELATIONS = ["none", "creator", *PR.values]

factory = APIRequestFactory()


# --------------------------------------------------------------- fixtures


@pytest.fixture
def somebody(user_factory) -> User:
    """A separate HR user who creates the JD unless the user under test is the creator."""
    return user_factory(role=UR.HR, first_name="Other", last_name="Creator")


def make_jd(creator: User) -> JobDescription:
    return JobDescription.objects.create(
        title="Senior Python Developer",
        department="Engineering",
        location="Chennai",
        work_mode=enums.WorkMode.HYBRID,
        employment_type=enums.EmploymentType.FULL_TIME,
        experience_min_years=4,
        experience_max_years=8,
        status=enums.JDStatus.OPEN,
        created_by=creator,
        updated_by=creator,
        published_at=timezone.now(),
    )


def build(user_factory, somebody, role: str, relation: str) -> tuple[User, JobDescription]:
    user = user_factory(role=role)
    if relation == "creator":
        jd = make_jd(user)
    else:
        jd = make_jd(somebody)
    if relation in PR.values:
        RecruitmentParticipant.objects.create(
            job_description=jd, user=user, role_in_recruitment=relation, added_by=somebody
        )
    return user, jd


# ------------------------------------------------------------ expectations
# One function per matrix row; each returns the expected verdict for (role, relation).


def expect_view(role, relation):
    return role == UR.HR_ADMIN or relation != "none"


def expect_create(role, relation):
    return role in (UR.HR_ADMIN, UR.HR)


def expect_edit(role, relation):
    # "Edit, archive, duplicate JD": hr_admin; hr when creator or owner-role participant.
    if role == UR.HR_ADMIN:
        return True
    return role == UR.HR and relation in ("creator", PR.OWNER)


def expect_delete(role, relation):
    if role == UR.HR_ADMIN:
        return True
    return role == UR.HR and relation == "creator"


def expect_pipeline(role, relation):
    # "Run candidate search, transition status, log contact, schedule interview": hr participant.
    if role == UR.HR_ADMIN:
        return True
    return role == UR.HR and relation != "none"


def expect_manage(role, relation):
    # "Manage offers and onboarding": hr participant with recruiter or owner role (or creator).
    if role == UR.HR_ADMIN:
        return True
    return role == UR.HR and relation in ("creator", PR.OWNER, PR.RECRUITER)


MATRIX = {
    "can_view_job": expect_view,
    "can_edit_job": expect_edit,
    "can_archive_job": expect_edit,
    "can_duplicate_job": expect_edit,
    "can_manage_participants": expect_edit,
    "can_delete_job": expect_delete,
    "can_run_search": expect_pipeline,
    "can_transition_application": expect_pipeline,
    "can_log_contact": expect_pipeline,
    "can_schedule_interview": expect_pipeline,
    "can_manage_job": expect_manage,
    "can_manage_offers": expect_manage,
    "can_manage_onboarding": expect_manage,
}


@pytest.mark.parametrize("predicate", sorted(MATRIX))
@pytest.mark.parametrize("relation", RELATIONS)
@pytest.mark.parametrize("role", ROLES)
def test_object_predicates_follow_the_matrix(user_factory, somebody, role, relation, predicate):
    user, jd = build(user_factory, somebody, role, relation)

    assert getattr(permissions, predicate)(user, jd) is MATRIX[predicate](role, relation)


@pytest.mark.parametrize("role", ROLES)
def test_can_create_job(user_factory, role):
    assert permissions.can_create_job(user_factory(role=role)) is expect_create(role, "none")


@pytest.mark.parametrize(
    ("role", "expected"),
    [(UR.HR_ADMIN, True), (UR.HR, True), (UR.INTERVIEWER, False), (UR.EMPLOYEE, False)],
)
def test_candidate_contact_visibility_and_dashboard_scope(user_factory, role, expected):
    user = user_factory(role=role)

    assert permissions.can_view_candidate_contact(user) is expected
    assert permissions.has_full_dashboard(user) is (role == UR.HR_ADMIN)


def test_role_helpers(user_factory):
    admin = user_factory(role=UR.HR_ADMIN)
    hr = user_factory(role=UR.HR)
    interviewer = user_factory(role=UR.INTERVIEWER)
    employee = user_factory(role=UR.EMPLOYEE)

    assert permissions.is_hr_admin(admin) and not permissions.is_hr_admin(hr)
    assert permissions.is_hr(hr) and not permissions.is_hr(admin)
    assert permissions.is_hr_staff(admin) and permissions.is_hr_staff(hr)
    assert not permissions.is_hr_staff(interviewer) and not permissions.is_hr_staff(employee)
    assert permissions.is_interviewer(interviewer) and not permissions.is_interviewer(hr)
    assert permissions.is_employee(employee) and not permissions.is_employee(interviewer)
    assert permissions.role_of(admin) == "hr_admin"
    assert permissions.role_of(AnonymousUser()) is None
    assert permissions.role_of(None) is None


def test_anonymous_and_none_users_get_nothing(user_factory, somebody):
    jd = make_jd(somebody)

    for user in (AnonymousUser(), None):
        assert not permissions.can_view_job(user, jd)
        assert not permissions.can_create_job(user)
        assert not permissions.can_edit_job(user, jd)
        assert not permissions.can_delete_job(user, jd)
        assert not permissions.can_run_search(user, jd)
        assert not permissions.can_manage_job(user, jd)
        assert not permissions.can_view_candidate_contact(user)
        assert not permissions.visible_job_descriptions_for(user).exists()


# ------------------------------------------------------- interview feedback


@pytest.fixture
def interview(user_factory, somebody):
    jd = make_jd(somebody)
    candidate = Candidate.objects.create(
        full_name="John Doe",
        email="john.doe@example.com",
        phone="+91 98765 43210",
        location="Chennai",
        headline="Backend Engineer",
        current_company="Zoho",
        current_title="Engineer",
        total_experience_years=5,
        summary="",
        resume_text="",
    )
    application = Application.objects.create(candidate=candidate, job_description=jd)
    assigned = user_factory(role=UR.INTERVIEWER, first_name="Assigned")
    return Interview.objects.create(
        application=application,
        round=enums.InterviewRound.TECHNICAL,
        interviewer=assigned,
        scheduled_at=timezone.now(),
        created_by=somebody,
    )


def test_submit_feedback_matrix(user_factory, interview, somebody):
    jd = interview.application.job_description
    admin = user_factory(role=UR.HR_ADMIN)
    hr_outsider = user_factory(role=UR.HR)
    hr_participant = user_factory(role=UR.HR)
    RecruitmentParticipant.objects.create(
        job_description=jd, user=hr_participant, role_in_recruitment=PR.RECRUITER
    )
    other_interviewer = user_factory(role=UR.INTERVIEWER)
    RecruitmentParticipant.objects.create(
        job_description=jd, user=other_interviewer, role_in_recruitment=PR.INTERVIEWER
    )
    employee = user_factory(role=UR.EMPLOYEE)
    RecruitmentParticipant.objects.create(
        job_description=jd, user=employee, role_in_recruitment=PR.OBSERVER
    )

    assert permissions.can_submit_feedback(admin, interview)
    assert permissions.can_submit_feedback(somebody, interview)  # hr creator of the JD
    assert permissions.can_submit_feedback(hr_participant, interview)
    assert not permissions.can_submit_feedback(hr_outsider, interview)
    assert permissions.can_submit_feedback(interview.interviewer, interview)
    assert not permissions.can_submit_feedback(other_interviewer, interview)
    assert not permissions.can_submit_feedback(employee, interview)
    assert not permissions.can_submit_feedback(AnonymousUser(), interview)


# ----------------------------------------------------------- visibility


def test_visible_job_descriptions_for_each_role(user_factory, somebody):
    mine = make_jd(somebody)
    other = make_jd(user_factory(role=UR.HR))
    joined = make_jd(user_factory(role=UR.HR))
    admin = user_factory(role=UR.HR_ADMIN)
    interviewer = user_factory(role=UR.INTERVIEWER)
    RecruitmentParticipant.objects.create(
        job_description=joined, user=somebody, role_in_recruitment=PR.RECRUITER
    )
    RecruitmentParticipant.objects.create(
        job_description=joined, user=interviewer, role_in_recruitment=PR.INTERVIEWER
    )
    RecruitmentParticipant.objects.create(
        job_description=mine, user=interviewer, role_in_recruitment=PR.INTERVIEWER
    )

    assert set(permissions.visible_job_descriptions_for(admin)) == {mine, other, joined}
    assert set(permissions.visible_job_descriptions_for(somebody)) == {mine, joined}
    assert set(permissions.visible_job_descriptions_for(interviewer)) == {mine, joined}
    assert set(permissions.visible_job_descriptions_for(user_factory(role=UR.EMPLOYEE))) == set()
    # No duplicate rows when a user is both creator and participant.
    RecruitmentParticipant.objects.create(
        job_description=mine, user=somebody, role_in_recruitment=PR.OWNER
    )
    assert list(permissions.visible_job_descriptions_for(somebody)).count(mine) == 1


def test_participant_role_uses_prefetched_rows_without_extra_queries(
    user_factory, somebody, django_assert_num_queries
):
    jd = make_jd(somebody)
    user = user_factory(role=UR.HR)
    RecruitmentParticipant.objects.create(
        job_description=jd, user=user, role_in_recruitment=PR.RECRUITER
    )
    prefetched = JobDescription.objects.prefetch_related("participants").get(pk=jd.pk)

    with django_assert_num_queries(0):
        assert permissions.participant_role(user, prefetched) == PR.RECRUITER
        assert permissions.participant_role(somebody, prefetched) is None
    with django_assert_num_queries(1):
        assert permissions.participant_role(user, jd) == PR.RECRUITER


def test_job_description_of_walks_related_objects(interview):
    jd = interview.application.job_description

    assert permissions.job_description_of(jd) is jd
    assert permissions.job_description_of(interview.application) == jd
    assert permissions.job_description_of(interview) == jd
    assert permissions.job_description_of(object()) is None


# --------------------------------------------------------- DRF classes


def _request(user, method="get"):
    request = getattr(factory, method)("/x/")
    request.user = user if user is not None else AnonymousUser()
    return request


@pytest.mark.parametrize(
    ("klass", "allowed_roles"),
    [
        (permissions.IsHrAdmin, {UR.HR_ADMIN}),
        (permissions.IsHrStaff, {UR.HR_ADMIN, UR.HR}),
        (permissions.IsInterviewer, {UR.INTERVIEWER}),
        (permissions.CanCreateJob, {UR.HR_ADMIN, UR.HR}),
    ],
)
@pytest.mark.parametrize("role", ROLES)
def test_role_permission_classes(user_factory, klass, allowed_roles, role):
    user = user_factory(role=role)

    assert klass().has_permission(_request(user), None) is (role in allowed_roles)
    assert klass().has_permission(_request(None), None) is False


@pytest.mark.parametrize(
    ("klass", "predicate"),
    [
        (permissions.CanViewJob, "can_view_job"),
        (permissions.CanEditJob, "can_edit_job"),
        (permissions.CanDeleteJob, "can_delete_job"),
        (permissions.CanManageJob, "can_manage_job"),
        (permissions.CanWorkPipeline, "can_run_search"),
    ],
)
@pytest.mark.parametrize("relation", ["none", "creator", PR.OWNER, PR.RECRUITER, PR.INTERVIEWER])
@pytest.mark.parametrize("role", ROLES)
def test_object_permission_classes_call_the_predicates(
    user_factory, somebody, klass, predicate, role, relation
):
    user, jd = build(user_factory, somebody, role, relation)
    request = _request(user)

    assert klass().has_permission(request, None) is True
    assert klass().has_object_permission(request, None, jd) is getattr(permissions, predicate)(
        user, jd
    )
    assert klass().has_permission(_request(None), None) is False


def test_object_permission_classes_resolve_the_jd_from_related_objects(
    user_factory, somebody, interview
):
    admin = user_factory(role=UR.HR_ADMIN)
    employee = user_factory(role=UR.EMPLOYEE)

    assert permissions.CanWorkPipeline().has_object_permission(
        _request(admin), None, interview.application
    )
    assert permissions.CanWorkPipeline().has_object_permission(_request(admin), None, interview)
    assert not permissions.CanWorkPipeline().has_object_permission(
        _request(employee), None, interview
    )
    assert not permissions.CanWorkPipeline().has_object_permission(_request(admin), None, object())


def test_can_submit_feedback_permission_class(interview, user_factory):
    assigned = interview.interviewer
    stranger = user_factory(role=UR.INTERVIEWER)

    assert permissions.CanSubmitFeedback().has_object_permission(
        _request(assigned), None, interview
    )
    assert not permissions.CanSubmitFeedback().has_object_permission(
        _request(stranger), None, interview
    )


def test_job_description_access_maps_methods_to_predicates(user_factory, somebody):
    hr_creator, jd = build(user_factory, somebody, UR.HR, "creator")
    observer, _ = build(user_factory, somebody, UR.EMPLOYEE, PR.OBSERVER)
    RecruitmentParticipant.objects.create(
        job_description=jd, user=observer, role_in_recruitment=PR.OBSERVER
    )
    access = permissions.JobDescriptionAccess()

    assert access.has_permission(_request(observer, "get"), None)
    assert not access.has_permission(_request(observer, "post"), None)
    assert access.has_permission(_request(hr_creator, "post"), None)

    assert access.has_object_permission(_request(observer, "get"), None, jd)
    assert not access.has_object_permission(_request(observer, "patch"), None, jd)
    assert not access.has_object_permission(_request(observer, "delete"), None, jd)
    assert access.has_object_permission(_request(hr_creator, "patch"), None, jd)
    assert access.has_object_permission(_request(hr_creator, "delete"), None, jd)
