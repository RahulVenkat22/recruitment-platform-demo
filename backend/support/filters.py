"""Query-string filters for ``GET /api/v1/support/tickets/``."""

from __future__ import annotations

import django_filters

from support.models import Ticket


class _CsvFilter(django_filters.BaseInFilter, django_filters.CharFilter):
    """``?status=open,in_progress``."""


class TicketFilter(django_filters.FilterSet):
    status = _CsvFilter(field_name="status", lookup_expr="in")
    priority = _CsvFilter(field_name="priority", lookup_expr="in")
    category = _CsvFilter(field_name="category", lookup_expr="in")
    requester = django_filters.UUIDFilter(field_name="requester_id")
    assignee = django_filters.UUIDFilter(field_name="assignee_id")
    job_description = django_filters.UUIDFilter(field_name="job_description_id")
    # Tickets I raised / tickets on my desk, whatever else I may see.
    mine = django_filters.BooleanFilter(method="filter_mine")
    assigned_to_me = django_filters.BooleanFilter(method="filter_assigned_to_me")

    class Meta:
        model = Ticket
        fields = ["status", "priority", "category", "requester", "assignee", "job_description"]

    def filter_mine(self, queryset, name, value):
        if not value:
            return queryset
        return queryset.filter(requester_id=self.request.user.pk)

    def filter_assigned_to_me(self, queryset, name, value):
        if not value:
            return queryset
        return queryset.filter(assignee_id=self.request.user.pk)
