"""Shapes for ``/api/v1/notifications/`` (plan.md 6.10 Notifications rows)."""

from __future__ import annotations

from rest_framework import serializers

from accounts.serializers import UserSummarySerializer
from notifications.models import Notification


class NotificationSerializer(serializers.ModelSerializer):
    actor = UserSummarySerializer(read_only=True, allow_null=True)
    type_label = serializers.CharField(source="get_type_display", read_only=True)

    class Meta:
        model = Notification
        fields = [
            "id",
            "type",
            "type_label",
            "title",
            "message",
            "link_url",
            "actor",
            "is_read",
            "read_at",
            "created_at",
        ]
        read_only_fields = fields


class UnreadCountSerializer(serializers.Serializer):
    unread = serializers.IntegerField()


class ReadAllSerializer(serializers.Serializer):
    marked = serializers.IntegerField()
