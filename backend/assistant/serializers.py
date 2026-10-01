"""Shapes of ``/assistant/chat/`` and ``/assistant/actions/``."""

from __future__ import annotations

from rest_framework import serializers

from assistant.models import AssistantMessage


class AssistantStepDetailSerializer(serializers.Serializer):
    label = serializers.CharField()
    value = serializers.CharField(allow_blank=True)


class AssistantStepResultSerializer(serializers.Serializer):
    summary = serializers.CharField(allow_blank=True)
    link = serializers.CharField(allow_blank=True, required=False, default="")
    link_label = serializers.CharField(allow_blank=True, required=False, default="")
    changed = serializers.BooleanField(required=False, default=False)


class AssistantStepSerializer(serializers.Serializer):
    """One step of an assistant turn: text it wrote, or an action it took."""

    type = serializers.ChoiceField(choices=[("text", "Text"), ("action", "Action")])
    text = serializers.CharField(allow_blank=True, required=False, default="")
    id = serializers.CharField(required=False, default="")
    name = serializers.CharField(required=False, default="")
    label = serializers.CharField(required=False, default="")
    status = serializers.ChoiceField(
        choices=[
            ("running", "Running"),
            ("done", "Done"),
            ("failed", "Failed"),
            ("pending", "Pending"),
            ("cancelled", "Cancelled"),
        ],
        required=False,
        default="done",
    )
    details = AssistantStepDetailSerializer(many=True, required=False, default=list)
    body = serializers.CharField(allow_blank=True, required=False, default="")
    result = AssistantStepResultSerializer(allow_null=True, required=False, default=None)
    error = serializers.CharField(allow_blank=True, required=False, default="")


class AssistantMessageSerializer(serializers.ModelSerializer):
    role = serializers.CharField(read_only=True)
    steps = AssistantStepSerializer(many=True, read_only=True)

    class Meta:
        model = AssistantMessage
        fields = ["id", "role", "content", "steps", "model", "created_at"]
        read_only_fields = fields


class AssistantScopeSerializer(serializers.Serializer):
    model = serializers.CharField()
    company = serializers.CharField()
    user_name = serializers.CharField()
    role = serializers.CharField()
    role_label = serializers.CharField()
    # HR staff can change things; everyone else gets answers and their own notifications.
    can_act = serializers.BooleanField()


class AssistantThreadSerializer(serializers.Serializer):
    """``GET /assistant/chat/``: who is asking, the turns so far and opening prompts."""

    scope = AssistantScopeSerializer()
    messages = AssistantMessageSerializer(many=True)
    suggestions = serializers.ListField(child=serializers.CharField())


class AssistantAskSerializer(serializers.Serializer):
    """``POST /assistant/chat/``: one instruction; the turn streams back."""

    message = serializers.CharField(max_length=4000)
