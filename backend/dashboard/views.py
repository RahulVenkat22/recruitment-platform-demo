from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from activity.serializers import ActivitySerializer
from dashboard import services
from dashboard.serializers import DashboardSummarySerializer, FunnelSerializer, MetaEnumsSerializer
from dashboard.services import build_enum_catalogue
from pipeline.serializers import ApplicationRowSerializer, InterviewSerializer


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


# ------------------------------------------------------------------ dashboard (plan.md 9.3)


class _DashboardView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes: list = []


class DashboardSummaryView(_DashboardView):
    @extend_schema(
        operation_id="dashboard_summary",
        summary="Eight metric cards with deltas against the previous seven days",
        responses={200: DashboardSummarySerializer},
        tags=["dashboard"],
    )
    def get(self, request: Request) -> Response:
        return Response(DashboardSummarySerializer(services.summary(request.user)).data)


class DashboardFunnelView(_DashboardView):
    @extend_schema(
        operation_id="dashboard_funnel",
        summary="Recruitment funnel, optionally for one job description",
        parameters=[OpenApiParameter("job_description", str)],
        responses={200: FunnelSerializer},
        tags=["dashboard"],
    )
    def get(self, request: Request) -> Response:
        jd = request.query_params.get("job_description") or None
        return Response(FunnelSerializer(services.funnel(request.user, jd)).data)


class DashboardRecentActivityView(_DashboardView):
    @extend_schema(
        operation_id="dashboard_recent_activity",
        summary="Last 15 activities across visible job descriptions",
        responses={200: ActivitySerializer(many=True)},
        tags=["dashboard"],
    )
    def get(self, request: Request) -> Response:
        rows = services.recent_activity(request.user)
        return Response(ActivitySerializer(rows, many=True, context={"request": request}).data)


class DashboardTopCandidatesView(_DashboardView):
    @extend_schema(
        operation_id="dashboard_top_candidates",
        summary="Top 8 applications by match across open job descriptions",
        responses={200: ApplicationRowSerializer(many=True)},
        tags=["dashboard"],
    )
    def get(self, request: Request) -> Response:
        rows = services.top_candidates(request.user)
        return Response(
            ApplicationRowSerializer(rows, many=True, context={"request": request}).data
        )


class DashboardUpcomingInterviewsView(_DashboardView):
    @extend_schema(
        operation_id="dashboard_upcoming_interviews",
        summary="The next five interviews",
        responses={200: InterviewSerializer(many=True)},
        tags=["dashboard"],
    )
    def get(self, request: Request) -> Response:
        rows = services.upcoming_interviews(request.user)
        return Response(InterviewSerializer(rows, many=True, context={"request": request}).data)
