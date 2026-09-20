"""Shapes for the resume endpoints and the resume block of a candidate profile."""

from __future__ import annotations

from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from accounts.serializers import UserSummarySerializer
from resumes.models import ResumeDocument


class ResumeDocumentSummarySerializer(serializers.ModelSerializer):
    """What a candidate profile shows about the PDF behind it."""

    status_label = serializers.CharField(source="get_status_display", read_only=True)
    storage_status_label = serializers.CharField(
        source="get_storage_status_display", read_only=True
    )
    is_uploaded = serializers.BooleanField(read_only=True)

    class Meta:
        model = ResumeDocument
        fields = [
            "id",
            "file_name",
            "page_count",
            "status",
            "status_label",
            "storage_status",
            "storage_status_label",
            "is_uploaded",
            "parse_source",
            "chunk_count",
            "ingested_at",
        ]
        read_only_fields = fields


class ResumeLinkSerializer(serializers.Serializer):
    url = serializers.URLField()
    expires_at = serializers.DateTimeField()
    file_name = serializers.CharField()
    document_id = serializers.UUIDField()


# ------------------------------------------------------------------ uploads


class ResumeUploadRequestSerializer(serializers.Serializer):
    """``POST /resumes/uploads/`` multipart body: one or many ``files`` parts."""

    files = serializers.ListField(child=serializers.FileField(), allow_empty=False)


class IntakeFileSerializer(serializers.Serializer):
    file_name = serializers.CharField()
    status = serializers.ChoiceField(choices=["accepted", "duplicate", "rejected"])
    reason = serializers.CharField(allow_blank=True)
    document_id = serializers.UUIDField(allow_null=True)
    candidate_id = serializers.UUIDField(allow_null=True)
    candidate_name = serializers.CharField(allow_blank=True)


class IntakeResultSerializer(serializers.Serializer):
    batch_id = serializers.UUIDField()
    accepted = IntakeFileSerializer(many=True)
    duplicates = IntakeFileSerializer(many=True)
    rejected = IntakeFileSerializer(many=True)


class UploadedCandidateRefSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    full_name = serializers.CharField()


class UploadedDocumentSerializer(serializers.ModelSerializer):
    """One file of an upload batch, as the upload page shows it while polling."""

    status_label = serializers.CharField(source="get_status_display", read_only=True)
    candidate = serializers.SerializerMethodField()
    warnings = serializers.ListField(child=serializers.CharField(), read_only=True)

    class Meta:
        model = ResumeDocument
        fields = [
            "id",
            "file_name",
            "file_size",
            "page_count",
            "status",
            "status_label",
            "status_reason",
            "warnings",
            "candidate",
            "chunk_count",
            "parse_source",
            "storage_status",
            "ingested_at",
            "processing_ms",
        ]
        read_only_fields = fields

    @extend_schema_field(UploadedCandidateRefSerializer(allow_null=True))
    def get_candidate(self, obj: ResumeDocument) -> dict | None:
        candidate = obj.candidate
        if candidate is None:
            return None
        return {"id": str(candidate.pk), "full_name": candidate.full_name}


class UploadBatchCountsSerializer(serializers.Serializer):
    pending = serializers.IntegerField()
    parsed = serializers.IntegerField()
    needs_review = serializers.IntegerField()
    failed = serializers.IntegerField()
    superseded = serializers.IntegerField()


class UploadBatchSerializer(serializers.Serializer):
    batch_id = serializers.UUIDField()
    created_at = serializers.DateTimeField()
    uploaded_by = UserSummarySerializer(allow_null=True)
    total = serializers.IntegerField()
    done = serializers.IntegerField()
    counts = UploadBatchCountsSerializer()
    running = serializers.BooleanField()
    stalled = serializers.BooleanField()
    queue_position = serializers.IntegerField()
    documents = UploadedDocumentSerializer(many=True)


class UploadBatchSummarySerializer(serializers.Serializer):
    batch_id = serializers.UUIDField()
    created_at = serializers.DateTimeField()
    total = serializers.IntegerField()
    parsed = serializers.IntegerField()
    needs_review = serializers.IntegerField()
    failed = serializers.IntegerField()
    pending = serializers.IntegerField()
    last_activity = serializers.DateTimeField()
