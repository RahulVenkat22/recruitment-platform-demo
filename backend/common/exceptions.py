"""One error envelope for the whole API (plan.md 6.10)::

    {"error": {"code": "validation_error", "message": "Invalid input.", "details": {...}}}

``code`` is a stable machine-readable string, ``message`` is a single sentence
for humans, and ``details`` is always an object: field errors for validation
failures, ``{"wait": seconds}`` for throttling, empty otherwise.
"""

from __future__ import annotations

from typing import Any

from django.core.exceptions import PermissionDenied as DjangoPermissionDenied
from django.http import Http404
from rest_framework.exceptions import (
    APIException,
    ErrorDetail,
    NotFound,
    PermissionDenied,
    Throttled,
    ValidationError,
)
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler

VALIDATION_MESSAGE = "Invalid input."
NON_FIELD_KEY = "non_field_errors"


def error_payload(code: str, message: str, details: dict[str, Any] | None = None) -> dict:
    """Build the envelope; shared with the non-DRF handlers in ``common.views``."""
    return {"error": {"code": code, "message": message, "details": details or {}}}


def api_exception_handler(exc: Exception, context: dict) -> Response | None:
    """DRF ``EXCEPTION_HANDLER``: reshape every handled exception into the envelope.

    Returns ``None`` for exceptions DRF does not handle so Django's 500 path
    still applies (and ``handler500`` renders the same envelope for API paths).
    """
    if isinstance(exc, Http404):
        exc = NotFound()
    elif isinstance(exc, DjangoPermissionDenied):
        exc = PermissionDenied()

    response = drf_exception_handler(exc, context)
    if response is None or not isinstance(exc, APIException):
        return response

    if isinstance(exc, ValidationError):
        response.data = error_payload(
            "validation_error", VALIDATION_MESSAGE, _as_field_errors(response.data)
        )
        return response

    details: dict[str, Any] = {}
    if isinstance(exc, Throttled) and exc.wait is not None:
        details["wait"] = int(exc.wait)

    response.data = error_payload(_code_of(exc), _message_of(exc), details)
    return response


def _as_field_errors(data: Any) -> dict[str, Any]:
    """Field errors as a dict; bare lists or strings become ``non_field_errors``."""
    if isinstance(data, dict):
        return {str(key): _plain(value) for key, value in data.items()}
    if isinstance(data, list):
        return {NON_FIELD_KEY: _plain(data)}
    return {NON_FIELD_KEY: [str(data)]}


def _plain(value: Any) -> Any:
    """Strip ``ErrorDetail`` down to plain strings, recursively (nested serializers)."""
    if isinstance(value, dict):
        return {str(key): _plain(inner) for key, inner in value.items()}
    if isinstance(value, list | tuple):
        return [_plain(item) for item in value]
    return str(value)


def _code_of(exc: APIException) -> str:
    detail = exc.detail
    if isinstance(detail, ErrorDetail) and detail.code:
        return str(detail.code)
    return str(exc.default_code)


def _message_of(exc: APIException) -> str:
    detail = exc.detail
    if isinstance(detail, str):
        return str(detail)
    if isinstance(detail, list) and detail:
        return str(detail[0])
    return str(exc.default_detail)
