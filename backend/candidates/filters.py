"""Query-string filters for ``GET /api/v1/candidates/`` (plan.md 6.10): free text,
skills, source, location, experience range, application status and JD."""

from __future__ import annotations

import django_filters
from django.db.models import Q, QuerySet

from candidates.models import Candidate
from common.enums import ApplicationStatus, CandidateSource
from matching.skills import normalize_skill


def _csv(value: str) -> list[str]:
    return [item.strip() for item in (value or "").split(",") if item.strip()]


class CandidateFilter(django_filters.FilterSet):
    search = django_filters.CharFilter(method="filter_search")
    skills = django_filters.CharFilter(method="filter_skills")
    source = django_filters.CharFilter(method="filter_source")
    location = django_filters.CharFilter(field_name="location", lookup_expr="icontains")
    min_exp = django_filters.NumberFilter(field_name="total_experience_years", lookup_expr="gte")
    max_exp = django_filters.NumberFilter(field_name="total_experience_years", lookup_expr="lte")
    status = django_filters.CharFilter(method="filter_status")
    job_description = django_filters.UUIDFilter(method="filter_job")

    class Meta:
        model = Candidate
        fields: list[str] = []

    def filter_search(self, qs: QuerySet, name: str, value: str) -> QuerySet:
        term = (value or "").strip()
        if not term:
            return qs
        key = normalize_skill(term)
        condition = (
            Q(full_name__icontains=term)
            | Q(headline__icontains=term)
            | Q(current_company__icontains=term)
            | Q(current_title__icontains=term)
            | Q(location__icontains=term)
        )
        if key:
            condition |= Q(skills__skill=key)
        return qs.filter(condition).distinct()

    def filter_skills(self, qs: QuerySet, name: str, value: str) -> QuerySet:
        keys = [normalize_skill(item) for item in _csv(value)]
        keys = [key for key in keys if key]
        return qs.filter(skills__skill__in=keys).distinct() if keys else qs

    def filter_source(self, qs: QuerySet, name: str, value: str) -> QuerySet:
        wanted = [key for key in _csv(value) if key in CandidateSource.values]
        return qs.filter(sources__source__in=wanted).distinct() if wanted else qs

    def filter_status(self, qs: QuerySet, name: str, value: str) -> QuerySet:
        wanted = [key for key in _csv(value) if key in ApplicationStatus.values]
        return qs.filter(applications__status__in=wanted).distinct() if wanted else qs

    def filter_job(self, qs: QuerySet, name: str, value) -> QuerySet:
        return qs.filter(applications__job_description_id=value).distinct()
