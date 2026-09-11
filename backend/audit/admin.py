from django.contrib import admin

from audit.models import AuditLog


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    """Read-only in the admin: audit rows are written by the middleware, never edited."""

    list_display = [
        "created_at",
        "actor",
        "action",
        "entity_type",
        "entity_id",
        "path",
        "status_code",
        "ip_address",
    ]
    list_filter = ["action", "entity_type", "status_code"]
    search_fields = ["actor__email", "entity_type", "entity_id", "path", "ip_address", "request_id"]
    autocomplete_fields = ["actor"]
    readonly_fields = [
        "actor",
        "action",
        "entity_type",
        "entity_id",
        "changes",
        "ip_address",
        "user_agent",
        "request_id",
        "path",
        "status_code",
        "created_at",
        "updated_at",
    ]
    date_hierarchy = "created_at"

    def has_add_permission(self, request) -> bool:
        return False

    def has_change_permission(self, request, obj=None) -> bool:
        return False
