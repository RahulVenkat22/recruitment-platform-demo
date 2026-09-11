from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin

from accounts.models import PasswordResetRequest, User


@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    """Django's UserAdmin re-pointed at the email login field and the profile columns."""

    ordering = ["email"]
    list_display = [
        "email",
        "first_name",
        "last_name",
        "role",
        "designation",
        "department",
        "is_active",
        "is_staff",
    ]
    list_filter = ["role", "department", "is_active", "is_staff", "is_superuser"]
    search_fields = ["email", "first_name", "last_name", "designation", "department"]
    readonly_fields = ["last_login", "created_at", "updated_at"]
    fieldsets = (
        (None, {"fields": ("email", "password")}),
        (
            "Profile",
            {
                "fields": (
                    "first_name",
                    "last_name",
                    "designation",
                    "department",
                    "role",
                    "avatar_url",
                    "phone",
                    "timezone",
                )
            },
        ),
        (
            "Permissions",
            {"fields": ("is_active", "is_staff", "is_superuser", "groups", "user_permissions")},
        ),
        ("Dates", {"fields": ("last_login", "created_at", "updated_at")}),
    )
    add_fieldsets = (
        (
            None,
            {
                "classes": ("wide",),
                "fields": (
                    "email",
                    "first_name",
                    "last_name",
                    "role",
                    "usable_password",
                    "password1",
                    "password2",
                ),
            },
        ),
    )


@admin.register(PasswordResetRequest)
class PasswordResetRequestAdmin(admin.ModelAdmin):
    list_display = ["email", "requested_at", "expires_at", "used_at", "ip_address"]
    list_filter = ["requested_at"]
    search_fields = ["email", "ip_address"]
    readonly_fields = ["token_hash", "created_at", "updated_at"]
    date_hierarchy = "requested_at"
