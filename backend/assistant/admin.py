from django.contrib import admin

from assistant.models import AssistantMessage


@admin.register(AssistantMessage)
class AssistantMessageAdmin(admin.ModelAdmin):
    list_display = ["user", "role", "content", "model", "created_at"]
    list_filter = ["role"]
    search_fields = ["content", "user__email"]
    autocomplete_fields = ["user"]
    readonly_fields = ["created_at", "updated_at"]
    date_hierarchy = "created_at"
