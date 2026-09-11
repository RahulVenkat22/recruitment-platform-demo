"""accounts.User per plan.md 6.3: UUID pk, email login, case-insensitive uniqueness."""

import uuid

import pytest
from django.contrib.auth import authenticate, get_user_model
from django.db import IntegrityError

from common.enums import UserRole

User = get_user_model()


@pytest.mark.django_db
def test_create_user_defaults(user_factory):
    user = user_factory(email="Priya@Aimious.Demo", first_name="Priya", last_name="Sharma")

    assert isinstance(user.id, uuid.UUID)
    assert user.email == "Priya@aimious.demo"  # domain part normalised, local part kept
    assert user.role == UserRole.EMPLOYEE
    assert user.timezone == "Asia/Kolkata"
    assert user.avatar_url is None
    assert user.phone is None
    assert user.is_active and not user.is_staff and not user.is_superuser
    assert user.check_password("Demo@1234")
    assert user.created_at is not None and user.updated_at is not None
    assert user.full_name == "Priya Sharma"
    assert user.initials == "PS"
    assert str(user) == "Priya Sharma <Priya@aimious.demo>"


@pytest.mark.django_db
def test_create_superuser_sets_flags_and_admin_role():
    admin = User.objects.create_superuser(
        email="rahul@aimious.demo", password="Demo@1234", first_name="Rahul", last_name="Venkat"
    )

    assert admin.is_staff and admin.is_superuser and admin.is_active
    assert admin.role == UserRole.HR_ADMIN


def test_create_user_requires_an_email():
    with pytest.raises(ValueError):
        User.objects.create_user(email="", password="x")


@pytest.mark.django_db
def test_email_is_unique_case_insensitively(user_factory):
    user_factory(email="john@aimious.demo")

    with pytest.raises(IntegrityError):
        user_factory(email="JOHN@aimious.demo")


@pytest.mark.django_db
def test_lookup_and_login_are_case_insensitive(user_factory):
    user_factory(email="karthik@aimious.demo", password="Demo@1234")

    assert User.objects.get_by_natural_key("KARTHIK@AIMIOUS.DEMO").email == "karthik@aimious.demo"
    assert authenticate(username="Karthik@Aimious.Demo", password="Demo@1234") is not None
    assert authenticate(username="karthik@aimious.demo", password="wrong") is None


def test_username_field_is_email():
    assert User.USERNAME_FIELD == "email"
    assert "email" not in User.REQUIRED_FIELDS
