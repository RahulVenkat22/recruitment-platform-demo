"""Shared pytest fixtures for the backend suite (pytest-django)."""

from __future__ import annotations

import itertools
from collections.abc import Callable

import pytest
from rest_framework.test import APIClient

_user_sequence = itertools.count(1)


@pytest.fixture
def api_client() -> APIClient:
    """An unauthenticated DRF test client."""
    return APIClient()


@pytest.fixture
def user_factory(db) -> Callable:
    """Build persisted users with unique emails; keyword arguments override any field.

    Usage: ``user_factory()`` or ``user_factory(role=UserRole.HR_ADMIN, email="x@y.z")``.
    """
    from accounts.models import User

    def factory(**overrides) -> User:
        index = next(_user_sequence)
        fields = {
            "email": f"user{index}@aimious.demo",
            "password": "Demo@1234",
            "first_name": "Test",
            "last_name": f"User{index}",
            "designation": "HR Executive",
            "department": "Human Resources",
        }
        fields.update(overrides)
        if fields.pop("is_superuser", False):
            return User.objects.create_superuser(**fields)
        return User.objects.create_user(**fields)

    return factory


@pytest.fixture
def user(user_factory):
    return user_factory()


@pytest.fixture
def auth_client(api_client: APIClient, user) -> APIClient:
    """A DRF client already authenticated as ``user`` (no token round-trip)."""
    api_client.force_authenticate(user=user)
    return api_client
