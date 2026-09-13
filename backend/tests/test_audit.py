"""audit.AuditMiddleware (plan.md 6.9 Audit, 6.3 audit.AuditLog): one row per
mutating API request with actor, derived action and entity, redacted body,
client address, request id (echoed as X-Request-ID) and status code."""

from __future__ import annotations

import uuid

import pytest
from django.http import HttpResponse
from django.test import RequestFactory

from audit import middleware
from audit.dtos import client_ip
from audit.middleware import AuditMiddleware, derive_action, parse_entity, redact, resolve_actor
from audit.models import AuditLog
from common.enums import AuditAction, UserRole

pytestmark = pytest.mark.django_db

ME = "/api/v1/auth/me/"
LOGIN = "/api/v1/auth/login/"
USERS = "/api/v1/users/"
FORGOT = "/api/v1/auth/forgot-password/"

JD_ID = "3d5a1c2e-7b8f-4a6d-9e0f-1a2b3c4d5e6f"


# ---------------------------------------------------------------- pure rules


@pytest.mark.parametrize(
    ("method", "path", "expected"),
    [
        ("POST", "/api/v1/job-descriptions/", AuditAction.CREATE),
        ("POST", "/api/v1/candidates/", AuditAction.CREATE),
        ("POST", f"/api/v1/job-descriptions/{JD_ID}/duplicate/", AuditAction.CREATE),
        ("PATCH", f"/api/v1/job-descriptions/{JD_ID}/", AuditAction.UPDATE),
        ("PUT", f"/api/v1/candidates/{JD_ID}/", AuditAction.UPDATE),
        ("DELETE", f"/api/v1/job-descriptions/{JD_ID}/", AuditAction.DELETE),
        ("DELETE", f"/api/v1/job-descriptions/{JD_ID}/participants/{JD_ID}/", AuditAction.DELETE),
        ("POST", f"/api/v1/applications/{JD_ID}/transition/", AuditAction.STATUS_CHANGE),
        ("POST", "/api/v1/applications/bulk-transition/", AuditAction.STATUS_CHANGE),
        ("POST", f"/api/v1/job-descriptions/{JD_ID}/status/", AuditAction.STATUS_CHANGE),
        ("POST", f"/api/v1/job-descriptions/{JD_ID}/publish/", AuditAction.STATUS_CHANGE),
        ("POST", f"/api/v1/job-descriptions/{JD_ID}/archive/", AuditAction.STATUS_CHANGE),
        ("POST", f"/api/v1/offers/{JD_ID}/accept/", AuditAction.STATUS_CHANGE),
        ("POST", f"/api/v1/interviews/{JD_ID}/cancel/", AuditAction.STATUS_CHANGE),
        ("POST", f"/api/v1/onboardings/{JD_ID}/complete/", AuditAction.STATUS_CHANGE),
        # An action on an existing entity that is not a status change is an update.
        ("POST", f"/api/v1/applications/{JD_ID}/rematch/", AuditAction.UPDATE),
        ("POST", f"/api/v1/interviews/{JD_ID}/feedback/", AuditAction.UPDATE),
        ("POST", f"/api/v1/job-descriptions/{JD_ID}/participants/", AuditAction.UPDATE),
        ("POST", f"/api/v1/notifications/{JD_ID}/read/", AuditAction.UPDATE),
        ("POST", "/api/v1/notifications/read-all/", AuditAction.UPDATE),
        ("POST", "/api/v1/auth/forgot-password/", AuditAction.CREATE),
        ("PATCH", "/api/v1/auth/me/", AuditAction.UPDATE),
    ],
)
def test_derive_action(method, path, expected):
    assert derive_action(method, path) == expected


@pytest.mark.parametrize(
    ("path", "expected"),
    [
        ("/api/v1/job-descriptions/", ("job-descriptions", "")),
        (f"/api/v1/job-descriptions/{JD_ID}/", ("job-descriptions", JD_ID)),
        (f"/api/v1/job-descriptions/{JD_ID}/participants/{JD_ID}/", ("job-descriptions", JD_ID)),
        ("/api/v1/applications/bulk-transition/", ("applications", "")),
        ("/api/v1/notifications/42/read/", ("notifications", "42")),
        ("/api/v1/auth/me/", ("auth", "")),
        ("/api/v1/", ("", "")),
        ("/api/v2/candidates/x/", ("candidates", "")),
    ],
)
def test_parse_entity(path, expected):
    assert parse_entity(path) == expected


def test_redact_hides_secrets_recursively_without_touching_the_input():
    body = {
        "email": "rahul@aimious.demo",
        "password": "Demo@1234",
        "current_password": "a",
        "new_password": "b",
        "refresh": "eyJ...",
        "nested": {"api_token": "t", "keep": 1, "items": [{"secret_key": "s", "n": 2}]},
        "list": ["x", {"password_confirm": "y"}],
    }
    snapshot = dict(body)

    redacted = redact(body)

    assert redacted == {
        "email": "rahul@aimious.demo",
        "password": "***",
        "current_password": "***",
        "new_password": "***",
        "refresh": "***",
        "nested": {"api_token": "***", "keep": 1, "items": [{"secret_key": "***", "n": 2}]},
        "list": ["x", {"password_confirm": "***"}],
    }
    assert body == snapshot


def test_client_ip_prefers_the_first_forwarded_address():
    rf = RequestFactory()

    assert client_ip(rf.get("/", REMOTE_ADDR="10.0.0.9")) == "10.0.0.9"
    assert (
        client_ip(rf.get("/", REMOTE_ADDR="10.0.0.9", HTTP_X_FORWARDED_FOR="203.0.113.5, 10.0.0.1"))
        == "203.0.113.5"
    )
    assert client_ip(rf.get("/", REMOTE_ADDR="10.0.0.9", HTTP_X_FORWARDED_FOR="garbage")) is None


# --------------------------------------------------------------- actor


def login_access(client, user_factory) -> tuple:
    user = user_factory(role=UserRole.HR, password="Demo@1234")
    response = client.post(LOGIN, {"email": user.email, "password": "Demo@1234"})
    assert response.status_code == 200
    return user, response.json()["access"]


def test_resolve_actor_decodes_the_bearer_header_without_raising(api_client, user_factory):
    user, access = login_access(api_client, user_factory)
    rf = RequestFactory()

    assert resolve_actor(rf.get("/api/v1/x/", HTTP_AUTHORIZATION=f"Bearer {access}")) == user
    assert resolve_actor(rf.get("/api/v1/x/", HTTP_AUTHORIZATION="Bearer nope")) is None
    assert resolve_actor(rf.get("/api/v1/x/", HTTP_AUTHORIZATION="Token abc")) is None
    assert resolve_actor(rf.get("/api/v1/x/")) is None


def test_resolve_actor_prefers_the_user_drf_already_authenticated(user_factory):
    user = user_factory()
    request = RequestFactory().get("/api/v1/x/")
    request.user = user

    assert resolve_actor(request) == user


# -------------------------------------------------------------- middleware


def test_get_requests_are_not_audited_but_carry_a_request_id(auth_client):
    response = auth_client.get(ME)

    assert response.status_code == 200
    assert uuid.UUID(response["X-Request-ID"])
    assert AuditLog.objects.count() == 0


def test_incoming_request_id_is_reused_when_it_is_a_uuid(auth_client):
    given = str(uuid.uuid4())

    assert auth_client.get(ME, HTTP_X_REQUEST_ID=given)["X-Request-ID"] == given
    assert auth_client.get(ME, HTTP_X_REQUEST_ID="not-a-uuid")["X-Request-ID"] != "not-a-uuid"


def test_mutating_request_with_bearer_writes_a_full_row(api_client, user_factory):
    user, access = login_access(api_client, user_factory)
    AuditLog.objects.all().delete()
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}", HTTP_USER_AGENT="pytest/1.0")

    response = api_client.patch(
        ME, {"first_name": "Renamed", "password": "should-not-be-stored"}, REMOTE_ADDR="10.9.8.7"
    )

    assert response.status_code == 200
    row = AuditLog.objects.get()
    assert row.actor == user
    assert row.action == AuditAction.UPDATE
    assert row.entity_type == "auth"
    assert row.entity_id == ""
    assert row.changes == {"first_name": "Renamed", "password": "***"}
    assert row.ip_address == "10.9.8.7"
    assert row.user_agent == "pytest/1.0"
    assert str(row.request_id) == response["X-Request-ID"]
    assert row.path == ME
    assert row.status_code == 200


def test_entity_id_comes_from_the_path(as_admin_client, people):
    target = people["vikram"]

    response = as_admin_client.patch(f"{USERS}{target.id}/", {"role": "hr", "password": "x"})

    assert response.status_code == 200
    row = AuditLog.objects.get()
    assert row.actor == people["rahul"]
    assert row.action == AuditAction.UPDATE
    assert row.entity_type == "users"
    assert row.entity_id == str(target.id)
    assert row.changes == {"role": "hr", "password": "***"}


def test_anonymous_mutations_and_failures_are_recorded(api_client):
    forgot = api_client.post(FORGOT, {"email": "ghost@aimious.demo"})
    missing = api_client.post("/api/v1/does-not-exist/", {"a": 1})
    denied = api_client.patch(ME, {"first_name": "X"})

    assert (forgot.status_code, missing.status_code, denied.status_code) == (202, 404, 401)
    rows = {row.path: row for row in AuditLog.objects.all()}
    assert rows[FORGOT].action == AuditAction.CREATE
    assert rows[FORGOT].actor is None
    assert rows[FORGOT].entity_type == "auth"
    assert rows[FORGOT].changes == {"email": "ghost@aimious.demo"}
    assert rows[FORGOT].status_code == 202
    assert rows["/api/v1/does-not-exist/"].status_code == 404
    assert rows["/api/v1/does-not-exist/"].entity_type == "does-not-exist"
    assert rows[ME].status_code == 401 and rows[ME].actor is None


def test_non_json_and_oversized_bodies_are_not_stored(auth_client, monkeypatch):
    monkeypatch.setattr(middleware, "MAX_BODY_BYTES", 32)

    small = auth_client.patch(ME, {"first_name": "A"})
    big = auth_client.patch(ME, {"avatar_url": f"https://cdn.example.com/{'a' * 100}.png"})
    form = auth_client.patch(
        ME, "first_name=Form", content_type="application/x-www-form-urlencoded"
    )

    assert (small.status_code, big.status_code, form.status_code) == (200, 200, 200)
    small_row, big_row, form_row = AuditLog.objects.order_by("created_at")
    assert small_row.changes == {"first_name": "A"}
    assert big_row.changes == {"_omitted": "body larger than 32 bytes"}
    assert form_row.changes == {}


def test_requests_outside_the_api_are_ignored(api_client):
    response = api_client.post("/admin/login/", {"username": "x", "password": "y"})

    assert response.status_code in (200, 302)
    assert "X-Request-ID" not in response
    assert AuditLog.objects.count() == 0


def test_options_and_head_are_ignored(auth_client):
    auth_client.options(ME)
    auth_client.head(ME)

    assert AuditLog.objects.count() == 0


def test_a_failing_audit_write_never_breaks_the_response(auth_client, monkeypatch, caplog):
    def explode(**kwargs):
        raise RuntimeError("disk on fire")

    monkeypatch.setattr(AuditLog.objects, "create", explode)

    response = auth_client.patch(ME, {"first_name": "Still"})

    assert response.status_code == 200
    assert response.json()["first_name"] == "Still"
    assert "audit" in caplog.text.lower()


def test_middleware_can_be_unit_tested_with_a_plain_django_stack(user_factory):
    user = user_factory()
    rf = RequestFactory()
    request = rf.post(
        f"/api/v1/applications/{JD_ID}/transition/",
        data='{"status": "contacted", "note": "called", "password": "p"}',
        content_type="application/json",
        REMOTE_ADDR="192.0.2.4",
    )
    request.user = user

    def view(req):
        # The body must still be readable by the view after the middleware captured it.
        assert req.body
        return HttpResponse(status=200)

    response = AuditMiddleware(view)(request)

    assert response["X-Request-ID"]
    row = AuditLog.objects.get()
    assert row.actor == user
    assert row.action == AuditAction.STATUS_CHANGE
    assert row.entity_type == "applications"
    assert row.entity_id == JD_ID
    assert row.changes == {"status": "contacted", "note": "called", "password": "***"}
    assert row.ip_address == "192.0.2.4"
    assert str(row.request_id) == response["X-Request-ID"]


# ---------------------------------------------------------------- fixtures


@pytest.fixture
def people(user_factory) -> dict:
    return {
        "rahul": user_factory(role=UserRole.HR_ADMIN, first_name="Rahul", last_name="Venkat"),
        "vikram": user_factory(role=UserRole.EMPLOYEE, first_name="Vikram", last_name="Shah"),
    }


@pytest.fixture
def as_admin_client(api_client, people):
    api_client.force_authenticate(user=people["rahul"])
    return api_client
