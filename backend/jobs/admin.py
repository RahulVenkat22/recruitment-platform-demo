from django.contrib import admin

from jobs.models import JobDescription, JobDescriptionVersion, RecruitmentParticipant


class RecruitmentParticipantInline(admin.TabularInline):
    model = RecruitmentParticipant
    extra = 0
    autocomplete_fields = ["user", "added_by"]


class JobDescriptionVersionInline(admin.TabularInline):
    model = JobDescriptionVersion
    extra = 0
    fields = ["version", "change_summary", "created_by", "created_at"]
    readonly_fields = ["created_at"]
    autocomplete_fields = ["created_by"]
    show_change_link = True


@admin.register(JobDescription)
class JobDescriptionAdmin(admin.ModelAdmin):
    list_display = [
        "title",
        "department",
        "location",
        "status",
        "work_mode",
        "employment_type",
        "openings",
        "created_by",
        "current_version",
        "published_at",
        "created_at",
    ]
    list_filter = ["status", "department", "work_mode", "employment_type"]
    search_fields = ["title", "department", "location", "domain", "created_by__email"]
    autocomplete_fields = ["created_by", "updated_by"]
    readonly_fields = ["created_at", "updated_at"]
    date_hierarchy = "created_at"
    inlines = [RecruitmentParticipantInline, JobDescriptionVersionInline]


@admin.register(JobDescriptionVersion)
class JobDescriptionVersionAdmin(admin.ModelAdmin):
    list_display = ["job_description", "version", "change_summary", "created_by", "created_at"]
    list_filter = ["created_at"]
    search_fields = ["job_description__title", "change_summary"]
    autocomplete_fields = ["job_description", "created_by"]
    readonly_fields = ["created_at", "updated_at"]


@admin.register(RecruitmentParticipant)
class RecruitmentParticipantAdmin(admin.ModelAdmin):
    list_display = ["job_description", "user", "role_in_recruitment", "added_by", "created_at"]
    list_filter = ["role_in_recruitment"]
    search_fields = [
        "job_description__title",
        "user__email",
        "user__first_name",
        "user__last_name",
    ]
    autocomplete_fields = ["job_description", "user", "added_by"]
