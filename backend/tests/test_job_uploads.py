"""Navigation-independent JD uploads, ownership and cancellation races."""

from unittest.mock import Mock

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile

from common.enums import UserRole
from jobs.models import JobDescriptionUpload
from jobs.services import JobUploadService

pytestmark = pytest.mark.django_db(transaction=True)
URL = "/api/v1/job-description-uploads/"


@pytest.fixture
def client(api_client, user_factory):
    api_client.force_authenticate(user=user_factory(role=UserRole.HR))
    return api_client


@pytest.fixture
def launch(monkeypatch):
    mock = Mock()
    monkeypatch.setattr(JobUploadService, "launch", mock)
    return mock


def reserve(client, name="role.pdf"):
    response = client.post(URL, {"file_name": name}, format="json")
    assert response.status_code == 201, response.data
    return response.data["id"]


def test_upload_survives_new_requests_and_keeps_result_for_review(client, launch, monkeypatch):
    upload_id = reserve(client)
    response = client.post(
        f"{URL}{upload_id}/file/",
        {"file": SimpleUploadedFile("role.pdf", b"%PDF-test")},
        format="multipart",
    )
    assert response.status_code == 202
    assert response.data["status"] == "processing"
    launch.assert_called_once()
    assert client.get(URL).data[0]["id"] == upload_id

    monkeypatch.setattr(
        "jobs.engines.extract_job_description", lambda file: {"title": "Python Developer"}
    )
    JobUploadService.process(upload_id, "role.pdf", b"%PDF-test")
    result = client.get(f"{URL}{upload_id}/").data
    assert result["status"] == "ready"
    assert result["fields"]["title"] == "Python Developer"
    assert client.get(URL).data[0]["fields"] == result["fields"]
    assert client.post(f"{URL}{upload_id}/dismiss/").status_code == 204
    assert client.get(URL).data == []


def test_cancel_before_file_arrives_never_launches_worker(client, launch):
    upload_id = reserve(client)
    assert client.post(f"{URL}{upload_id}/cancel/").data["status"] == "cancelled"
    response = client.post(
        f"{URL}{upload_id}/file/",
        {"file": SimpleUploadedFile("role.pdf", b"%PDF-test")},
        format="multipart",
    )
    assert response.data["status"] == "cancelled"
    launch.assert_not_called()
    assert client.get(URL).data == []
    assert client.post(f"{URL}{upload_id}/cancel/").status_code == 200


def test_cancel_wins_over_a_late_ai_result(client, launch, monkeypatch):
    upload_id = reserve(client)
    client.post(
        f"{URL}{upload_id}/file/",
        {"file": SimpleUploadedFile("role.pdf", b"%PDF-test")},
        format="multipart",
    )

    def extract(file):
        JobUploadService.cancel(JobDescriptionUpload.objects.get(pk=upload_id))
        return {"title": "Must not be restored"}

    monkeypatch.setattr("jobs.engines.extract_job_description", extract)
    JobUploadService.process(upload_id, "role.pdf", b"%PDF-test")
    result = client.get(f"{URL}{upload_id}/").data
    assert result["status"] == "cancelled"
    assert result["fields"] == {}


def test_cancelled_upload_is_skipped_before_extraction(client, monkeypatch):
    upload_id = reserve(client)
    client.post(f"{URL}{upload_id}/cancel/")
    extract = Mock()
    monkeypatch.setattr("jobs.engines.extract_job_description", extract)
    JobUploadService.process(upload_id, "role.pdf", b"%PDF-test")
    extract.assert_not_called()


def test_provider_failure_remains_visible_until_dismissed(client, launch, monkeypatch):
    from jobs.exceptions import JobFileNotRead

    upload_id = reserve(client)
    client.post(
        f"{URL}{upload_id}/file/",
        {"file": SimpleUploadedFile("role.pdf", b"%PDF-test")},
        format="multipart",
    )
    monkeypatch.setattr(
        "jobs.engines.extract_job_description", Mock(side_effect=JobFileNotRead("No credits"))
    )
    JobUploadService.process(upload_id, "role.pdf", b"%PDF-test")
    result = client.get(URL).data[0]
    assert result["status"] == "failed"
    assert result["error"] == "No credits"


def test_owner_is_required_for_status_cancel_and_file(client, api_client, user_factory, launch):
    upload_id = reserve(client)
    api_client.force_authenticate(user=user_factory(role=UserRole.HR_ADMIN))
    assert api_client.get(URL).data == []
    assert api_client.get(f"{URL}{upload_id}/").status_code == 404
    assert api_client.post(f"{URL}{upload_id}/cancel/").status_code == 404
    assert api_client.post(f"{URL}{upload_id}/dismiss/").status_code == 404
    assert (
        api_client.post(
            f"{URL}{upload_id}/file/",
            {"file": SimpleUploadedFile("role.pdf", b"%PDF-test")},
            format="multipart",
        ).status_code
        == 404
    )
    launch.assert_not_called()


def test_one_active_upload_and_explicit_cancel_required(client):
    upload_id = reserve(client)
    assert client.post(URL, {"file_name": "another.pdf"}, format="json").status_code == 400
    assert client.post(f"{URL}{upload_id}/dismiss/").status_code == 400
    client.post(f"{URL}{upload_id}/cancel/")
    assert reserve(client, "another.docx") != upload_id


def test_duplicate_file_transfer_does_not_start_two_workers(client, launch):
    upload_id = reserve(client)
    for _ in range(2):
        assert (
            client.post(
                f"{URL}{upload_id}/file/",
                {"file": SimpleUploadedFile("role.pdf", b"%PDF-test")},
                format="multipart",
            ).status_code
            == 202
        )
    assert launch.call_count == 1


def test_rejects_unsupported_files_and_non_hr(api_client, user_factory, client):
    assert client.post(URL, {"file_name": "role.exe"}, format="json").status_code == 400
    api_client.force_authenticate(user=user_factory(role=UserRole.EMPLOYEE))
    assert api_client.post(URL, {"file_name": "role.pdf"}, format="json").status_code == 403
    assert api_client.get(URL).status_code == 403
