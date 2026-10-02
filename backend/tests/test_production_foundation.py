"""Production invariants: durable work, fencing, cookie CSRF and private media."""

from datetime import timedelta
from unittest.mock import Mock, patch

import pytest
from django.core import mail
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import transaction
from django.test import Client, RequestFactory, override_settings
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from accounts.services import (
    complete_password_reset,
    deliver_password_reset,
    request_password_reset,
)
from common.media import media_token, valid_media_token
from common.middleware import ProductionBoundaryMiddleware
from jobs.services import JobUploadService
from resumes.engines.storage import StorageConfig
from resumes.services.intake import store_uploads
from workqueue.handlers import execute
from workqueue.models import WorkItem
from workqueue.services import (
    LeaseLost,
    claim,
    enqueue,
    finish,
    heartbeat,
    job_context,
    write_guard,
)

pytestmark = pytest.mark.django_db


def test_enqueue_rolls_back_with_business_transaction():
    with pytest.raises(RuntimeError), transaction.atomic():
        enqueue("search", "rollback", {"id": "test"})
        raise RuntimeError
    assert not WorkItem.objects.filter(key="rollback").exists()


def test_idempotent_enqueue_and_claim():
    first = enqueue("search", "one", {"id": "test"})
    assert enqueue("search", "one", {"id": "test"}).pk == first.pk
    claimed = claim()
    assert claimed.pk == first.pk
    assert claimed.attempts == 1
    assert claim() is None
    assert heartbeat(claimed)
    assert finish(claimed) == 1
    assert claim() is None


def test_expired_worker_cannot_overwrite_replacement():
    enqueue("search", "one", {})
    old = claim()
    WorkItem.objects.filter(pk=old.pk).update(lease_until=timezone.now() - timedelta(seconds=1))
    new = claim()
    assert new.pk == old.pk and new.lease_token != old.lease_token
    assert finish(old) == 0
    assert not heartbeat(old)
    with job_context(old), pytest.raises(LeaseLost), write_guard():
        pytest.fail("stale worker acquired the write fence")
    with job_context(new), write_guard():
        assert finish(new) == 1


@override_settings(WORK_MAX_ATTEMPTS=2)
def test_failures_back_off_and_become_dead():
    enqueue("search", "one", {})
    item = claim()
    finish(item, ValueError("private resume or secret"))
    item.refresh_from_db()
    assert item.error == "ValueError"
    assert item.status == WorkItem.Status.PENDING
    assert claim() is None
    WorkItem.objects.filter(pk=item.pk).update(available_at=timezone.now())
    item = claim()
    finish(item, ValueError())
    item.refresh_from_db()
    assert item.status == WorkItem.Status.DEAD


@override_settings(RESUME_INGEST_ASYNC=True)
def test_resume_input_is_durable_and_queued_without_process_thread(user):
    result = store_uploads([SimpleUploadedFile("resume.pdf", b"%PDF-1.4\ncontent")], user)
    from resumes.models import ResumeDocument

    doc = ResumeDocument.objects.get(pk=result.accepted[0].document_id)
    with doc.input_file.open("rb") as source:
        assert source.read() == b"%PDF-1.4\ncontent"
    assert WorkItem.objects.get().payload == {"id": str(doc.pk)}
    assert not doc.source_path.startswith("/tmp/")
    duplicate = store_uploads([SimpleUploadedFile("copy.pdf", b"%PDF-1.4\ncontent")], user)
    assert duplicate.duplicates and WorkItem.objects.count() == 1


def test_job_upload_survives_request_and_has_identifier_only_payload(user):
    upload = JobUploadService.reserve(user, "role.pdf")
    JobUploadService.receive(upload, SimpleUploadedFile("role.pdf", b"%PDF-test"))
    upload.refresh_from_db()
    assert upload.input_file.open("rb").read() == b"%PDF-test"
    assert WorkItem.objects.get().payload == {"id": str(upload.pk)}


def test_s3_uses_task_role_without_static_credentials():
    config = StorageConfig(
        bucket="private-bucket",
        prefix="resumes/",
        region="ap-south-1",
        endpoint_url="",
        access_key="",
        secret_key="",
        url_expiry_seconds=300,
    )
    assert config.configured
    from resumes.engines.storage import S3ResumeStorage

    with patch("boto3.client") as client:
        S3ResumeStorage(config)._require_client()
    assert client.call_args.kwargs["aws_access_key_id"] is None
    assert client.call_args.kwargs["aws_secret_access_key"] is None


def test_login_requires_csrf_and_rejects_cross_origin(user):
    client = Client(enforce_csrf_checks=True)
    body = {"email": user.email, "password": "Demo@1234"}
    assert client.post("/api/v1/auth/login/", body).status_code == 403
    token = client.get("/api/v1/auth/csrf/").json()["csrfToken"]
    assert client.post("/api/v1/auth/login/", body, HTTP_X_CSRFTOKEN=token).status_code == 200
    assert (
        client.post(
            "/api/v1/auth/refresh/", HTTP_X_CSRFTOKEN=token, HTTP_ORIGIN="https://attacker.example"
        ).status_code
        == 403
    )
    assert client.post("/api/v1/auth/logout/").status_code == 403


@override_settings(PUBLIC_BASE_URL="https://talent.example.com")
def test_reset_email_one_use_and_session_revocation(user):
    from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken

    from accounts.services import start_session

    session = start_session(user, remember_me=False)
    assert session.refresh
    reset = request_password_reset(user.email, None)
    assert WorkItem.objects.get().payload == {"id": str(reset.request.pk)}
    deliver_password_reset(reset.request.pk)
    assert len(mail.outbox) == 1 and "/reset-password#token=" in mail.outbox[0].body
    assert mail.outbox[0].to == [user.email]
    complete_password_reset(reset.token, "New-strong-password-782!")
    user.refresh_from_db()
    assert user.check_password("New-strong-password-782!")
    assert BlacklistedToken.objects.exists()
    with pytest.raises(ValidationError):
        complete_password_reset(reset.token, "Another-strong-password-781!")


def test_unknown_user_does_not_receive_reset_mail():
    reset = request_password_reset("absent@example.com", None)
    deliver_password_reset(reset.request.pk)
    assert not mail.outbox


def test_reset_rejects_expired_token_and_weak_password(user):
    reset = request_password_reset(user.email, None)
    with pytest.raises(ValidationError):
        complete_password_reset(reset.token, "123")
    reset.request.expires_at = timezone.now() - timedelta(seconds=1)
    reset.request.save()
    with pytest.raises(ValidationError):
        complete_password_reset(reset.token, "Strong-password-179!")


def test_media_token_expiry_and_object_binding():
    with patch("time.time", return_value=1000):
        token = media_token("candidate-photo", "candidate-1")
    with patch("time.time", return_value=1001):
        assert valid_media_token("candidate-photo", "candidate-1", token)
        assert not valid_media_token("candidate-photo", "candidate-2", token)
        assert not valid_media_token("support-attachment", "candidate-1", token)
    with patch("time.time", return_value=2000):
        assert not valid_media_token("candidate-photo", "candidate-1", token)


@override_settings(ORIGIN_VERIFY_SECRET="origin-secret")
def test_edge_boundary_rejects_spoofed_ip_and_limits_bodies():
    from django.http import HttpResponse

    factory = RequestFactory()
    boundary = ProductionBoundaryMiddleware(lambda _: HttpResponse("ok"))
    assert boundary(factory.get("/api/v1/health/")).status_code == 403
    request = factory.get(
        "/api/v1/health/",
        HTTP_X_ORIGIN_VERIFY="origin-secret",
        HTTP_X_TALENT_CLIENT_IP="192.0.2.1",
        HTTP_X_FORWARDED_FOR="attacker",
    )
    assert boundary(request).status_code == 200
    assert request.META["REMOTE_ADDR"] == "192.0.2.1"
    assert "HTTP_X_FORWARDED_FOR" not in request.META
    request.method = "POST"
    request.META["CONTENT_LENGTH"] = str(33 * 1024 * 1024)
    assert boundary(request).status_code == 413
    assert boundary(factory.get("/health/live", HTTP_HOST="10.0.1.2")).status_code == 200


def test_readiness_fails_without_cache():
    boundary = ProductionBoundaryMiddleware(Mock())
    with patch("common.middleware.cache.get", side_effect=ConnectionError):
        assert boundary(RequestFactory().get("/health/ready")).status_code == 503


def test_webhook_secret_is_mandatory(settings):
    from pipeline.services.voice import VapiProvider

    settings.VAPI_WEBHOOK_SECRET = ""
    assert not VapiProvider.verify({})


def test_unknown_handler_is_not_executable():
    item = WorkItem(kind="os.system", payload={"command": "anything"})
    with pytest.raises(ValueError, match="unknown work kind"):
        execute(item)


def test_voice_webhook_deduplicates_and_queues_identifier_only():
    from pipeline.models import VoiceWebhook
    from pipeline.services.calls import receive_voice_webhook

    payload = {
        "message": {"type": "status-update", "call": {"id": "provider-123"}, "status": "ringing"}
    }
    receive_voice_webhook(payload)
    receive_voice_webhook(payload)
    assert VoiceWebhook.objects.count() == WorkItem.objects.count() == 1
    assert WorkItem.objects.get().payload == {"id": str(VoiceWebhook.objects.get().pk)}


def test_production_settings_reject_unsafe_configuration():
    import os
    import subprocess
    import sys
    from pathlib import Path

    backend = Path(__file__).resolve().parents[1]
    env = {
        "PATH": os.environ.get("PATH", ""),
        "DJANGO_SETTINGS_MODULE": "config.settings.prod",
        "DJANGO_SECRET_KEY": "validation-only-secret-with-50-characters-192837465-AZz",
        "DJANGO_ALLOWED_HOSTS": "talent.example.com,origin.talent.example.com",
        "JWT_COOKIE_SECURE": "true",
        "PUBLIC_BASE_URL": "https://talent.example.com",
        "DATABASE_URL": "postgres://runtime:test@db.example.com/talentos?sslmode=verify-full&sslrootcert=/app/certs/rds-global-bundle.pem",
        "CACHE_URL": "rediss://:test-cache-token@cache.example.com:6379/0",
        "RESUME_S3_BUCKET": "private-test-media",
        "WORK_QUEUE_URL": "https://sqs.ap-south-1.amazonaws.com/123456789012/jobs",
        "LLM_ALLOWED_PROVIDERS": "openai",
        "EMAIL_HOST": "smtp.example.com",
        "COMPANY_PROFILE": "Validation company profile",
        "OPENAI_API_KEY": "validation-only-not-a-real-provider-key",
        "DEFAULT_FROM_EMAIL": "talent@example.com",
        "ORIGIN_VERIFY_SECRET": "origin-validation-secret-longer-than-32-characters",
    }
    command = [sys.executable, "-c", "import django; django.setup()"]
    healthy = subprocess.run(command, cwd=backend, env=env, capture_output=True, text=True)
    assert healthy.returncode == 0, healthy.stderr
    cases = {
        "DJANGO_SECRET_KEY": "change-me",
        "DJANGO_ALLOWED_HOSTS": "*",
        "JWT_COOKIE_SECURE": "false",
        "CACHE_URL": "locmemcache://test",
        "DATABASE_URL": "postgres://test:test@db/test",
        "RESUME_S3_BUCKET": "",
        "ORIGIN_VERIFY_SECRET": "",
        "LLM_ALLOWED_PROVIDERS": "",
        "VOICE_PROVIDER": "vapi",
        "PUBLIC_BASE_URL": "http://talent.example.com",
    }
    for key, value in cases.items():
        result = subprocess.run(command, cwd=backend, env={**env, key: value}, capture_output=True)
        assert result.returncode != 0, f"Production accepted insecure {key}"


def test_sse_heartbeats_and_cancellation(settings):
    from common.streaming import heartbeat_stream

    settings.STREAM_HEARTBEAT_ENABLED = True
    settings.STREAM_MAX_SECONDS = 0.05
    import time

    closed = []

    def slow_source():
        try:
            time.sleep(0.02)
            yield 'event: token\ndata: {"text":"hello"}\n\n'
        finally:
            closed.append(True)

    result = list(heartbeat_stream(slow_source()))
    assert result[0] == ": connected\n\n"
    assert "hello" in "".join(result)
    assert closed


def test_json_logs_redact_credentials_and_urls(settings):
    import json
    import logging

    from common.logging import JsonFormatter

    settings.OPENAI_API_KEY = "private-key-example"
    record = logging.LogRecord(
        "test",
        logging.ERROR,
        "",
        1,
        "Failed private-key-example https://example.com/?token=secret user@example.com",
        (),
        None,
    )
    output = json.loads(JsonFormatter().format(record))["message"]
    assert "private-key-example" not in output
    assert "token=secret" not in output
    assert "user@example.com" not in output


@pytest.mark.django_db(transaction=True)
def test_concurrent_refresh_rotates_only_once(user):
    from concurrent.futures import ThreadPoolExecutor
    from threading import Barrier

    from django.db import connections

    from accounts.exceptions import RefreshTokenInvalid
    from accounts.services import rotate_session, start_session

    raw = start_session(user, remember_me=False).refresh
    ready = Barrier(2)

    def rotate():
        try:
            ready.wait(timeout=5)
            rotate_session(raw)
            return "rotated"
        except RefreshTokenInvalid:
            return "rejected"
        finally:
            connections.close_all()

    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(lambda _: rotate(), range(2))) == ["rejected", "rotated"]


def test_password_change_rejects_old_access_token(user, monkeypatch):
    from rest_framework.test import APIClient

    from accounts.services import change_password, start_session

    # SimpleJWT modules retain their imported APISettings instance; Django's
    # override_settings signal replaces the source object instead of those refs.
    monkeypatch.setattr("rest_framework_simplejwt.tokens.api_settings.CHECK_REVOKE_TOKEN", True)
    monkeypatch.setattr(
        "rest_framework_simplejwt.authentication.api_settings.CHECK_REVOKE_TOKEN", True
    )
    token = start_session(user, remember_me=False).access
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION="Bearer " + token)
    assert client.get("/api/v1/auth/me/").status_code == 200
    change_password(user, "A-different-strong-password-872!")
    assert client.get("/api/v1/auth/me/").status_code == 401


def test_s3_input_is_the_resume_original_without_second_upload(settings):
    from resumes.models import ResumeDocument, StorageStatus
    from resumes.services.ingestion import upload

    settings.RESUME_S3_BUCKET = "test-private-media"
    settings.STORAGES = {
        "default": {
            "BACKEND": "storages.backends.s3.S3Storage",
            "OPTIONS": {"bucket_name": "test-private-media"},
        },
        "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"},
    }
    document = ResumeDocument.objects.create(
        file_name="resume.pdf",
        file_hash="a" * 64,
        input_file="inputs/resumes/example.pdf",
        file_size=12,
    )
    with patch("resumes.engines.storage.S3ResumeStorage.upload_file") as transfer:
        assert upload({"document_id": str(document.pk), "path": "/missing/file.pdf"})["uploaded"]
    transfer.assert_not_called()
    document.refresh_from_db()
    assert document.storage_status == StorageStatus.UPLOADED
    assert document.storage_key == document.input_file.name


def test_migration_task_uses_separate_database_secret_and_has_no_health_probe():
    import importlib.util
    from pathlib import Path

    spec = importlib.util.spec_from_file_location(
        "release_deploy", Path(__file__).resolve().parents[2] / "scripts/release/deploy.py"
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    original = {
        "family": "api",
        "taskDefinitionArn": "not-a-registration-field",
        "revision": 5,
        "containerDefinitions": [
            {
                "name": "app",
                "image": "old",
                "environment": [],
                "healthCheck": {"command": ["test"]},
                "portMappings": [{"containerPort": 8200}],
                "secrets": [{"name": "DATABASE_URL", "valueFrom": "runtime-secret"}],
            }
        ],
    }
    task = module.migration_definition(original, "repository@sha256:digest", "secret-arn")
    app = task["containerDefinitions"][0]
    assert app["command"] == ["python", "manage.py", "release_migrate"]
    assert app["secrets"][0]["valueFrom"] == "secret-arn:MIGRATION_DATABASE_URL::"
    assert "healthCheck" not in app and "portMappings" not in app
    assert "revision" not in task and "taskDefinitionArn" not in task
    assert original["containerDefinitions"][0]["image"] == "old"


@override_settings(RESUME_INGEST_ASYNC=True)
def test_resume_retry_reuses_work_record_without_parallel_attempts(user):
    from resumes.models import ResumeDocument, ResumeStatus

    data = b"%PDF-1.4\nretry-test"
    first = store_uploads([SimpleUploadedFile("first.pdf", data)], user)
    document = ResumeDocument.objects.get(pk=first.accepted[0].document_id)
    document.status = ResumeStatus.FAILED
    document.save()
    # The original worker has scheduled a retry: uploading again must not race it.
    assert store_uploads([SimpleUploadedFile("again.pdf", data)], user).duplicates
    work = WorkItem.objects.get()
    work.status = WorkItem.Status.DEAD
    work.attempts = 3
    work.save()
    assert store_uploads([SimpleUploadedFile("again.pdf", data)], user).accepted
    work.refresh_from_db()
    assert WorkItem.objects.count() == 1
    assert work.status == WorkItem.Status.PENDING and work.attempts == 0


def test_queue_transport_failure_preserves_runnable_database_work():
    from workqueue.management.commands.run_worker import Command

    item = enqueue("search", "transport-failure", {"id": "example"})
    sqs = Mock()
    sqs.send_message.side_effect = ConnectionError("transport offline")
    assert not Command().publish(sqs)
    item.refresh_from_db()
    assert item.published_at is None
    assert claim().pk == item.pk


@pytest.mark.django_db(transaction=True)
def test_parallel_password_reset_links_have_one_winner(user):
    from concurrent.futures import ThreadPoolExecutor
    from threading import Barrier

    from django.db import connections

    tokens = [request_password_reset(user.email, None).token for _ in range(2)]
    ready = Barrier(2)

    def complete(token):
        try:
            ready.wait(timeout=5)
            complete_password_reset(token, "Concurrency-safe-password-758!")
            return "reset"
        except ValidationError:
            return "rejected"
        finally:
            connections.close_all()

    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(complete, tokens)) == ["rejected", "reset"]
