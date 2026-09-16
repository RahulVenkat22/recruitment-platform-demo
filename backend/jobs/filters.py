"""Query-string filters for ``GET /api/v1/job-descriptions/`` (plan.md 6.10):
``search``, ``status``, ``department``, ``location``, ``employment_type``,
``work_mode``, ``created_by``, ``created_by_role``, ``mine`` and ``skill``.
Multi-value filters take a comma list (``?status=open,on_hold``) so the filter
popovers can send one param."""

from __future__ import annotations

from typing import Any

import django_filters
from django.db.models import Q, QuerySet

from common.enums import EmploymentType, JDStatus, UserRole, WorkMode
from jobs.models import JobDescription
from matching.skills import normalize_skill


def _csv(value: str) -> list[str]:
    return [item.strip() for item in (value or "").split(",") if item.strip()]


class _CsvChoiceFilter(django_filters.CharFilter):
    """``?field=a,b`` -> ``field__in=[a, b]``, ignoring values outside ``choices``."""

    def __init__(self, *, choices: Any, **kwargs: Any) -> None:
        self.allowed = {str(key) for key, _label in choices}
        super().__init__(**kwargs)

    def filter(self, qs: QuerySet, value: str) -> QuerySet:  # noqa: A003
        if not value:
            return qs
        wanted = [item for item in _csv(value) if item in self.allowed]
        if not wanted:
            return qs.none()
        return qs.filter(**{f"{self.field_name}__in": wanted})


class _CsvTextFilter(django_filters.CharFilter):
    """``?field=a,b`` -> case-insensitive exact match on any of the values."""

    def filter(self, qs: QuerySet, value: str) -> QuerySet:  # noqa: A003
        wanted = _csv(value)
        if not wanted:
            return qs
        condition = Q()
        for item in wanted:
            condition |= Q(**{f"{self.field_name}__iexact": item})
        return qs.filter(condition)


class JobDescriptionFilter(django_filters.FilterSet):
    search = django_filters.CharFilter(method="filter_search")
    status = _CsvChoiceFilter(field_name="status", choices=JDStatus.choices)
    department = _CsvTextFilter(field_name="department")
    location = _CsvTextFilter(field_name="location")
    employment_type = _CsvChoiceFilter(field_name="employment_type", choices=EmploymentType.choices)
    work_mode = _CsvChoiceFilter(field_name="work_mode", choices=WorkMode.choices)
    created_by = django_filters.UUIDFilter(field_name="created_by_id")
    # The homepage "User level" filter (Enhancement.md 3): JDs raised by users of these roles.
    created_by_role = _CsvChoiceFilter(field_name="created_by__role", choices=UserRole.choices)
    mine = django_filters.BooleanFilter(method="filter_mine")
    skill = django_filters.CharFilter(method="filter_skill")

    class Meta:
        model = JobDescription
        fields: list[str] = []

    def filter_search(self, qs: QuerySet, name: str, value: str) -> QuerySet:
        """Title, department, location, or a skill key (raw or through the synonym map)."""
        term = (value or "").strip()
        if not term:
            return qs
        condition = (
            Q(title__icontains=term)
            | Q(department__icontains=term)
            | Q(location__icontains=term)
            | Q(domain__icontains=term)
        )
        key = normalize_skill(term)
        if key:
            condition |= Q(required_skills__contains=[key]) | Q(preferred_skills__contains=[key])
        return qs.filter(condition)

    def filter_mine(self, qs: QuerySet, name: str, value: bool | None) -> QuerySet:
        """JDs the caller created or is listed on."""
        if not value:
            return qs
        user = getattr(self.request, "user", None)
        if user is None or not user.is_authenticated:
            return qs.none()
        return qs.filter(Q(created_by_id=user.id) | Q(participants__user_id=user.id)).distinct()

    def filter_skill(self, qs: QuerySet, name: str, value: str) -> QuerySet:
        key = normalize_skill(value or "")
        if not key:
            return qs
        return qs.filter(Q(required_skills__contains=[key]) | Q(preferred_skills__contains=[key]))
