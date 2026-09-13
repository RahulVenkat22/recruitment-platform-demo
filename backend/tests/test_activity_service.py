"""activity.services: the event type -> category map from plan.md 6.4 and
``record_activity()``, the only writer of timeline rows."""

from __future__ import annotations

from datetime import timedelta

import pytest
from django.utils import timezone

from activity import services
from activity.models import Activity
from activity.services import EVENT_TYPE_CATEGORY, InvalidActivity, record_activity
from candidates.models import Candidate
from common import enums
from common.enums import ActivityCategory as AC
from jobs.models import JobDescription
from pipeline.models import Application

pytestmark = pytest.mark.django_db

# plan.md 6.4 "Event types (event_type, grouped by category)", copied verbatim.
PLAN_EVENT_TYPES: dict[str, list[str]] = {
    AC.JOB_DESCRIPTION: [
        "jd.created",
        "jd.updated",
        "jd.published",
        "jd.status_changed",
        "jd.participant_added",
        "jd.participant_removed",
        "jd.duplicated",
        "jd.archived",
    ],
    AC.CANDIDATE_SEARCH: ["search.completed", "application.added_manually"],
    AC.CANDIDATE_SHORTLISTED: [
        "application.ai_shortlisted",
        "application.shortlisted",
        "application.status_changed",
    ],
    AC.CANDIDATE_CONTACT: ["communication.logged", "application.status_changed"],
    AC.INTERVIEW: [
        "interview.scheduled",
        "interview.rescheduled",
        "interview.cancelled",
        "application.status_changed",
    ],
    AC.INTERVIEW_FEEDBACK: ["interview.feedback_submitted"],
    AC.CANDIDATE_SELECTED: ["application.status_changed"],
    AC.OFFER: [
        "offer.created",
        "offer.sent",
        "offer.accepted",
        "offer.declined",
        "offer.withdrawn",
    ],
    AC.ONBOARDING: ["onboarding.started", "onboarding.checklist_updated", "onboarding.completed"],
    AC.DECISION: [
        "application.rejected",
        "application.withdrawn",
        "application.on_hold",
        "application.resumed",
    ],
}


# ------------------------------------------------------------------ the map


def test_plan_lists_all_ten_categories():
    assert set(PLAN_EVENT_TYPES) == set(AC.values)


@pytest.mark.parametrize(
    ("category", "event_type"),
    [(category, event) for category, events in PLAN_EVENT_TYPES.items() for event in events],
)
def test_every_plan_event_type_is_mapped_to_its_category(category, event_type):
    assert event_type in EVENT_TYPE_CATEGORY
    assert category in EVENT_TYPE_CATEGORY[event_type]


def test_map_values_are_real_categories():
    for event_type, categories in EVENT_TYPE_CATEGORY.items():
        assert "." in event_type
        assert categories, event_type
        assert categories <= set(AC.values), event_type


def test_status_changed_follows_the_status_entry_categories():
    # A status change is recorded under the entry category of the target status.
    assert EVENT_TYPE_CATEGORY["application.status_changed"] == frozenset(
        enums.STATUS_ENTRY_CATEGORY.values()
    )
    assert AC.JOB_DESCRIPTION not in EVENT_TYPE_CATEGORY["application.status_changed"]
    assert AC.INTERVIEW_FEEDBACK not in EVENT_TYPE_CATEGORY["application.status_changed"]


def test_single_category_event_types_map_to_exactly_one_category():
    for event_type, categories in EVENT_TYPE_CATEGORY.items():
        if event_type != "application.status_changed":
            assert len(categories) == 1, event_type


def test_event_types_for_category_lists_the_plan_rows():
    for category, events in PLAN_EVENT_TYPES.items():
        assert set(events) <= services.event_types_for(category)
    assert services.event_types_for("nope") == frozenset()


def test_category_for_returns_the_only_category_or_the_status_entry_one():
    assert services.category_for("jd.created") == AC.JOB_DESCRIPTION
    assert services.category_for("offer.sent") == AC.OFFER
    assert (
        services.category_for("application.status_changed", status=enums.ApplicationStatus.SELECTED)
        == AC.CANDIDATE_SELECTED
    )
    with pytest.raises(InvalidActivity):
        services.category_for("application.status_changed")
    with pytest.raises(InvalidActivity):
        services.category_for("made.up")


# --------------------------------------------------------- record_activity


@pytest.fixture
def hr(user_factory):
    return user_factory(first_name="Priya", last_name="Sharma", role=enums.UserRole.HR)


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
        created_by=hr,
    )


@pytest.fixture
def application(jd) -> Application:
    candidate = Candidate.objects.create(full_name="John Doe", email="john.doe@example.com")
    return Application.objects.create(candidate=candidate, job_description=jd)


def test_record_activity_persists_every_column(jd, hr):
    when = timezone.now() - timedelta(days=2)

    activity = record_activity(
        job_description=jd,
        category=AC.JOB_DESCRIPTION,
        event_type="jd.created",
        title="Priya Sharma created the job description",
        actor=hr,
        description="Senior Python Developer",
        metadata={"version": 1},
        occurred_at=when,
    )

    assert isinstance(activity, Activity)
    stored = Activity.objects.get(pk=activity.pk)
    assert stored.job_description == jd
    assert stored.category == AC.JOB_DESCRIPTION
    assert stored.event_type == "jd.created"
    assert stored.title == "Priya Sharma created the job description"
    assert stored.actor == hr
    assert stored.description == "Senior Python Developer"
    assert stored.metadata == {"version": 1}
    assert stored.occurred_at == when
    assert stored.application is None and stored.candidate is None


def test_defaults_are_system_actor_now_and_empty_metadata(jd):
    before = timezone.now()

    activity = record_activity(
        job_description=jd,
        category=AC.JOB_DESCRIPTION,
        event_type="jd.published",
        title="Published",
    )

    assert activity.actor is None
    assert activity.metadata == {}
    assert activity.description == ""
    assert before <= activity.occurred_at <= timezone.now()


def test_candidate_is_denormalised_from_the_application(application, hr):
    activity = record_activity(
        job_description=application.job_description,
        category=AC.CANDIDATE_CONTACT,
        event_type="communication.logged",
        title="Priya contacted John Doe",
        actor=hr,
        application=application,
    )

    assert activity.application == application
    assert activity.candidate == application.candidate


def test_explicit_candidate_wins_over_the_application(application):
    other = Candidate.objects.create(full_name="Jane Smith", email="jane@example.com")

    activity = record_activity(
        job_description=application.job_description,
        category=AC.CANDIDATE_SEARCH,
        event_type="application.added_manually",
        title="Added Jane",
        application=application,
        candidate=other,
    )

    assert activity.candidate == other


def test_status_changed_is_accepted_under_any_entry_category(application):
    for category in (AC.CANDIDATE_CONTACT, AC.INTERVIEW, AC.CANDIDATE_SELECTED, AC.DECISION):
        activity = record_activity(
            job_description=application.job_description,
            category=category,
            event_type="application.status_changed",
            title="moved",
            application=application,
        )
        assert activity.category == category


def test_event_type_must_belong_to_the_category(jd):
    with pytest.raises(InvalidActivity, match="jd.created"):
        record_activity(
            job_description=jd, category=AC.OFFER, event_type="jd.created", title="wrong"
        )
    with pytest.raises(InvalidActivity):
        record_activity(
            job_description=jd,
            category=AC.JOB_DESCRIPTION,
            event_type="application.status_changed",
            title="wrong",
        )
    assert Activity.objects.count() == 0


def test_unknown_event_type_and_category_are_rejected(jd):
    with pytest.raises(InvalidActivity, match="unknown event type"):
        record_activity(
            job_description=jd, category=AC.JOB_DESCRIPTION, event_type="jd.exploded", title="x"
        )
    with pytest.raises(InvalidActivity, match="unknown category"):
        record_activity(job_description=jd, category="nope", event_type="jd.created", title="x")


def test_title_is_required_and_long_titles_are_shortened(jd):
    with pytest.raises(InvalidActivity, match="title"):
        record_activity(
            job_description=jd, category=AC.JOB_DESCRIPTION, event_type="jd.created", title="  "
        )

    activity = record_activity(
        job_description=jd,
        category=AC.CANDIDATE_SHORTLISTED,
        event_type="application.shortlisted",
        title="Rahul shortlisted " + ", ".join(f"Candidate {n}" for n in range(60)),
    )

    assert len(activity.title) == 200
    assert activity.title.endswith("…")


def test_metadata_must_be_a_mapping(jd):
    with pytest.raises(InvalidActivity, match="metadata"):
        record_activity(
            job_description=jd,
            category=AC.JOB_DESCRIPTION,
            event_type="jd.created",
            title="x",
            metadata=["not", "a", "dict"],  # type: ignore[arg-type]
        )
