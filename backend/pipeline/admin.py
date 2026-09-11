from django.contrib import admin

from pipeline.models import (
    Application,
    CandidateMatch,
    Communication,
    Interview,
    Offer,
    Onboarding,
    SearchRun,
)


@admin.register(SearchRun)
class SearchRunAdmin(admin.ModelAdmin):
    list_display = [
        "job_description",
        "requested_by",
        "status",
        "sources",
        "total_found",
        "new_candidates",
        "existing_candidates",
        "shortlisted",
        "started_at",
        "duration_ms",
    ]
    list_filter = ["status"]
    search_fields = ["job_description__title", "requested_by__email"]
    autocomplete_fields = ["job_description", "requested_by"]
    readonly_fields = ["created_at", "updated_at"]
    date_hierarchy = "started_at"


@admin.register(Application)
class ApplicationAdmin(admin.ModelAdmin):
    list_display = [
        "candidate",
        "job_description",
        "status",
        "match_pct",
        "owner",
        "entry_source",
        "is_starred",
        "stage_entered_at",
        "last_activity_at",
    ]
    list_filter = ["status", "entry_source", "is_starred", "job_description"]
    search_fields = ["candidate__full_name", "candidate__email", "job_description__title"]
    autocomplete_fields = ["candidate", "job_description", "owner", "search_run"]
    list_select_related = ["candidate", "job_description", "owner", "match"]
    readonly_fields = ["created_at", "updated_at"]
    date_hierarchy = "last_activity_at"

    @admin.display(description="Match %", ordering="match__overall_pct")
    def match_pct(self, application: Application):
        match = getattr(application, "match", None)
        return match.overall_pct if match else None


@admin.register(CandidateMatch)
class CandidateMatchAdmin(admin.ModelAdmin):
    list_display = [
        "application",
        "overall_pct",
        "skills_score",
        "experience_score",
        "education_score",
        "domain_score",
        "responsibility_score",
        "engine",
        "engine_version",
        "computed_at",
    ]
    list_filter = ["engine", "engine_version"]
    search_fields = [
        "application__candidate__full_name",
        "application__job_description__title",
    ]
    autocomplete_fields = ["application"]
    readonly_fields = ["created_at", "updated_at"]


@admin.register(Interview)
class InterviewAdmin(admin.ModelAdmin):
    list_display = [
        "application",
        "round",
        "sequence",
        "interviewer",
        "scheduled_at",
        "duration_minutes",
        "mode",
        "status",
        "score",
        "recommendation",
    ]
    list_filter = ["round", "mode", "status", "recommendation"]
    search_fields = [
        "application__candidate__full_name",
        "application__job_description__title",
        "interviewer__email",
    ]
    autocomplete_fields = ["application", "interviewer", "created_by"]
    readonly_fields = ["created_at", "updated_at"]
    date_hierarchy = "scheduled_at"


@admin.register(Communication)
class CommunicationAdmin(admin.ModelAdmin):
    list_display = [
        "application",
        "channel",
        "direction",
        "outcome",
        "summary",
        "performed_by",
        "occurred_at",
        "next_action_at",
    ]
    list_filter = ["channel", "direction", "outcome"]
    search_fields = ["summary", "notes", "application__candidate__full_name"]
    autocomplete_fields = ["application", "performed_by"]
    readonly_fields = ["created_at", "updated_at"]
    date_hierarchy = "occurred_at"


@admin.register(Offer)
class OfferAdmin(admin.ModelAdmin):
    list_display = [
        "application",
        "status",
        "designation",
        "annual_ctc",
        "currency",
        "joining_date",
        "sent_at",
        "responded_at",
        "created_by",
    ]
    list_filter = ["status", "currency"]
    search_fields = ["designation", "application__candidate__full_name"]
    autocomplete_fields = ["application", "created_by"]
    readonly_fields = ["created_at", "updated_at"]


@admin.register(Onboarding)
class OnboardingAdmin(admin.ModelAdmin):
    list_display = ["application", "status", "start_date", "buddy", "hr_contact", "completed_at"]
    list_filter = ["status"]
    search_fields = ["application__candidate__full_name", "buddy__email", "hr_contact__email"]
    autocomplete_fields = ["application", "buddy", "hr_contact"]
    readonly_fields = ["created_at", "updated_at"]
