"""Auth failures with stable codes for the plan.md 6.10 error envelope.

These subclass ``APIException`` directly rather than ``AuthenticationFailed``:
DRF downgrades the latter to 403 on views without authenticators, and the
login and refresh views deliberately have none.
"""

from __future__ import annotations

from rest_framework import status
from rest_framework.exceptions import APIException


class InvalidCredentials(APIException):
    status_code = status.HTTP_401_UNAUTHORIZED
    default_detail = "Invalid email or password."
    default_code = "invalid_credentials"


class InactiveAccount(APIException):
    status_code = status.HTTP_403_FORBIDDEN
    default_detail = "This account has been deactivated."
    default_code = "account_inactive"


class RefreshTokenMissing(APIException):
    status_code = status.HTTP_401_UNAUTHORIZED
    default_detail = "No refresh token was provided."
    default_code = "refresh_token_missing"


class RefreshTokenInvalid(APIException):
    status_code = status.HTTP_401_UNAUTHORIZED
    default_detail = "Refresh token is invalid or expired."
    default_code = "token_not_valid"


class RefreshUserInactive(RefreshTokenInvalid):
    default_detail = "This account has been deactivated."
    default_code = "user_inactive"
