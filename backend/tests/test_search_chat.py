"""Results chat integration: access, private history and streamed persistence."""

import json
from types import SimpleNamespace
from unittest.mock import Mock

import pytest

from common.enums import ApplicationStatus, SearchRunStatus, UserRole
from pipeline.models import CandidateMatch, SearchChatMessage, SearchRun
from pipeline.services import chat
from tests.test_jobs_support import make_application, make_candidate, make_jd

pytestmark = pytest.mark.django_db


@pytest.fixture
def run(user):
    job = make_jd(user)
    run = SearchRun.objects.create(
        job_description=job, requested_by=user, status=SearchRunStatus.COMPLETED, total_found=1
    )
    application = make_application(
        job,
        ApplicationStatus.NEW,
        candidate=make_candidate(full_name="Priya Raman"),
        search_run=run,
    )
    CandidateMatch.objects.create(
        application=application,
        overall_pct=90,
        skills_score=90,
        experience_score=90,
        education_score=90,
        domain_score=90,
        responsibility_score=90,
        matched_required_skills=["python"],
        engine="test",
        engine_version="1",
    )
    return run


def url(run):
    return f"/api/v1/searches/{run.pk}/chat/"


def events(response):
    assert response.status_code == 200
    assert response["Content-Type"].startswith("text/event-stream")
    frames = b"".join(response.streaming_content).decode().strip().split("\n\n")
    return [(frame.splitlines()[0][7:], json.loads(frame.splitlines()[1][6:])) for frame in frames]


def test_thread_and_clear_are_private_to_the_user(auth_client, user, user_factory, run):
    other = user_factory()
    own = SearchChatMessage.objects.create(search_run=run, user=user, role="user", content="Mine")
    theirs = SearchChatMessage.objects.create(
        search_run=run, user=other, role="user", content="Private"
    )
    response = auth_client.get(url(run))
    assert response.status_code == 200
    assert response.data["scope"]["ranked"] == 1
    assert [message["id"] for message in response.data["messages"]] == [str(own.pk)]
    assert "Priya Raman" in response.data["suggestions"][0]
    assert auth_client.delete(url(run)).status_code == 204
    assert not SearchChatMessage.objects.filter(pk=own.pk).exists()
    assert SearchChatMessage.objects.filter(pk=theirs.pk).exists()


@pytest.mark.parametrize("method", ["get", "post", "delete"])
def test_inaccessible_search_is_hidden(api_client, user_factory, run, method):
    api_client.force_authenticate(user_factory(role=UserRole.INTERVIEWER))
    response = getattr(api_client, method)(url(run), {"message": "Who is first?"}, format="json")
    assert response.status_code == 404


@pytest.mark.parametrize("message", ["", "   ", "x" * 2001])
def test_question_validation(auth_client, run, message):
    assert auth_client.post(url(run), {"message": message}, format="json").status_code == 400


def test_running_search_cannot_be_questioned(auth_client, run):
    run.status = SearchRunStatus.RUNNING
    run.save(update_fields=["status"])
    assert auth_client.post(url(run), {"message": "Who is first?"}).status_code == 409


def test_stream_stores_answer_and_candidate_citation(auth_client, user, run, monkeypatch):
    client = Mock()
    client.stream.return_value = iter(
        [SimpleNamespace(text="Priya Raman "), SimpleNamespace(text="matches Python at 90%.")]
    )
    monkeypatch.setattr(chat, "chat_model", lambda *args, **kwargs: client)
    frames = events(auth_client.post(url(run), {"message": "Why is Priya Raman first?"}))
    assert [name for name, _ in frames] == ["context", "token", "token", "done"]
    reply = frames[-1][1]["message"]
    assert reply["content"] == "Priya Raman matches Python at 90%."
    assert reply["citations"][0]["name"] == "Priya Raman"
    assert SearchChatMessage.objects.filter(search_run=run, user=user).count() == 2


def test_failed_stream_leaves_no_half_conversation(auth_client, run, monkeypatch):
    client = Mock()
    client.stream.side_effect = RuntimeError("Unavailable")
    monkeypatch.setattr(chat, "chat_model", lambda *args, **kwargs: client)
    frames = events(auth_client.post(url(run), {"message": "Why is Priya Raman first?"}))
    assert frames[-1][0] == "error"
    assert not SearchChatMessage.objects.filter(search_run=run).exists()
