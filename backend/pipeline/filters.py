"""Query-string filters for ``GET /api/v1/applications/`` and ``GET /searches/``
(plan.md 6.10): scope, status or status group, source, owner, match floor and
free text."""

from __future__ import annotations

import django_filters
from django.db.models import Q, QuerySet
from django.utils import timezone

from common.enums import (
    KANBAN_COLUMNS,
    ApplicationStatus,
    CallPurpose,
    CallStatus,
    CandidateSource,
    CommunicationChannel,
    CommunicationOutcome,
    InterviewRound,
    InterviewStatus,
    OfferStatus,
    OnboardingStatus,
)
from pipeline.models import (
    Application,
    Communication,
    Interview,
    Offer,
    Onboarding,
    PhoneCall,
    SearchRun,
)


def _csv(value: str) -> list[str]:
    return [item.strip() for item in (value or "").split(",") if item.strip()]


# Candidates-tab groups (plan.md 9.6) plus the Kanban column keys (plan.md 6.4).
STATUS_GROUPS: dict[str, tuple[str, ...]] = {
    "new": (ApplicationStatus.NEW,),
    "shortlisted": (ApplicationStatus.AI_SHORTLISTED, ApplicationStatus.HR_REVIEW),
    "in_progress": (
        ApplicationStatus.CONTACT_PENDING,
        ApplicationStatus.CONTACTED,
        ApplicationStatus.PHONE_SCREENING,
    ),
    "interview": (
        ApplicationStatus.INTERVIEW_SCHEDULED,
        ApplicationStatus.TECHNICAL_INTERVIEW,
        ApplicationStatus.HR_INTERVIEW,
        ApplicationStatus.FINAL_INTERVIEW,
    ),
    "selected": (
        ApplicationStatus.SELECTED,
        ApplicationStatus.OFFER_SENT,
        ApplicationStatus.OFFER_ACCEPTED,
        ApplicationStatus.ONBOARDING,
        ApplicationStatus.ONBOARDED,
    ),
    "closed": (
        ApplicationStatus.REJECTED,
        ApplicationStatus.WITHDRAWN,
        ApplicationStatus.ON_HOLD,
    ),
    **{key: tuple(str(s) for s in column.statuses) for key, column in KANBAN_COLUMNS.items()},
}


class ApplicationFilter(django_filters.FilterSet):
    job_description = django_filters.UUIDFilter(field_name="job_description_id")
    candidate = django_filters.UUIDFilter(field_name="candidate_id")
    owner = django_filters.UUIDFilter(field_name="owner_id")
    search_run = django_filters.UUIDFilter(field_name="search_run_id")
    status = django_filters.CharFilter(method="filter_status")
    status_group = django_filters.CharFilter(method="filter_status_group")
    source = django_filters.CharFilter(method="filter_source")
    min_match = django_filters.NumberFilter(field_name="match__overall_pct", lookup_expr="gte")
    is_starred = django_filters.BooleanFilter()
    search = django_filters.CharFilter(method="filter_search")

    class Meta:
        model = Application
        fields: list[str] = []

    def filter_status(self, qs: QuerySet, name: str, value: str) -> QuerySet:
        wanted = [key for key in _csv(value) if key in ApplicationStatus.values]
        return qs.filter(status__in=wanted) if wanted else qs

    def filter_status_group(self, qs: QuerySet, name: str, value: str) -> QuerySet:
        statuses: set[str] = set()
        for key in _csv(value):
            if key == "all":
                return qs
            statuses.update(STATUS_GROUPS.get(key, ()))
        return qs.filter(status__in=statuses) if statuses else qs

    def filter_source(self, qs: QuerySet, name: str, value: str) -> QuerySet:
        wanted = [key for key in _csv(value) if key in CandidateSource.values]
        if not wanted:
            return qs
        return qs.filter(
            Q(entry_source__in=wanted) | Q(candidate__sources__source__in=wanted)
        ).distinct()

    def filter_search(self, qs: QuerySet, name: str, value: str) -> QuerySet:
        term = (value or "").strip()
        if not term:
            return qs
        return qs.filter(
            Q(candidate__full_name__icontains=term)
            | Q(candidate__headline__icontains=term)
            | Q(candidate__current_company__icontains=term)
            | Q(candidate__location__icontains=term)
            | Q(candidate__skills__skill__icontains=term)
        ).distinct()


class SearchRunFilter(django_filters.FilterSet):
    job_description = django_filters.UUIDFilter(field_name="job_description_id")

    class Meta:
        model = SearchRun
        fields: list[str] = []


class InterviewFilter(django_filters.FilterSet):
    """``GET /interviews/``: scope, people, status, round, a date window, ``mine``
    and the page's ``bucket`` tabs (upcoming | today | completed | past | all)."""

    job_description = django_filters.UUIDFilter(field_name="application__job_description_id")
    application = django_filters.UUIDFilter(field_name="application_id")
    candidate = django_filters.UUIDFilter(field_name="application__candidate_id")
    interviewer = django_filters.UUIDFilter(field_name="interviewer_id")
    status = django_filters.CharFilter(method="filter_status")
    round = django_filters.CharFilter(method="filter_round")
    from_ = django_filters.IsoDateTimeFilter(field_name="scheduled_at", lookup_expr="gte")
    to = django_filters.IsoDateTimeFilter(field_name="scheduled_at", lookup_expr="lte")
    mine = django_filters.BooleanFilter(method="filter_mine")
    bucket = django_filters.CharFilter(method="filter_bucket")
    search = django_filters.CharFilter(method="filter_search")

    class Meta:
        model = Interview
        fields: list[str] = []

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # ``from`` is a keyword; expose it under the plan's name.
        self.filters["from"] = self.filters.pop("from_")

    def filter_status(self, qs: QuerySet, name: str, value: str) -> QuerySet:
        wanted = [key for key in _csv(value) if key in InterviewStatus.values]
        return qs.filter(status__in=wanted) if wanted else qs

    def filter_round(self, qs: QuerySet, name: str, value: str) -> QuerySet:
        wanted = [key for key in _csv(value) if key in InterviewRound.values]
        return qs.filter(round__in=wanted) if wanted else qs

    def filter_mine(self, qs: QuerySet, name: str, value: bool) -> QuerySet:
        user = getattr(self.request, "user", None)
        if not value or user is None:
            return qs
        return qs.filter(Q(interviewer_id=user.pk) | Q(created_by_id=user.pk))

    def filter_bucket(self, qs: QuerySet, name: str, value: str) -> QuerySet:
        now = timezone.now()
        open_statuses = (InterviewStatus.SCHEDULED, InterviewStatus.RESCHEDULED)
        if value == "upcoming":
            return qs.filter(scheduled_at__gte=now, status__in=open_statuses)
        if value == "today":
            today = timezone.localdate()
            return qs.filter(scheduled_at__date=today)
        if value == "completed":
            return qs.filter(status=InterviewStatus.COMPLETED)
        if value == "past":
            return qs.filter(scheduled_at__lt=now)
        if value == "pending_feedback":
            return qs.filter(scheduled_at__lt=now, status__in=open_statuses)
        return qs

    def filter_search(self, qs: QuerySet, name: str, value: str) -> QuerySet:
        term = (value or "").strip()
        if not term:
            return qs
        return qs.filter(
            Q(application__candidate__full_name__icontains=term)
            | Q(application__job_description__title__icontains=term)
            | Q(interviewer__first_name__icontains=term)
            | Q(interviewer__last_name__icontains=term)
        )


class CommunicationFilter(django_filters.FilterSet):
    application = django_filters.UUIDFilter(field_name="application_id")
    job_description = django_filters.UUIDFilter(field_name="application__job_description_id")
    candidate = django_filters.UUIDFilter(field_name="application__candidate_id")
    channel = django_filters.CharFilter(method="filter_channel")
    outcome = django_filters.CharFilter(method="filter_outcome")

    class Meta:
        model = Communication
        fields: list[str] = []

    def filter_channel(self, qs: QuerySet, name: str, value: str) -> QuerySet:
        wanted = [key for key in _csv(value) if key in CommunicationChannel.values]
        return qs.filter(channel__in=wanted) if wanted else qs

    def filter_outcome(self, qs: QuerySet, name: str, value: str) -> QuerySet:
        wanted = [key for key in _csv(value) if key in CommunicationOutcome.values]
        return qs.filter(outcome__in=wanted) if wanted else qs


class OfferFilter(django_filters.FilterSet):
    application = django_filters.UUIDFilter(field_name="application_id")
    job_description = django_filters.UUIDFilter(field_name="application__job_description_id")
    candidate = django_filters.UUIDFilter(field_name="application__candidate_id")
    status = django_filters.CharFilter(method="filter_status")

    class Meta:
        model = Offer
        fields: list[str] = []

    def filter_status(self, qs: QuerySet, name: str, value: str) -> QuerySet:
        wanted = [key for key in _csv(value) if key in OfferStatus.values]
        return qs.filter(status__in=wanted) if wanted else qs


class OnboardingFilter(django_filters.FilterSet):
    application = django_filters.UUIDFilter(field_name="application_id")
    job_description = django_filters.UUIDFilter(field_name="application__job_description_id")
    candidate = django_filters.UUIDFilter(field_name="application__candidate_id")
    status = django_filters.CharFilter(method="filter_status")

    class Meta:
        model = Onboarding
        fields: list[str] = []

    def filter_status(self, qs: QuerySet, name: str, value: str) -> QuerySet:
        wanted = [key for key in _csv(value) if key in OnboardingStatus.values]
        return qs.filter(status__in=wanted) if wanted else qs


class PhoneCallFilter(django_filters.FilterSet):
    application = django_filters.UUIDFilter(field_name="application_id")
    job_description = django_filters.UUIDFilter(field_name="application__job_description_id")
    candidate = django_filters.UUIDFilter(field_name="application__candidate_id")
    status = django_filters.CharFilter(method="filter_status")
    purpose = django_filters.CharFilter(method="filter_purpose")

    class Meta:
        model = PhoneCall
        fields: list[str] = []

    def filter_status(self, qs: QuerySet, name: str, value: str) -> QuerySet:
        wanted = [key for key in _csv(value) if key in CallStatus.values]
        return qs.filter(status__in=wanted) if wanted else qs

    def filter_purpose(self, qs: QuerySet, name: str, value: str) -> QuerySet:
        wanted = [key for key in _csv(value) if key in CallPurpose.values]
        return qs.filter(purpose__in=wanted) if wanted else qs
