"""Pipeline rule violations with stable codes for the plan.md 6.10 envelope."""

from __future__ import annotations

from rest_framework import status
from rest_framework.exceptions import APIException


class InvalidTransition(APIException):
    status_code = status.HTTP_409_CONFLICT
    default_detail = "This status change is not allowed from the current status."
    default_code = "invalid_transition"


class NoteRequired(APIException):
    status_code = status.HTTP_400_BAD_REQUEST
    default_detail = "Add a note explaining this move."
    default_code = "note_required"


class ReasonRequired(APIException):
    status_code = status.HTTP_400_BAD_REQUEST
    default_detail = "Give a reason for this decision."
    default_code = "reason_required"


class ReopenNotAllowed(APIException):
    status_code = status.HTTP_403_FORBIDDEN
    default_detail = "Only an HR admin can reopen a rejected or withdrawn candidate."
    default_code = "reopen_not_allowed"


class ApplicationExists(APIException):
    status_code = status.HTTP_409_CONFLICT
    default_detail = "This candidate is already attached to that job description."
    default_code = "application_exists"


class NoRecipient(APIException):
    status_code = status.HTTP_400_BAD_REQUEST
    default_detail = "This candidate has no email address."
    default_code = "no_recipient"


class EmailDeliveryFailed(APIException):
    status_code = status.HTTP_502_BAD_GATEWAY
    default_detail = "The mail server rejected the message."
    default_code = "email_delivery_failed"
