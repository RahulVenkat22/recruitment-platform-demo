from django.contrib import admin

from candidates.models import (
    Candidate,
    CandidateCertification,
    CandidateEducation,
    CandidateExperience,
    CandidateSkill,
    CandidateSource,
)


class CandidateSkillInline(admin.TabularInline):
    model = CandidateSkill
    extra = 0


class CandidateExperienceInline(admin.TabularInline):
    model = CandidateExperience
    extra = 0


class CandidateEducationInline(admin.TabularInline):
    model = CandidateEducation
    extra = 0


class CandidateCertificationInline(admin.TabularInline):
    model = CandidateCertification
    extra = 0


class CandidateSourceInline(admin.TabularInline):
    model = CandidateSource
    extra = 0
    autocomplete_fields = ["referred_by"]


@admin.register(Candidate)
class CandidateAdmin(admin.ModelAdmin):
    list_display = [
        "full_name",
        "email",
        "current_title",
        "current_company",
        "location",
        "total_experience_years",
        "notice_period_days",
        "created_at",
    ]
    list_filter = ["location", "current_company"]
    search_fields = ["full_name", "email", "phone", "headline", "current_company", "current_title"]
    readonly_fields = ["created_at", "updated_at"]
    inlines = [
        CandidateSkillInline,
        CandidateExperienceInline,
        CandidateEducationInline,
        CandidateCertificationInline,
        CandidateSourceInline,
    ]


@admin.register(CandidateSkill)
class CandidateSkillAdmin(admin.ModelAdmin):
    list_display = ["candidate", "skill", "display_name", "proficiency", "years", "is_primary"]
    list_filter = ["proficiency", "is_primary"]
    search_fields = ["skill", "display_name", "candidate__full_name"]
    autocomplete_fields = ["candidate"]


@admin.register(CandidateExperience)
class CandidateExperienceAdmin(admin.ModelAdmin):
    list_display = [
        "candidate",
        "title",
        "company",
        "domain",
        "start_date",
        "end_date",
        "is_current",
    ]
    list_filter = ["is_current", "domain"]
    search_fields = ["title", "company", "candidate__full_name"]
    autocomplete_fields = ["candidate"]


@admin.register(CandidateEducation)
class CandidateEducationAdmin(admin.ModelAdmin):
    list_display = ["candidate", "degree", "field", "institution", "start_year", "end_year"]
    list_filter = ["degree"]
    search_fields = ["degree", "field", "institution", "candidate__full_name"]
    autocomplete_fields = ["candidate"]


@admin.register(CandidateCertification)
class CandidateCertificationAdmin(admin.ModelAdmin):
    list_display = ["candidate", "name", "issuer", "issued_year"]
    list_filter = ["issuer"]
    search_fields = ["name", "issuer", "candidate__full_name"]
    autocomplete_fields = ["candidate"]


@admin.register(CandidateSource)
class CandidateSourceAdmin(admin.ModelAdmin):
    list_display = ["candidate", "source", "source_reference", "referred_by", "discovered_at"]
    list_filter = ["source"]
    search_fields = ["candidate__full_name", "candidate__email", "source_reference"]
    autocomplete_fields = ["candidate", "referred_by"]
