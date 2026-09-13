"""common.masking (plan.md 6.9 PII): interviewer and employee roles see masked contact
details; HR roles see everything."""

from __future__ import annotations

import pytest
from django.contrib.auth.models import AnonymousUser
from rest_framework import serializers
from rest_framework.test import APIRequestFactory

from common.enums import UserRole
from common.masking import (
    PIIMaskingMixin,
    mask_contact,
    mask_email,
    mask_phone,
    should_mask_pii,
)

factory = APIRequestFactory()


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("john.doe@gmail.com", "j***@gmail.com"),
        ("priya@aimious.demo", "p***@aimious.demo"),
        ("a@b.co", "a***@b.co"),
        ("no-at-sign", "n***"),
        ("", ""),
        (None, ""),
    ],
)
def test_mask_email(raw, expected):
    assert mask_email(raw) == expected


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        # Country code and last three digits kept, the first two national digits too.
        ("+91 98765 43210", "+91 98xxx xx210"),
        ("+91-98765-43210", "+91-98xxx-xx210"),
        ("+919876543210", "+9198xxxxx210"),
        ("9876543210", "98xxxxx210"),
        ("+1 (555) 123-4567", "+1 (55x) xxx-x567"),
        ("12345", "xx345"),
        ("", ""),
        (None, ""),
    ],
)
def test_mask_phone(raw, expected):
    assert mask_phone(raw) == expected


class _Role:
    is_authenticated = True

    def __init__(self, role: str) -> None:
        self.role = role


@pytest.mark.parametrize(
    ("role", "masked"),
    [
        (UserRole.HR_ADMIN, False),
        (UserRole.HR, False),
        (UserRole.INTERVIEWER, True),
        (UserRole.EMPLOYEE, True),
    ],
)
def test_should_mask_pii_by_role(role, masked):
    assert should_mask_pii(_Role(role)) is masked


def test_anonymous_and_missing_users_are_always_masked():
    assert should_mask_pii(None) is True
    assert should_mask_pii(AnonymousUser()) is True


def test_mask_contact_masks_only_for_masked_roles():
    data = {"email": "john.doe@gmail.com", "phone": "+91 98765 43210", "name": "John"}

    assert mask_contact(dict(data), _Role(UserRole.INTERVIEWER)) == {
        "email": "j***@gmail.com",
        "phone": "+91 98xxx xx210",
        "name": "John",
    }
    assert mask_contact(dict(data), _Role(UserRole.HR)) == data


class ContactSerializer(PIIMaskingMixin, serializers.Serializer):
    email = serializers.EmailField()
    phone = serializers.CharField()
    name = serializers.CharField()


@pytest.mark.parametrize(
    ("role", "expected_email"),
    [
        (UserRole.HR, "john.doe@gmail.com"),
        (UserRole.INTERVIEWER, "j***@gmail.com"),
    ],
)
def test_serializer_mixin_masks_from_the_request_user(role, expected_email):
    request = factory.get("/x/")
    request.user = _Role(role)
    instance = {"email": "john.doe@gmail.com", "phone": "+91 98765 43210", "name": "John"}

    data = ContactSerializer(instance, context={"request": request}).data

    assert data["email"] == expected_email
    assert data["name"] == "John"


def test_serializer_mixin_without_request_masks_defensively():
    instance = {"email": "john.doe@gmail.com", "phone": "+91 98765 43210", "name": "John"}

    data = ContactSerializer(instance).data

    assert data["email"] == "j***@gmail.com"
    assert data["phone"] == "+91 98xxx xx210"
