"""Query-string filters for ``GET /api/v1/users/`` (plan.md 6.10: role, department)."""

from __future__ import annotations

import django_filters

from accounts.models import User
from common.enums import UserRole


class UserFilter(django_filters.FilterSet):
    role = django_filters.ChoiceFilter(choices=UserRole.choices)
    department = django_filters.CharFilter(lookup_expr="iexact")
    is_active = django_filters.BooleanFilter()

    class Meta:
        model = User
        fields = ["role", "department", "is_active"]
