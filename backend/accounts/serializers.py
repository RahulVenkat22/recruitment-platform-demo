"""Request and response shapes for the auth and users endpoints (plan.md 6.10)."""

from __future__ import annotations

import re
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from django.contrib.auth import password_validation
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from accounts.models import User
from common.enums import UserRole

_PHONE = re.compile(r"^\+?[0-9][0-9 ()\-]{4,30}$")


class UserSerializer(serializers.ModelSerializer):
    """The profile returned by login, refresh, ``auth/me`` and ``users/{id}``."""

    full_name = serializers.CharField(read_only=True)
    initials = serializers.CharField(read_only=True)

    class Meta:
        model = User
        fields = [
            "id",
            "email",
            "first_name",
            "last_name",
            "full_name",
            "initials",
            "designation",
            "department",
            "role",
            "avatar_url",
            "phone",
            "timezone",
            "is_active",
            "last_login",
        ]
        read_only_fields = fields


class UserSummarySerializer(serializers.ModelSerializer):
    """Compact row for the people picker (``GET /users/``)."""

    full_name = serializers.CharField(read_only=True)
    initials = serializers.CharField(read_only=True)

    class Meta:
        model = User
        fields = [
            "id",
            "full_name",
            "first_name",
            "last_name",
            "email",
            "designation",
            "department",
            "role",
            "avatar_url",
            "initials",
            "is_active",
        ]
        read_only_fields = fields


class ProfileUpdateSerializer(serializers.ModelSerializer):
    """``PATCH /auth/me/``: the fields a user may edit about themselves."""

    avatar_url = serializers.URLField(required=False, allow_null=True, allow_blank=True)
    phone = serializers.CharField(required=False, allow_null=True, allow_blank=True, max_length=32)

    class Meta:
        model = User
        fields = ["first_name", "last_name", "phone", "avatar_url", "timezone"]
        extra_kwargs = {
            "first_name": {"required": False},
            "last_name": {"required": False},
            "timezone": {"required": False},
        }

    def validate_timezone(self, value: str) -> str:
        try:
            ZoneInfo(value)
        except (ZoneInfoNotFoundError, ValueError) as exc:
            raise serializers.ValidationError(
                "Enter a valid IANA time zone, e.g. Asia/Kolkata.", code="invalid"
            ) from exc
        return value

    def validate_phone(self, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        if not value:
            return None
        if not _PHONE.match(value):
            raise serializers.ValidationError(
                "Enter a valid phone number, e.g. +91 98765 43210.", code="invalid"
            )
        return value

    def validate_avatar_url(self, value: str | None) -> str | None:
        return value or None


class UserAdminUpdateSerializer(serializers.Serializer):
    """``PATCH /users/{id}/`` (hr_admin only): role and active flag."""

    role = serializers.ChoiceField(choices=UserRole.choices, required=False)
    is_active = serializers.BooleanField(required=False)

    def validate(self, attrs: dict) -> dict:
        request = self.context.get("request")
        actor = getattr(request, "user", None)
        target: User | None = self.instance
        if target is not None and actor is not None and actor.pk == target.pk:
            demoting = "role" in attrs and attrs["role"] != target.role
            deactivating = attrs.get("is_active") is False
            if demoting or deactivating:
                raise serializers.ValidationError(
                    "You cannot change your own role or deactivate your own account.",
                    code="self_change_forbidden",
                )
        return attrs


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(
        write_only=True, trim_whitespace=False, style={"input_type": "password"}
    )
    remember_me = serializers.BooleanField(default=False)


class AuthResponseSerializer(serializers.Serializer):
    """Body of ``POST /auth/login/`` and ``POST /auth/refresh/``; the refresh
    token travels only in the ``aimious_refresh`` cookie."""

    access = serializers.CharField(help_text="Short-lived JWT for the Authorization header")
    user = UserSerializer()


class RefreshRequestSerializer(serializers.Serializer):
    refresh = serializers.CharField(
        required=False,
        allow_blank=True,
        help_text="For clients without cookies; the aimious_refresh cookie wins when present.",
    )


class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(write_only=True, trim_whitespace=False)
    new_password = serializers.CharField(write_only=True, trim_whitespace=False)

    def validate_current_password(self, value: str) -> str:
        if not self.context["request"].user.check_password(value):
            raise serializers.ValidationError(
                "Current password is incorrect.", code="invalid_password"
            )
        return value

    def validate_new_password(self, value: str) -> str:
        user = self.context["request"].user
        try:
            password_validation.validate_password(value, user)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(list(exc.messages), code="invalid") from exc
        if user.check_password(value):
            raise serializers.ValidationError(
                "The new password must differ from the current one.", code="unchanged"
            )
        return value


class ForgotPasswordSerializer(serializers.Serializer):
    email = serializers.EmailField()


class DetailSerializer(serializers.Serializer):
    detail = serializers.CharField()
