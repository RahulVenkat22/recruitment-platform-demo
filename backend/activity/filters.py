"""Query-string filters for ``GET /api/v1/activities/`` (plan.md 6.10): scope
(``job_description``, ``application``, ``candidate``), ``actor``, ``event_type``
and free text. ``category`` and the ``before`` cursor are applied by the view
after the per-category counts are taken, so they live outside this FilterSet."""

from __future__ import annotations

import django_filters
from django.db.models import Q, QuerySet

from activity.models import Activity


def _csv(value: str) -> list[str]:
    return [item.strip() for item in (value or "").split(",") if item.strip()]


class ActivityFilter(django_filters.FilterSet):
    job_description = django_filters.UUIDFilter(field_name="job_description_id")
    application = django_filters.UUIDFilter(method="filter_application")
    candidate = django_filters.UUIDFilter(method="filter_candidate")
    actor = django_filters.UUIDFilter(field_name="actor_id")
    event_type = django_filters.CharFilter(method="filter_event_type")
    search = django_filters.CharFilter(method="filter_search")
    since = django_filters.IsoDateTimeFilter(field_name="occurred_at", lookup_expr="gte")

    class Meta:
        model = Activity
        fields: list[str] = []

    def filter_application(self, qs: QuerySet, name: str, value) -> QuerySet:
        """Rows on the application, plus grouped bulk events that list it in metadata."""
        return qs.filter(
            Q(application_id=value) | Q(metadata__application_ids__contains=[str(value)])
        )

    def filter_candidate(self, qs: QuerySet, name: str, value) -> QuerySet:
        return qs.filter(Q(candidate_id=value) | Q(metadata__candidate_ids__contains=[str(value)]))

    def filter_event_type(self, qs: QuerySet, name: str, value: str) -> QuerySet:
        wanted = _csv(value)
        return qs.filter(event_type__in=wanted) if wanted else qs

    def filter_search(self, qs: QuerySet, name: str, value: str) -> QuerySet:
        term = (value or "").strip()
        if not term:
            return qs
        return qs.filter(
            Q(title__icontains=term)
            | Q(description__icontains=term)
            | Q(actor__first_name__icontains=term)
            | Q(actor__last_name__icontains=term)
            | Q(candidate__full_name__icontains=term)
        )
