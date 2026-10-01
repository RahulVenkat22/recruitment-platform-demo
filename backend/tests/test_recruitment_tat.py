"""Elapsed recruitment time, including history gaps, bulk moves and returns."""

from datetime import UTC, datetime, timedelta

import pytest

from activity.models import Activity
from common.enums import ActivityCategory, JDStatus, UserRole
from common.enums import ApplicationStatus as AS
from pipeline.models import Application, Onboarding
from pipeline.services.pipeline import PipelineService
from pipeline.services.tat import application_tat, job_tat
from tests.test_jobs_support import make_application, make_jd

pytestmark = pytest.mark.django_db
START = datetime(2026, 9, 1, tzinfo=UTC)
DAY = 86400


def day(value):
    return START + timedelta(days=value)


@pytest.fixture
def recruiter(user_factory):
    return user_factory(role=UserRole.HR_ADMIN)


@pytest.fixture
def job(recruiter):
    return make_jd(recruiter, published_at=START)


def candidate(job, status=AS.NEW, entered=1):
    application = make_application(job, status, stage_entered_at=day(entered))
    Application.objects.filter(pk=application.pk).update(created_at=day(1))
    application.refresh_from_db()
    return application


def event(application, at, previous, target, *, bulk=False):
    metadata = {"from": previous, "to": target}
    if bulk:
        metadata = {"to": target, "application_ids": [str(application.pk)]}
    return Activity.objects.create(
        job_description=application.job_description,
        application=None if bulk else application,
        category=ActivityCategory.CANDIDATE_SHORTLISTED,
        event_type="application.status_changed",
        title="Status changed",
        metadata=metadata,
        occurred_at=day(at),
    )


def test_live_candidate_and_repeated_stage_visits_include_holds(job):
    app = candidate(job, AS.HR_REVIEW, entered=6)
    event(app, 2, AS.NEW, AS.HR_REVIEW)
    event(app, 4, AS.HR_REVIEW, AS.ON_HOLD)
    event(app, 6, AS.ON_HOLD, AS.HR_REVIEW)
    result = application_tat(app, now=day(8))
    assert result["elapsed_seconds"] == 7 * DAY
    assert result["job_elapsed_seconds"] == 8 * DAY
    assert result["on_hold_seconds"] == 2 * DAY
    assert result["finished_at"] is None
    assert result["history_complete"]
    assert [s["status"] for s in result["stages"]] == [
        AS.NEW,
        AS.HR_REVIEW,
        AS.ON_HOLD,
        AS.HR_REVIEW,
    ]
    assert [s["elapsed_seconds"] for s in result["stages"]] == [DAY, 2 * DAY, 2 * DAY, 2 * DAY]
    assert result["stages"][-1]["exited_at"] is None


def test_same_stage_activity_does_not_restart_the_clock(job):
    app = candidate(job, AS.HR_REVIEW, entered=2)
    event(app, 2, AS.NEW, AS.HR_REVIEW)
    event(app, 4, AS.HR_REVIEW, AS.HR_REVIEW)
    result = application_tat(app, now=day(5))
    assert len(result["stages"]) == 2
    assert result["stages"][-1]["elapsed_seconds"] == 3 * DAY


def test_bulk_history_is_included_and_scoped_to_application(job):
    app = candidate(job, AS.HR_REVIEW, entered=3)
    other = candidate(job, AS.SELECTED, entered=4)
    event(app, 2, AS.NEW, AS.AI_SHORTLISTED)
    event(app, 3, AS.AI_SHORTLISTED, AS.HR_REVIEW, bulk=True)
    event(other, 4, AS.NEW, AS.SELECTED, bulk=True)
    result = application_tat(app, now=day(5))
    assert result["history_complete"]
    assert [s["status"] for s in result["stages"]] == [AS.NEW, AS.AI_SHORTLISTED, AS.HR_REVIEW]


def test_bulk_service_records_each_previous_stage(job, recruiter):
    first = candidate(job)
    second = candidate(job, AS.AI_SHORTLISTED)
    PipelineService.bulk_transition(
        [first, second], AS.HR_REVIEW, recruiter, occurred_at=day(3), notify=False
    )
    for app, previous in [(first, AS.NEW), (second, AS.AI_SHORTLISTED)]:
        result = application_tat(app, now=day(4))
        assert result["history_complete"]
        assert result["stages"][0]["status"] == previous
        assert result["stages"][0]["elapsed_seconds"] == 2 * DAY


@pytest.mark.parametrize("status", [AS.ONBOARDED, AS.REJECTED, AS.WITHDRAWN])
def test_finished_applications_stop_growing(job, status):
    app = candidate(job, status, entered=4)
    event(app, 4, AS.NEW, status)
    result = application_tat(app, now=day(20))
    assert result["elapsed_seconds"] == 3 * DAY
    assert result["finished_at"] == day(4)
    assert result["stages"][-1]["elapsed_seconds"] == 0


def test_reopened_candidate_includes_time_while_rejected(job):
    app = candidate(job, AS.HR_REVIEW, entered=6)
    event(app, 3, AS.NEW, AS.REJECTED)
    event(app, 6, AS.REJECTED, AS.HR_REVIEW)
    result = application_tat(app, now=day(7))
    assert result["finished_at"] is None
    assert result["elapsed_seconds"] == 6 * DAY
    assert result["stages"][1]["elapsed_seconds"] == 3 * DAY


def test_missing_history_is_explicit_and_current_stage_is_still_measured(job):
    app = candidate(job, AS.SELECTED, entered=5)
    result = application_tat(app, now=day(7))
    assert not result["history_complete"]
    assert result["stages"][0]["status"] is None
    assert result["stages"][0]["elapsed_seconds"] == 4 * DAY
    assert result["stages"][1]["elapsed_seconds"] == 2 * DAY


def test_initial_candidate_needs_no_history(job):
    result = application_tat(candidate(job), now=day(3))
    assert result["history_complete"]
    assert len(result["stages"]) == 1
    assert result["stages"][0]["elapsed_seconds"] == 2 * DAY


def test_snapshot_event_does_not_override_earlier_current_stage_timestamp(job):
    app = candidate(job, AS.SELECTED, entered=5)
    Activity.objects.create(
        job_description=job,
        application=app,
        category=ActivityCategory.OFFER,
        event_type="offer.created",
        title="Offer drafted",
        occurred_at=day(6),
        metadata={"to": AS.SELECTED},
    )
    result = application_tat(app, now=day(8))
    assert result["stages"][-1]["entered_at"] == day(5)
    assert result["stages"][-1]["elapsed_seconds"] == 3 * DAY
    assert not result["history_complete"]


def test_job_tat_uses_publication_and_all_openings(job):
    job.openings = 2
    job.save(update_fields=["openings"])
    first = candidate(job, AS.ONBOARDED, entered=10)
    Onboarding.objects.create(application=first, start_date=day(8).date(), completed_at=day(9))
    result = job_tat(job, now=day(15))
    assert result["state"] == "in_progress"
    assert result["elapsed_seconds"] == 15 * DAY
    assert result["first_hire_seconds"] == 9 * DAY
    assert result["hires"] == 1
    candidate(job, AS.ONBOARDED, entered=12)
    result = job_tat(job, now=day(20))
    assert result["state"] == "filled"
    assert result["elapsed_seconds"] == result["filled_seconds"] == 12 * DAY
    assert result["average_hire_seconds"] == 10.5 * DAY
    assert result["hires"] == 2


def test_unpublished_job_has_no_elapsed_time(job):
    job.published_at = None
    job.status = JDStatus.DRAFT
    result = job_tat(job, now=day(20))
    assert result["state"] == "not_started"
    assert result["elapsed_seconds"] is None


def test_closed_job_does_not_count_as_a_hire_or_keep_ticking(job):
    job.status = JDStatus.FORCE_CLOSED
    job.save(update_fields=["status"])
    Activity.objects.create(
        job_description=job,
        category=ActivityCategory.JOB_DESCRIPTION,
        event_type="jd.force_closed",
        title="Closed",
        occurred_at=day(5),
        metadata={"from": JDStatus.OPEN, "to": JDStatus.FORCE_CLOSED},
    )
    result = job_tat(job, now=day(20))
    assert result["state"] == "closed"
    assert result["elapsed_seconds"] == 5 * DAY
    assert result["first_hire_seconds"] is None
    assert result["hires"] == 0


def test_closed_job_without_recorded_milestone_is_unknown(job):
    job.status = JDStatus.CLOSED
    assert job_tat(job, now=day(20))["elapsed_seconds"] is None


def test_archiving_after_closure_does_not_extend_the_clock(job):
    job.status = JDStatus.ARCHIVED
    for at, previous, target in [
        (4, JDStatus.OPEN, JDStatus.CLOSED),
        (7, JDStatus.CLOSED, JDStatus.OPEN),
        (9, JDStatus.OPEN, JDStatus.CLOSED),
        (12, JDStatus.CLOSED, JDStatus.ARCHIVED),
    ]:
        Activity.objects.create(
            job_description=job,
            category=ActivityCategory.JOB_DESCRIPTION,
            event_type="jd.status_changed",
            title="Changed",
            occurred_at=day(at),
            metadata={"from": previous, "to": target},
        )
    assert job_tat(job, now=day(20))["elapsed_seconds"] == 9 * DAY


def test_job_reopened_after_closure_uses_original_publication(job):
    Activity.objects.create(
        job_description=job,
        category=ActivityCategory.JOB_DESCRIPTION,
        event_type="jd.status_changed",
        title="Closed",
        occurred_at=day(5),
        metadata={"from": JDStatus.OPEN, "to": JDStatus.CLOSED},
    )
    assert job_tat(job, now=day(10))["elapsed_seconds"] == 10 * DAY


def test_detail_endpoints_include_tat_and_enforce_visibility(
    job, recruiter, api_client, user_factory
):
    app = candidate(job)
    api_client.force_authenticate(recruiter)
    response = api_client.get(f"/api/v1/job-descriptions/{job.pk}/")
    assert response.status_code == 200
    assert response.data["tat"]["started_at"] is not None
    response = api_client.get(f"/api/v1/applications/{app.pk}/")
    assert response.status_code == 200
    assert response.data["tat"]["stages"][0]["status"] == AS.NEW
    api_client.force_authenticate(user_factory(role=UserRole.EMPLOYEE))
    assert api_client.get(f"/api/v1/job-descriptions/{job.pk}/").status_code == 404
    assert api_client.get(f"/api/v1/applications/{app.pk}/").status_code == 404


def test_invalid_hire_dates_are_excluded(job):
    candidate(job, AS.ONBOARDED, entered=-1)
    candidate(job, AS.ONBOARDED, entered=30)
    result = job_tat(job, now=day(20))
    assert result["hires"] == 0
    assert result["average_hire_seconds"] is None
