"""Chat failover is ordered, bounded, provider-aware and independent of embeddings."""

from unittest.mock import Mock

import httpx
import openai
import pytest
from langchain_core.exceptions import OutputParserException
from langchain_core.messages import HumanMessage
from pydantic import BaseModel

from jobs import engines as jobs
from resumes.engines import embeddings, llm, parsing
from resumes.engines.pdf_payload import PdfPayload
from resumes.engines.schemas import ParsedResume
from resumes.services.ingestion import _llm_provenance


class Answer(BaseModel):
    text: str


@pytest.fixture(autouse=True)
def llm_settings(settings):
    settings.LLM_PROVIDER = "openai"
    settings.LLM_MODEL = settings.OPENAI_MODEL = "gpt-4.1-mini"
    settings.LLM_SEARCH_MODEL = settings.OPENAI_SEARCH_MODEL = "gpt-4.1-mini"
    settings.LLM_FALLBACK_MODEL = settings.OPENAI_FALLBACK_MODEL = "gpt-4o-mini"
    settings.GEMINI_MODEL = "gemini-2.5-flash"
    settings.GEMINI_SEARCH_MODEL = "gemini-2.5-flash-lite"
    settings.GEMINI_FALLBACK_MODEL = "gemini-2.5-flash-lite"
    settings.LLM_MAX_RETRIES = 0
    settings.OPENAI_API_KEY = "test-openai-key"
    settings.GEMINI_API_KEY = "test-gemini-key"


TARGETS = [
    ("openai", "gpt-4.1-mini"),
    ("openai", "gpt-4o-mini"),
    ("gemini", "gemini-2.5-flash"),
]
MESSAGES = [HumanMessage(content="Return a short JSON answer.")]


def fake_clients(monkeypatch, outcomes):
    """Replace the SDK boundary, keeping real routing, validation and error mapping."""
    attempts = []

    def build(model=None, *, provider=None, num_predict=None):
        outcome = outcomes[len(attempts)]
        client = Mock()
        runnable = client.with_structured_output.return_value
        if isinstance(outcome, Exception):
            runnable.invoke.side_effect = outcome
        else:
            runnable.invoke.return_value = outcome
        attempts.append((provider, model, num_predict, client))
        return client

    monkeypatch.setattr(llm, "chat_model", build)
    return attempts


def attempted_targets(attempts):
    return [(provider, model) for provider, model, _, _ in attempts]


@pytest.mark.parametrize("failures", [0, 1, 2])
def test_stops_at_first_success(monkeypatch, failures):
    expected = Answer(text="ok")
    attempts = fake_clients(monkeypatch, [llm.LLMBusy("busy")] * failures + [expected])
    info = llm.LLMCallInfo()

    result = llm.invoke_structured(Answer, MESSAGES, num_predict=80, call_info=info)

    assert result is expected
    assert attempted_targets(attempts) == TARGETS[: failures + 1]
    assert (info.provider, info.model) == TARGETS[failures]
    assert len(info.failures) == failures
    for provider, _, tokens, client in attempts:
        assert tokens == 80
        client.with_structured_output.assert_called_once_with(
            Answer, method="function_calling" if provider == "gemini" else "json_schema"
        )
        client.with_structured_output.return_value.invoke.assert_called_once_with(MESSAGES)


def provider_errors():
    response = httpx.Response(503, request=httpx.Request("POST", "https://api.openai.com/v1"))
    return [
        openai.InternalServerError("busy", response=response, body=None),
        openai.RateLimitError("rate limited", response=response, body=None),
        openai.AuthenticationError("invalid key", response=response, body=None),
        openai.NotFoundError("model missing", response=response, body=None),
        openai.BadRequestError("bad request", response=response, body=None),
        openai.APITimeoutError(request=response.request),
        openai.APIConnectionError(request=response.request),
        OutputParserException("invalid JSON"),
        None,
    ]


@pytest.mark.parametrize("failure", provider_errors())
def test_any_provider_or_output_error_tries_next_model(monkeypatch, failure):
    attempts = fake_clients(monkeypatch, [failure, Answer(text="recovered")])

    assert llm.invoke_structured(Answer, MESSAGES).text == "recovered"
    assert attempted_targets(attempts) == TARGETS[:2]


@pytest.mark.parametrize("code", ["insufficient_quota", "credit_balance_exhausted"])
def test_exhausted_openai_credits_are_reported_and_still_fail_over(monkeypatch, code):
    response = httpx.Response(429, request=httpx.Request("POST", "https://api.openai.com/v1"))
    failure = openai.RateLimitError(
        "No credits", response=response, body={"code": code, "type": "insufficient_quota"}
    )
    fake_clients(monkeypatch, [failure, Answer(text="ok")])
    info = llm.LLMCallInfo()

    llm.invoke_structured(Answer, MESSAGES, call_info=info)

    assert "credits or quota are exhausted" in info.failures[0]
    assert info.model == "gpt-4o-mini"


def test_gemini_project_access_denied_is_not_reported_as_an_invalid_key():
    from google.genai.errors import ClientError

    error = ClientError(403, {"error": {"message": "Your project has been denied access."}})

    mapped = llm.as_llm_error("gemini", "gemini-2.5-flash", error)

    assert isinstance(mapped, llm.LLMUnavailable)
    assert "project permissions" in str(mapped)
    assert "credentials" not in str(mapped)


def test_all_models_fail_once_and_report_each_attempt(monkeypatch):
    attempts = fake_clients(
        monkeypatch,
        [llm.LLMUnavailable("missing model"), llm.LLMTimeout("timeout"), llm.LLMBusy("busy")],
    )

    with pytest.raises(llm.LLMBusy, match="All configured LLM models failed") as error:
        llm.invoke_structured(Answer, MESSAGES)

    assert attempted_targets(attempts) == TARGETS
    for provider, model in TARGETS:
        assert f"{provider}:{model}" in str(error.value)


def test_duplicate_openai_model_is_not_retried(monkeypatch, settings):
    settings.LLM_FALLBACK_MODEL = settings.LLM_MODEL
    attempts = fake_clients(monkeypatch, [llm.LLMBusy("busy"), Answer(text="ok")])

    llm.invoke_structured(Answer, MESSAGES)

    assert attempted_targets(attempts) == [TARGETS[0], TARGETS[2]]


def test_search_uses_its_configured_models(monkeypatch, settings):
    settings.LLM_SEARCH_MODEL = "gpt-4.1"
    attempts = fake_clients(monkeypatch, [llm.LLMBusy("busy")] * 2 + [Answer(text="ok")])

    llm.invoke_structured(Answer, MESSAGES, model=settings.LLM_SEARCH_MODEL)

    assert attempted_targets(attempts) == [
        ("openai", "gpt-4.1"),
        TARGETS[1],
        ("gemini", "gemini-2.5-flash-lite"),
    ]


def test_gemini_primary_keeps_same_provider_fallback(monkeypatch, settings):
    settings.LLM_PROVIDER = "gemini"
    settings.LLM_MODEL = settings.GEMINI_MODEL
    settings.LLM_FALLBACK_MODEL = settings.GEMINI_FALLBACK_MODEL
    attempts = fake_clients(monkeypatch, [llm.LLMBusy("busy"), Answer(text="ok")])

    llm.invoke_structured(Answer, MESSAGES)

    assert attempted_targets(attempts) == [
        ("gemini", "gemini-2.5-flash"),
        ("gemini", "gemini-2.5-flash-lite"),
    ]


def test_file_and_resume_provenance_survive_cross_provider_fallback(monkeypatch):
    attempts = fake_clients(
        monkeypatch,
        [llm.LLMBusy("busy")] * 2 + [ParsedResume(full_name="Asha Rao", skills=["Python"])],
    )
    pdf = PdfPayload(data=b"%PDF-test", file_name="resume.pdf")

    validated, source, warnings = parsing.parse_resume(pdf, model="gpt-4.1-mini")

    assert source == "llm_pdf"
    assert validated.model == "gemini:gemini-2.5-flash"
    assert _llm_provenance(validated.model) == "gemini:gemini-2.5-flash"
    assert any("parsed with fallback model gemini:gemini-2.5-flash" in w for w in warnings)
    payloads = [a[3].with_structured_output.return_value.invoke.call_args.args[0] for a in attempts]
    assert payloads[0] == payloads[1] == payloads[2]
    assert payloads[0][-1].content[1]["type"] == "file"
    assert payloads[0][-1].content[1]["base64"] == "JVBERi10ZXN0"


def test_job_file_failure_does_not_restart_fallback_chain(monkeypatch):
    attempts = fake_clients(monkeypatch, [llm.LLMBusy("busy")] * 3)

    with pytest.raises(jobs.JobFileNotRead, match="All configured LLM models failed"):
        jobs._ask(MESSAGES)

    assert attempted_targets(attempts) == TARGETS


def test_client_creation_failure_also_falls_back(monkeypatch, settings):
    settings.OPENAI_API_KEY = ""
    gemini = Mock()
    gemini.return_value.with_structured_output.return_value.invoke.return_value = Answer(text="ok")
    loader = Mock(return_value=gemini)
    monkeypatch.setattr(llm, "_import", loader)
    info = llm.LLMCallInfo()

    assert llm.invoke_structured(Answer, MESSAGES, call_info=info).text == "ok"
    assert info.provider == "gemini"
    assert len(info.failures) == 2
    loader.assert_called_once_with(
        "langchain_google_genai", "ChatGoogleGenerativeAI", "langchain-google-genai"
    )
    assert gemini.call_args.kwargs["google_api_key"] == "test-gemini-key"
    assert gemini.call_args.kwargs["model"] == "gemini-2.5-flash"


@pytest.mark.parametrize("provider", ["openai", "gemini"])
def test_client_uses_explicit_provider_credentials_and_limits(monkeypatch, provider):
    constructor = Mock()
    monkeypatch.setattr(llm, "_import", Mock(return_value=constructor))

    llm.chat_model("chosen-model", provider=provider, timeout=10)

    kwargs = constructor.call_args.kwargs
    assert kwargs["model"] == "chosen-model"
    assert kwargs["timeout"] == 10
    assert kwargs["max_retries"] == (0 if provider == "openai" else 1)
    assert kwargs["api_key" if provider == "openai" else "google_api_key"] == f"test-{provider}-key"


def test_health_check_allows_configured_gemini_when_openai_key_missing(monkeypatch, settings):
    settings.OPENAI_API_KEY = ""
    monkeypatch.setattr(llm, "_import", Mock(return_value=Mock()))

    status = llm.chat_status()

    assert status["available"] is True
    assert status["search_model_available"] is True
    assert [row["available"] for row in status["models"]] == [False, False, True]


def test_no_keys_reports_unavailable_without_network(settings):
    settings.OPENAI_API_KEY = settings.GEMINI_API_KEY = ""

    status = llm.chat_status()

    assert status["available"] is False
    assert status["search_model_available"] is False
    assert "OPENAI_API_KEY" in status["error"]
    assert "GEMINI_API_KEY" in status["error"]


def test_embeddings_keep_their_provider_during_chat_failover(monkeypatch, settings):
    settings.EMBEDDING_PROVIDER = "gemini"
    settings.EMBEDDING_MODEL = "gemini-embedding-001"
    constructor = Mock()
    monkeypatch.setattr(embeddings, "_import", Mock(return_value=constructor))
    service = embeddings.EmbeddingService()
    constructor.return_value.embed_query.return_value = [0.0] * service.dimensions

    service.embed_query("Python developer")

    assert service.provider == "gemini"
    assert constructor.call_args.kwargs["model"] == "gemini-embedding-001"
    assert constructor.call_args.kwargs["google_api_key"] == "test-gemini-key"
    constructor.return_value.embed_query.assert_called_once_with("Python developer")


def test_cancel_before_request_does_not_call_any_provider(monkeypatch):
    builder = Mock()
    monkeypatch.setattr(llm, "chat_model", builder)
    with llm.cancellable_llm(lambda: True), pytest.raises(llm.LLMCancelled):
        llm.invoke_structured(Answer, MESSAGES)
    builder.assert_not_called()


def test_cancel_interrupts_async_request_and_does_not_try_fallback(monkeypatch):
    import asyncio
    import threading
    from unittest.mock import AsyncMock

    started, stopped = threading.Event(), threading.Event()

    async def pending(messages):
        started.set()
        try:
            await asyncio.Future()
        except asyncio.CancelledError:
            stopped.set()
            raise

    client = Mock()
    client.with_structured_output.return_value.ainvoke = AsyncMock(side_effect=pending)
    builder = Mock(return_value=client)
    monkeypatch.setattr(llm, "chat_model", builder)
    with llm.cancellable_llm(started.is_set), pytest.raises(llm.LLMCancelled):
        llm.invoke_structured(Answer, MESSAGES)
    assert stopped.is_set()
    assert builder.call_count == 1
    client.with_structured_output.return_value.invoke.assert_not_called()
    # The request-local cancellation scope must not leak into the next request.
    client.with_structured_output.return_value.invoke.return_value = Answer(text="ok")
    assert llm.invoke_structured(Answer, MESSAGES).text == "ok"
