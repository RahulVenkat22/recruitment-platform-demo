from django.contrib import admin

from notifications.models import Notification


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ["recipient", "type", "title", "actor", "is_read", "read_at", "created_at"]
    list_filter = ["type", "is_read"]
    search_fields = ["title", "message", "recipient__email", "actor__email"]
    autocomplete_fields = ["recipient", "actor"]
    readonly_fields = ["created_at", "updated_at"]
    date_hierarchy = "created_at"
