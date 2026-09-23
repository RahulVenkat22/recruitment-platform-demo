from rest_framework import status
from rest_framework.exceptions import APIException


class InvalidTicketMove(APIException):
    """The ticket is not in a state that allows the requested change (409)."""

    status_code = status.HTTP_409_CONFLICT
    default_code = "invalid_transition"
    default_detail = "That change is not possible for this ticket right now."
