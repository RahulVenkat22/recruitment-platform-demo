"""Job description rule violations with stable codes for the plan.md 6.10 error
envelope. Raised by ``jobs.services``; the views let them through untouched."""

from __future__ import annotations

from rest_framework import status
from rest_framework.exceptions import APIException


class ConfirmationRequired(APIException):
    """``DELETE /job-descriptions/{id}/`` without ``?confirm=true``."""

    status_code = status.HTTP_400_BAD_REQUEST
    default_detail = "Pass confirm=true to delete this job description."
    default_code = "confirmation_required"


class InvalidStatusTransition(APIException):
    """The JD is not in a status the requested move starts from."""

    status_code = status.HTTP_409_CONFLICT
    default_detail = "This status change is not allowed from the current status."
    default_code = "invalid_status_transition"


class ParticipantExists(APIException):
    status_code = status.HTTP_409_CONFLICT
    default_detail = "This person is already involved in the recruitment."
    default_code = "participant_exists"


class CreatorProtected(APIException):
    """The creator is always the owner participant and cannot be removed or demoted."""

    status_code = status.HTTP_400_BAD_REQUEST
    default_detail = "The creator of a job description is always its owner and cannot be removed."
    default_code = "creator_protected"
