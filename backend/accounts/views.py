"""Auth and users endpoints (plan.md 6.9, 6.10 Auth and Users rows).

Views stay thin: they validate, call ``accounts.services``, write the auth
audit events and handle the refresh cookie. The refresh token is only ever
sent as an httpOnly cookie scoped to ``/api/v1/auth/``; the access token goes
in the body for the SPA to keep in memory.
"""

from __future__ import annotations

from collections.abc import Mapping
from datetime import timedelta

from django.conf import settings
from django.db.models import Value
from django.db.models.functions import Concat
from drf_spectacular.utils import (
    OpenApiParameter,
    OpenApiResponse,
    extend_schema,
    extend_schema_view,
)
from rest_framework import mixins, status, viewsets
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts import services
from accounts.exceptions import (
    InactiveAccount,
    InvalidCredentials,
    RefreshTokenInvalid,
    RefreshTokenMissing,
)
from accounts.filters import UserFilter
from accounts.models import User
from accounts.serializers import (
    AuthResponseSerializer,
    ChangePasswordSerializer,
    DetailSerializer,
    ForgotPasswordSerializer,
    LoginSerializer,
    ProfileUpdateSerializer,
    RefreshRequestSerializer,
    UserAdminUpdateSerializer,
    UserSerializer,
    UserSummarySerializer,
)
from audit.dtos import client_ip, mark_audited
from audit.services import (
    record_login,
    record_login_failed,
    record_logout,
    record_password_change,
)
from common.permissions import IsHrAdmin
from common.throttles import LoginRateThrottle, PasswordResetRateThrottle

FORGOT_PASSWORD_MESSAGE = (
    "If an account exists for that email, reset instructions have been recorded."
)

ERROR_ENVELOPE = OpenApiResponse(
    description="plan.md 6.10 error envelope {error: {code, message, details}}"
)


# --------------------------------------------------------------- cookie helpers


def set_refresh_cookie(response: Response, token: str, lifetime: timedelta) -> None:
    response.set_cookie(
        settings.JWT_REFRESH_COOKIE_NAME,
        token,
        max_age=int(lifetime.total_seconds()),
        path=settings.JWT_REFRESH_COOKIE_PATH,
        secure=settings.JWT_COOKIE_SECURE,
        httponly=True,
        samesite=settings.JWT_COOKIE_SAMESITE,
    )


def clear_refresh_cookie(response: Response) -> None:
    # Same attributes as the cookie being cleared, so browsers match it exactly.
    response.set_cookie(
        settings.JWT_REFRESH_COOKIE_NAME,
        "",
        max_age=0,
        expires="Thu, 01 Jan 1970 00:00:00 GMT",
        path=settings.JWT_REFRESH_COOKIE_PATH,
        secure=settings.JWT_COOKIE_SECURE,
        httponly=True,
        samesite=settings.JWT_COOKIE_SAMESITE,
    )


def refresh_token_from(request: Request) -> str | None:
    """The cookie wins; a JSON ``refresh`` field serves clients without cookies (and tests)."""
    raw = request.COOKIES.get(settings.JWT_REFRESH_COOKIE_NAME)
    if raw:
        return raw
    data = request.data
    if isinstance(data, Mapping):
        value = data.get("refresh")
        return value if isinstance(value, str) and value else None
    return None


def auth_response(session: services.Session) -> Response:
    payload = AuthResponseSerializer({"access": session.access, "user": session.user}).data
    response = Response(payload)
    set_refresh_cookie(response, session.refresh, session.refresh_lifetime)
    return response


# ------------------------------------------------------------------- auth views


class LoginView(APIView):
    """``POST /api/v1/auth/login/``: credentials -> access token + profile + refresh cookie."""

    permission_classes = [AllowAny]
    authentication_classes: list = []
    throttle_classes = [LoginRateThrottle]

    @extend_schema(
        operation_id="auth_login",
        summary="Log in with email and password",
        description=(
            "Returns the access token and profile; the refresh token is set as the httpOnly "
            "`aimious_refresh` cookie (path /api/v1/auth/), valid 12 hours or 14 days with "
            "remember_me. Limited to 10 attempts per minute per IP."
        ),
        request=LoginSerializer,
        responses={
            200: AuthResponseSerializer,
            400: ERROR_ENVELOPE,
            401: OpenApiResponse(description="invalid_credentials"),
            403: OpenApiResponse(description="account_inactive"),
            429: OpenApiResponse(description="throttled; details.wait is the retry delay"),
        },
        auth=[],
        tags=["auth"],
    )
    def post(self, request: Request) -> Response:
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data["email"]
        try:
            user = services.authenticate_credentials(email, serializer.validated_data["password"])
        except InvalidCredentials:
            record_login_failed(request, email)
            raise
        except InactiveAccount:
            record_login_failed(request, email, reason="account_inactive", status_code=403)
            raise
        session = services.start_session(user, remember_me=serializer.validated_data["remember_me"])
        record_login(request, user, remember_me=serializer.validated_data["remember_me"])
        return auth_response(session)


class RefreshView(APIView):
    """``POST /api/v1/auth/refresh/``: rotate the refresh cookie, return a new access token."""

    permission_classes = [AllowAny]
    authentication_classes: list = []
    throttle_classes: list = []

    @extend_schema(
        operation_id="auth_refresh",
        summary="Rotate the refresh cookie and mint a new access token",
        description=(
            "Reads the `aimious_refresh` cookie (or a JSON `refresh` field), blacklists it and "
            "sets a replacement that keeps the remaining session lifetime."
        ),
        request=RefreshRequestSerializer,
        responses={
            200: AuthResponseSerializer,
            401: OpenApiResponse(
                description=(
                    "refresh_token_missing, token_not_valid or user_inactive; the cookie is cleared"
                )
            ),
        },
        auth=[],
        tags=["auth"],
    )
    def post(self, request: Request) -> Response:
        raw = refresh_token_from(request)
        if not raw:
            raise RefreshTokenMissing
        session = services.rotate_session(raw)
        # Token rotation is plumbing, not a business mutation: no audit row.
        mark_audited(request)
        return auth_response(session)

    def handle_exception(self, exc: Exception) -> Response:
        response = super().handle_exception(exc)
        if isinstance(exc, RefreshTokenMissing | RefreshTokenInvalid):
            clear_refresh_cookie(response)
        return response


class LogoutView(APIView):
    """``POST /api/v1/auth/logout/``: blacklist the refresh token and clear the cookie.

    Needs no bearer token: logging out must work with an expired access token.
    """

    permission_classes = [AllowAny]
    authentication_classes: list = []
    throttle_classes: list = []

    @extend_schema(
        operation_id="auth_logout",
        summary="Log out: blacklist the refresh token and clear the cookie",
        request=RefreshRequestSerializer,
        responses={204: OpenApiResponse(description="Logged out (idempotent)")},
        auth=[],
        tags=["auth"],
    )
    def post(self, request: Request) -> Response:
        user = services.end_session(refresh_token_from(request))
        record_logout(request, user)
        response = Response(status=status.HTTP_204_NO_CONTENT)
        clear_refresh_cookie(response)
        return response


@extend_schema(tags=["auth"])
class MeView(APIView):
    """``GET / PATCH /api/v1/auth/me/``: the current user's profile."""

    permission_classes = [IsAuthenticated]

    @extend_schema(
        operation_id="auth_me_retrieve",
        summary="Current user profile",
        responses={200: UserSerializer, 401: ERROR_ENVELOPE},
    )
    def get(self, request: Request) -> Response:
        return Response(UserSerializer(request.user).data)

    @extend_schema(
        operation_id="auth_me_partial_update",
        summary="Edit name, phone, avatar and time zone",
        request=ProfileUpdateSerializer,
        responses={200: UserSerializer, 400: ERROR_ENVELOPE, 401: ERROR_ENVELOPE},
    )
    def patch(self, request: Request) -> Response:
        serializer = ProfileUpdateSerializer(request.user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(UserSerializer(request.user).data)


class ChangePasswordView(APIView):
    """``POST /api/v1/auth/change-password/``: Django validators, other sessions revoked."""

    permission_classes = [IsAuthenticated]

    @extend_schema(
        operation_id="auth_change_password",
        summary="Change the current user's password",
        description="Runs Django's password validators and signs out every other session.",
        request=ChangePasswordSerializer,
        responses={
            204: OpenApiResponse(description="Password changed"),
            400: ERROR_ENVELOPE,
            401: ERROR_ENVELOPE,
        },
        tags=["auth"],
    )
    def post(self, request: Request) -> Response:
        serializer = ChangePasswordSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        services.change_password(
            request.user,
            serializer.validated_data["new_password"],
            keep_refresh=refresh_token_from(request),
        )
        record_password_change(request, request.user)
        return Response(status=status.HTTP_204_NO_CONTENT)


class ForgotPasswordView(APIView):
    """``POST /api/v1/auth/forgot-password/``: always 202, records the request."""

    permission_classes = [AllowAny]
    authentication_classes: list = []
    throttle_classes = [PasswordResetRateThrottle]

    @extend_schema(
        operation_id="auth_forgot_password",
        summary="Request a password reset (always 202, no email is sent in the MVP)",
        request=ForgotPasswordSerializer,
        responses={
            202: DetailSerializer,
            400: ERROR_ENVELOPE,
            429: OpenApiResponse(description="throttled"),
        },
        auth=[],
        tags=["auth"],
    )
    def post(self, request: Request) -> Response:
        serializer = ForgotPasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        services.request_password_reset(serializer.validated_data["email"], client_ip(request))
        return Response({"detail": FORGOT_PASSWORD_MESSAGE}, status=status.HTTP_202_ACCEPTED)


# ------------------------------------------------------------------- users API


@extend_schema_view(
    list=extend_schema(
        operation_id="users_list",
        summary="Users for the people picker",
        description=(
            "Compact rows. `search` matches first name, last name, email and designation; "
            "`ordering` accepts name, first_name, last_name, email, designation, department, "
            "role (prefix with - for descending)."
        ),
        parameters=[
            OpenApiParameter("search", str, description="Free text over name, email, designation"),
            OpenApiParameter(
                "ordering",
                str,
                description=(
                    "name (default), first_name, last_name, email, designation, department, role"
                ),
            ),
        ],
        tags=["users"],
    ),
    retrieve=extend_schema(
        operation_id="users_retrieve",
        summary="One user's profile",
        responses={200: UserSerializer, 404: ERROR_ENVELOPE},
        tags=["users"],
    ),
    partial_update=extend_schema(
        operation_id="users_partial_update",
        summary="Change a user's role or active flag (hr_admin only)",
        request=UserAdminUpdateSerializer,
        responses={
            200: UserSerializer,
            400: ERROR_ENVELOPE,
            403: ERROR_ENVELOPE,
            404: ERROR_ENVELOPE,
        },
        tags=["users"],
    ),
)
class UserViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    """``GET /users/``, ``GET /users/{id}/``, admin-only ``PATCH /users/{id}/``."""

    queryset = User.objects.annotate(name=Concat("first_name", Value(" "), "last_name"))
    serializer_class = UserSummarySerializer
    filterset_class = UserFilter
    search_fields = ["first_name", "last_name", "email", "designation"]
    ordering_fields = [
        "name",
        "first_name",
        "last_name",
        "email",
        "designation",
        "department",
        "role",
        "created_at",
    ]
    ordering = ["name", "email"]
    http_method_names = ["get", "patch", "head", "options"]

    def get_permissions(self):
        if self.action == "partial_update":
            return [IsAuthenticated(), IsHrAdmin()]
        return [IsAuthenticated()]

    def get_serializer_class(self):
        if self.action == "retrieve":
            return UserSerializer
        if self.action == "partial_update":
            return UserAdminUpdateSerializer
        return UserSummarySerializer

    def partial_update(self, request: Request, *args, **kwargs) -> Response:
        user = self.get_object()
        serializer = UserAdminUpdateSerializer(
            user, data=request.data, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        services.admin_update_user(
            user,
            role=serializer.validated_data.get("role"),
            is_active=serializer.validated_data.get("is_active"),
        )
        return Response(UserSerializer(user).data)
