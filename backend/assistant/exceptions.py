"""Assistant errors with stable codes for the plan.md 6.10 envelope."""

from __future__ import annotations

from rest_framework import status
from rest_framework.exceptions import APIException


class AssistantUnavailable(APIException):
    status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    default_detail = "The AI assistant is not available right now."
    default_code = "assistant_unavailable"


class AssistantBusy(APIException):
    status_code = status.HTTP_409_CONFLICT
    default_detail = "The assistant is still working on your previous request."
    default_code = "assistant_busy"


class ActionNotPending(APIException):
    status_code = status.HTTP_409_CONFLICT
    default_detail = "This action is no longer waiting for confirmation."
    default_code = "action_not_pending"
