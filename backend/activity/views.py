"""``GET /api/v1/activities/``: the timeline feed behind the JD, application and
candidate timelines (plan.md 6.10 Activities, 9.6 Timeline tab).

The response is one keyset page (newest first, ``limit`` up to 200) plus the
per-category counts over everything that matches the scope filters, so the
filter chips can show "Interview 6" while the client filters the loaded page in
memory. A user only ever sees activities of job descriptions visible to them.
"""

from __future__ import annotations

from django.db.models import Count, QuerySet
from django_filters.rest_framework import DjangoFilterBackend
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.generics import GenericAPIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response

from activity.filters import ActivityFilter
from activity.models import Activity
from activity.serializers import ActivityPageSerializer, ActivitySerializer
from common.enums import ActivityCategory
from common.pagination import CursorActivityPagination
from common.permissions import visible_job_descriptions_for

KNOWN_CATEGORIES = frozenset(ActivityCategory.values)


def _csv(value: str) -> list[str]:
    return [item.strip() for item in (value or "").split(",") if item.strip()]


class ActivityListView(GenericAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = ActivitySerializer
    filter_backends = [DjangoFilterBackend]
    filterset_class = ActivityFilter
    pagination_class = None
    cursor = CursorActivityPagination()

    def get_queryset(self) -> QuerySet[Activity]:
        visible = visible_job_descriptions_for(self.request.user).values("pk")
        return Activity.objects.filter(job_description_id__in=visible).select_related(
            "actor", "candidate"
        )

    @extend_schema(
        operation_id="activities_list",
        summary="Timeline events, newest first, with per-category counts",
        description=(
            "Scope with `job_description`, `application` or `candidate`. `category` is a comma "
            "list; `counts` and `total` ignore it so filter chips keep their numbers. Page with "
            "`before` (ISO date-time) plus `before_id` from the previous response; `limit` is "
            "200 at most."
        ),
        parameters=[
            OpenApiParameter("job_description", str),
            OpenApiParameter("application", str),
            OpenApiParameter("candidate", str),
            OpenApiParameter("actor", str, description="User id"),
            OpenApiParameter("category", str, description="Comma list of activity categories"),
            OpenApiParameter("event_type", str, description="Comma list of event types"),
            OpenApiParameter("search", str, description="Title, description, actor or candidate"),
            OpenApiParameter("since", str, description="ISO date-time lower bound"),
            OpenApiParameter("before", str, description="ISO date-time cursor (exclusive)"),
            OpenApiParameter("before_id", str, description="Tie-break id from the last page"),
            OpenApiParameter("limit", int, description="Default 200, max 200"),
        ],
        responses={200: ActivityPageSerializer},
        tags=["activities"],
    )
    def get(self, request: Request) -> Response:
        scoped = self.filter_queryset(self.get_queryset())
        counts = {key: 0 for key in ActivityCategory.values}
        for row in scoped.order_by().values("category").annotate(n=Count("id")):
            counts[row["category"]] = int(row["n"])
        total = sum(counts.values())

        wanted = [
            key for key in _csv(request.query_params.get("category", "")) if key in KNOWN_CATEGORIES
        ]
        if request.query_params.get("category", "").strip() and not wanted:
            page_queryset = scoped.none()
        elif wanted:
            page_queryset = scoped.filter(category__in=wanted)
        else:
            page_queryset = scoped

        page = self.cursor.paginate(page_queryset, request)
        payload = {
            "results": page.results,
            "next_before": page.next_before,
            "next_before_id": page.next_before_id,
            "has_more": page.has_more,
            "total": total,
            "counts": counts,
        }
        serializer = ActivityPageSerializer(payload, context=self.get_serializer_context())
        return Response(serializer.data)
