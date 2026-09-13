"""Login throttling (plan.md 6.9): 10 attempts per minute per IP through DRF's
scoped throttle. The test settings raise the rate so the rest of the suite can
log in freely; these tests lower it again with ``override_settings``."""

from __future__ import annotations

import pytest
from django.conf import settings
from django.core.cache import cache
from django.test import override_settings

from common.throttles import LoginRateThrottle, PasswordResetRateThrottle
from config.settings import base as base_settings

pytestmark = pytest.mark.django_db

LOGIN = "/api/v1/auth/login/"
FORGOT = "/api/v1/auth/forgot-password/"

LOW_RATES = {
    **settings.REST_FRAMEWORK,
    "DEFAULT_THROTTLE_RATES": {"login": "3/min", "password_reset": "2/min"},
}


@pytest.fixture(autouse=True)
def _fresh_throttle_counters():
    cache.clear()
    yield
    cache.clear()


def attempt(client, ip="203.0.113.10", password="wrong"):
    return client.post(LOGIN, {"email": "rahul@aimious.demo", "password": password}, REMOTE_ADDR=ip)


def test_production_rate_is_ten_per_minute_per_ip():
    assert base_settings.REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]["login"] == "10/min"
    assert LoginRateThrottle.scope == "login"
    assert PasswordResetRateThrottle.scope == "password_reset"


@override_settings(REST_FRAMEWORK=LOW_RATES)
def test_attempts_over_the_rate_are_429_with_the_error_envelope(api_client):
    for _ in range(3):
        assert attempt(api_client).status_code == 401

    response = attempt(api_client)

    assert response.status_code == 429
    body = response.json()["error"]
    assert body["code"] == "throttled"
    assert body["message"]
    assert isinstance(body["details"]["wait"], int) and body["details"]["wait"] > 0
    assert response["Retry-After"]


@override_settings(REST_FRAMEWORK=LOW_RATES)
def test_successful_logins_count_towards_the_limit(api_client, user_factory):
    user_factory(email="rahul@aimious.demo", password="Demo@1234")

    for _ in range(3):
        assert attempt(api_client, password="Demo@1234").status_code == 200

    assert attempt(api_client, password="Demo@1234").status_code == 429


@override_settings(REST_FRAMEWORK=LOW_RATES)
def test_throttle_is_per_client_ip(api_client):
    for _ in range(3):
        attempt(api_client, ip="203.0.113.10")
    assert attempt(api_client, ip="203.0.113.10").status_code == 429

    assert attempt(api_client, ip="203.0.113.11").status_code == 401


@override_settings(REST_FRAMEWORK=LOW_RATES)
def test_forgot_password_has_its_own_scope(api_client):
    for _ in range(2):
        assert api_client.post(FORGOT, {"email": "x@aimious.demo"}).status_code == 202

    assert api_client.post(FORGOT, {"email": "x@aimious.demo"}).status_code == 429
    # A throttled forgot-password does not block logging in.
    assert attempt(api_client, ip="127.0.0.1").status_code == 401
