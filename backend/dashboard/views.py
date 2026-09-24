from uuid import UUID

from django.http import HttpResponse
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import serializers
from rest_framework.exceptions import NotFound
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from common import locations
from common.permissions import IsHrStaff
from dashboard import exports, services
from dashboard.serializers import (
    AttentionCountsSerializer,
    CountryCitiesSerializer,
    CountrySerializer,
    DashboardDetailsSerializer,
    DashboardInsightsSerializer,
    DashboardPipelineSerializer,
    DashboardSummarySerializer,
    DashboardTrendsSerializer,
    FunnelSerializer,
    InterviewInsightsSerializer,
    MetaEnumsSerializer,
    TeamMemberSerializer,
)
from dashboard.services import build_enum_catalogue
from pipeline.serializers import InterviewSerializer


class MetaEnumsView(APIView):
    """``GET /api/v1/meta/enums/``: every enum with labels and colour tokens (plan.md 6.10).

    Authenticated: the SPA loads it right after the boot-time session restore.
    """

    permission_classes = [IsAuthenticated]
    throttle_classes: list = []

    @extend_schema(
        operation_id="meta_enums",
        summary="Enum catalogue: labels, colour tokens, status order and Kanban mapping",
        responses={200: MetaEnumsSerializer},
        tags=["meta"],
    )
    def get(self, request: Request) -> Response:
        return Response(MetaEnumsSerializer(instance=build_enum_catalogue()).data)


class MetaCountriesView(APIView):
    """``GET /api/v1/meta/countries/``: every country, for the job description form."""

    permission_classes = [IsAuthenticated]
    throttle_classes: list = []

    @extend_schema(
        operation_id="meta_countries",
        summary="Every country, alphabetical",
        responses={200: CountrySerializer(many=True)},
        tags=["meta"],
    )
    def get(self, request: Request) -> Response:
        return Response(CountrySerializer(locations.countries(), many=True).data)


class MetaCitiesView(APIView):
    """``GET /api/v1/meta/countries/{code}/cities/``: the places in one country."""

    permission_classes = [IsAuthenticated]
    throttle_classes: list = []

    @extend_schema(
        operation_id="meta_cities",
        summary="The places in a country (15,000 people or more), alphabetical",
        responses={200: CountryCitiesSerializer},
        tags=["meta"],
    )
    def get(self, request: Request, code: str) -> Response:
        found = locations.country(code)
        if found is None:
            raise NotFound(f"No country with code {code!r}.")
        payload = {"country": found, "cities": locations.cities(found.code)}
        return Response(CountryCitiesSerializer(payload).data)


# ------------------------------------------------------------------ dashboard


class DashboardParamsSerializer(serializers.Serializer):
    """The query parameters every dashboard endpoint shares: a preset window or a
    custom date range, and the people to narrow to."""

    range = serializers.ChoiceField(
        choices=list(services.RANGE_CHOICES), required=False, default=services.DEFAULT_RANGE
    )
    start = serializers.DateField(required=False)
    end = serializers.DateField(required=False)
    user = serializers.CharField(required=False, allow_blank=True)

    def validate_user(self, value: str) -> list[str]:
        """``a,b,c`` -> the ids, each checked to be a UUID."""
        ids = []
        for item in value.split(","):
            item = item.strip()
            if not item:
                continue
            try:
                ids.append(str(UUID(item)))
            except ValueError as exc:
                raise serializers.ValidationError(f"{item!r} is not a user id.") from exc
        return ids

    def validate(self, attrs: dict) -> dict:
        start, end = attrs.get("start"), attrs.get("end")
        if (start is None) != (end is None):
            raise serializers.ValidationError("Give both start and end, or neither.")
        if start and end:
            if start > end:
                raise serializers.ValidationError("start must be on or before end.")
            if (end - start).days + 1 > services.MAX_CUSTOM_DAYS:
                raise serializers.ValidationError(
                    f"A custom range covers at most {services.MAX_CUSTOM_DAYS} days."
                )
        return attrs


SCOPE_PARAMETERS = [
    OpenApiParameter(
        "range",
        int,
        enum=list(services.RANGE_CHOICES),
        description="Window in days: 7, 30 (default) or 90; ignored when start and end are given",
    ),
    OpenApiParameter(
        "start",
        OpenApiTypes.DATE,
        description="First day of a custom window (inclusive, the viewer's local date); needs end",
    ),
    OpenApiParameter(
        "end",
        OpenApiTypes.DATE,
        description="Last day of a custom window (inclusive; later than today reads as today), "
        "at most 366 days after start",
    ),
    OpenApiParameter(
        "user",
        str,
        description="Comma-separated user ids: narrow to the job descriptions any of these "
        "people created or are listed on",
    ),
]


class _DashboardView(APIView):
    """HR admins and HR only: the dashboard is the recruiting team's view (plan.md 6.9)."""

    permission_classes = [IsAuthenticated, IsHrStaff]
    throttle_classes: list = []

    def scope(self, request: Request) -> services.Scope:
        params = DashboardParamsSerializer(data=request.query_params)
        params.is_valid(raise_exception=True)
        data = params.validated_data
        return services.Scope(
            viewer=request.user,
            days=data["range"],
            user_ids=tuple(data.get("user", ())),
            start=data.get("start"),
            end=data.get("end"),
        )


class DashboardSummaryView(_DashboardView):
    @extend_schema(
        operation_id="dashboard_summary",
        summary="Eight headline figures with deltas against the previous window and sparklines",
        parameters=SCOPE_PARAMETERS,
        responses={200: DashboardSummarySerializer},
        tags=["dashboard"],
    )
    def get(self, request: Request) -> Response:
        return Response(DashboardSummarySerializer(services.summary(self.scope(request))).data)


class DashboardTrendsView(_DashboardView):
    @extend_schema(
        operation_id="dashboard_trends",
        summary="Daily hiring activity across the window",
        parameters=SCOPE_PARAMETERS,
        responses={200: DashboardTrendsSerializer},
        tags=["dashboard"],
    )
    def get(self, request: Request) -> Response:
        return Response(DashboardTrendsSerializer(services.trends(self.scope(request))).data)


class DashboardPipelineView(_DashboardView):
    @extend_schema(
        operation_id="dashboard_pipeline",
        summary="Where candidates stand now: by stage, by source and per job description",
        parameters=SCOPE_PARAMETERS,
        responses={200: DashboardPipelineSerializer},
        tags=["dashboard"],
    )
    def get(self, request: Request) -> Response:
        return Response(DashboardPipelineSerializer(services.pipeline(self.scope(request))).data)


class DashboardFunnelView(_DashboardView):
    @extend_schema(
        operation_id="dashboard_funnel",
        summary="Recruitment funnel, optionally for one job description",
        parameters=[*SCOPE_PARAMETERS, OpenApiParameter("job_description", OpenApiTypes.UUID)],
        responses={200: FunnelSerializer},
        tags=["dashboard"],
    )
    def get(self, request: Request) -> Response:
        jd = request.query_params.get("job_description") or None
        return Response(FunnelSerializer(services.funnel(self.scope(request), jd)).data)


class DashboardInterviewsView(_DashboardView):
    @extend_schema(
        operation_id="dashboard_interviews",
        summary="Interview outcomes across the window and the interviewers' load",
        parameters=SCOPE_PARAMETERS,
        responses={200: InterviewInsightsSerializer},
        tags=["dashboard"],
    )
    def get(self, request: Request) -> Response:
        return Response(
            InterviewInsightsSerializer(services.interview_insights(self.scope(request))).data
        )


class DashboardAttentionView(_DashboardView):
    @extend_schema(
        operation_id="dashboard_attention",
        summary="Counts of things waiting on someone right now",
        parameters=SCOPE_PARAMETERS,
        responses={200: AttentionCountsSerializer},
        tags=["dashboard"],
    )
    def get(self, request: Request) -> Response:
        return Response(AttentionCountsSerializer(services.attention(self.scope(request))).data)


class DashboardTeamView(_DashboardView):
    @extend_schema(
        operation_id="dashboard_team",
        summary="Who did what across the window, over everything the viewer may see",
        parameters=SCOPE_PARAMETERS,
        responses={200: TeamMemberSerializer(many=True)},
        tags=["dashboard"],
    )
    def get(self, request: Request) -> Response:
        return Response(TeamMemberSerializer(services.team(self.scope(request)), many=True).data)


class DashboardUpcomingInterviewsView(_DashboardView):
    @extend_schema(
        operation_id="dashboard_upcoming_interviews",
        summary="The next five interviews",
        parameters=SCOPE_PARAMETERS,
        responses={200: InterviewSerializer(many=True)},
        tags=["dashboard"],
    )
    def get(self, request: Request) -> Response:
        rows = services.upcoming_interviews(self.scope(request))
        return Response(InterviewSerializer(rows, many=True, context={"request": request}).data)


class DashboardInsightsView(_DashboardView):
    @extend_schema(
        operation_id="dashboard_insights",
        summary="Stage ages, match quality, skills demand, departments, experience, outreach, "
        "offers, the activity heatmap and search totals",
        parameters=SCOPE_PARAMETERS,
        responses={200: DashboardInsightsSerializer},
        tags=["dashboard"],
    )
    def get(self, request: Request) -> Response:
        return Response(DashboardInsightsSerializer(services.insights(self.scope(request))).data)


class DashboardExportView(_DashboardView):
    @extend_schema(
        operation_id="dashboard_export",
        summary="Every dashboard figure and table as a CSV, an Excel workbook or a PDF",
        parameters=[
            OpenApiParameter(
                "kind",
                str,
                OpenApiParameter.PATH,
                enum=list(exports.WRITERS),
                description="The file to build: csv, xlsx or pdf",
            ),
            *SCOPE_PARAMETERS,
            OpenApiParameter(
                "job_description",
                OpenApiTypes.UUID,
                description="Narrow the funnel to one role, as on the page",
            ),
        ],
        responses={
            (200, content_type): OpenApiTypes.BINARY for content_type, _ in exports.WRITERS.values()
        },
        tags=["dashboard"],
    )
    def get(self, request: Request, kind: str) -> HttpResponse:
        scope = self.scope(request)
        content_type, write = exports.WRITERS[kind]
        report = exports.report(scope, request.query_params.get("job_description") or None)
        response = HttpResponse(write(report), content_type=content_type)
        response["Content-Disposition"] = f'attachment; filename="{exports.filename(scope, kind)}"'
        return response


class DetailParamsSerializer(serializers.Serializer):
    """Which figure to open, plus the narrowing some figures take."""

    metric = serializers.ChoiceField(choices=list(services.DETAIL_BUILDERS))
    statuses = serializers.CharField(required=False, allow_blank=True)
    job_description = serializers.UUIDField(required=False)
    key = serializers.CharField(required=False, allow_blank=True)

    def validate(self, attrs: dict) -> dict:
        metric = attrs["metric"]
        if metric == "role" and not attrs.get("job_description"):
            raise serializers.ValidationError("The role metric needs job_description.")
        if metric in services.KEYED_METRICS and not attrs.get("key"):
            raise serializers.ValidationError(f"The {metric} metric needs key.")
        return attrs


class DashboardDetailsView(_DashboardView):
    @extend_schema(
        operation_id="dashboard_details",
        summary="The rows behind one dashboard figure",
        parameters=[
            *SCOPE_PARAMETERS,
            OpenApiParameter(
                "metric",
                str,
                required=True,
                enum=list(services.DETAIL_BUILDERS),
                description="The figure to open",
            ),
            OpenApiParameter(
                "statuses", str, description="Comma-separated application statuses (stage)"
            ),
            OpenApiParameter(
                "job_description", OpenApiTypes.UUID, description="One role (role, stage)"
            ),
            OpenApiParameter(
                "key",
                str,
                description="The source, skill, band, department, channel or offer status",
            ),
        ],
        responses={200: DashboardDetailsSerializer},
        tags=["dashboard"],
    )
    def get(self, request: Request) -> Response:
        params = DetailParamsSerializer(data=request.query_params)
        params.is_valid(raise_exception=True)
        data = params.validated_data
        query = services.DetailQuery(
            metric=data["metric"],
            statuses=tuple(s for s in data.get("statuses", "").split(",") if s),
            job_description=str(data["job_description"]) if data.get("job_description") else None,
            key=data.get("key") or None,
        )
        return Response(
            DashboardDetailsSerializer(services.details(self.scope(request), query)).data
        )
