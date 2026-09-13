"""Session and account workflows behind the auth views (plan.md 6.9 "Login flow").

A session is a SimpleJWT refresh token whose lifetime is fixed at login (12
hours, or 14 days with remember-me) plus short-lived access tokens minted from
it. Rotation issues a new refresh token that keeps the *remaining* lifetime
and blacklists the old one, so a session ends when it was meant to no matter
how often it refreshes.
"""

from __future__ import annotations

import hashlib
import secrets
from dataclasses import dataclass
from datetime import timedelta
from typing import NamedTuple

from django.conf import settings
from django.contrib.auth.models import update_last_login
from django.utils import timezone
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.settings import api_settings
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.utils import aware_utcnow, datetime_from_epoch

from accounts.exceptions import (
    InactiveAccount,
    InvalidCredentials,
    RefreshTokenInvalid,
    RefreshUserInactive,
)
from accounts.models import PasswordResetRequest, User

PASSWORD_RESET_TTL = timedelta(hours=1)


@dataclass(frozen=True)
class Session:
    user: User
    access: str
    refresh: str
    # How long the refresh token (and therefore the cookie) is still valid.
    refresh_lifetime: timedelta


class PasswordReset(NamedTuple):
    request: PasswordResetRequest
    # The plain token is only ever returned here; the row stores its hash.
    token: str


# ---------------------------------------------------------------------- login


def authenticate_credentials(email: str, password: str) -> User:
    """The active user for ``email`` / ``password``; raises the envelope exceptions otherwise."""
    user = User.objects.filter(email__iexact=email.strip()).first()
    if user is None:
        # Run the hasher anyway so a missing account takes as long as a wrong password.
        User().set_password(password)
        raise InvalidCredentials
    if not user.check_password(password):
        raise InvalidCredentials
    if not user.is_active:
        raise InactiveAccount
    return user


def refresh_lifetime(remember_me: bool) -> timedelta:
    """Remember-me: ``JWT_REFRESH_REMEMBER_DAYS`` days; otherwise ``JWT_REFRESH_HOURS`` hours."""
    if remember_me:
        return timedelta(days=settings.JWT_REFRESH_REMEMBER_DAYS)
    return timedelta(hours=settings.JWT_REFRESH_HOURS)


def issue_refresh_token(user: User, lifetime: timedelta) -> RefreshToken:
    """A refresh token that expires after ``lifetime`` (not the class default).

    SimpleJWT reads the lifetime from the token *class*, and ``for_user`` also
    records the expiry on the blacklist app's ``OutstandingToken`` row, so the
    cleanest way to get both right is a throwaway subclass per lifetime.
    """
    token_class = type(
        "SessionRefreshToken", (RefreshToken,), {"lifetime": lifetime, "__module__": __name__}
    )
    return token_class.for_user(user)


def start_session(user: User, *, remember_me: bool = False) -> Session:
    lifetime = refresh_lifetime(remember_me)
    refresh = issue_refresh_token(user, lifetime)
    update_last_login(None, user)
    return Session(
        user=user, access=str(refresh.access_token), refresh=str(refresh), refresh_lifetime=lifetime
    )


# -------------------------------------------------------------------- refresh


def _parse_refresh(raw: str) -> RefreshToken:
    """Verify signature, expiry, type and blacklist; raise the envelope exception on failure."""
    try:
        return RefreshToken(raw)
    except TokenError as exc:
        raise RefreshTokenInvalid(str(exc)) from exc


def _user_of(token: RefreshToken) -> User | None:
    return User.objects.filter(pk=token.get(api_settings.USER_ID_CLAIM)).first()


def rotate_session(raw_refresh: str) -> Session:
    """Exchange a valid refresh token for a new access token.

    With ``ROTATE_REFRESH_TOKENS`` a new refresh token is issued for the time
    the old one had left, and with ``BLACKLIST_AFTER_ROTATION`` the old one is
    blacklisted, so a stolen cookie stops working as soon as the real client
    refreshes.
    """
    old = _parse_refresh(raw_refresh)
    user = _user_of(old)
    if user is None:
        raise RefreshTokenInvalid("User not found.")
    if not user.is_active:
        raise RefreshUserInactive

    remaining = datetime_from_epoch(old["exp"]) - aware_utcnow()
    if remaining <= timedelta(0):
        raise RefreshTokenInvalid("Token is expired.")

    if api_settings.ROTATE_REFRESH_TOKENS:
        current = issue_refresh_token(user, remaining)
        if api_settings.BLACKLIST_AFTER_ROTATION:
            old.blacklist()
    else:
        current = old

    return Session(
        user=user,
        access=str(current.access_token),
        refresh=str(current),
        refresh_lifetime=remaining,
    )


# --------------------------------------------------------------------- logout


def end_session(raw_refresh: str | None) -> User | None:
    """Blacklist the refresh token if it is still valid; returns its user for the audit row."""
    if not raw_refresh:
        return None
    try:
        token = RefreshToken(raw_refresh)
    except TokenError:
        # Expired, garbage or already blacklisted: nothing left to revoke.
        return None
    token.blacklist()
    return _user_of(token)


def revoke_sessions(user: User, *, keep_refresh: str | None = None) -> int:
    """Blacklist every live refresh token of ``user`` except ``keep_refresh``; returns the count."""
    outstanding = OutstandingToken.objects.filter(
        user=user, expires_at__gt=timezone.now(), blacklistedtoken__isnull=True
    )
    if keep_refresh:
        try:
            outstanding = outstanding.exclude(
                jti=RefreshToken(keep_refresh)[api_settings.JTI_CLAIM]
            )
        except TokenError:
            pass
    rows = [BlacklistedToken(token=token) for token in outstanding]
    BlacklistedToken.objects.bulk_create(rows, ignore_conflicts=True)
    return len(rows)


# ------------------------------------------------------------------ passwords


def change_password(user: User, new_password: str, *, keep_refresh: str | None = None) -> None:
    """Set the new password and sign the user out of every other session."""
    user.set_password(new_password)
    user.save(update_fields=["password", "updated_at"])
    revoke_sessions(user, keep_refresh=keep_refresh)


def request_password_reset(email: str, ip_address: str | None) -> PasswordReset:
    """Record a forgot-password submission (plan.md 6.3 PasswordResetRequest).

    Always writes a row, whether or not the email belongs to an account, so the
    endpoint's behaviour cannot be used to enumerate users. No email is sent in
    the MVP; the plain token is returned for a future mailer and never stored.
    """
    token = secrets.token_urlsafe(32)
    row = PasswordResetRequest.objects.create(
        email=email.strip().lower(),
        token_hash=hashlib.sha256(token.encode()).hexdigest(),
        expires_at=timezone.now() + PASSWORD_RESET_TTL,
        ip_address=ip_address,
    )
    return PasswordReset(request=row, token=token)


# ---------------------------------------------------------------------- admin


def admin_update_user(
    user: User, *, role: str | None = None, is_active: bool | None = None
) -> User:
    """Change a user's role and/or active flag; deactivating revokes their sessions."""
    fields = ["updated_at"]
    if role is not None:
        user.role = role
        fields.append("role")
    if is_active is not None:
        user.is_active = is_active
        fields.append("is_active")
    user.save(update_fields=fields)
    if is_active is False:
        revoke_sessions(user)
    return user
