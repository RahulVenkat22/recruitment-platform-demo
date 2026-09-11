"""GET /api/v1/health/ (plan.md 6.10): public, reports the database check."""

import pytest
from django.urls import reverse


@pytest.mark.django_db
def test_health_returns_ok_without_authentication(api_client):
    response = api_client.get(reverse("api-v1:health"))

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": "ok"}


@pytest.mark.django_db
def test_health_ignores_invalid_bearer_tokens(api_client):
    api_client.credentials(HTTP_AUTHORIZATION="Bearer not-a-real-token")

    response = api_client.get("/api/v1/health/")

    assert response.status_code == 200


def test_health_reports_database_failure(api_client, monkeypatch):
    from django.db import DatabaseError

    from common import views

    def failing_check() -> None:
        raise DatabaseError("connection refused")

    monkeypatch.setattr(views, "_check_database", failing_check)

    response = api_client.get("/api/v1/health/")

    assert response.status_code == 503
    assert response.json() == {"status": "degraded", "database": "error"}
