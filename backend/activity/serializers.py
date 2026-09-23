"""Response shapes for ``GET /api/v1/activities/`` (plan.md 6.10 Activities row)."""

from __future__ import annotations

from rest_framework import serializers

from accounts.serializers import UserSummarySerializer
from activity.models import Activity
from candidates.models import Candidate


class CandidateRefSerializer(serializers.ModelSerializer):
    """Enough of a candidate to render a chip that links to their profile."""

    avatar_url = serializers.CharField(source="display_avatar_url", read_only=True, allow_null=True)

    class Meta:
        model = Candidate
        fields = ["id", "full_name", "avatar_url", "headline", "current_company", "current_title"]
        read_only_fields = fields


class ActivitySerializer(serializers.ModelSerializer):
    """One timeline row, ready to render (plan.md 6.3 activity.Activity)."""

    actor = UserSummarySerializer(read_only=True, allow_null=True)
    candidate = CandidateRefSerializer(read_only=True, allow_null=True)
    category_label = serializers.CharField(source="get_category_display", read_only=True)
    metadata = serializers.DictField(child=serializers.JSONField(), read_only=True)

    class Meta:
        model = Activity
        fields = [
            "id",
            "job_description",
            "application",
            "candidate",
            "category",
            "category_label",
            "event_type",
            "title",
            "description",
            "actor",
            "metadata",
            "occurred_at",
            "created_at",
        ]
        read_only_fields = fields


class ActivityPageSerializer(serializers.Serializer):
    """A keyset page plus the numbers the timeline header needs (counts per category)."""

    results = ActivitySerializer(many=True)
    next_before = serializers.DateTimeField(allow_null=True)
    next_before_id = serializers.UUIDField(allow_null=True)
    has_more = serializers.BooleanField()
    total = serializers.IntegerField(help_text="Events matching the filters, ignoring category")
    counts = serializers.DictField(
        child=serializers.IntegerField(), help_text="Events per category, ignoring category"
    )
