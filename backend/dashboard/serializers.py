"""Response shapes for the dashboard endpoints. These are read-only and describe
already-built dicts, so the OpenAPI schema (and the generated TypeScript types)
match what the views return."""

from rest_framework import serializers

from accounts.serializers import UserSummarySerializer
from jobs.models import JobDescription


class CountrySerializer(serializers.Serializer):
    code = serializers.CharField()
    name = serializers.CharField()


class CountryCitiesSerializer(serializers.Serializer):
    country = CountrySerializer()
    cities = serializers.ListField(child=serializers.CharField())


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


# ------------------------------------------------------------------ dashboard


class DashboardMetricSerializer(serializers.Serializer):
    """One headline figure: the value now (or across the window for flows), its
    change against the previous window, and a daily series for the sparkline."""

    value = serializers.FloatField(allow_null=True, help_text="Null when there is no data yet")
    delta = serializers.FloatField(
        allow_null=True,
        help_text="Change against the previous window; null when either side has no data",
    )
    unit = serializers.ChoiceField(choices=["count", "percent", "days"])
    detail = serializers.CharField(
        allow_null=True, help_text="A short qualifier, e.g. '12 openings'"
    )
    series = serializers.ListField(
        child=serializers.IntegerField(),
        allow_null=True,
        help_text="Daily counts across the window, oldest first; null for snapshots and rates",
    )


class DashboardSummarySerializer(serializers.Serializer):
    range_days = serializers.IntegerField()
    open_roles = DashboardMetricSerializer()
    in_pipeline = DashboardMetricSerializer()
    new_candidates = DashboardMetricSerializer()
    interviews = DashboardMetricSerializer()
    offers_pending = DashboardMetricSerializer()
    hires = DashboardMetricSerializer()
    offer_acceptance = DashboardMetricSerializer()
    time_to_hire = DashboardMetricSerializer()


class TrendPointSerializer(serializers.Serializer):
    date = serializers.DateField()
    candidates = serializers.IntegerField(help_text="Candidates found (applications created)")
    shortlisted = serializers.IntegerField()
    interviews = serializers.IntegerField(help_text="Interviews held, cancellations excluded")
    offers = serializers.IntegerField(help_text="Offers sent")
    hires = serializers.IntegerField(help_text="Onboardings completed")


class DashboardTrendsSerializer(serializers.Serializer):
    range_days = serializers.IntegerField()
    points = TrendPointSerializer(many=True)


class KeyCountSerializer(serializers.Serializer):
    key = serializers.CharField()
    label = serializers.CharField()
    value = serializers.IntegerField()


class StageCountSerializer(KeyCountSerializer):
    statuses = serializers.ListField(
        child=serializers.CharField(), help_text="Application statuses this stage covers"
    )


class JobPipelineRowSerializer(serializers.ModelSerializer):
    """One job description with its candidates split by where they stand now."""

    total = serializers.IntegerField(read_only=True)
    awaiting = serializers.IntegerField(read_only=True)
    shortlisted = serializers.IntegerField(read_only=True)
    contacted = serializers.IntegerField(read_only=True)
    interviewed = serializers.IntegerField(read_only=True)
    selected = serializers.IntegerField(read_only=True)
    onboarded = serializers.IntegerField(read_only=True)
    parked = serializers.IntegerField(read_only=True)
    last_activity_at = serializers.DateTimeField(read_only=True, allow_null=True)

    class Meta:
        model = JobDescription
        fields = [
            "id",
            "title",
            "department",
            "status",
            "openings",
            "total",
            "awaiting",
            "shortlisted",
            "contacted",
            "interviewed",
            "selected",
            "onboarded",
            "parked",
            "last_activity_at",
        ]
        read_only_fields = fields


class DashboardPipelineSerializer(serializers.Serializer):
    stages = StageCountSerializer(many=True)
    sources = KeyCountSerializer(many=True)
    jobs = JobPipelineRowSerializer(many=True)


class FunnelStageSerializer(serializers.Serializer):
    key = serializers.CharField()
    label = serializers.CharField()
    statuses = serializers.ListField(
        child=serializers.CharField(),
        help_text="Application statuses counted as having reached this stage; empty for Found",
    )
    value = serializers.IntegerField()
    conversion_pct = serializers.IntegerField(
        allow_null=True, help_text="Percent of the previous stage; null for the first"
    )


class FunnelSerializer(serializers.Serializer):
    job_description = serializers.UUIDField(allow_null=True)
    stages = FunnelStageSerializer(many=True)


class InterviewerLoadSerializer(serializers.Serializer):
    user = UserSummarySerializer()
    total = serializers.IntegerField()
    completed = serializers.IntegerField()
    avg_score = serializers.FloatField(allow_null=True)


class InterviewInsightsSerializer(serializers.Serializer):
    range_days = serializers.IntegerField()
    total = serializers.IntegerField(help_text="Interviews scheduled inside the window")
    completed = serializers.IntegerField()
    cancelled = serializers.IntegerField()
    no_show = serializers.IntegerField()
    upcoming = serializers.IntegerField(help_text="Open interviews still ahead, right now")
    feedback_pending = serializers.IntegerField(
        help_text="Interviews that have happened but have no feedback yet, right now"
    )
    avg_score = serializers.FloatField(allow_null=True)
    recommendations = KeyCountSerializer(many=True)
    interviewers = InterviewerLoadSerializer(many=True)


class AttentionCountsSerializer(serializers.Serializer):
    overdue_follow_ups = serializers.IntegerField()
    feedback_pending = serializers.IntegerField()
    offers_expiring = serializers.IntegerField()
    stale_candidates = serializers.IntegerField()
    quiet_roles = serializers.IntegerField()


class TeamMemberSerializer(serializers.Serializer):
    user = UserSummarySerializer()
    roles = serializers.IntegerField(help_text="Job descriptions created or listed on")
    sourcing = serializers.IntegerField()
    outreach = serializers.IntegerField()
    interviews = serializers.IntegerField()
    closing = serializers.IntegerField()
    total = serializers.IntegerField()
