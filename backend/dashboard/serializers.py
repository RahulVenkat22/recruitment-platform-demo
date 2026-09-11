"""Response shapes for the dashboard endpoints. These are read-only and describe
already-built dicts, so the OpenAPI schema (and the generated TypeScript types)
match what the views return."""

from rest_framework import serializers


class KeyLabelSerializer(serializers.Serializer):
    key = serializers.CharField()
    label = serializers.CharField()


class ColorTokenSerializer(serializers.Serializer):
    bg = serializers.CharField(help_text="Badge background, hex")
    text = serializers.CharField(help_text="Badge text, hex")
    name = serializers.CharField(help_text="Palette name used in plan.md 8.1, e.g. 'emerald'")


class StatusGroupsSerializer(serializers.Serializer):
    active = serializers.ListField(child=serializers.CharField())
    tray = serializers.ListField(child=serializers.CharField())
    terminal = serializers.ListField(child=serializers.CharField())


class KanbanColumnSerializer(serializers.Serializer):
    key = serializers.CharField()
    label = serializers.CharField()
    statuses = serializers.ListField(child=serializers.CharField())
    entry_status = serializers.CharField(
        help_text="Status applied when a card is dropped into this column"
    )


class KanbanTraySerializer(serializers.Serializer):
    label = serializers.CharField()
    statuses = serializers.ListField(child=serializers.CharField())


class KanbanSerializer(serializers.Serializer):
    columns = KanbanColumnSerializer(many=True)
    tray = KanbanTraySerializer()
    status_to_column = serializers.DictField(
        child=serializers.CharField(allow_null=True),
        help_text="Application status -> column key; null for tray statuses",
    )


class MetaEnumsSerializer(serializers.Serializer):
    """``GET /api/v1/meta/enums/`` body (plan.md 6.4, 7.2)."""

    enums = serializers.DictField(child=KeyLabelSerializer(many=True))
    colors = serializers.DictField(child=serializers.DictField(child=ColorTokenSerializer()))
    status_order = serializers.ListField(child=serializers.CharField())
    status_groups = StatusGroupsSerializer()
    status_entry_category = serializers.DictField(child=serializers.CharField())
    kanban = KanbanSerializer()
