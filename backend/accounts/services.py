"""Session and account workflows behind the auth views (plan.md 6.9 "Login flow").

A session is a SimpleJWT refresh token whose lifetime is fixed at login (12
hours, or 14 days with remember-me) plus short-lived access tokens minted from
it. Rotation issues a new refresh token that keeps the *remaining* lifetime
and blacklists the old one, so a session ends when it was meant to no matter
how often it refreshes.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from datetime import timedelta
from typing import NamedTuple

from django.conf import settings
from django.contrib.auth.models import update_last_login
from django.core import signing
from django.db import transaction
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
from workqueue.services import enqueue

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


@transaction.atomic
def rotate_session(raw_refresh: str) -> Session:
    """Exchange a valid refresh token for a new access token.

    With ``ROTATE_REFRESH_TOKENS`` a new refresh token is issued for the time
    the old one had left, and with ``BLACKLIST_AFTER_ROTATION`` the old one is
    blacklisted, so a stolen cookie stops working as soon as the real client
    refreshes.
    """
    old = _parse_refresh(raw_refresh)
    user = User.objects.select_for_update().filter(pk=old.get(api_settings.USER_ID_CLAIM)).first()
    old = _parse_refresh(raw_refresh)  # Recheck after waiting for another rotation/reset.
    if user is None:
        raise RefreshTokenInvalid("User not found.")
    if not user.is_active:
        raise RefreshUserInactive
    if api_settings.CHECK_REVOKE_TOKEN:
        from rest_framework_simplejwt.utils import get_md5_hash_password

        if old.get(api_settings.REVOKE_TOKEN_CLAIM) != get_md5_hash_password(user.password):
            raise RefreshTokenInvalid("Password changed; sign in again.")

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


def reset_token(row):
    # Reconstructible only with the signing key; no bearer token in the queue or DB.
    return signing.Signer(salt="password-reset").sign(str(row.pk))


@transaction.atomic
def request_password_reset(email: str, ip_address: str | None) -> PasswordReset:
    row = PasswordResetRequest(
        email=email.strip().lower(),
        expires_at=timezone.now() + PASSWORD_RESET_TTL,
        ip_address=ip_address,
    )
    token = reset_token(row)
    row.token_hash = hashlib.sha256(token.encode()).hexdigest()
    row.save()
    enqueue("password_reset", f"password_reset:{row.pk}", {"id": str(row.pk)})
    return PasswordReset(request=row, token=token)


def deliver_password_reset(request_id):
    from urllib.parse import quote

    from django.core.mail import send_mail

    row = PasswordResetRequest.objects.filter(pk=request_id).first()
    if (
        row is None
        or not row.is_usable
        or not User.objects.filter(email=row.email, is_active=True).exists()
    ):
        return
    # Fragment keeps the token out of HTTP access logs and Referer headers.
    url = settings.PUBLIC_BASE_URL.rstrip("/") + "/reset-password#token=" + quote(reset_token(row))
    send_mail(
        "Reset your password",
        f"Open this link to reset your password:\n\n{url}\n\n"
        "The link expires in one hour. Ignore this email if you did not request it.",
        settings.DEFAULT_FROM_EMAIL,
        [row.email],
        fail_silently=False,
    )


@transaction.atomic
def complete_password_reset(token, password):
    from django.contrib.auth.password_validation import validate_password
    from django.core.exceptions import ValidationError as DjangoValidationError
    from rest_framework.exceptions import ValidationError

    row = PasswordResetRequest.objects.filter(
        token_hash=hashlib.sha256(token.encode()).hexdigest()
    ).first()
    if row is None or not row.is_usable:
        raise ValidationError("The reset link is invalid or expired.")
    user = User.objects.select_for_update().filter(email=row.email, is_active=True).first()
    if user is None:
        raise ValidationError("The reset link is invalid or expired.")
    # Lock the account before any reset row: parallel reset links for one user
    # must not each hold a row while waiting for the other's account lock.
    row = PasswordResetRequest.objects.select_for_update().get(pk=row.pk)
    if not row.is_usable:
        raise ValidationError("The reset link is invalid or expired.")
    try:
        validate_password(password, user)
    except DjangoValidationError as exc:
        raise ValidationError({"new_password": exc.messages}) from exc
    change_password(user, password)
    PasswordResetRequest.objects.filter(email=row.email, used_at__isnull=True).update(
        used_at=timezone.now()
    )


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
