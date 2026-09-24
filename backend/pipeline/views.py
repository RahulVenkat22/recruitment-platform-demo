"""Searches, sources and applications (plan.md 6.10 Searches and Applications rows)."""

from __future__ import annotations

from dataclasses import asdict
from typing import Any

from django.db.models import Q, QuerySet
from drf_spectacular.utils import (
    OpenApiParameter,
    OpenApiResponse,
    extend_schema,
    extend_schema_view,
)
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import SAFE_METHODS, AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from common.enums import ApplicationStatus, CommunicationChannel
from common.permissions import (
    IsHrStaff,
    can_log_contact,
    can_manage_job,
    can_run_search,
    can_schedule_interview,
    can_submit_feedback,
    can_transition_application,
    can_work_pipeline,
    visible_job_descriptions_for,
)
from pipeline.filters import (
    ApplicationFilter,
    CommunicationFilter,
    InterviewFilter,
    OfferFilter,
    OnboardingFilter,
    PhoneCallFilter,
    SearchRunFilter,
)
from pipeline.models import (
    Application,
    Communication,
    Interview,
    MessageTemplate,
    Offer,
    Onboarding,
    PhoneCall,
    SearchRun,
)
from pipeline.serializers import (
    ApplicationDetailSerializer,
    ApplicationRowSerializer,
    ApplicationUpdateSerializer,
    BulkEmailResultSerializer,
    BulkEmailSerializer,
    BulkPhoneCallResultSerializer,
    BulkPhoneCallSerializer,
    BulkTransitionResponseSerializer,
    BulkTransitionSerializer,
    CallReplySerializer,
    CandidateMatchSerializer,
    CommunicationCreateSerializer,
    CommunicationSerializer,
    EmailConfigSerializer,
    EmailDraftBriefSerializer,
    EmailDraftSerializer,
    EmailPreviewRequestSerializer,
    EmailPreviewSerializer,
    EmailSendSerializer,
    FeedbackSerializer,
    InterviewCancelSerializer,
    InterviewCreateSerializer,
    InterviewRescheduleSerializer,
    InterviewSerializer,
    InterviewUpdateSerializer,
    ManualApplicationSerializer,
    MessageTemplateSerializer,
    MoveSerializer,
    OfferCreateSerializer,
    OfferReasonSerializer,
    OfferSerializer,
    OfferUpdateSerializer,
    OnboardingCreateSerializer,
    OnboardingSerializer,
    OnboardingUpdateSerializer,
    PhoneCallCreateSerializer,
    PhoneCallSerializer,
    ProviderHealthSerializer,
    SearchRequestSerializer,
    SearchResponseSerializer,
    SearchRunSerializer,
    TransitionResponseSerializer,
    TransitionSerializer,
    VoiceConfigSerializer,
)
from pipeline.services import (
    PLACEHOLDERS,
    CallService,
    CommunicationService,
    InterviewService,
    OfferService,
    OnboardingService,
    OutreachService,
    PipelineService,
    allowed_moves,
    draft_email,
    email_config,
    recipient_for,
    render_text,
    set_default_template,
)
from pipeline.services.queries import application_queryset
from pipeline.services.voice import VapiProvider, voice_config
from sourcing.registry import available_providers
from sourcing.services import TERMINAL_STATUSES, SearchService

ERROR_ENVELOPE = OpenApiResponse(description="plan.md 6.10 error envelope")


class SourcesView(APIView):
    """``GET /api/v1/sources/``: provider health and pool sizes for the source cards."""

    permission_classes = [IsAuthenticated]
    throttle_classes: list = []

    @extend_schema(
        operation_id="sources_list",
        summary="Candidate sources with availability and profile counts",
        responses={200: ProviderHealthSerializer(many=True)},
        tags=["searches"],
    )
    def get(self, request: Request) -> Response:
        rows = [provider.health() for provider in available_providers()]
        return Response(ProviderHealthSerializer(rows, many=True).data)


@extend_schema_view(
    list=extend_schema(
        operation_id="searches_list",
        summary="Search history (newest first); filter with job_description",
        parameters=[OpenApiParameter("job_description", str)],
        tags=["searches"],
    ),
    retrieve=extend_schema(
        operation_id="searches_retrieve", summary="One search run", tags=["searches"]
    ),
    create=extend_schema(
        operation_id="searches_create",
        summary="Run a candidate search for a job description",
        description=(
            "With SEARCH_RUN_ASYNC (the default) the run executes in the background: the "
            "response is 202 with the run in status pending/running and an empty results "
            "list; poll GET /searches/{id}/ (phase, progress) until status is completed, "
            "partial or failed, then list applications with search_run={id}. Otherwise the "
            "run executes inline and the response is 201 with the ranked results."
        ),
        request=SearchRequestSerializer,
        responses={
            201: SearchResponseSerializer,
            202: SearchResponseSerializer,
            400: ERROR_ENVELOPE,
            403: ERROR_ENVELOPE,
            409: ERROR_ENVELOPE,
        },
        tags=["searches"],
    ),
)
class SearchRunViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    permission_classes = [IsAuthenticated]
    serializer_class = SearchRunSerializer
    filterset_class = SearchRunFilter
    ordering = ["-started_at"]

    def get_queryset(self) -> QuerySet[SearchRun]:
        visible = visible_job_descriptions_for(self.request.user).values("pk")
        return SearchRun.objects.filter(job_description_id__in=visible).select_related(
            "requested_by"
        )

    def create(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        serializer = SearchRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        jd = serializer.validated_data["job_description"]
        if not can_run_search(request.user, jd):
            raise PermissionDenied("You cannot search candidates for this job description.")
        outcome = SearchService.start(jd, serializer.validated_data["sources"], request.user)
        ids = [application.pk for application in outcome.applications]
        rows = list(
            application_queryset(request.user).filter(pk__in=ids).order_by("-match__overall_pct")
        )
        payload = {"run": outcome.run, "results": rows, "errors": outcome.errors}
        in_flight = str(outcome.run.status) not in TERMINAL_STATUSES
        return Response(
            SearchResponseSerializer(payload, context=self.get_serializer_context()).data,
            status=status.HTTP_202_ACCEPTED if in_flight else status.HTTP_201_CREATED,
        )

    @extend_schema(
        operation_id="searches_destroy",
        summary="Cancel a running search and remove it",
        description=(
            "Stops the background run at its next step and deletes the run together with "
            "the untouched applications it created. Only a run that is still pending or "
            "running can be cancelled."
        ),
        responses={204: None, 403: ERROR_ENVELOPE, 404: ERROR_ENVELOPE, 409: ERROR_ENVELOPE},
        tags=["searches"],
    )
    def destroy(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        run = self.get_object()
        if not can_run_search(request.user, run.job_description):
            raise PermissionDenied("You cannot cancel searches for this job description.")
        SearchService.cancel(run)
        return Response(status=status.HTTP_204_NO_CONTENT)


@extend_schema_view(
    list=extend_schema(
        operation_id="applications_list",
        summary="Ranked applications",
        description=(
            "Filter with job_description, candidate, owner, search_run, status (comma list), "
            "status_group (new|shortlisted|in_progress|interview|selected|closed or a Kanban "
            "column key), metric (a JD metric-row card: shortlisted|contacted|in_interview|"
            "selected|rejected|onboarded), source (comma list), min_match, is_starred and "
            "search. Default order is match descending."
        ),
        parameters=[
            OpenApiParameter("job_description", str),
            OpenApiParameter("candidate", str),
            OpenApiParameter("owner", str),
            OpenApiParameter("status", str),
            OpenApiParameter("status_group", str),
            OpenApiParameter("metric", str),
            OpenApiParameter("source", str),
            OpenApiParameter("min_match", float),
            OpenApiParameter("is_starred", bool),
            OpenApiParameter("search", str),
            OpenApiParameter(
                "ordering",
                str,
                description=(
                    "-match__overall_pct (default), last_activity_at, created_at, "
                    "candidate__full_name, candidate__total_experience_years, "
                    "job_description__title, status"
                ),
            ),
        ],
        tags=["applications"],
    ),
    retrieve=extend_schema(
        operation_id="applications_retrieve",
        summary="One application with its match",
        responses={200: ApplicationDetailSerializer},
        tags=["applications"],
    ),
    partial_update=extend_schema(
        operation_id="applications_partial_update",
        summary="Change the owner, star or notes",
        request=ApplicationUpdateSerializer,
        responses={200: ApplicationDetailSerializer, 400: ERROR_ENVELOPE, 403: ERROR_ENVELOPE},
        tags=["applications"],
    ),
)
class ApplicationViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    permission_classes = [IsAuthenticated]
    serializer_class = ApplicationRowSerializer
    filterset_class = ApplicationFilter
    ordering_fields = [
        "match__overall_pct",
        "last_activity_at",
        "created_at",
        "stage_entered_at",
        "candidate__full_name",
        "candidate__total_experience_years",
        "job_description__title",
        "status",
    ]
    ordering = ["-match__overall_pct", "-created_at"]
    http_method_names = ["get", "post", "patch", "head", "options"]

    def get_queryset(self) -> QuerySet[Application]:
        return application_queryset(self.request.user)

    def get_serializer_class(self):
        if self.action == "list":
            return ApplicationRowSerializer
        return ApplicationDetailSerializer

    def _detail(self, application: Application, code: int = status.HTTP_200_OK) -> Response:
        fresh = self.get_queryset().get(pk=application.pk)
        return Response(
            ApplicationDetailSerializer(fresh, context=self.get_serializer_context()).data,
            status=code,
        )

    @extend_schema(
        operation_id="applications_create",
        summary="Attach a known candidate to a job description by hand",
        request=ManualApplicationSerializer,
        responses={
            201: ApplicationDetailSerializer,
            400: ERROR_ENVELOPE,
            403: ERROR_ENVELOPE,
            409: ERROR_ENVELOPE,
        },
        tags=["applications"],
    )
    def create(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        serializer = ManualApplicationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        jd = serializer.validated_data["job_description"]
        if not can_work_pipeline(request.user, jd):
            raise PermissionDenied("You cannot add candidates to this job description.")
        application = PipelineService.add_manually(
            serializer.validated_data["candidate"], jd, request.user
        )
        return self._detail(application, status.HTTP_201_CREATED)

    def partial_update(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        application = self.get_object()
        if not can_work_pipeline(request.user, application.job_description):
            raise PermissionDenied("You cannot change this application.")
        serializer = ApplicationUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        PipelineService.update(application, dict(serializer.validated_data), request.user)
        return self._detail(application)

    @extend_schema(
        operation_id="applications_moves",
        summary="Status moves allowed from the current status (plan.md 6.5)",
        responses={200: MoveSerializer(many=True)},
        tags=["applications"],
    )
    @action(detail=True, methods=["get"])
    def moves(self, request: Request, pk: str | None = None) -> Response:
        application = self.get_object()
        if not can_transition_application(request.user, application.job_description):
            return Response([])
        rows = [vars(move) for move in allowed_moves(application, request.user)]
        return Response(MoveSerializer(rows, many=True).data)

    @extend_schema(
        operation_id="applications_transition",
        summary="Move an application to a new status",
        request=TransitionSerializer,
        responses={
            200: TransitionResponseSerializer,
            400: ERROR_ENVELOPE,
            403: ERROR_ENVELOPE,
            409: ERROR_ENVELOPE,
        },
        tags=["applications"],
    )
    @action(detail=True, methods=["post"])
    def transition(self, request: Request, pk: str | None = None) -> Response:
        application = self.get_object()
        if not can_transition_application(request.user, application.job_description):
            raise PermissionDenied("You cannot change this candidate's status.")
        serializer = TransitionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        _updated, activity = PipelineService.transition(
            application, data["status"], request.user, note=data["note"], reason=data["reason"]
        )
        fresh = self.get_queryset().get(pk=application.pk)
        payload = {"application": fresh, "activity": activity}
        return Response(
            TransitionResponseSerializer(payload, context=self.get_serializer_context()).data
        )

    @extend_schema(
        operation_id="applications_bulk_transition",
        summary="Move several applications at once (one grouped activity per JD)",
        request=BulkTransitionSerializer,
        responses={200: BulkTransitionResponseSerializer, 400: ERROR_ENVELOPE, 403: ERROR_ENVELOPE},
        tags=["applications"],
    )
    @action(detail=False, methods=["post"], url_path="bulk-transition")
    def bulk_transition(self, request: Request) -> Response:
        serializer = BulkTransitionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        applications = list(self.get_queryset().filter(pk__in=data["ids"]))
        for application in applications:
            if not can_transition_application(request.user, application.job_description):
                raise PermissionDenied("You cannot change one of these candidates.")
        moved, skipped, activities = PipelineService.bulk_transition(
            applications, data["status"], request.user, note=data["note"]
        )
        fresh = list(self.get_queryset().filter(pk__in=[app.pk for app in moved]))
        payload = {
            "moved": fresh,
            "skipped": {str(k): v for k, v in skipped.items()},
            "activities": activities,
        }
        return Response(
            BulkTransitionResponseSerializer(payload, context=self.get_serializer_context()).data
        )

    @extend_schema(
        operation_id="applications_email_preview",
        summary="Render an outreach template for this candidate",
        request=EmailPreviewRequestSerializer,
        responses={200: EmailPreviewSerializer, 400: ERROR_ENVELOPE, 403: ERROR_ENVELOPE},
        tags=["communications"],
    )
    @action(detail=True, methods=["post"], url_path="email/preview")
    def email_preview(self, request: Request, pk: str | None = None) -> Response:
        application = self.get_object()
        if not can_log_contact(request.user, application.job_description):
            raise PermissionDenied("You cannot email candidates for this job description.")
        serializer = EmailPreviewRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        template = data.get("template")
        raw_subject = template.subject if template else data["subject"]
        raw_body = template.body if template else data["body"]
        subject, body = render_text(raw_subject, raw_body, application, request.user)
        to = recipient_for(application.candidate)
        active = str(application.status) in ApplicationStatus.ACTIVE
        if not to:
            reason = "This candidate has no email address."
        elif not active:
            reason = "The candidate is no longer active on this job."
        else:
            reason = ""
        payload = {
            "to": to,
            "can_send": bool(to) and active,
            "reason": reason,
            "subject": subject,
            "body": body,
        }
        return Response(EmailPreviewSerializer(payload).data)

    @extend_schema(
        operation_id="applications_email",
        summary="Email the candidate and log it as a contact",
        request=EmailSendSerializer,
        responses={
            201: CommunicationSerializer,
            400: ERROR_ENVELOPE,
            403: ERROR_ENVELOPE,
            409: ERROR_ENVELOPE,
            502: ERROR_ENVELOPE,
        },
        tags=["communications"],
    )
    @action(detail=True, methods=["post"], url_path="email")
    def email(self, request: Request, pk: str | None = None) -> Response:
        application = self.get_object()
        if not can_log_contact(request.user, application.job_description):
            raise PermissionDenied("You cannot email candidates for this job description.")
        serializer = EmailSendSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        row = OutreachService.send_email(
            application,
            subject=serializer.validated_data["subject"],
            body=serializer.validated_data["body"],
            actor=request.user,
        )
        fresh = Communication.objects.select_related(
            "application__candidate",
            "application__owner",
            "application__job_description__created_by",
            "performed_by",
        ).get(pk=row.pk)
        return Response(
            CommunicationSerializer(fresh, context=self.get_serializer_context()).data,
            status=status.HTTP_201_CREATED,
        )

    @extend_schema(
        operation_id="applications_bulk_email",
        summary="Email several candidates with one template, personalised per candidate",
        request=BulkEmailSerializer,
        responses={200: BulkEmailResultSerializer, 400: ERROR_ENVELOPE, 403: ERROR_ENVELOPE},
        tags=["communications"],
    )
    @action(detail=False, methods=["post"], url_path="bulk-email")
    def bulk_email(self, request: Request) -> Response:
        serializer = BulkEmailSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        applications = list(
            self.get_queryset()
            .filter(pk__in=data["ids"])
            .select_related("candidate", "job_description__created_by")
        )
        for application in applications:
            if not can_log_contact(request.user, application.job_description):
                raise PermissionDenied("You cannot email one of these candidates.")
        sent, skipped = OutreachService.send_bulk(
            applications,
            actor=request.user,
            template=data.get("template"),
            subject=data["subject"],
            body=data["body"],
        )
        payload = {"sent": [str(row.application_id) for row in sent], "skipped": skipped}
        return Response(BulkEmailResultSerializer(payload).data)

    @extend_schema(
        operation_id="applications_call",
        summary="Start an AI phone call to the candidate (real or simulated)",
        request=PhoneCallCreateSerializer,
        responses={
            201: PhoneCallSerializer,
            400: ERROR_ENVELOPE,
            403: ERROR_ENVELOPE,
            409: ERROR_ENVELOPE,
            502: ERROR_ENVELOPE,
            503: ERROR_ENVELOPE,
        },
        tags=["calls"],
    )
    @action(detail=True, methods=["post"], url_path="calls")
    def call(self, request: Request, pk: str | None = None) -> Response:
        application = self.get_object()
        if not can_log_contact(request.user, application.job_description):
            raise PermissionDenied("You cannot call candidates for this job description.")
        serializer = PhoneCallCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        call = CallService.create(application, actor=request.user, **serializer.validated_data)
        return Response(
            PhoneCallSerializer(call, context=self.get_serializer_context()).data,
            status=status.HTTP_201_CREATED,
        )

    @extend_schema(
        operation_id="applications_bulk_call",
        summary="Start the same AI phone call for several candidates",
        request=BulkPhoneCallSerializer,
        responses={200: BulkPhoneCallResultSerializer, 400: ERROR_ENVELOPE, 403: ERROR_ENVELOPE},
        tags=["calls"],
    )
    @action(detail=False, methods=["post"], url_path="bulk-calls")
    def bulk_call(self, request: Request) -> Response:
        serializer = BulkPhoneCallSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        ids = data.pop("ids")
        applications = list(
            self.get_queryset()
            .filter(pk__in=ids)
            .select_related("candidate", "job_description__created_by")
        )
        for application in applications:
            if not can_log_contact(request.user, application.job_description):
                raise PermissionDenied("You cannot call one of these candidates.")
        placed, skipped = CallService.bulk_create(applications, actor=request.user, **data)
        payload = {"placed": placed, "skipped": skipped}
        return Response(
            BulkPhoneCallResultSerializer(payload, context=self.get_serializer_context()).data
        )

    @extend_schema(
        operation_id="applications_rematch",
        summary="Recompute the AI match (never changes the status)",
        request=None,
        responses={200: CandidateMatchSerializer, 403: ERROR_ENVELOPE},
        tags=["applications"],
    )
    @action(detail=True, methods=["post"])
    def rematch(self, request: Request, pk: str | None = None) -> Response:
        application = self.get_object()
        if not can_work_pipeline(request.user, application.job_description):
            raise PermissionDenied("You cannot recompute this match.")
        match = PipelineService.rematch(application)
        return Response(CandidateMatchSerializer(match, context=self.get_serializer_context()).data)


# ------------------------------------------------------ interviews, comms, offers, onboardings


def _visible_application_ids(user: Any):
    return Application.objects.filter(
        job_description_id__in=visible_job_descriptions_for(user).values("pk")
    ).values("pk")


def _refresh(view: viewsets.GenericViewSet, obj: Any, code: int = status.HTTP_200_OK) -> Response:
    fresh = view.get_queryset().get(pk=obj.pk)
    return Response(view.get_serializer(fresh).data, status=code)


@extend_schema_view(
    list=extend_schema(
        operation_id="interviews_list",
        summary="Interviews the user may see (visible JDs, plus any they conduct)",
        parameters=[
            OpenApiParameter("job_description", str),
            OpenApiParameter("application", str),
            OpenApiParameter("candidate", str),
            OpenApiParameter("interviewer", str),
            OpenApiParameter("status", str, description="comma list"),
            OpenApiParameter("round", str, description="comma list"),
            OpenApiParameter("from", str, description="ISO datetime, scheduled_at >="),
            OpenApiParameter("to", str, description="ISO datetime, scheduled_at <="),
            OpenApiParameter("mine", bool),
            OpenApiParameter(
                "bucket", str, description="upcoming | today | completed | past | pending_feedback"
            ),
            OpenApiParameter("search", str),
            OpenApiParameter(
                "ordering",
                str,
                description=(
                    "scheduled_at (default), created_at, status, round, score, "
                    "application__candidate__full_name, application__job_description__title, "
                    "interviewer__first_name; prefix with - for descending"
                ),
            ),
        ],
        tags=["interviews"],
    ),
    retrieve=extend_schema(operation_id="interviews_retrieve", tags=["interviews"]),
    create=extend_schema(
        operation_id="interviews_create",
        summary="Schedule an interview (moves the application to Interview Scheduled)",
        request=InterviewCreateSerializer,
        responses={
            201: InterviewSerializer,
            400: ERROR_ENVELOPE,
            403: ERROR_ENVELOPE,
            409: ERROR_ENVELOPE,
        },
        tags=["interviews"],
    ),
    partial_update=extend_schema(
        operation_id="interviews_partial_update",
        summary="Change interviewer, mode, link, location, duration, or mark a no-show",
        request=InterviewUpdateSerializer,
        responses={200: InterviewSerializer, 400: ERROR_ENVELOPE, 403: ERROR_ENVELOPE},
        tags=["interviews"],
    ),
    destroy=extend_schema(
        operation_id="interviews_destroy",
        summary="Delete an interview that has not been completed",
        responses={204: None, 403: ERROR_ENVELOPE, 409: ERROR_ENVELOPE},
        tags=["interviews"],
    ),
)
class InterviewViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    permission_classes = [IsAuthenticated]
    serializer_class = InterviewSerializer
    filterset_class = InterviewFilter
    ordering_fields = [
        "scheduled_at",
        "created_at",
        "status",
        "round",
        "score",
        "application__candidate__full_name",
        "application__job_description__title",
        "interviewer__first_name",
    ]
    ordering = ["scheduled_at"]
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_queryset(self) -> QuerySet[Interview]:
        user = self.request.user
        return (
            Interview.objects.filter(
                Q(application_id__in=_visible_application_ids(user)) | Q(interviewer_id=user.pk)
            )
            .select_related(
                "application__candidate",
                "application__owner",
                "application__job_description__created_by",
                "interviewer",
                "created_by",
            )
            .prefetch_related("application__job_description__participants")
        )

    def create(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        serializer = InterviewCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        application = data.pop("application")
        if not can_schedule_interview(request.user, application.job_description):
            raise PermissionDenied("You cannot schedule interviews for this job description.")
        interview = InterviewService.schedule(application, actor=request.user, **data)
        return _refresh(self, interview, status.HTTP_201_CREATED)

    def partial_update(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        interview = self.get_object()
        if not can_schedule_interview(request.user, interview.application.job_description):
            raise PermissionDenied("You cannot change this interview.")
        serializer = InterviewUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        InterviewService.update(interview, dict(serializer.validated_data), request.user)
        return _refresh(self, interview)

    def destroy(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        interview = self.get_object()
        if not can_schedule_interview(request.user, interview.application.job_description):
            raise PermissionDenied("You cannot delete this interview.")
        InterviewService.delete(interview, request.user)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @extend_schema(
        operation_id="interviews_feedback",
        summary="Submit score, recommendation and feedback (completes the interview)",
        request=FeedbackSerializer,
        responses={
            200: InterviewSerializer,
            400: ERROR_ENVELOPE,
            403: ERROR_ENVELOPE,
            409: ERROR_ENVELOPE,
        },
        tags=["interviews"],
    )
    @action(detail=True, methods=["post"])
    def feedback(self, request: Request, pk: str | None = None) -> Response:
        interview = self.get_object()
        if not can_submit_feedback(request.user, interview):
            raise PermissionDenied("Only the interviewer or HR can submit feedback.")
        serializer = FeedbackSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        InterviewService.submit_feedback(interview, actor=request.user, **serializer.validated_data)
        return _refresh(self, interview)

    @extend_schema(
        operation_id="interviews_reschedule",
        request=InterviewRescheduleSerializer,
        responses={
            200: InterviewSerializer,
            400: ERROR_ENVELOPE,
            403: ERROR_ENVELOPE,
            409: ERROR_ENVELOPE,
        },
        tags=["interviews"],
    )
    @action(detail=True, methods=["post"])
    def reschedule(self, request: Request, pk: str | None = None) -> Response:
        interview = self.get_object()
        if not can_schedule_interview(request.user, interview.application.job_description):
            raise PermissionDenied("You cannot reschedule this interview.")
        serializer = InterviewRescheduleSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        InterviewService.reschedule(interview, actor=request.user, **serializer.validated_data)
        return _refresh(self, interview)

    @extend_schema(
        operation_id="interviews_cancel",
        request=InterviewCancelSerializer,
        responses={
            200: InterviewSerializer,
            400: ERROR_ENVELOPE,
            403: ERROR_ENVELOPE,
            409: ERROR_ENVELOPE,
        },
        tags=["interviews"],
    )
    @action(detail=True, methods=["post"])
    def cancel(self, request: Request, pk: str | None = None) -> Response:
        interview = self.get_object()
        if not can_schedule_interview(request.user, interview.application.job_description):
            raise PermissionDenied("You cannot cancel this interview.")
        serializer = InterviewCancelSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        InterviewService.cancel(interview, actor=request.user, **serializer.validated_data)
        return _refresh(self, interview)


@extend_schema_view(
    list=extend_schema(
        operation_id="communications_list",
        summary="Logged contacts, newest first",
        parameters=[
            OpenApiParameter("application", str),
            OpenApiParameter("job_description", str),
            OpenApiParameter("candidate", str),
            OpenApiParameter("channel", str),
            OpenApiParameter("outcome", str),
        ],
        tags=["communications"],
    ),
    retrieve=extend_schema(operation_id="communications_retrieve", tags=["communications"]),
    create=extend_schema(
        operation_id="communications_create",
        summary="Log a contact (a connection moves early applications to Contacted)",
        request=CommunicationCreateSerializer,
        responses={
            201: CommunicationSerializer,
            400: ERROR_ENVELOPE,
            403: ERROR_ENVELOPE,
            409: ERROR_ENVELOPE,
        },
        tags=["communications"],
    ),
)
class CommunicationViewSet(
    mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet
):
    permission_classes = [IsAuthenticated]
    serializer_class = CommunicationSerializer
    filterset_class = CommunicationFilter
    ordering_fields = ["occurred_at", "created_at"]
    ordering = ["-occurred_at"]

    def get_queryset(self) -> QuerySet[Communication]:
        return (
            Communication.objects.filter(
                application_id__in=_visible_application_ids(self.request.user)
            )
            .select_related(
                "application__candidate",
                "application__owner",
                "application__job_description__created_by",
                "performed_by",
            )
            .prefetch_related("application__job_description__participants")
        )

    def create(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        serializer = CommunicationCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        application = data.pop("application")
        if not can_log_contact(request.user, application.job_description):
            raise PermissionDenied("You cannot log contacts for this job description.")
        row = CommunicationService.log(application, actor=request.user, **data)
        return _refresh(self, row, status.HTTP_201_CREATED)


class _ManagedViewSet(viewsets.GenericViewSet):
    """Shared plumbing for offers and onboardings: visibility by JD, manage rights
    through ``can_manage_job``."""

    permission_classes = [IsAuthenticated]

    def _require_manage(self, application: Application) -> None:
        if not can_manage_job(self.request.user, application.job_description):
            raise PermissionDenied("You cannot manage offers or onboarding for this role.")


@extend_schema_view(
    list=extend_schema(
        operation_id="offers_list",
        parameters=[
            OpenApiParameter("application", str),
            OpenApiParameter("job_description", str),
            OpenApiParameter("candidate", str),
            OpenApiParameter("status", str),
        ],
        tags=["offers"],
    ),
    retrieve=extend_schema(operation_id="offers_retrieve", tags=["offers"]),
    create=extend_schema(
        operation_id="offers_create",
        summary="Draft (or send) an offer for a selected candidate",
        request=OfferCreateSerializer,
        responses={
            201: OfferSerializer,
            400: ERROR_ENVELOPE,
            403: ERROR_ENVELOPE,
            409: ERROR_ENVELOPE,
        },
        tags=["offers"],
    ),
    partial_update=extend_schema(
        operation_id="offers_partial_update",
        request=OfferUpdateSerializer,
        responses={
            200: OfferSerializer,
            400: ERROR_ENVELOPE,
            403: ERROR_ENVELOPE,
            409: ERROR_ENVELOPE,
        },
        tags=["offers"],
    ),
)
class OfferViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    _ManagedViewSet,
):
    serializer_class = OfferSerializer
    filterset_class = OfferFilter
    ordering_fields = ["created_at", "sent_at", "joining_date", "status"]
    ordering = ["-created_at"]
    http_method_names = ["get", "post", "patch", "head", "options"]

    def get_queryset(self) -> QuerySet[Offer]:
        return (
            Offer.objects.filter(application_id__in=_visible_application_ids(self.request.user))
            .select_related(
                "application__candidate",
                "application__owner",
                "application__job_description__created_by",
                "created_by",
            )
            .prefetch_related("application__job_description__participants")
        )

    def create(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        serializer = OfferCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        application = data.pop("application")
        self._require_manage(application)
        offer = OfferService.create(application, actor=request.user, **data)
        return _refresh(self, offer, status.HTTP_201_CREATED)

    def partial_update(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        offer = self.get_object()
        self._require_manage(offer.application)
        serializer = OfferUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        OfferService.update(offer, dict(serializer.validated_data), request.user)
        return _refresh(self, offer)

    def _act(self, request: Request, method: str) -> Response:
        offer = self.get_object()
        self._require_manage(offer.application)
        serializer = OfferReasonSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        if method == "send":
            OfferService.send(offer, actor=request.user)
        elif method == "accept":
            OfferService.accept(offer, actor=request.user, note=data["note"] or data["reason"])
        elif method == "decline":
            OfferService.decline(offer, actor=request.user, reason=data["reason"] or data["note"])
        else:
            OfferService.withdraw(offer, actor=request.user, reason=data["reason"] or data["note"])
        return _refresh(self, offer)

    @extend_schema(
        operation_id="offers_send",
        request=None,
        responses={200: OfferSerializer, 403: ERROR_ENVELOPE, 409: ERROR_ENVELOPE},
        tags=["offers"],
    )
    @action(detail=True, methods=["post"])
    def send(self, request: Request, pk: str | None = None) -> Response:
        return self._act(request, "send")

    @extend_schema(
        operation_id="offers_accept",
        request=OfferReasonSerializer,
        responses={200: OfferSerializer, 403: ERROR_ENVELOPE, 409: ERROR_ENVELOPE},
        tags=["offers"],
    )
    @action(detail=True, methods=["post"])
    def accept(self, request: Request, pk: str | None = None) -> Response:
        return self._act(request, "accept")

    @extend_schema(
        operation_id="offers_decline",
        request=OfferReasonSerializer,
        responses={200: OfferSerializer, 403: ERROR_ENVELOPE, 409: ERROR_ENVELOPE},
        tags=["offers"],
    )
    @action(detail=True, methods=["post"])
    def decline(self, request: Request, pk: str | None = None) -> Response:
        return self._act(request, "decline")

    @extend_schema(
        operation_id="offers_withdraw",
        request=OfferReasonSerializer,
        responses={200: OfferSerializer, 403: ERROR_ENVELOPE, 409: ERROR_ENVELOPE},
        tags=["offers"],
    )
    @action(detail=True, methods=["post"])
    def withdraw(self, request: Request, pk: str | None = None) -> Response:
        return self._act(request, "withdraw")


@extend_schema_view(
    list=extend_schema(
        operation_id="onboardings_list",
        parameters=[
            OpenApiParameter("application", str),
            OpenApiParameter("job_description", str),
            OpenApiParameter("candidate", str),
            OpenApiParameter("status", str),
        ],
        tags=["onboardings"],
    ),
    retrieve=extend_schema(operation_id="onboardings_retrieve", tags=["onboardings"]),
    create=extend_schema(
        operation_id="onboardings_create",
        summary="Start onboarding for a candidate who accepted an offer",
        request=OnboardingCreateSerializer,
        responses={
            201: OnboardingSerializer,
            400: ERROR_ENVELOPE,
            403: ERROR_ENVELOPE,
            409: ERROR_ENVELOPE,
        },
        tags=["onboardings"],
    ),
    partial_update=extend_schema(
        operation_id="onboardings_partial_update",
        summary="Tick checklist items, edit notes, buddy, HR contact or start date",
        request=OnboardingUpdateSerializer,
        responses={
            200: OnboardingSerializer,
            400: ERROR_ENVELOPE,
            403: ERROR_ENVELOPE,
            409: ERROR_ENVELOPE,
        },
        tags=["onboardings"],
    ),
)
class OnboardingViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    _ManagedViewSet,
):
    serializer_class = OnboardingSerializer
    filterset_class = OnboardingFilter
    ordering_fields = ["start_date", "created_at", "status"]
    ordering = ["-start_date"]
    http_method_names = ["get", "post", "patch", "head", "options"]

    def get_queryset(self) -> QuerySet[Onboarding]:
        return (
            Onboarding.objects.filter(
                application_id__in=_visible_application_ids(self.request.user)
            )
            .select_related(
                "application__candidate",
                "application__owner",
                "application__job_description__created_by",
                "buddy",
                "hr_contact",
            )
            .prefetch_related("application__job_description__participants")
        )

    def create(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        serializer = OnboardingCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        application = data.pop("application")
        self._require_manage(application)
        row = OnboardingService.start(application, actor=request.user, **data)
        return _refresh(self, row, status.HTTP_201_CREATED)

    def partial_update(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        row = self.get_object()
        self._require_manage(row.application)
        serializer = OnboardingUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        OnboardingService.update(row, dict(serializer.validated_data), request.user)
        return _refresh(self, row)

    @extend_schema(
        operation_id="onboardings_complete",
        summary="Tick the rest of the checklist and mark the candidate onboarded",
        request=None,
        responses={200: OnboardingSerializer, 403: ERROR_ENVELOPE, 409: ERROR_ENVELOPE},
        tags=["onboardings"],
    )
    @action(detail=True, methods=["post"])
    def complete(self, request: Request, pk: str | None = None) -> Response:
        row = self.get_object()
        self._require_manage(row.application)
        OnboardingService.complete(row, actor=request.user)
        return _refresh(self, row)


class EmailConfigView(APIView):
    """``GET /email/``: whether outreach mail is configured, the sender, and the templates."""

    permission_classes = [IsAuthenticated]

    @extend_schema(
        operation_id="email_config",
        summary="Outreach email settings and templates",
        responses={200: EmailConfigSerializer},
        tags=["communications"],
    )
    def get(self, request: Request) -> Response:
        payload = {
            **asdict(email_config()),
            "placeholders": list(PLACEHOLDERS),
            "templates": MessageTemplate.objects.filter(
                is_active=True, channel=CommunicationChannel.EMAIL
            ),
        }
        return Response(EmailConfigSerializer(payload).data)


@extend_schema_view(
    list=extend_schema(
        operation_id="email_templates_list", summary="Outreach templates", tags=["communications"]
    ),
    retrieve=extend_schema(operation_id="email_templates_retrieve", tags=["communications"]),
    create=extend_schema(
        operation_id="email_templates_create",
        summary="Create a template (HR staff)",
        responses={201: MessageTemplateSerializer, 400: ERROR_ENVELOPE, 403: ERROR_ENVELOPE},
        tags=["communications"],
    ),
    update=extend_schema(operation_id="email_templates_update", tags=["communications"]),
    partial_update=extend_schema(
        operation_id="email_templates_partial_update", tags=["communications"]
    ),
    destroy=extend_schema(operation_id="email_templates_destroy", tags=["communications"]),
)
class MessageTemplateViewSet(viewsets.ModelViewSet):
    """Outreach templates: anyone signed in may read them, HR staff maintain them."""

    serializer_class = MessageTemplateSerializer
    queryset = MessageTemplate.objects.filter(channel=CommunicationChannel.EMAIL)
    http_method_names = ["get", "post", "patch", "put", "delete", "head", "options"]

    def get_permissions(self):
        if self.request.method in SAFE_METHODS:
            return [IsAuthenticated()]
        return [IsAuthenticated(), IsHrStaff()]

    def perform_create(self, serializer) -> None:
        template = serializer.save(channel=CommunicationChannel.EMAIL)
        set_default_template(template)

    def perform_update(self, serializer) -> None:
        set_default_template(serializer.save())

    @extend_schema(
        operation_id="email_templates_generate",
        summary="Draft a template with the AI from a purpose, tone, role and instructions",
        request=EmailDraftBriefSerializer,
        responses={200: EmailDraftSerializer, 400: ERROR_ENVELOPE, 502: ERROR_ENVELOPE},
        tags=["communications"],
    )
    @action(detail=False, methods=["post"], url_path="generate")
    def generate(self, request: Request) -> Response:
        serializer = EmailDraftBriefSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        draft, model = draft_email(
            purpose=data["purpose"],
            tone=data["tone"],
            instructions=data["instructions"],
            jd=data.get("jd"),
        )
        payload = {"subject": draft.subject, "body": draft.body, "model": model}
        return Response(EmailDraftSerializer(payload).data)


@extend_schema_view(
    list=extend_schema(
        operation_id="calls_list",
        summary="AI phone calls the user may see",
        parameters=[
            OpenApiParameter("application", str),
            OpenApiParameter("job_description", str),
            OpenApiParameter("candidate", str),
            OpenApiParameter("status", str),
            OpenApiParameter("purpose", str),
        ],
        tags=["calls"],
    ),
    retrieve=extend_schema(operation_id="calls_retrieve", tags=["calls"]),
)
class PhoneCallViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = PhoneCallSerializer
    filterset_class = PhoneCallFilter
    ordering_fields = ["created_at", "started_at"]
    ordering = ["-created_at"]

    def get_queryset(self) -> QuerySet[PhoneCall]:
        return PhoneCall.objects.filter(
            application_id__in=_visible_application_ids(self.request.user)
        ).select_related(
            "application__candidate",
            "application__owner",
            "application__job_description__created_by",
            "created_by",
        )

    def _writable(self, request: Request) -> PhoneCall:
        call = self.get_object()
        if not can_log_contact(request.user, call.application.job_description):
            raise PermissionDenied("You cannot run calls for this job description.")
        return call

    @extend_schema(
        operation_id="calls_config",
        summary="Whether a voice provider is configured, and the safe-mode number",
        responses={200: VoiceConfigSerializer},
        tags=["calls"],
    )
    @action(detail=False, methods=["get"], url_path="config")
    def config(self, request: Request) -> Response:
        config = voice_config()
        payload = {
            "provider": config.provider,
            "configured": config.configured,
            "safe_number": config.safe_number,
            "default_region": config.default_region,
        }
        return Response(VoiceConfigSerializer(payload).data)

    @extend_schema(
        operation_id="calls_reply",
        summary="Simulated call: the candidate's answer; returns the call with the AI's next turn",
        request=CallReplySerializer,
        responses={200: PhoneCallSerializer, 400: ERROR_ENVELOPE, 409: ERROR_ENVELOPE},
        tags=["calls"],
    )
    @action(detail=True, methods=["post"], url_path="reply")
    def reply(self, request: Request, pk: str | None = None) -> Response:
        call = self._writable(request)
        serializer = CallReplySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        call = CallService.reply(call, serializer.validated_data["answer"], request.user)
        return _refresh(self, call)

    @extend_schema(
        operation_id="calls_finish",
        summary="End the call now and write the assessment",
        request=None,
        responses={200: PhoneCallSerializer, 403: ERROR_ENVELOPE},
        tags=["calls"],
    )
    @action(detail=True, methods=["post"], url_path="finish")
    def finish(self, request: Request, pk: str | None = None) -> Response:
        call = self._writable(request)
        call = CallService.finish(call, actor=request.user, reason="ended by the recruiter")
        return _refresh(self, call)


class VapiWebhookView(APIView):
    """Vapi posts status updates and the end-of-call report here: no session, a shared secret."""

    permission_classes = [AllowAny]
    authentication_classes: list = []

    @extend_schema(exclude=True)
    def post(self, request: Request) -> Response:
        if not VapiProvider.verify(request.headers):
            return Response(status=status.HTTP_403_FORBIDDEN)
        event = VapiProvider.parse_webhook(request.data if isinstance(request.data, dict) else {})
        if event.kind == "ignored" or not event.provider_call_id:
            return Response({"ok": True})
        call = PhoneCall.objects.filter(provider_call_id=event.provider_call_id).first()
        if call is not None:
            CallService.apply_event(call, event)
        return Response({"ok": True})
