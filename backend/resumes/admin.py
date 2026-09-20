from django.contrib import admin

from resumes.models import ResumeChunk, ResumeDocument


class ResumeChunkInline(admin.TabularInline):
    model = ResumeChunk
    extra = 0
    fields = ["section", "chunk_index", "char_count"]
    readonly_fields = fields
    can_delete = False


@admin.register(ResumeDocument)
class ResumeDocumentAdmin(admin.ModelAdmin):
    list_display = [
        "file_name",
        "candidate",
        "status",
        "storage_status",
        "page_count",
        "chunk_count",
        "ingested_at",
    ]
    list_filter = ["status", "storage_status", "parse_source"]
    search_fields = ["file_name", "candidate__full_name", "candidate__email", "file_hash"]
    readonly_fields = [
        "file_hash",
        "file_size",
        "page_count",
        "text_chars",
        "chunk_count",
        "processing_ms",
        "ingested_at",
        "uploaded_at",
    ]
    autocomplete_fields = ["candidate"]
    inlines = [ResumeChunkInline]
