"""Shapes for ``/api/v1/support/tickets/``."""

from __future__ import annotations

from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from accounts.models import User
from accounts.serializers import UserSummarySerializer
from common.enums import TicketCategory, TicketPriority, TicketStatus
from jobs.models import JobDescription
from pipeline.serializers import JobRefSerializer
from support.models import Ticket, TicketEvent
from support.permissions import (
    allowed_moves,
    can_assign_ticket,
    can_comment_ticket,
    can_edit_ticket,
)

SUBJECT_MAX = 200
TEXT_MAX = 5000


class TicketEventSerializer(serializers.ModelSerializer):
    actor = UserSummarySerializer(read_only=True, allow_null=True)
    kind_label = serializers.CharField(source="get_kind_display", read_only=True)

    class Meta:
        model = TicketEvent
        fields = [
            "id",
            "kind",
            "kind_label",
            "actor",
            "title",
            "message",
            "metadata",
            "occurred_at",
        ]
        read_only_fields = fields


class TicketPermissionsSerializer(serializers.Serializer):
    can_edit = serializers.BooleanField()
    can_comment = serializers.BooleanField()
    can_assign = serializers.BooleanField()
    moves = serializers.ListField(
        child=serializers.ChoiceField(choices=TicketStatus.choices),
        help_text="Statuses the current user may move the ticket into, in button order",
    )


class TicketRowSerializer(serializers.ModelSerializer):
    """A row of ``GET /support/tickets/``."""

    requester = UserSummarySerializer(read_only=True)
    assignee = UserSummarySerializer(read_only=True, allow_null=True)
    job = JobRefSerializer(source="job_description", read_only=True, allow_null=True)
    category_label = serializers.CharField(source="get_category_display", read_only=True)
    priority_label = serializers.CharField(source="get_priority_display", read_only=True)
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    comment_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Ticket
        fields = [
            "id",
            "number",
            "subject",
            "category",
            "category_label",
            "priority",
            "priority_label",
            "status",
            "status_label",
            "requester",
            "assignee",
            "job",
            "comment_count",
            "last_activity_at",
            "resolved_at",
            "closed_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class TicketDetailSerializer(TicketRowSerializer):
    """``GET /support/tickets/{id}/``: the row plus the text, the timeline and
    what the current user may do."""

    events = TicketEventSerializer(many=True, read_only=True)
    permissions = serializers.SerializerMethodField()

    class Meta(TicketRowSerializer.Meta):
        fields = [
            *TicketRowSerializer.Meta.fields,
            "description",
            "resolution",
            "events",
            "permissions",
        ]
        read_only_fields = fields

    @extend_schema_field(TicketPermissionsSerializer)
    def get_permissions(self, ticket: Ticket) -> dict:
        user = self.context["request"].user
        return {
            "can_edit": can_edit_ticket(user, ticket),
            "can_comment": can_comment_ticket(user, ticket),
            "can_assign": can_assign_ticket(user, ticket),
            "moves": allowed_moves(user, ticket),
        }


class TicketCreateSerializer(serializers.Serializer):
    """``POST /support/tickets/``."""

    subject = serializers.CharField(max_length=SUBJECT_MAX)
    description = serializers.CharField(max_length=TEXT_MAX)
    category = serializers.ChoiceField(choices=TicketCategory.choices, default=TicketCategory.OTHER)
    priority = serializers.ChoiceField(
        choices=TicketPriority.choices, default=TicketPriority.MEDIUM
    )
    job_description_id = serializers.PrimaryKeyRelatedField(
        queryset=JobDescription.objects.all(),
        source="job_description",
        required=False,
        allow_null=True,
    )

    def validate_subject(self, value: str) -> str:
        if not value.strip():
            raise serializers.ValidationError("Give the ticket a subject.")
        return value.strip()

    def validate_description(self, value: str) -> str:
        if not value.strip():
            raise serializers.ValidationError("Describe what you need help with.")
        return value.strip()


class TicketUpdateSerializer(TicketCreateSerializer):
    """``PATCH /support/tickets/{id}/``: any of the create fields."""

    subject = serializers.CharField(max_length=SUBJECT_MAX, required=False)
    description = serializers.CharField(max_length=TEXT_MAX, required=False)
    category = serializers.ChoiceField(choices=TicketCategory.choices, required=False)
    priority = serializers.ChoiceField(choices=TicketPriority.choices, required=False)


class TicketCommentSerializer(serializers.Serializer):
    message = serializers.CharField(max_length=TEXT_MAX)

    def validate_message(self, value: str) -> str:
        if not value.strip():
            raise serializers.ValidationError("Write something first.")
        return value.strip()


class TicketTransitionSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=TicketStatus.choices)
    note = serializers.CharField(
        max_length=TEXT_MAX,
        required=False,
        allow_blank=True,
        help_text="The resolution when resolving; the reason when closing early or reopening",
    )


class TicketAssignSerializer(serializers.Serializer):
    assignee_id = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.filter(is_active=True),
        source="assignee",
        allow_null=True,
        help_text="Null takes the ticket away from its assignee",
    )


class TicketSummarySerializer(serializers.Serializer):
    """Counts by status for the list's filter chips."""

    total = serializers.IntegerField()
    open = serializers.IntegerField()
    in_progress = serializers.IntegerField()
    resolved = serializers.IntegerField()
    closed = serializers.IntegerField()
