from django.contrib import admin

from activity.models import Activity


@admin.register(Activity)
class ActivityAdmin(admin.ModelAdmin):
    list_display = [
        "occurred_at",
        "category",
        "event_type",
        "title",
        "actor",
        "job_description",
        "candidate",
    ]
    list_filter = ["category", "event_type"]
    search_fields = [
        "title",
        "description",
        "event_type",
        "job_description__title",
        "candidate__full_name",
        "actor__email",
    ]
    autocomplete_fields = ["job_description", "application", "candidate", "actor"]
    readonly_fields = ["created_at", "updated_at"]
    date_hierarchy = "occurred_at"
