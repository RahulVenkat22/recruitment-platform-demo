"""Auth endpoints (plan.md 6.9, 6.10 Auth rows): login sets the refresh cookie,
refresh rotates and blacklists, logout blacklists and clears, remember-me
lifetimes, me / change-password / forgot-password."""

from __future__ import annotations

from datetime import timedelta

import pytest
from django.test import override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken
from rest_framework_simplejwt.tokens import AccessToken, RefreshToken

from accounts.models import PasswordResetRequest, User
from audit.models import AuditLog
from common.enums import AuditAction, UserRole

pytestmark = pytest.mark.django_db

LOGIN = "/api/v1/auth/login/"
REFRESH = "/api/v1/auth/refresh/"
LOGOUT = "/api/v1/auth/logout/"
ME = "/api/v1/auth/me/"
CHANGE_PASSWORD = "/api/v1/auth/change-password/"
FORGOT_PASSWORD = "/api/v1/auth/forgot-password/"

COOKIE = "aimious_refresh"
PASSWORD = "Demo@1234"

PROFILE_KEYS = {
    "id",
    "email",
    "first_name",
    "last_name",
    "full_name",
    "initials",
    "designation",
    "department",
    "role",
    "avatar_url",
    "phone",
    "timezone",
    "is_active",
    "last_login",
}


@pytest.fixture
def rahul(user_factory) -> User:
    return user_factory(
        email="rahul@aimious.demo",
        password=PASSWORD,
        first_name="Rahul",
        last_name="Venkat",
        role=UserRole.HR_ADMIN,
        designation="HR Manager",
        department="Human Resources",
        phone="+91 98400 11001",
    )


def login(client, email="rahul@aimious.demo", password=PASSWORD, remember_me=None):
    payload = {"email": email, "password": password}
    if remember_me is not None:
        payload["remember_me"] = remember_me
    return client.post(LOGIN, payload)


def bearer(client, access: str) -> None:
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")


def token_lifetime(raw: str) -> timedelta:
    token = RefreshToken(raw)
    return timedelta(seconds=token["exp"] - token["iat"])


# ------------------------------------------------------------------------ login


class TestLogin:
    def test_urls_are_named(self):
        assert reverse("api-v1:auth-login") == LOGIN
        assert reverse("api-v1:auth-refresh") == REFRESH
        assert reverse("api-v1:auth-logout") == LOGOUT
        assert reverse("api-v1:auth-me") == ME
        assert reverse("api-v1:auth-change-password") == CHANGE_PASSWORD
        assert reverse("api-v1:auth-forgot-password") == FORGOT_PASSWORD

    def test_returns_access_token_and_profile(self, api_client, rahul):
        response = login(api_client)

        assert response.status_code == 200
        body = response.json()
        assert set(body) == {"access", "user"}
        assert AccessToken(body["access"])["user_id"] == str(rahul.id)
        assert set(body["user"]) == PROFILE_KEYS
        assert body["user"]["email"] == "rahul@aimious.demo"
        assert body["user"]["full_name"] == "Rahul Venkat"
        assert body["user"]["initials"] == "RV"
        assert body["user"]["role"] == "hr_admin"
        assert "password" not in body["user"]

    def test_sets_httponly_refresh_cookie_scoped_to_the_auth_path(self, api_client, rahul):
        response = login(api_client)

        cookie = response.cookies[COOKIE]
        assert cookie["httponly"]
        assert cookie["path"] == "/api/v1/auth/"
        assert cookie["samesite"] == "Lax"
        assert not cookie["secure"]
        assert int(cookie["max-age"]) == 12 * 3600
        assert RefreshToken(cookie.value)["user_id"] == str(rahul.id)
        assert token_lifetime(cookie.value) == timedelta(hours=12)
        # The refresh token never appears in the body.
        assert cookie.value not in response.content.decode()

    def test_remember_me_extends_cookie_and_token_to_fourteen_days(self, api_client, rahul):
        response = login(api_client, remember_me=True)

        cookie = response.cookies[COOKIE]
        assert int(cookie["max-age"]) == 14 * 24 * 3600
        assert token_lifetime(cookie.value) == timedelta(days=14)

    @override_settings(
        JWT_REFRESH_HOURS=2,
        JWT_REFRESH_REMEMBER_DAYS=3,
        JWT_COOKIE_SECURE=True,
        JWT_COOKIE_SAMESITE="Strict",
    )
    def test_lifetimes_and_cookie_flags_come_from_settings(self, api_client, rahul):
        short = login(api_client).cookies[COOKIE]
        long = login(api_client, remember_me=True).cookies[COOKIE]

        assert int(short["max-age"]) == 2 * 3600
        assert token_lifetime(short.value) == timedelta(hours=2)
        assert int(long["max-age"]) == 3 * 24 * 3600
        assert short["secure"]
        assert short["samesite"] == "Strict"

    def test_outstanding_token_expiry_matches_the_remember_me_lifetime(self, api_client, rahul):
        """The blacklist app's bookkeeping row must carry the real expiry, otherwise
        ``flushexpiredtokens`` could drop a still-valid remember-me token."""
        before = timezone.now()
        cookie = login(api_client, remember_me=True).cookies[COOKIE]

        row = OutstandingToken.objects.get(jti=RefreshToken(cookie.value)["jti"])
        assert row.user == rahul
        assert row.expires_at - before > timedelta(days=13, hours=23)

    def test_email_is_case_insensitive(self, api_client, rahul):
        assert login(api_client, email="RAHUL@Aimious.Demo").status_code == 200

    def test_updates_last_login(self, api_client, rahul):
        assert rahul.last_login is None
        login(api_client)
        rahul.refresh_from_db()
        assert rahul.last_login is not None

    def test_wrong_password_is_401_with_the_error_envelope(self, api_client, rahul):
        response = login(api_client, password="nope")

        assert response.status_code == 401
        assert response.json() == {
            "error": {
                "code": "invalid_credentials",
                "message": "Invalid email or password.",
                "details": {},
            }
        }
        assert COOKIE not in response.cookies

    def test_unknown_email_uses_the_same_envelope(self, api_client, rahul):
        response = login(api_client, email="nobody@aimious.demo")

        assert response.status_code == 401
        assert response.json()["error"]["code"] == "invalid_credentials"

    def test_inactive_user_is_403(self, api_client, rahul):
        rahul.is_active = False
        rahul.save()

        response = login(api_client)

        assert response.status_code == 403
        assert response.json()["error"]["code"] == "account_inactive"
        assert COOKIE not in response.cookies

    def test_missing_fields_is_a_validation_error(self, api_client):
        response = api_client.post(LOGIN, {"email": "not-an-email"})

        assert response.status_code == 400
        body = response.json()["error"]
        assert body["code"] == "validation_error"
        assert set(body["details"]) == {"email", "password"}

    def test_writes_login_and_login_failed_audit_rows(self, api_client, rahul):
        login(api_client, password="wrong")
        login(api_client, remember_me=True)

        failed, ok = AuditLog.objects.order_by("created_at")
        assert failed.action == AuditAction.LOGIN_FAILED
        assert failed.actor is None
        assert failed.entity_type == "users"
        assert failed.changes == {"email": "rahul@aimious.demo", "reason": "invalid_credentials"}
        assert failed.status_code == 401
        assert failed.path == LOGIN
        assert ok.action == AuditAction.LOGIN
        assert ok.actor == rahul
        assert ok.entity_id == str(rahul.id)
        assert ok.changes == {"remember_me": True}
        assert ok.status_code == 200
        # The middleware does not add a second "create" row for the login request.
        assert AuditLog.objects.count() == 2


# ---------------------------------------------------------------------- refresh


class TestRefresh:
    def test_cookie_refresh_returns_a_new_access_token_and_rotates_the_cookie(
        self, api_client, rahul
    ):
        first = login(api_client)
        old_refresh = first.cookies[COOKIE].value

        response = api_client.post(REFRESH)

        assert response.status_code == 200
        body = response.json()
        assert set(body) == {"access", "user"}
        assert body["user"]["email"] == "rahul@aimious.demo"
        assert AccessToken(body["access"])["user_id"] == str(rahul.id)
        new_refresh = response.cookies[COOKIE].value
        assert new_refresh and new_refresh != old_refresh
        assert response.cookies[COOKIE]["httponly"]
        assert response.cookies[COOKIE]["path"] == "/api/v1/auth/"
        # The old token is blacklisted, the new one is outstanding.
        with pytest.raises(TokenError, match="blacklisted"):
            RefreshToken(old_refresh)
        assert (
            BlacklistedToken.objects.filter(token__jti=RefreshToken(new_refresh)["jti"]).count()
            == 0
        )
        assert OutstandingToken.objects.filter(user=rahul).count() == 2

    def test_reusing_a_rotated_token_is_401_and_clears_the_cookie(self, api_client, rahul):
        old_refresh = login(api_client).cookies[COOKIE].value
        api_client.post(REFRESH)
        api_client.cookies.clear()

        response = api_client.post(REFRESH, {"refresh": old_refresh})

        assert response.status_code == 401
        assert response.json()["error"]["code"] == "token_not_valid"
        assert response.cookies[COOKIE].value == ""
        assert int(response.cookies[COOKIE]["max-age"]) == 0

    def test_rotation_keeps_the_remaining_lifetime(self, api_client, rahul):
        old_refresh = login(api_client, remember_me=True).cookies[COOKIE].value
        old_exp = RefreshToken(old_refresh)["exp"]

        response = api_client.post(REFRESH)

        new_cookie = response.cookies[COOKIE]
        assert abs(RefreshToken(new_cookie.value)["exp"] - old_exp) <= 1
        max_age = int(new_cookie["max-age"])
        assert 14 * 24 * 3600 - 10 <= max_age <= 14 * 24 * 3600

    def test_json_body_refresh_for_clients_without_cookies(self, api_client, rahul):
        refresh = login(api_client).cookies[COOKIE].value
        api_client.cookies.clear()

        response = api_client.post(REFRESH, {"refresh": refresh})

        assert response.status_code == 200
        assert response.json()["access"]
        assert response.cookies[COOKIE].value != refresh

    def test_missing_token_is_401(self, api_client, rahul):
        response = api_client.post(REFRESH)

        assert response.status_code == 401
        assert response.json()["error"]["code"] == "refresh_token_missing"

    def test_garbage_token_is_401(self, api_client):
        api_client.cookies[COOKIE] = "not-a-token"

        response = api_client.post(REFRESH)

        assert response.status_code == 401
        assert response.json()["error"]["code"] == "token_not_valid"

    def test_deactivated_user_cannot_refresh(self, api_client, rahul):
        login(api_client)
        rahul.is_active = False
        rahul.save()

        response = api_client.post(REFRESH)

        assert response.status_code == 401
        assert response.json()["error"]["code"] == "user_inactive"

    def test_an_access_token_is_not_accepted_as_a_refresh_token(self, api_client, rahul):
        access = login(api_client).json()["access"]
        api_client.cookies.clear()

        response = api_client.post(REFRESH, {"refresh": access})

        assert response.status_code == 401

    def test_refresh_writes_no_audit_row(self, api_client, rahul):
        login(api_client)
        AuditLog.objects.all().delete()

        api_client.post(REFRESH)

        assert AuditLog.objects.count() == 0


# ----------------------------------------------------------------------- logout


class TestLogout:
    def test_blacklists_the_refresh_token_and_clears_the_cookie(self, api_client, rahul):
        first = login(api_client)
        refresh = first.cookies[COOKIE].value
        bearer(api_client, first.json()["access"])

        response = api_client.post(LOGOUT)

        assert response.status_code == 204
        assert response.cookies[COOKIE].value == ""
        assert int(response.cookies[COOKIE]["max-age"]) == 0
        assert response.cookies[COOKIE]["path"] == "/api/v1/auth/"
        assert BlacklistedToken.objects.filter(
            token__jti=RefreshToken(refresh, verify=False)["jti"]
        ).exists()
        api_client.cookies.clear()
        assert api_client.post(REFRESH, {"refresh": refresh}).status_code == 401

        row = AuditLog.objects.get(action=AuditAction.LOGOUT)
        assert row.actor == rahul
        assert row.entity_type == "users"
        assert row.entity_id == str(rahul.id)
        assert row.status_code == 204
        assert AuditLog.objects.filter(path=LOGOUT).count() == 1

    def test_logout_without_a_session_is_still_204(self, api_client):
        response = api_client.post(LOGOUT)

        assert response.status_code == 204
        assert response.cookies[COOKIE].value == ""

    def test_logout_accepts_a_json_refresh_body(self, api_client, rahul):
        refresh = login(api_client).cookies[COOKIE].value
        api_client.cookies.clear()

        assert api_client.post(LOGOUT, {"refresh": refresh}).status_code == 204
        with pytest.raises(TokenError):
            RefreshToken(refresh)

    def test_logout_with_an_expired_access_token_still_works(self, api_client, rahul):
        login(api_client)
        bearer(api_client, "expired-or-garbage")

        assert api_client.post(LOGOUT).status_code == 204


# --------------------------------------------------------------------------- me


class TestMe:
    def test_requires_authentication(self, api_client):
        response = api_client.get(ME)

        assert response.status_code == 401
        assert response.json()["error"]["code"] == "not_authenticated"

    def test_get_returns_the_profile(self, api_client, rahul):
        bearer(api_client, login(api_client).json()["access"])

        response = api_client.get(ME)

        assert response.status_code == 200
        body = response.json()
        assert set(body) == PROFILE_KEYS
        assert body["id"] == str(rahul.id)
        assert body["phone"] == "+91 98400 11001"
        assert body["timezone"] == "Asia/Kolkata"

    def test_patch_updates_the_editable_fields(self, auth_client, user):
        response = auth_client.patch(
            ME,
            {
                "first_name": "Priya",
                "last_name": "S",
                "phone": "+91 98400 22002",
                "avatar_url": "https://cdn.example.com/priya.png",
                "timezone": "Europe/London",
            },
        )

        assert response.status_code == 200
        body = response.json()
        assert set(body) == PROFILE_KEYS
        assert body["full_name"] == "Priya S"
        assert body["initials"] == "PS"
        user.refresh_from_db()
        assert user.first_name == "Priya"
        assert user.phone == "+91 98400 22002"
        assert user.avatar_url == "https://cdn.example.com/priya.png"
        assert user.timezone == "Europe/London"

    def test_patch_can_clear_phone_and_avatar(self, auth_client, user):
        user.phone = "+91 1"
        user.avatar_url = "https://x.example/a.png"
        user.save()

        response = auth_client.patch(ME, {"phone": None, "avatar_url": None})

        assert response.status_code == 200
        user.refresh_from_db()
        assert user.phone is None and user.avatar_url is None

    def test_patch_ignores_protected_fields(self, auth_client, user):
        response = auth_client.patch(
            ME, {"role": "hr_admin", "email": "hacker@aimious.demo", "is_active": False}
        )

        assert response.status_code == 200
        user.refresh_from_db()
        assert user.role == UserRole.EMPLOYEE
        assert user.email != "hacker@aimious.demo"
        assert user.is_active

    def test_patch_rejects_an_unknown_timezone(self, auth_client):
        response = auth_client.patch(ME, {"timezone": "Mars/Olympus"})

        assert response.status_code == 400
        assert "timezone" in response.json()["error"]["details"]

    def test_patch_rejects_a_bad_avatar_url_and_phone(self, auth_client):
        response = auth_client.patch(ME, {"avatar_url": "not a url", "phone": "call me"})

        assert response.status_code == 400
        assert set(response.json()["error"]["details"]) == {"avatar_url", "phone"}

    def test_put_is_not_allowed(self, auth_client):
        assert auth_client.put(ME, {"first_name": "X"}).status_code == 405


# -------------------------------------------------------------- change password


class TestChangePassword:
    def test_requires_authentication(self, api_client):
        response = api_client.post(
            CHANGE_PASSWORD, {"current_password": PASSWORD, "new_password": "Str0ng!Pass"}
        )
        assert response.status_code == 401

    def test_changes_the_password_and_revokes_other_sessions(self, api_client, rahul):
        other = login(api_client).cookies[COOKIE].value
        current = login(api_client)  # the client now carries this session's cookie
        bearer(api_client, current.json()["access"])

        response = api_client.post(
            CHANGE_PASSWORD, {"current_password": PASSWORD, "new_password": "N3w!Passw0rd"}
        )

        assert response.status_code == 204
        rahul.refresh_from_db()
        assert rahul.check_password("N3w!Passw0rd")
        # The session that changed the password survives; every other one is revoked.
        assert api_client.post(REFRESH).status_code == 200
        api_client.cookies.clear()
        assert api_client.post(REFRESH, {"refresh": other}).status_code == 401
        assert login(api_client, password=PASSWORD).status_code == 401
        assert login(api_client, password="N3w!Passw0rd").status_code == 200

    def test_wrong_current_password_is_a_validation_error(self, auth_client):
        response = auth_client.post(
            CHANGE_PASSWORD, {"current_password": "wrong", "new_password": "N3w!Passw0rd"}
        )

        assert response.status_code == 400
        body = response.json()["error"]
        assert body["code"] == "validation_error"
        assert body["details"] == {"current_password": ["Current password is incorrect."]}

    @pytest.mark.parametrize("weak", ["short", "password", "12345678"])
    def test_weak_new_password_fails_the_django_validators(self, auth_client, weak):
        response = auth_client.post(
            CHANGE_PASSWORD, {"current_password": PASSWORD, "new_password": weak}
        )

        assert response.status_code == 400
        assert response.json()["error"]["details"].keys() == {"new_password"}

    def test_new_password_must_differ_from_the_current_one(self, auth_client):
        response = auth_client.post(
            CHANGE_PASSWORD, {"current_password": PASSWORD, "new_password": PASSWORD}
        )

        assert response.status_code == 400
        assert "new_password" in response.json()["error"]["details"]

    def test_writes_an_audit_row_with_the_password_redacted(self, auth_client, user):
        auth_client.post(
            CHANGE_PASSWORD, {"current_password": PASSWORD, "new_password": "N3w!Passw0rd"}
        )

        row = AuditLog.objects.get(path=CHANGE_PASSWORD)
        assert row.action == AuditAction.UPDATE
        assert row.actor == user
        assert row.entity_type == "users"
        assert row.entity_id == str(user.id)
        assert "N3w!Passw0rd" not in str(row.changes)
        assert PASSWORD not in str(row.changes)
        assert row.status_code == 204


# -------------------------------------------------------------- forgot password


class TestForgotPassword:
    def test_records_a_hashed_token_with_a_one_hour_expiry(self, api_client, rahul):
        before = timezone.now()

        response = api_client.post(
            FORGOT_PASSWORD, {"email": "Rahul@Aimious.Demo"}, REMOTE_ADDR="10.1.2.3"
        )

        assert response.status_code == 202
        assert response.json() == {
            "detail": "If an account exists for that email, reset instructions have been recorded."
        }
        row = PasswordResetRequest.objects.get()
        assert row.email == "rahul@aimious.demo"
        assert len(row.token_hash) == 64 and row.token_hash.isalnum()
        assert row.used_at is None
        assert row.ip_address == "10.1.2.3"
        assert timedelta(minutes=59) < row.expires_at - before <= timedelta(hours=1, seconds=5)
        assert row.is_usable

    def test_unknown_email_is_still_202_and_recorded(self, api_client):
        response = api_client.post(FORGOT_PASSWORD, {"email": "ghost@aimious.demo"})

        assert response.status_code == 202
        assert PasswordResetRequest.objects.filter(email="ghost@aimious.demo").exists()

    def test_invalid_email_is_400(self, api_client):
        response = api_client.post(FORGOT_PASSWORD, {"email": "nope"})

        assert response.status_code == 400
        assert "email" in response.json()["error"]["details"]

    def test_tokens_are_unique_per_request(self, api_client):
        api_client.post(FORGOT_PASSWORD, {"email": "a@aimious.demo"})
        api_client.post(FORGOT_PASSWORD, {"email": "a@aimious.demo"})

        hashes = set(PasswordResetRequest.objects.values_list("token_hash", flat=True))
        assert len(hashes) == 2
