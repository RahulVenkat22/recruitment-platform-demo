"""The ten demo users (plan.md sections 10 and 18)."""

from __future__ import annotations

from accounts.models import User
from common.enums import UserRole
from seed.context import SeedContext
from seed.pools.users import PASSWORD, USERS, DemoUser


def seed_users(ctx: SeedContext) -> dict[str, User]:
    """Create or refresh every demo user, keyed by email. Idempotent by email."""
    return {spec.email: _upsert_user(spec) for spec in USERS}


def _upsert_user(spec: DemoUser) -> User:
    user = User.objects.filter(email__iexact=spec.email).first() or User(email=spec.email)
    user.first_name = spec.first_name
    user.last_name = spec.last_name
    user.role = spec.role
    user.designation = spec.designation
    user.department = spec.department
    user.avatar_url = spec.avatar_url
    user.phone = spec.phone
    user.timezone = "Asia/Kolkata"
    user.is_active = True
    # The HR admin is also the Django admin for the demo.
    user.is_staff = user.is_superuser = spec.role == UserRole.HR_ADMIN
    user.set_password(PASSWORD)
    user.save()
    return user
