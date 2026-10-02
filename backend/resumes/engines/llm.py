"""The LLM behind resume parsing, JD analysis and candidate evaluation.

One place -- ``chat_model`` -- builds the LangChain client from settings, and
``LLM_PROVIDER`` decides which provider starts each request. OpenAI calls try
the primary model, another OpenAI model, then Gemini on any LLM error.
The Pydantic schemas, the prompts and everything after the request is built are
identical for both; only the client, the structured-output method and the error
mapping differ, and all three live here.

Both providers read a file, so ``invoke_structured_with_file`` attaches the
resume PDF itself to the last human turn and the model answers from the rendered
pages. Everything after the attachment -- the structured-output method switch,
the error mapping -- is shared with the text-only calls the JD
planner and the candidate evaluator make through ``invoke_structured``.

Each provider's failure modes are mapped onto the same three exceptions the
callers route on: ``LLMUnavailable`` (key missing or rejected, model missing,
quota, network), ``LLMTimeout`` and ``LLMOutputInvalid`` (the answer did not
fit the schema). ``LLMBusy`` is the ``LLMUnavailable`` subclass for a transient
refusal -- a server error or a rate limit that outlived the client's retries --
which participates in the same shared fallback chain as other errors. OpenAI uses
``method="json_schema"`` and Gemini
``method="function_calling"`` (see ``_structured_method``); LangChain parses
the answer into the schema on both, and a document whose answer does not parse
is shelved for review rather than repaired.

``chat_status`` and ``embedding_status`` answer the health-card question -- is
the configured provider usable -- without a network call: the key is present
and the client can be constructed.
"""

from __future__ import annotations

import asyncio
import base64
import importlib
import logging
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass, field
from typing import Any

import httpx
from django.conf import settings
from langchain_core.exceptions import OutputParserException
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import BaseMessage, HumanMessage
from pydantic import BaseModel, ValidationError

logger = logging.getLogger(__name__)


class LLMError(Exception):
    """Base class; ``str(exc)`` is a sentence fit for logs and API messages."""


class LLMCancelled(LLMError):
    """Explicit cancellation stops the current request and every fallback."""


_cancellation: ContextVar[Callable[[], bool] | None] = ContextVar("llm_cancellation", default=None)


@contextmanager
def cancellable_llm(should_cancel: Callable[[], bool]) -> Iterator[None]:
    """Give one worker a cancellation check without affecting other LLM callers."""
    token = _cancellation.set(should_cancel)
    try:
        yield
    finally:
        _cancellation.reset(token)


async def _invoke_cancellable(runnable, messages, should_cancel):
    """Cancel the SDK's async HTTP request, then drain it before leaving the loop."""
    task = asyncio.create_task(runnable.ainvoke(messages))
    try:
        while True:
            if await asyncio.to_thread(should_cancel):
                raise LLMCancelled("The job description upload was cancelled.")
            if task.done():
                return await task
            await asyncio.wait({task}, timeout=0.25)
    finally:
        if not task.done():
            task.cancel()
        await asyncio.gather(task, return_exceptions=True)


class LLMUnavailable(LLMError):
    pass


class LLMBusy(LLMUnavailable):
    """A transient refusal (5xx, rate limit) that outlived the retries: another model may answer."""


class LLMTimeout(LLMError):
    pass


class LLMOutputInvalid(LLMError):
    pass


@dataclass
class LLMCallInfo:
    """Request-local provenance; never shared across concurrent calls."""

    provider: str = ""
    model: str = ""
    failures: list[str] = field(default_factory=list)


def chat_targets(
    model: str | None = None, *, fallback_model: str | None = None
) -> list[tuple[str, str]]:
    """Ordered, distinct provider/model pairs for a single chat request."""
    provider = settings.LLM_PROVIDER
    name = _resolve_model(model)
    fallback = settings.LLM_FALLBACK_MODEL if fallback_model is None else fallback_model
    targets = [(provider, name)]
    if fallback:
        targets.append((provider, fallback))
    if provider == "openai":
        gemini_model = (
            settings.GEMINI_SEARCH_MODEL
            if name == settings.LLM_SEARCH_MODEL and name != settings.LLM_MODEL
            else settings.GEMINI_MODEL
        )
        targets.append(("gemini", gemini_model))
    return list(dict.fromkeys(targets))


def _import(module: str, attribute: str, package: str) -> Any:
    """Import a provider client on demand, as an ``LLMError`` the callers handle."""
    try:
        return getattr(importlib.import_module(module), attribute)
    except (ImportError, AttributeError) as exc:
        # AttributeError as well as ImportError: an installed package that
        # renamed or dropped the class must still leave this helper raising the
        # LLMError its callers route on, not an AttributeError from inside it.
        raise LLMUnavailable(
            f"The provider client needs `pip install {package}` "
            f"(could not load {module}.{attribute}: {type(exc).__name__})."
        ) from exc


def _resolve_model(model: str | None) -> str:
    """The model to call: what the caller named, or the provider's main model.

    Every caller passes ``settings.LLM_MODEL`` or ``settings.LLM_SEARCH_MODEL``,
    which ``config.settings.base`` has already resolved for ``LLM_PROVIDER``, so
    a name arriving here is taken at face value.
    """
    return model or settings.LLM_MODEL


def api_key_for(provider: str) -> str:
    """The configured key for ``provider``, or ``""``."""
    return settings.OPENAI_API_KEY if provider == "openai" else settings.GEMINI_API_KEY


def key_setting_for(provider: str) -> str:
    """The name of the environment variable that holds ``provider``'s key."""
    return "OPENAI_API_KEY" if provider == "openai" else "GEMINI_API_KEY"


def require_api_key(provider: str) -> str:
    """The key for ``provider``, or ``LLMUnavailable`` naming the setting to fill in."""
    key = api_key_for(provider)
    if not key:
        raise LLMUnavailable(f"LLM_PROVIDER={provider} but {key_setting_for(provider)} is not set.")
    return key


def chat_model(
    model: str | None = None,
    *,
    provider: str | None = None,
    num_predict: int | None = None,
    temperature: float = 0.0,
    timeout: float | None = None,
) -> BaseChatModel:
    """A deterministic chat client for ``LLM_PROVIDER``, bound to its model and limits.

    ``LLM_TIMEOUT_SECONDS`` is the deadline and ``LLM_MAX_RETRIES`` the retry
    budget on both providers; the Gemini client counts total attempts rather
    than retries, so it is translated at this seam.
    """
    provider = provider or settings.LLM_PROVIDER
    name = model or (settings.OPENAI_MODEL if provider == "openai" else settings.GEMINI_MODEL)
    key = require_api_key(provider)
    if provider == "openai":
        chat_openai = _import("langchain_openai", "ChatOpenAI", "langchain-openai")
        return chat_openai(
            model=name,
            api_key=key,
            base_url=settings.OPENAI_BASE_URL or None,
            temperature=temperature,
            max_tokens=num_predict,
            timeout=float(timeout or settings.LLM_TIMEOUT_SECONDS),
            # ChatOpenAI counts retries after the first attempt, like the setting.
            max_retries=settings.LLM_MAX_RETRIES,
        )
    chat_gemini = _import(
        "langchain_google_genai", "ChatGoogleGenerativeAI", "langchain-google-genai"
    )
    client = chat_gemini(
        model=name,
        google_api_key=key,
        temperature=temperature,
        max_output_tokens=num_predict,
        # Seconds: langchain-google-genai converts to milliseconds itself.
        timeout=float(timeout or settings.LLM_TIMEOUT_SECONDS),
        # Its `max_retries` is not retries: it becomes
        # HttpRetryOptions(attempts=...), the TOTAL number of attempts, and
        # the SDK treats 0 as "use Google's default". Translate at the seam
        # so LLM_MAX_RETRIES means retries here too, and never send 0.
        max_retries=max(1, settings.LLM_MAX_RETRIES + 1),
    )
    return _with_thinking_headroom(client, num_predict)


# A Gemini "thinking" model spends reasoning tokens out of the SAME
# maxOutputTokens budget as the answer, and spends them first. The callers size
# `num_predict` for the answer alone (450 / 600 for the search prompts), which a
# thinking model can consume entirely on thoughts and return nothing. This floor
# only ever RAISES the ceiling, so it cannot truncate an answer that fits today,
# and it is applied only when the pinned client's own offline model profile says
# the model reasons (`reasoning_output`) -- a non-thinking model is left exactly
# as it was. Deliberately NOT `thinking_budget=0`: the pro models do not allow
# thinking to be switched off, so that would be a new failure mode.
GEMINI_THINKING_OUTPUT_FLOOR = 4096


def _with_thinking_headroom(client: Any, num_predict: int | None) -> Any:
    """Raise a thinking model's output ceiling to ``GEMINI_THINKING_OUTPUT_FLOOR``."""
    if num_predict is None or num_predict >= GEMINI_THINKING_OUTPUT_FLOOR:
        return client
    profile = getattr(client, "profile", None) or {}
    if not profile.get("reasoning_output", False):
        return client
    ceiling = profile.get("max_output_tokens") or GEMINI_THINKING_OUTPUT_FLOOR
    floor = min(GEMINI_THINKING_OUTPUT_FLOOR, int(ceiling))
    if floor <= num_predict:
        return client
    return client.model_copy(update={"max_output_tokens": floor})


def _structured_method(provider: str) -> str:
    """How ``with_structured_output`` should constrain the answer for ``provider``.

    OpenAI takes the Pydantic JSON schema as-is. Gemini does not:
    ``method="json_schema"`` hands ``schema.model_json_schema()`` straight
    through as the API's ``responseJsonSchema``, which documents a closed list of
    supported keywords -- ``$defs``, ``$ref``, ``type``, ``enum``, ``items``,
    ``properties``, ``required`` and friends -- and ``default`` is not on it,
    while our schemas emit ``default`` for every optional field.
    ``method="function_calling"`` goes through the package's own
    ``_format_json_schema_to_gapic``, which drops every keyword outside
    ``_ALLOWED_SCHEMA_FIELDS`` before the request is built, so the schema cannot
    carry anything Gemini rejects. It still parses into the Pydantic model
    (``PydanticToolsParser``) and still supports ``include_raw``.
    """
    return "function_calling" if provider == "gemini" else "json_schema"


def attach_file(
    messages: list[BaseMessage], data: bytes, *, file_name: str, mime_type: str = "application/pdf"
) -> list[BaseMessage]:
    """``messages`` with ``data`` attached to the last message, which is the human turn.

    ``create_file_block`` builds the one file-carrying block langchain-core
    defines, and each provider adapter translates it. It is not written by hand
    because ``langchain_google_genai`` does not reject a malformed dict: it logs
    "Assuming it's a text part" and sends the dict's repr as prompt text.
    ``filename`` is passed because the OpenAI translator substitutes
    ``LC_AUTOGENERATED`` without it.
    """
    from langchain_core.messages.content import create_file_block

    block = create_file_block(
        base64=base64.b64encode(data).decode(), mime_type=mime_type, filename=file_name
    )
    *head, last = messages
    return [*head, HumanMessage(content=[{"type": "text", "text": last.content}, block])]


def invoke_structured_with_file[SchemaT: BaseModel](
    schema: type[SchemaT],
    messages: list[BaseMessage],
    *,
    data: bytes,
    file_name: str,
    mime_type: str = "application/pdf",
    model: str | None = None,
    num_predict: int | None = None,
    fallback_model: str | None = None,
    call_info: LLMCallInfo | None = None,
) -> SchemaT:
    """``invoke_structured`` with a file attached to the human message.

    Everything after the attachment is shared, so the structured-output method
    switch and the per-provider error mapping apply to the PDF path unchanged.
    """
    attached = attach_file(messages, data, file_name=file_name, mime_type=mime_type)
    return invoke_structured(
        schema,
        attached,
        model=model,
        num_predict=num_predict,
        fallback_model=fallback_model,
        call_info=call_info,
    )


def invoke_structured[SchemaT: BaseModel](
    schema: type[SchemaT],
    messages: list[BaseMessage],
    *,
    model: str | None = None,
    num_predict: int | None = None,
    fallback_model: str | None = None,
    call_info: LLMCallInfo | None = None,
) -> SchemaT:
    """Return the first validated answer, advancing on any mapped LLM error."""
    info = call_info if call_info is not None else LLMCallInfo()
    info.provider = info.model = ""
    info.failures.clear()
    last_error: LLMError | None = None
    for provider, name in chat_targets(model, fallback_model=fallback_model):
        should_cancel = _cancellation.get()
        if should_cancel and should_cancel():
            raise LLMCancelled("The job description upload was cancelled.")
        try:
            result = _invoke_once(schema, messages, provider, name, num_predict=num_predict)
        except LLMCancelled:
            raise
        except LLMError as exc:
            last_error = exc
            info.failures.append(f"{provider}:{name}: {exc}")
            logger.warning("LLM attempt failed for %s:%s (%s)", provider, name, type(exc).__name__)
            continue
        info.provider, info.model = provider, name
        return result
    assert last_error is not None
    raise type(last_error)(
        "All configured LLM models failed. " + "; ".join(info.failures)
    ) from last_error


def _invoke_once[SchemaT: BaseModel](
    schema: type[SchemaT],
    messages: list[BaseMessage],
    provider: str,
    name: str,
    *,
    num_predict: int | None,
) -> SchemaT:
    """Build, invoke and validate one provider-specific request."""
    try:
        # Built inside the try: the hosted clients raise from their constructor
        # when the key is missing or malformed.
        client = chat_model(name, provider=provider, num_predict=num_predict)
        runnable = client.with_structured_output(schema, method=_structured_method(provider))
        should_cancel = _cancellation.get()
        result = (
            asyncio.run(_invoke_cancellable(runnable, messages, should_cancel))
            if should_cancel
            else runnable.invoke(messages)
        )
    except LLMError:
        raise
    except (OutputParserException, ValidationError) as exc:
        # Logged with the detail, raised without it: the message is persisted
        # (ResumeDocument.warnings, SearchRun.error) and the parser's text embeds
        # the raw model output, resume included.
        logger.error("%s output did not match %s", provider, schema.__name__, exc_info=exc)
        raise LLMOutputInvalid(f"The model's JSON did not match {schema.__name__}.") from exc
    except Exception as exc:
        raise as_llm_error(provider, name, exc) from exc
    if not isinstance(result, schema):
        # Gemini's tool parser returns None when the model answered in prose
        # instead of calling the schema tool.
        raise LLMOutputInvalid(f"The model returned no {schema.__name__}.")
    return result


def as_llm_error(
    provider: str, name: str, exc: Exception, *, model_setting: str | None = None
) -> LLMError:
    """The provider's failure as an ``LLMError``.

    ``model_setting`` names the variable a "no such model" message should point
    at; it defaults to the chat model's and the embeddings pass
    ``EMBEDDING_MODEL``, so the advice in the message is about the right knob.
    """
    if provider == "openai":
        return _openai_error(name, exc, model_setting=model_setting or "OPENAI_MODEL")
    return _gemini_error(name, exc, model_setting=model_setting or "GEMINI_MODEL")


def _openai_error(name: str, exc: Exception, *, model_setting: str) -> LLMError:
    """Never carries the response body into the message."""
    import openai

    # APITimeoutError is a subclass of APIConnectionError: test it first.
    if isinstance(exc, openai.APITimeoutError):
        return LLMTimeout(f"OpenAI did not answer within {settings.LLM_TIMEOUT_SECONDS}s ({name}).")
    if isinstance(exc, openai.AuthenticationError):
        return LLMUnavailable("OpenAI rejected the credentials; check OPENAI_API_KEY.")
    if isinstance(exc, openai.PermissionDeniedError):
        return LLMUnavailable("OpenAI denied access; check project permissions and model access.")
    if isinstance(exc, openai.NotFoundError):
        return LLMUnavailable(f"OpenAI has no model {name!r}; check {model_setting}.")
    if isinstance(exc, openai.RateLimitError):
        if exc.code in {"insufficient_quota", "credit_balance_exhausted"} or (
            exc.type == "insufficient_quota"
        ):
            return LLMUnavailable(
                "OpenAI API credits or quota are exhausted; check project billing and limits."
            )
        return LLMBusy(f"OpenAI rate limit reached for {name}.")
    if isinstance(exc, openai.InternalServerError):
        return LLMBusy(f"OpenAI returned a server error for {name}.")
    if isinstance(exc, openai.LengthFinishReasonError):
        return LLMOutputInvalid(
            f"OpenAI hit the output token limit before finishing the JSON ({name})."
        )
    if isinstance(exc, openai.BadRequestError):
        logger.exception("OpenAI rejected the request for %s", name)
        return LLMOutputInvalid(f"OpenAI rejected the request for {name}; check {model_setting}.")
    if isinstance(exc, openai.APIConnectionError):
        return LLMUnavailable(f"OpenAI is not reachable: {exc}")
    logger.exception("OpenAI call failed for %s", name)
    return LLMUnavailable(f"OpenAI call failed ({type(exc).__name__}).")


def _gemini_classes() -> dict[str, Any]:
    """The exception classes ``langchain_google_genai`` raises, resolved by name.

    It does not re-raise the SDK's own ``google.genai.errors.ClientError``: its
    ``_handle_client_error`` maps each status onto its own class, and none of
    them is a ``ClientError`` subclass (``GoogleAuthenticationError``'s bases are
    ``ChatGoogleGenerativeAIError`` and ``langchain_core``'s
    ``ModelAuthenticationError``). So we must match on those classes.

    Resolved with ``getattr``, defaulting to ``()`` -- which ``isinstance``
    accepts and never matches -- so a version that renames or drops one of them
    falls through to the ``ChatGoogleGenerativeAIError`` base branch instead of
    raising ``AttributeError`` inside the error handler.
    """
    module = importlib.import_module("langchain_google_genai.chat_models")
    names = (
        "ChatGoogleGenerativeAIError",
        "GoogleAuthenticationError",
        "GooglePermissionDeniedError",
        "GoogleModelNotFoundError",
        "GoogleRateLimitError",
        "GoogleInvalidRequestError",
        "GoogleContextOverflowError",
    )
    return {name: getattr(module, name, ()) for name in names}


_CREDENTIAL_FIELDS = frozenset(
    {"google_api_key", "api_key", "credentials", "client_options", "transport"}
)


def _is_credentials_validation_error(exc: ValidationError) -> bool:
    """Is this pydantic error about the client's own credentials, or someone else's model?

    ``google.genai`` parses its own request and response payloads with pydantic
    models, so a ``ValidationError`` reaching here is at least as likely to be a
    response the SDK could not parse as a key the client rejected. Only an error
    whose location names a credential field is diagnosed as bad credentials;
    anything else falls through to the generic branches rather than sending the
    operator to look at a GEMINI_API_KEY that is fine.
    """
    try:
        locations = {str(part) for error in exc.errors() for part in error.get("loc", ())}
    except Exception:  # noqa: BLE001 - a diagnostic must never raise
        return False
    return bool(locations & _CREDENTIAL_FIELDS)


def _gemini_error(name: str, exc: Exception, *, model_setting: str) -> LLMError:
    """Note: an invalid key comes back as a 400, not a 401 -- both end up here."""
    from google.genai import errors as genai_errors

    # The embeddings client wraps the SDK error in the package's base
    # `GoogleGenerativeAIError` (not the chat module's subclasses) and keeps the
    # original as `__cause__`; classify the original so a 404 on
    # EMBEDDING_MODEL reads as "no such model" rather than "call failed".
    cause = getattr(exc, "__cause__", None)
    if isinstance(cause, genai_errors.APIError) and not isinstance(exc, genai_errors.APIError):
        exc = cause
    if isinstance(exc, httpx.TimeoutException) or type(exc).__name__.endswith("TimeoutException"):
        return LLMTimeout(f"Gemini did not answer within {settings.LLM_TIMEOUT_SECONDS}s ({name}).")
    if isinstance(exc, ValidationError) and _is_credentials_validation_error(exc):
        return LLMUnavailable("Gemini is not configured; check GEMINI_API_KEY.")
    try:
        classes = _gemini_classes()
    except ImportError:  # pragma: no cover - only if the package vanished mid-run
        classes = {}
    bad_key = "API key not valid" in str(exc) or "API_KEY_INVALID" in str(exc)
    if isinstance(exc, classes.get("GoogleAuthenticationError", ())):
        return LLMUnavailable("Google rejected the credentials; check GEMINI_API_KEY.")
    if isinstance(exc, classes.get("GooglePermissionDeniedError", ())):
        return LLMUnavailable("Google denied access; check Gemini project permissions and access.")
    # Before the generic ClientError branch below: GoogleContextOverflowError IS
    # a ClientError (400), and the model name is not the knob that fixes it.
    if isinstance(exc, classes.get("GoogleContextOverflowError", ())):
        return LLMUnavailable(
            f"The prompt exceeded {name}'s context window; use a model with a larger context."
        )
    if isinstance(exc, classes.get("GoogleModelNotFoundError", ())):
        return LLMUnavailable(f"Gemini has no model {name!r}; check {model_setting}.")
    if isinstance(exc, classes.get("GoogleRateLimitError", ())):
        return LLMBusy(f"Gemini quota reached for {name}.")
    if isinstance(exc, classes.get("GoogleInvalidRequestError", ())):
        # A rejected key is a 400 with "API key not valid", not a 401.
        if bad_key:
            return LLMUnavailable("Google rejected the credentials; check GEMINI_API_KEY.")
        logger.exception("Gemini rejected the request for %s", name)
        return LLMOutputInvalid(f"Gemini rejected the request for {name}; check {model_setting}.")
    # Server errors first: GoogleAPIError subclasses the SDK's ServerError.
    if isinstance(exc, genai_errors.ServerError):
        return LLMBusy(f"Gemini returned a server error for {name}.")
    # Fallback for a raw SDK error escaping unwrapped (and for
    # GoogleContextOverflowError, which is a ClientError but not a
    # ChatGoogleGenerativeAIError), matched on the HTTP code it carries.
    if isinstance(exc, genai_errors.ClientError):
        code = getattr(exc, "code", None)
        if code == 401 or bad_key:
            return LLMUnavailable("Google rejected the credentials; check GEMINI_API_KEY.")
        if code == 403:
            return LLMUnavailable(
                "Google denied access; check Gemini project permissions and access."
            )
        if code == 404:
            return LLMUnavailable(f"Gemini has no model {name!r}; check {model_setting}.")
        if code == 429:
            return LLMBusy(f"Gemini quota reached for {name}.")
        logger.exception("Gemini rejected the request for %s", name)
        return LLMOutputInvalid(f"Gemini rejected the request for {name}; check {model_setting}.")
    # Any other status, or a class this version names differently.
    if isinstance(exc, classes.get("ChatGoogleGenerativeAIError", ())):
        if bad_key:
            return LLMUnavailable("Google rejected the credentials; check GEMINI_API_KEY.")
        logger.exception("Gemini rejected the request for %s", name)
        return LLMUnavailable(f"Gemini rejected the request for {name} ({type(exc).__name__}).")
    if isinstance(exc, httpx.HTTPError | ConnectionError | OSError):
        return LLMUnavailable(f"Gemini is not reachable: {exc}")
    logger.exception("Gemini call failed for %s", name)
    return LLMUnavailable(f"Gemini call failed ({type(exc).__name__}).")


def chat_status() -> dict[str, Any]:
    """Check client construction across both chat chains without network calls.

    A usable fallback keeps ingestion/search available when the primary cannot
    be built. This checks local configuration, not live model availability.
    """
    provider = settings.LLM_PROVIDER
    model = settings.LLM_MODEL
    search_model = settings.LLM_SEARCH_MODEL
    targets = chat_targets(model)
    search_targets = chat_targets(search_model)
    errors = {
        target: _client_error(*target) for target in dict.fromkeys([*targets, *search_targets])
    }
    available = any(not errors[target] for target in targets)
    search_available = any(not errors[target] for target in search_targets)
    error = "" if available else "; ".join(errors[target] for target in targets)
    warning = "" if search_available else "; ".join(errors[target] for target in search_targets)
    return {
        "provider": provider,
        "model": model,
        "search_model": search_model,
        "available": available,
        "search_model_available": search_available,
        "error": error,
        "warning": warning,
        "models": [
            {"provider": p, "model": m, "available": not errors[(p, m)], "error": errors[(p, m)]}
            for p, m in targets
        ],
    }


def _client_error(provider: str, name: str) -> str:
    """Build the client for ``name`` and report why it could not be, or ``""``."""
    try:
        chat_model(name, provider=provider)
    except LLMError as exc:
        return str(exc)
    except Exception as exc:  # noqa: BLE001 - a client we cannot build is unavailable
        logger.exception("Could not build the %s chat client", provider)
        return f"The {provider} client could not be built ({type(exc).__name__})."
    return ""
