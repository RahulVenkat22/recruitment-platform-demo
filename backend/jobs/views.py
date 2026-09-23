"""Job description endpoints (plan.md 6.10 "Job descriptions" rows).

Thin views: validate with ``jobs.serializers``, authorise with the
``common.permissions`` predicates, call ``JobService``. A JD the caller may
not see is a 404 (the queryset is already scoped), one they can see but may
not change is a 403.
"""

from __future__ import annotations

from typing import Any

from django.db.models import Count, Q, QuerySet
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import (
    OpenApiParameter,
    OpenApiResponse,
    extend_schema,
    extend_schema_view,
)
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from activity.serializers import ActivitySerializer
from common.enums import EmploymentType, JDStatus, WorkMode
from common.permissions import (
    JobDescriptionAccess,
    can_comment_job,
    can_force_close_job,
    can_manage_participants,
)
from jobs.engines import extract_job_description
from jobs.filters import JobDescriptionFilter
from jobs.models import JobDescription, JobDescriptionVersion, RecruitmentParticipant
from jobs.serializers import (
    ForceCloseSerializer,
    JobCommentSerializer,
    JobDescriptionCreateSerializer,
    JobDescriptionDetailSerializer,
    JobDescriptionRowSerializer,
    JobDescriptionUpdateSerializer,
    JobExtractionSerializer,
    JobExtractRequestSerializer,
    JobFacetsSerializer,
    MetricsSerializer,
    ParticipantInputSerializer,
    ParticipantRoleSerializer,
    ParticipantSerializer,
    SkillSuggestionSerializer,
    StatusChangeSerializer,
    VersionDetailSerializer,
    VersionRowSerializer,
)
from jobs.services import SKILL_SUGGESTION_LIMIT, JobService, search_skills
from pipeline.serializers import KanbanBoardSerializer
from pipeline.services import KanbanService

ERROR_ENVELOPE = OpenApiResponse(
    description="plan.md 6.10 error envelope {error: {code, message, details}}"
)
TRUE_VALUES = frozenset({"true", "1", "yes"})
FACET_LIMIT = 50
SKILL_LIMIT_MAX = 50


def _flag(request: Request, name: str) -> bool:
    return str(request.query_params.get(name, "")).strip().lower() in TRUE_VALUES


def _require(predicate: bool, message: str) -> None:
    if not predicate:
        raise PermissionDenied(message)


@extend_schema_view(
    list=extend_schema(
        operation_id="jobs_list",
        summary="Job descriptions the caller can see",
        description=(
            "Each row carries the creator, the first four participants, the participant count "
            "and the pipeline counts (candidates, shortlisted, interviewed, selected, onboarded). "
            "`status`, `department`, `location`, `employment_type` and `work_mode` accept comma "
            "lists; `mine` limits to JDs the caller created or is listed on; `created_by` "
            "(comma list of user ids) keeps the JDs raised by those users; `search` "
            "matches title, department, location, domain or a skill. Rows carry the "
            "interviewer-role participants, the time of the latest timeline event and the "
            "completion percentage for the homepage table."
        ),
        parameters=[
            OpenApiParameter("search", str),
            OpenApiParameter(
                "status", str, description="Comma list of draft|open|on_hold|closed|archived"
            ),
            OpenApiParameter("department", str, description="Comma list, case-insensitive"),
            OpenApiParameter("location", str, description="Comma list, case-insensitive"),
            OpenApiParameter("employment_type", str, description="Comma list"),
            OpenApiParameter("work_mode", str, description="Comma list"),
            OpenApiParameter("created_by", str, description="Comma list of user ids"),
            OpenApiParameter("mine", bool),
            OpenApiParameter("skill", str, description="One skill (normalised)"),
            OpenApiParameter(
                "ordering",
                str,
                description=(
                    "-updated_at (default), updated_at, created_at, title, status, department, "
                    "location, employment_type, created_by__first_name, count_candidates, "
                    "last_activity_at"
                ),
            ),
        ],
        tags=["jobs"],
    ),
    retrieve=extend_schema(
        operation_id="jobs_retrieve",
        summary="One job description with participants, metrics and the caller's permissions",
        responses={200: JobDescriptionDetailSerializer, 404: ERROR_ENVELOPE},
        tags=["jobs"],
    ),
    create=extend_schema(
        operation_id="jobs_create",
        summary="Create a job description (creator becomes owner, version 1 is written)",
        request=JobDescriptionCreateSerializer,
        responses={201: JobDescriptionDetailSerializer, 400: ERROR_ENVELOPE, 403: ERROR_ENVELOPE},
        tags=["jobs"],
    ),
    partial_update=extend_schema(
        operation_id="jobs_partial_update",
        summary="Edit content (writes a version when something changed) and sync participants",
        request=JobDescriptionUpdateSerializer,
        responses={200: JobDescriptionDetailSerializer, 400: ERROR_ENVELOPE, 403: ERROR_ENVELOPE},
        tags=["jobs"],
    ),
    destroy=extend_schema(
        operation_id="jobs_destroy",
        summary="Delete permanently; needs ?confirm=true",
        parameters=[OpenApiParameter("confirm", bool, required=True)],
        responses={
            204: OpenApiResponse(description="Deleted"),
            400: ERROR_ENVELOPE,
            403: ERROR_ENVELOPE,
        },
        tags=["jobs"],
    ),
)
class JobDescriptionViewSet(viewsets.ModelViewSet):
    """``/api/v1/job-descriptions/`` and its sub-resources."""

    permission_classes = [IsAuthenticated, JobDescriptionAccess]
    filterset_class = JobDescriptionFilter
    ordering_fields = [
        "updated_at",
        "created_at",
        "title",
        "status",
        "department",
        "location",
        "employment_type",
        "created_by__first_name",
        "count_candidates",
        "last_activity_at",
    ]
    ordering = ["-updated_at", "-created_at"]
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]
    lookup_value_regex = "[0-9a-fA-F-]{36}"

    # ------------------------------------------------------------- plumbing

    def get_queryset(self) -> QuerySet[JobDescription]:
        return JobService.list_queryset(self.request.user)

    def get_serializer_class(self):
        if self.action == "list":
            return JobDescriptionRowSerializer
        if self.action == "create":
            return JobDescriptionCreateSerializer
        if self.action == "partial_update":
            return JobDescriptionUpdateSerializer
        return JobDescriptionDetailSerializer

    def _detail(self, jd: JobDescription, code: int = status.HTTP_200_OK) -> Response:
        """Serialise a fresh copy so annotations and prefetches are current."""
        fresh = JobService.list_queryset(self.request.user).get(pk=jd.pk)
        return Response(
            JobDescriptionDetailSerializer(fresh, context=self.get_serializer_context()).data,
            status=code,
        )

    # ------------------------------------------------------------------ CRUD

    def create(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        serializer = JobDescriptionCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        participants = data.pop("participants", [])
        jd = JobService.create(data, participants, request.user)
        return self._detail(jd, status.HTTP_201_CREATED)

    def partial_update(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        jd = self.get_object()
        serializer = JobDescriptionUpdateSerializer(jd, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        change_summary = data.pop("change_summary", "")
        JobService.update(jd, data, request.user, change_summary=change_summary)
        return self._detail(jd)

    def destroy(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        jd = self.get_object()
        JobService.delete(jd, request.user, confirm=_flag(request, "confirm"))
        return Response(status=status.HTTP_204_NO_CONTENT)

    # --------------------------------------------------------------- actions

    @extend_schema(
        operation_id="jobs_duplicate",
        summary='Copy as a new draft "Copy of {title}" with the same participants',
        request=None,
        responses={201: JobDescriptionDetailSerializer, 403: ERROR_ENVELOPE},
        tags=["jobs"],
    )
    @action(detail=True, methods=["post"])
    def duplicate(self, request: Request, pk: str | None = None) -> Response:
        jd = self.get_object()
        copy = JobService.duplicate(jd, request.user)
        return self._detail(copy, status.HTTP_201_CREATED)

    @extend_schema(
        operation_id="jobs_publish",
        summary="draft -> open",
        request=None,
        responses={200: JobDescriptionDetailSerializer, 403: ERROR_ENVELOPE, 409: ERROR_ENVELOPE},
        tags=["jobs"],
    )
    @action(detail=True, methods=["post"])
    def publish(self, request: Request, pk: str | None = None) -> Response:
        jd = self.get_object()
        return self._detail(JobService.publish(jd, request.user))

    @extend_schema(
        operation_id="jobs_archive",
        summary="Archive from any status",
        request=None,
        responses={200: JobDescriptionDetailSerializer, 403: ERROR_ENVELOPE, 409: ERROR_ENVELOPE},
        tags=["jobs"],
    )
    @action(detail=True, methods=["post"])
    def archive(self, request: Request, pk: str | None = None) -> Response:
        jd = self.get_object()
        return self._detail(JobService.archive(jd, request.user))

    @extend_schema(
        operation_id="jobs_unarchive",
        summary="Restore an archived JD to open (or draft when never published)",
        request=None,
        responses={200: JobDescriptionDetailSerializer, 403: ERROR_ENVELOPE, 409: ERROR_ENVELOPE},
        tags=["jobs"],
    )
    @action(detail=True, methods=["post"])
    def unarchive(self, request: Request, pk: str | None = None) -> Response:
        jd = self.get_object()
        return self._detail(JobService.unarchive(jd, request.user))

    @extend_schema(
        operation_id="jobs_set_status",
        summary="Move between open, on hold and closed (open on a draft publishes)",
        request=StatusChangeSerializer,
        responses={
            200: JobDescriptionDetailSerializer,
            400: ERROR_ENVELOPE,
            403: ERROR_ENVELOPE,
            409: ERROR_ENVELOPE,
        },
        tags=["jobs"],
    )
    @action(detail=True, methods=["post"], url_path="status")
    def set_status(self, request: Request, pk: str | None = None) -> Response:
        jd = self.get_object()
        serializer = StatusChangeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        updated = JobService.set_status(
            jd,
            serializer.validated_data["status"],
            request.user,
            note=serializer.validated_data.get("note", ""),
        )
        return self._detail(updated)

    @extend_schema(
        operation_id="jobs_force_close",
        summary="Close a draft, open or on-hold JD early; the reason goes on the timeline",
        request=ForceCloseSerializer,
        responses={
            200: JobDescriptionDetailSerializer,
            400: ERROR_ENVELOPE,
            403: ERROR_ENVELOPE,
            409: ERROR_ENVELOPE,
        },
        tags=["jobs"],
    )
    @action(detail=True, methods=["post"], url_path="force-close")
    def force_close(self, request: Request, pk: str | None = None) -> Response:
        jd = self.get_object()
        _require(
            can_force_close_job(request.user, jd), "You cannot force close this job description."
        )
        serializer = ForceCloseSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        updated = JobService.force_close(
            jd, request.user, reason=serializer.validated_data["reason"]
        )
        return self._detail(updated)

    @extend_schema(
        operation_id="jobs_comment_add",
        summary="Add a comment to the job description timeline",
        request=JobCommentSerializer,
        responses={201: ActivitySerializer, 400: ERROR_ENVELOPE, 403: ERROR_ENVELOPE},
        tags=["jobs"],
    )
    @action(detail=True, methods=["post"], url_path="comments")
    def comments(self, request: Request, pk: str | None = None) -> Response:
        # Commenting needs visibility plus HR membership, not edit rights, so the
        # POST branch of JobDescriptionAccess (edit) is bypassed on purpose.
        jd = get_object_or_404(self.get_queryset(), pk=pk)
        _require(can_comment_job(request.user, jd), "You cannot comment on this job description.")
        serializer = JobCommentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        activity = JobService.add_comment(jd, serializer.validated_data["text"], request.user)
        return Response(
            ActivitySerializer(activity, context=self.get_serializer_context()).data,
            status=status.HTTP_201_CREATED,
        )

    @extend_schema(
        operation_id="jobs_metrics",
        summary=(
            "The metric row: total found, shortlisted, contacted, in interview, selected, "
            "rejected, offers pending, onboarded"
        ),
        responses={200: MetricsSerializer},
        tags=["jobs"],
    )
    @action(detail=True, methods=["get"])
    def metrics(self, request: Request, pk: str | None = None) -> Response:
        jd = self.get_object()
        return Response(MetricsSerializer(JobService.metrics(jd)).data)

    # -------------------------------------------------------------- versions

    @extend_schema(
        operation_id="jobs_kanban",
        summary="The Kanban board: eight columns plus the rejected / on-hold tray",
        parameters=[
            OpenApiParameter("search", str),
            OpenApiParameter("source", str, description="comma list"),
            OpenApiParameter("min_match", float),
            OpenApiParameter("owner", str),
        ],
        responses={200: KanbanBoardSerializer, 403: ERROR_ENVELOPE},
        tags=["jobs"],
    )
    @action(detail=True, methods=["get"])
    def kanban(self, request: Request, pk: str | None = None) -> Response:
        # The board's own filters (search, source, ...) must not narrow the JD lookup.
        jd = get_object_or_404(self.get_queryset(), pk=pk)
        self.check_object_permissions(request, jd)
        board = KanbanService.board(jd, request.user, dict(request.query_params.items()))
        return Response(KanbanBoardSerializer(board, context=self.get_serializer_context()).data)

    @extend_schema(
        operation_id="jobs_versions_list",
        summary="Version history, newest first",
        responses={200: VersionRowSerializer(many=True)},
        tags=["jobs"],
    )
    @action(detail=True, methods=["get"], pagination_class=None)
    def versions(self, request: Request, pk: str | None = None) -> Response:
        jd = self.get_object()
        rows = jd.versions.select_related("created_by").order_by("-version")
        serializer = VersionRowSerializer(
            rows,
            many=True,
            context={**self.get_serializer_context(), "current_version": jd.current_version},
        )
        return Response(serializer.data)

    @extend_schema(
        operation_id="jobs_versions_retrieve",
        summary="One version with its content snapshot",
        responses={200: VersionDetailSerializer, 404: ERROR_ENVELOPE},
        tags=["jobs"],
    )
    @action(
        detail=True, methods=["get"], url_path=r"versions/(?P<number>\d+)", pagination_class=None
    )
    def version_detail(self, request: Request, pk: str | None = None, number: str = "") -> Response:
        jd = self.get_object()
        row = (
            JobDescriptionVersion.objects.select_related("created_by")
            .filter(job_description=jd, version=int(number))
            .first()
        )
        if row is None:
            return Response(
                {"error": {"code": "not_found", "message": "No such version.", "details": {}}},
                status=status.HTTP_404_NOT_FOUND,
            )
        context = {**self.get_serializer_context(), "current_version": jd.current_version}
        return Response(VersionDetailSerializer(row, context=context).data)

    # ---------------------------------------------------------- participants

    def _participants_queryset(self, jd: JobDescription) -> QuerySet[RecruitmentParticipant]:
        """Participants with the per-person "N interviews • N activities" numbers (plan.md 9.6)."""
        return (
            jd.participants.select_related("user", "added_by")
            .annotate(
                interview_count=Count(
                    "user__interviews",
                    filter=Q(user__interviews__application__job_description=jd),
                    distinct=True,
                ),
                activity_count=Count(
                    "user__activities",
                    filter=Q(user__activities__job_description=jd),
                    distinct=True,
                ),
            )
            .order_by("created_at")
        )

    @extend_schema(
        methods=["GET"],
        operation_id="jobs_participants_list",
        summary="People involved in the recruitment",
        responses={200: ParticipantSerializer(many=True)},
        tags=["jobs"],
    )
    @extend_schema(
        methods=["POST"],
        operation_id="jobs_participants_add",
        summary="Add one person or a list of people",
        request=ParticipantInputSerializer(many=True),
        responses={
            201: ParticipantSerializer(many=True),
            400: ERROR_ENVELOPE,
            403: ERROR_ENVELOPE,
            409: ERROR_ENVELOPE,
        },
        tags=["jobs"],
    )
    @action(detail=True, methods=["get", "post"], pagination_class=None)
    def participants(self, request: Request, pk: str | None = None) -> Response:
        jd = self.get_object()
        if request.method == "GET":
            rows = self._participants_queryset(jd)
            return Response(
                ParticipantSerializer(rows, many=True, context=self.get_serializer_context()).data
            )
        _require(
            can_manage_participants(request.user, jd),
            "You cannot change who is involved in this recruitment.",
        )
        payload = request.data if isinstance(request.data, list) else [request.data]
        serializer = ParticipantInputSerializer(data=payload, many=True)
        serializer.is_valid(raise_exception=True)
        added = JobService.add_participants(jd, serializer.validated_data, request.user)
        added_ids = [row.pk for row in added]
        rows = self._participants_queryset(jd).filter(pk__in=added_ids)
        return Response(
            ParticipantSerializer(rows, many=True, context=self.get_serializer_context()).data,
            status=status.HTTP_201_CREATED,
        )

    @extend_schema(
        methods=["PATCH"],
        operation_id="jobs_participant_update",
        summary="Change someone's role in the recruitment",
        request=ParticipantRoleSerializer,
        responses={200: ParticipantSerializer, 400: ERROR_ENVELOPE, 403: ERROR_ENVELOPE},
        tags=["jobs"],
    )
    @extend_schema(
        methods=["DELETE"],
        operation_id="jobs_participant_remove",
        summary="Remove someone from the recruitment (the creator cannot be removed)",
        responses={
            204: OpenApiResponse(description="Removed"),
            400: ERROR_ENVELOPE,
            403: ERROR_ENVELOPE,
        },
        tags=["jobs"],
    )
    @action(
        detail=True,
        methods=["patch", "delete"],
        url_path=r"participants/(?P<participant_id>[0-9a-fA-F-]{36})",
    )
    def participant(
        self, request: Request, pk: str | None = None, participant_id: str = ""
    ) -> Response:
        jd = self.get_object()
        _require(
            can_manage_participants(request.user, jd),
            "You cannot change who is involved in this recruitment.",
        )
        participant = (
            jd.participants.select_related("user", "added_by", "job_description")
            .filter(pk=participant_id)
            .first()
        )
        if participant is None:
            return Response(
                {"error": {"code": "not_found", "message": "No such participant.", "details": {}}},
                status=status.HTTP_404_NOT_FOUND,
            )
        if request.method == "DELETE":
            JobService.remove_participant(participant, request.user)
            return Response(status=status.HTTP_204_NO_CONTENT)
        serializer = ParticipantRoleSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        JobService.update_participant(
            participant, serializer.validated_data["role_in_recruitment"], request.user
        )
        row = self._participants_queryset(jd).get(pk=participant.pk)
        return Response(ParticipantSerializer(row, context=self.get_serializer_context()).data)

    # ---------------------------------------------------------------- facets

    @extend_schema(
        operation_id="jobs_facets",
        summary="Filter options with counts over the JDs the caller can see",
        responses={200: JobFacetsSerializer},
        tags=["jobs"],
    )
    @action(detail=False, methods=["get"])
    def facets(self, request: Request) -> Response:
        visible = JobService.list_queryset(request.user)

        def grouped(field: str, labels: dict[str, str] | None = None) -> list[dict[str, Any]]:
            rows = (
                visible.order_by()
                .values(field)
                .annotate(count=Count("id", distinct=True))
                .order_by("-count", field)[:FACET_LIMIT]
            )
            result = []
            for row in rows:
                key = row[field]
                if key in (None, ""):
                    continue
                label = labels.get(str(key), str(key)) if labels else str(key)
                result.append({"key": str(key), "label": label, "count": int(row["count"])})
            return result

        creators = (
            visible.order_by()
            .values("created_by_id", "created_by__first_name", "created_by__last_name")
            .annotate(count=Count("id", distinct=True))
            .order_by("-count", "created_by__first_name", "created_by__last_name")[:FACET_LIMIT]
        )
        full_name = "{created_by__first_name} {created_by__last_name}"
        payload = {
            "statuses": grouped("status", dict(JDStatus.choices)),
            "departments": grouped("department"),
            "locations": grouped("location"),
            "employment_types": grouped("employment_type", dict(EmploymentType.choices)),
            "work_modes": grouped("work_mode", dict(WorkMode.choices)),
            "creators": [
                {
                    "key": str(row["created_by_id"]),
                    "label": full_name.format(**row).strip(),
                    "count": int(row["count"]),
                }
                for row in creators
            ],
        }
        return Response(JobFacetsSerializer(payload).data)

    @extend_schema(
        operation_id="jobs_extract",
        summary="Read one job description file (PDF or Word) with the AI; returns the form fields",
        description=(
            "Multipart body with one `file` part. The model reads the document and returns the "
            "create-request fields it found; a file that is not a job description, or holds more "
            "than one, is refused with `invalid_job_file`."
        ),
        request={"multipart/form-data": JobExtractRequestSerializer},
        responses={
            200: JobExtractionSerializer,
            400: ERROR_ENVELOPE,
            403: ERROR_ENVELOPE,
            503: ERROR_ENVELOPE,
        },
        tags=["jobs"],
    )
    @action(detail=False, methods=["post"], parser_classes=[MultiPartParser, FormParser])
    def extract(self, request: Request) -> Response:
        upload = request.FILES.get("file")
        if upload is None:
            raise ValidationError({"file": ["Attach a PDF or Word (.docx) file."]})
        payload = {"file_name": upload.name, "fields": extract_job_description(upload)}
        return Response(JobExtractionSerializer(payload).data)


class SkillSuggestionView(APIView):
    """``GET /api/v1/skills/?q=``: autocomplete rows for the JD form's tag inputs (plan.md 9.5)."""

    permission_classes = [IsAuthenticated]
    throttle_classes: list = []

    @extend_schema(
        operation_id="skills_suggest",
        summary="Skill autocomplete (candidate and JD skills, most common first)",
        parameters=[
            OpenApiParameter(
                "q", str, description="Prefix or synonym; empty returns the most common"
            ),
            OpenApiParameter(
                "limit", int, description=f"Default {SKILL_SUGGESTION_LIMIT}, max {SKILL_LIMIT_MAX}"
            ),
        ],
        responses={200: SkillSuggestionSerializer(many=True)},
        tags=["jobs"],
    )
    def get(self, request: Request) -> Response:
        raw_limit = request.query_params.get("limit", "")
        try:
            limit = (
                min(max(int(raw_limit), 1), SKILL_LIMIT_MAX)
                if raw_limit
                else SKILL_SUGGESTION_LIMIT
            )
        except ValueError:
            limit = SKILL_SUGGESTION_LIMIT
        rows = search_skills(request.query_params.get("q", ""), limit=limit)
        return Response(SkillSuggestionSerializer(rows, many=True).data)
