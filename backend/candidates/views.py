"""``/api/v1/candidates/`` (plan.md 6.10 Candidates rows, 9.9, 9.10).

HR roles see every candidate; interviewers and employees only see people who
are attached to a job description they are involved in, and with masked
contact details (plan.md 6.9).
"""

from __future__ import annotations

from typing import Any

from django.db.models import Max, Prefetch, QuerySet
from drf_spectacular.utils import (
    OpenApiParameter,
    OpenApiResponse,
    extend_schema,
    extend_schema_view,
)
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response

from candidates import services
from candidates.filters import CandidateFilter
from candidates.models import Candidate, CandidateSkill, CandidateSource
from candidates.serializers import (
    CandidateDetailSerializer,
    CandidateRowSerializer,
    CandidateWriteSerializer,
)
from common.permissions import IsHrStaff, is_hr_staff, visible_job_descriptions_for
from pipeline.models import Application
from resumes.models import ResumeDocument
from resumes.serializers import ResumeLinkSerializer
from resumes.services.links import resume_link_for

ERROR_ENVELOPE = OpenApiResponse(description="plan.md 6.10 error envelope")


def candidate_queryset(user: Any) -> QuerySet[Candidate]:
    applications = Application.objects.select_related("job_description", "owner", "match").order_by(
        "-last_activity_at"
    )
    qs = Candidate.objects.prefetch_related(
        Prefetch(
            "skills",
            queryset=CandidateSkill.objects.order_by("-is_primary", "-proficiency", "skill"),
        ),
        Prefetch(
            "sources",
            queryset=CandidateSource.objects.select_related("referred_by").order_by(
                "discovered_at"
            ),
        ),
        Prefetch("applications", queryset=applications),
        Prefetch(
            "resume_documents",
            queryset=ResumeDocument.objects.only(
                "id",
                "candidate_id",
                "file_name",
                "page_count",
                "status",
                "storage_status",
                "storage_key",
                "parse_source",
                "chunk_count",
                "ingested_at",
                "created_at",
            ),
        ),
        "experiences",
        "education",
        "certifications",
    ).annotate(last_activity=Max("applications__last_activity_at"))
    if is_hr_staff(user):
        return qs
    visible = visible_job_descriptions_for(user).values("pk")
    return qs.filter(applications__job_description_id__in=visible).distinct()


@extend_schema_view(
    list=extend_schema(
        operation_id="candidates_list",
        summary="Candidates with their active applications",
        parameters=[
            OpenApiParameter(
                "search", str, description="Name, headline, company, location or a skill"
            ),
            OpenApiParameter("skills", str, description="Comma list of skills (normalised)"),
            OpenApiParameter("source", str, description="Comma list of sources"),
            OpenApiParameter("location", str),
            OpenApiParameter("min_exp", float),
            OpenApiParameter("max_exp", float),
            OpenApiParameter("status", str, description="Comma list of application statuses"),
            OpenApiParameter("job_description", str),
            OpenApiParameter(
                "ordering",
                str,
                description=(
                    "full_name, -total_experience_years, -created_at, -last_activity (default)"
                ),
            ),
        ],
        tags=["candidates"],
    ),
    retrieve=extend_schema(
        operation_id="candidates_retrieve",
        summary=(
            "Full profile with skills, experience, education, certifications, sources and "
            "applications"
        ),
        responses={200: CandidateDetailSerializer, 404: ERROR_ENVELOPE},
        tags=["candidates"],
    ),
    create=extend_schema(
        operation_id="candidates_create",
        summary="Add a candidate by hand (source: internal)",
        request=CandidateWriteSerializer,
        responses={
            201: CandidateDetailSerializer,
            400: ERROR_ENVELOPE,
            403: ERROR_ENVELOPE,
            409: ERROR_ENVELOPE,
        },
        tags=["candidates"],
    ),
    partial_update=extend_schema(
        operation_id="candidates_partial_update",
        summary="Edit a candidate's profile (skills replace the list when given)",
        request=CandidateWriteSerializer,
        responses={
            200: CandidateDetailSerializer,
            400: ERROR_ENVELOPE,
            403: ERROR_ENVELOPE,
            409: ERROR_ENVELOPE,
        },
        tags=["candidates"],
    ),
)
class CandidateViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    filterset_class = CandidateFilter
    ordering_fields = [
        "full_name",
        "total_experience_years",
        "created_at",
        "last_activity",
        "location",
    ]
    ordering = ["-last_activity", "full_name"]
    http_method_names = ["get", "post", "patch", "head", "options"]

    def get_permissions(self):
        if self.action in ("create", "partial_update"):
            return [IsAuthenticated(), IsHrStaff()]
        return [IsAuthenticated()]

    def get_queryset(self) -> QuerySet[Candidate]:
        return candidate_queryset(self.request.user)

    def get_serializer_class(self):
        if self.action == "list":
            return CandidateRowSerializer
        return CandidateDetailSerializer

    def _detail(self, candidate: Candidate, code: int = status.HTTP_200_OK) -> Response:
        fresh = self.get_queryset().get(pk=candidate.pk)
        return Response(
            CandidateDetailSerializer(fresh, context=self.get_serializer_context()).data,
            status=code,
        )

    def create(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        serializer = CandidateWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        candidate = services.create_candidate(dict(serializer.validated_data), request.user)
        return self._detail(candidate, status.HTTP_201_CREATED)

    def partial_update(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        candidate = self.get_object()
        serializer = CandidateWriteSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        services.update_candidate(candidate, dict(serializer.validated_data), request.user)
        return self._detail(candidate)

    @extend_schema(
        operation_id="candidates_resume_link",
        summary="A short-lived link to open the candidate's resume PDF from S3",
        description=(
            "404 when no resume was ingested, 503 while S3 is not configured, 409 when the "
            "file has not been uploaded yet, 502 when S3 cannot sign the link."
        ),
        responses={
            200: ResumeLinkSerializer,
            404: ERROR_ENVELOPE,
            409: ERROR_ENVELOPE,
            502: ERROR_ENVELOPE,
            503: ERROR_ENVELOPE,
        },
        tags=["candidates"],
    )
    @action(detail=True, methods=["get"], url_path="resume-link")
    def resume_link(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        candidate = self.get_object()
        link = resume_link_for(candidate)
        return Response(ResumeLinkSerializer(link).data)
