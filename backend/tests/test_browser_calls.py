"""Browser voice demos are authenticated, bounded, and isolated from recruitment data."""

from datetime import timedelta
from unittest.mock import Mock

import httpx
import pytest
from django.core.cache import cache
from django.utils import timezone

from common.enums import ApplicationStatus, ParticipantRole, UserRole
from pipeline.models import Communication, Interview, PhoneCall
from pipeline.services import browser_calls
from tests.test_jobs_support import add_participant, make_application, make_candidate, make_jd

pytestmark = pytest.mark.django_db


@pytest.fixture
def user(user_factory):
    return user_factory(role=UserRole.HR)


@pytest.fixture(autouse=True)
def voice_demo_settings(settings):
    settings.VAPI_API_KEY = "test-vapi-private-key"
    settings.VOICE_PROVIDER = ""
    settings.VAPI_PHONE_NUMBER_ID = ""
    settings.PUBLIC_BASE_URL = ""
    cache.clear()
    yield
    cache.clear()


@pytest.fixture
def provider(monkeypatch):
    response = httpx.Response(
        201,
        json={
            "id": "test-web-call-id",
            "webCallUrl": "https://example.daily.co/test-web-call",
            "privateProviderField": "not-for-the-browser",
        },
        request=httpx.Request("POST", browser_calls.VAPI_WEB_CALL_URL),
    )
    post = Mock(return_value=response)
    monkeypatch.setattr(browser_calls.httpx, "post", post)
    return post


@pytest.fixture
def application(user):
    return make_application(
        make_jd(user, title="Backend Developer"),
        ApplicationStatus.NEW,
        candidate=make_candidate(full_name="Priya Raman", phone=""),
    )


def url(application):
    return f"/api/v1/applications/{application.pk}/browser-call/"


def information_request(**overrides):
    return {
        "purpose": "information",
        "information": "Your interview is tomorrow at 10 AM IST.",
        "max_minutes": 3,
        **overrides,
    }


def test_demo_reuses_scheduling_script_without_recruitment_writes(
    auth_client, user, application, provider
):
    original_updated_at = application.updated_at
    slot = timezone.now() + timedelta(days=1)
    response = auth_client.post(
        url(application),
        {
            "purpose": "schedule_interview",
            "slots": [slot.isoformat()],
            "interview_round": "technical",
            "interviewer": str(user.pk),
            "max_minutes": 4,
            # Even a client trying to request telephone mode cannot dial anyone.
            "mode": "phone",
        },
        format="json",
    )
    assert response.status_code == 201, response.data
    assert response.data == {
        "id": "test-web-call-id",
        "web_call_url": "https://example.daily.co/test-web-call",
        "max_duration_seconds": 240,
    }
    assert response["Cache-Control"] == "no-store"
    assert "test-vapi-private-key" not in response.content.decode()
    assert "privateProviderField" not in response.content.decode()
    application.refresh_from_db()
    assert application.status == ApplicationStatus.NEW
    assert application.updated_at == original_updated_at
    assert not PhoneCall.objects.exists()
    assert not Interview.objects.exists()
    assert not Communication.objects.exists()

    provider.assert_called_once()
    assert provider.call_args.args == (browser_calls.VAPI_WEB_CALL_URL,)
    payload = provider.call_args.kwargs["json"]
    assert "customer" not in payload
    assert "phoneNumberId" not in payload
    assert payload["roomDeleteOnUserLeaveEnabled"] is True
    assistant = payload["assistant"]
    assert assistant["maxDurationSeconds"] == 240
    assert assistant["customerJoinTimeoutSeconds"] == 45
    assert assistant["artifactPlan"]["recordingEnabled"] is False
    assert assistant["serverMessages"] == []
    assert "server" not in assistant
    assert "transcript" in assistant["clientMessages"]
    prompt = assistant["model"]["messages"][0]["content"]
    assert "Priya Raman" in prompt
    assert "Backend Developer" in prompt
    assert browser_calls.DEMO_INSTRUCTIONS in prompt
    assert "AVAILABLE SLOTS" in prompt


def test_information_demo_works_without_a_phone_number(auth_client, application, provider):
    response = auth_client.post(url(application), information_request(), format="json")
    assert response.status_code == 201
    prompt = provider.call_args.kwargs["json"]["assistant"]["model"]["messages"][0]["content"]
    assert "Your interview is tomorrow at 10 AM IST." in prompt
    assert not PhoneCall.objects.exists()


def test_config_reports_browser_readiness_independently_of_telephony(auth_client, settings):
    config = auth_client.get("/api/v1/calls/config/")
    assert config.status_code == 200
    assert config.data["browser_configured"] is True
    assert config.data["configured"] is False
    settings.VAPI_API_KEY = ""
    assert auth_client.get("/api/v1/calls/config/").data["browser_configured"] is False


def test_missing_provider_key_fails_without_an_upstream_request(
    auth_client, application, provider, settings
):
    settings.VAPI_API_KEY = ""
    response = auth_client.post(url(application), information_request(), format="json")
    assert response.status_code == 503
    assert response.data["error"]["code"] == "browser_call_not_configured"
    provider.assert_not_called()


def test_anonymous_user_cannot_start_a_demo(api_client, application, provider):
    response = api_client.post(url(application), information_request(), format="json")
    assert response.status_code == 401
    provider.assert_not_called()


def test_inaccessible_application_is_hidden(api_client, user_factory, application, provider):
    api_client.force_authenticate(user_factory(role=UserRole.HR))
    response = api_client.post(url(application), information_request(), format="json")
    assert response.status_code == 404
    provider.assert_not_called()


def test_visible_application_still_requires_contact_permission(
    api_client, user_factory, application, provider
):
    interviewer = user_factory(role=UserRole.INTERVIEWER)
    add_participant(application.job_description, interviewer, ParticipantRole.INTERVIEWER)
    api_client.force_authenticate(interviewer)
    response = api_client.post(url(application), information_request(), format="json")
    assert response.status_code == 403
    provider.assert_not_called()


@pytest.mark.parametrize(
    "data",
    [
        {"purpose": "schedule_interview"},
        information_request(information=""),
        information_request(max_minutes=31),
        information_request(max_minutes=0),
    ],
)
def test_invalid_input_never_reaches_vapi(auth_client, application, provider, data):
    response = auth_client.post(url(application), data, format="json")
    assert response.status_code == 400
    provider.assert_not_called()


@pytest.mark.parametrize(
    "data",
    [
        [],
        {},
        {"id": 3, "webCallUrl": "https://example.daily.co/room"},
        {"id": "call", "webCallUrl": None},
        {"id": "call", "webCallUrl": "javascript:alert(1)"},
        {"id": "call", "webCallUrl": "http://example.daily.co/room"},
        {"id": "call", "webCallUrl": "https://user:password@example.daily.co/room"},
    ],
)
def test_invalid_provider_session_is_a_safe_error(auth_client, application, provider, data):
    provider.return_value = httpx.Response(
        201, json=data, request=httpx.Request("POST", browser_calls.VAPI_WEB_CALL_URL)
    )
    response = auth_client.post(url(application), information_request(), format="json")
    assert response.status_code == 502
    assert response.data["error"]["message"] == (
        "Vapi did not return a valid browser call session."
    )
    assert not PhoneCall.objects.exists()


def test_provider_rejection_does_not_expose_provider_body(
    auth_client, application, provider, caplog
):
    provider.return_value = httpx.Response(
        403,
        text="sensitive-provider-diagnostic",
        request=httpx.Request("POST", browser_calls.VAPI_WEB_CALL_URL),
    )
    response = auth_client.post(url(application), information_request(), format="json")
    assert response.status_code == 502
    assert "sensitive-provider-diagnostic" not in response.content.decode()
    assert "sensitive-provider-diagnostic" not in caplog.text


def test_provider_timeout_is_a_safe_error(auth_client, application, provider):
    provider.side_effect = httpx.ReadTimeout("sensitive-transport-diagnostic")
    response = auth_client.post(url(application), information_request(), format="json")
    assert response.status_code == 502
    assert "sensitive-transport-diagnostic" not in response.content.decode()


def test_invalid_json_is_a_safe_error(auth_client, application, provider):
    provider.return_value = httpx.Response(
        201,
        text="not-json",
        request=httpx.Request("POST", browser_calls.VAPI_WEB_CALL_URL),
    )
    response = auth_client.post(url(application), information_request(), format="json")
    assert response.status_code == 502


def test_demo_requests_are_throttled_per_user(auth_client, application, provider):
    for _ in range(6):
        assert (
            auth_client.post(url(application), information_request(), format="json").status_code
            == 201
        )
    response = auth_client.post(url(application), information_request(), format="json")
    assert response.status_code == 429
    assert provider.call_count == 6
