from django.contrib import admin

from seed.models import SeedMarker


@admin.register(SeedMarker)
class SeedMarkerAdmin(admin.ModelAdmin):
    """Read-only view of seed runs; rows are written by ``manage.py seed_demo`` only."""

    list_display = ("version", "created_at", "candidate_count", "job_count")
    search_fields = ("version",)
    readonly_fields = ("version", "counts", "created_at", "updated_at")
    ordering = ("-created_at",)

    @admin.display(description="Candidates")
    def candidate_count(self, marker: SeedMarker) -> int:
        return marker.counts.get("Candidates", 0)

    @admin.display(description="Job descriptions")
    def job_count(self, marker: SeedMarker) -> int:
        return marker.counts.get("Job descriptions", 0)

    def has_add_permission(self, request) -> bool:
        return False

    def has_change_permission(self, request, obj=None) -> bool:
        return False
