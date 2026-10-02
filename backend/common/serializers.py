"""Shared response shapes for recruitment turnaround time."""

from rest_framework import serializers


class TATStageSerializer(serializers.Serializer):
    status = serializers.CharField(allow_null=True)
    label = serializers.CharField()
    entered_at = serializers.DateTimeField()
    exited_at = serializers.DateTimeField(allow_null=True)
    elapsed_seconds = serializers.IntegerField()
    is_current = serializers.BooleanField()


class ApplicationTATSerializer(serializers.Serializer):
    as_of = serializers.DateTimeField()
    started_at = serializers.DateTimeField()
    finished_at = serializers.DateTimeField(allow_null=True)
    elapsed_seconds = serializers.IntegerField(allow_null=True)
    job_elapsed_seconds = serializers.IntegerField(allow_null=True)
    on_hold_seconds = serializers.IntegerField()
    history_complete = serializers.BooleanField()
    stages = TATStageSerializer(many=True)


class JobTATSerializer(serializers.Serializer):
    as_of = serializers.DateTimeField()
    started_at = serializers.DateTimeField(allow_null=True)
    finished_at = serializers.DateTimeField(allow_null=True)
    state = serializers.ChoiceField(
        choices=["not_started", "in_progress", "on_hold", "filled", "closed"]
    )
    elapsed_seconds = serializers.IntegerField(allow_null=True)
    first_hire_seconds = serializers.IntegerField(allow_null=True)
    average_hire_seconds = serializers.IntegerField(allow_null=True)
    filled_seconds = serializers.IntegerField(allow_null=True)
    hires = serializers.IntegerField()
    openings = serializers.IntegerField()
