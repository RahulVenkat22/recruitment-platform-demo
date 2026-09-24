"""``/api/v1/support/tickets/``: raise, list, read, edit, comment on, assign and
move support tickets, and ``/api/v1/support/attachments/{id}/`` for the files
handed in with them. Views validate and check permissions; ``TicketService``
does the work and writes the timeline and notifications."""

from __future__ import annotations

from typing import Any

from django.db.models import Count, Q, QuerySet
from django.http import FileResponse
from django.utils.crypto import constant_time_compare
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import (
    OpenApiParameter,
    OpenApiResponse,
    extend_schema,
    extend_schema_view,
)
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from common.enums import TicketEventKind, TicketStatus
from common.permissions import can_view_job
from support.filters import TicketFilter
from support.models import Ticket, TicketAttachment, attachment_signature
from support.permissions import (
    can_assign_ticket,
    can_comment_ticket,
    can_edit_ticket,
    is_agent,
)
from support.serializers import (
    TicketAssignSerializer,
    TicketCommentSerializer,
    TicketCreateSerializer,
    TicketDetailSerializer,
    TicketRowSerializer,
    TicketSummarySerializer,
    TicketTransitionSerializer,
    TicketUpdateSerializer,
)
from support.services import TicketService

ERROR_ENVELOPE = OpenApiResponse(
    description="plan.md 6.10 error envelope {error: {code, message, details}}"
)


def _visible_tickets(user: Any) -> QuerySet[Ticket]:
    """Every ticket for the support team; own and assigned tickets for everyone else."""
    qs = Ticket.objects.all()
    if not is_agent(user):
        qs = qs.filter(Q(requester_id=user.pk) | Q(assignee_id=user.pk))
    return qs


@extend_schema_view(
    list=extend_schema(
        operation_id="support_tickets_list",
        summary="Support tickets the current user may see",
        description=(
            "Admins (the support team) see every ticket; everyone else sees the tickets they "
            "raised or were assigned. `search` matches the number, subject and description."
        ),
        parameters=[
            OpenApiParameter("search", str),
            OpenApiParameter(
                "ordering",
                str,
                description=(
                    "-last_activity_at (default), created_at, number, subject, status, priority"
                ),
            ),
        ],
        tags=["support"],
    ),
    retrieve=extend_schema(
        operation_id="support_tickets_retrieve",
        summary="One ticket with its timeline and what you may do with it",
        responses={200: TicketDetailSerializer, 404: ERROR_ENVELOPE},
        tags=["support"],
    ),
    create=extend_schema(
        operation_id="support_tickets_create",
        summary="Raise a ticket (everyone), with images or videos; the support team is notified",
        request=TicketCreateSerializer,
        responses={201: TicketDetailSerializer, 400: ERROR_ENVELOPE},
        tags=["support"],
    ),
    partial_update=extend_schema(
        operation_id="support_tickets_partial_update",
        summary="Edit the details (requester or support team, until closed)",
        request=TicketUpdateSerializer,
        responses={200: TicketDetailSerializer, 400: ERROR_ENVELOPE, 403: ERROR_ENVELOPE},
        tags=["support"],
    ),
)
class TicketViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    permission_classes = [IsAuthenticated]
    serializer_class = TicketRowSerializer
    filterset_class = TicketFilter
    search_fields = ["number", "subject", "description"]
    ordering_fields = ["last_activity_at", "created_at", "number", "subject", "status", "priority"]
    ordering = ["-last_activity_at"]
    http_method_names = ["get", "post", "patch", "head", "options"]
    # Schema generation only; get_queryset scopes to the request user.
    queryset = Ticket.objects.none()

    def get_queryset(self) -> QuerySet[Ticket]:
        return (
            _visible_tickets(self.request.user)
            .select_related("requester", "assignee", "job_description")
            .annotate(
                comment_count=Count(
                    "events", filter=Q(events__kind=TicketEventKind.COMMENT), distinct=True
                )
            )
        )

    def get_serializer_class(self):
        if self.action in ("retrieve", "create", "partial_update"):
            return TicketDetailSerializer
        return TicketRowSerializer

    def _detail(self, ticket: Ticket, code: int = status.HTTP_200_OK) -> Response:
        row = (
            self.get_queryset()
            .prefetch_related("events__actor", "events__attachments", "attachments")
            .get(pk=ticket.pk)
        )
        return Response(
            TicketDetailSerializer(row, context={"request": self.request}).data, status=code
        )

    def retrieve(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        return self._detail(self.get_object())

    def _check_job(self, request: Request, job: Any) -> None:
        if job is not None and not can_view_job(request.user, job):
            raise PermissionDenied("You cannot see that job description.")

    def create(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        serializer = TicketCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        attachments = data.pop("attachments", [])
        self._check_job(request, data.get("job_description"))
        ticket = TicketService.create(requester=request.user, attachments=attachments, **data)
        return self._detail(ticket, status.HTTP_201_CREATED)

    def partial_update(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        ticket = self.get_object()
        if not can_edit_ticket(request.user, ticket):
            raise PermissionDenied("You cannot edit this ticket.")
        serializer = TicketUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        self._check_job(request, data.get("job_description"))
        TicketService.update(ticket, data, request.user)
        return self._detail(ticket)

    @extend_schema(
        operation_id="support_tickets_summary",
        summary="Counts by status for the filter chips",
        parameters=[
            OpenApiParameter("mine", bool, description="Only tickets I raised"),
            OpenApiParameter("assigned_to_me", bool, description="Only tickets assigned to me"),
        ],
        responses={200: TicketSummarySerializer},
        tags=["support"],
    )
    @action(detail=False, methods=["get"])
    def summary(self, request: Request) -> Response:
        qs = _visible_tickets(request.user)
        truthy = ("true", "1", "yes")
        if request.query_params.get("mine", "").lower() in truthy:
            qs = qs.filter(requester_id=request.user.pk)
        if request.query_params.get("assigned_to_me", "").lower() in truthy:
            qs = qs.filter(assignee_id=request.user.pk)
        counts = qs.aggregate(
            total=Count("id"),
            **{str(value): Count("id", filter=Q(status=value)) for value in TicketStatus.values},
        )
        return Response(TicketSummarySerializer(counts).data)

    @extend_schema(
        operation_id="support_tickets_comment",
        summary="Add a comment, with images or videos, to the ticket's timeline",
        request=TicketCommentSerializer,
        responses={
            200: TicketDetailSerializer,
            400: ERROR_ENVELOPE,
            403: ERROR_ENVELOPE,
            409: ERROR_ENVELOPE,
        },
        tags=["support"],
    )
    @action(detail=True, methods=["post"])
    def comments(self, request: Request, pk: str | None = None) -> Response:
        ticket = self.get_object()
        if not can_comment_ticket(request.user, ticket):
            raise PermissionDenied("You cannot comment on this ticket.")
        serializer = TicketCommentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        TicketService.comment(
            ticket,
            request.user,
            serializer.validated_data["message"],
            attachments=serializer.validated_data.get("attachments", []),
        )
        return self._detail(ticket)

    @extend_schema(
        operation_id="support_tickets_transition",
        summary="Move the ticket: start work, resolve, close or reopen",
        request=TicketTransitionSerializer,
        responses={
            200: TicketDetailSerializer,
            400: ERROR_ENVELOPE,
            403: ERROR_ENVELOPE,
            409: ERROR_ENVELOPE,
        },
        tags=["support"],
    )
    @action(detail=True, methods=["post"])
    def transition(self, request: Request, pk: str | None = None) -> Response:
        ticket = self.get_object()
        serializer = TicketTransitionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        TicketService.transition(
            ticket,
            serializer.validated_data["status"],
            request.user,
            serializer.validated_data.get("note", ""),
        )
        return self._detail(ticket)

    @extend_schema(
        operation_id="support_tickets_assign",
        summary="Hand the ticket to someone (support team only)",
        request=TicketAssignSerializer,
        responses={
            200: TicketDetailSerializer,
            400: ERROR_ENVELOPE,
            403: ERROR_ENVELOPE,
            409: ERROR_ENVELOPE,
        },
        tags=["support"],
    )
    @action(detail=True, methods=["post"])
    def assign(self, request: Request, pk: str | None = None) -> Response:
        ticket = self.get_object()
        if not can_assign_ticket(request.user, ticket):
            raise PermissionDenied("Only the support team can assign tickets.")
        serializer = TicketAssignSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        TicketService.assign(ticket, serializer.validated_data["assignee"], request.user)
        return self._detail(ticket)


class TicketAttachmentView(APIView):
    """``GET /support/attachments/{id}/?t=<signature>``: the image or video itself.

    No login: an <img> or <video> cannot send the access token, so the URL
    carries an HMAC instead, the way candidate photos do.
    """

    permission_classes = [AllowAny]
    authentication_classes: list = []
    throttle_classes: list = []

    @extend_schema(
        operation_id="support_attachment",
        summary="An attachment's file; its signed URL is the attachment's url",
        parameters=[OpenApiParameter("t", str, required=True, description="The signature in url")],
        responses={(200, "application/octet-stream"): OpenApiTypes.BINARY, 404: ERROR_ENVELOPE},
        auth=[],
        tags=["support"],
    )
    def get(self, request: Request, pk: str) -> FileResponse:
        attachment = TicketAttachment.objects.filter(pk=pk).first()
        token = request.query_params.get("t", "")
        if attachment is None or not constant_time_compare(
            token, attachment_signature(attachment.pk)
        ):
            raise NotFound("No such attachment.")
        response = FileResponse(attachment.file.open("rb"), content_type=attachment.content_type)
        response["Content-Disposition"] = f'inline; filename="{attachment.name}"'
        response["Cache-Control"] = "private, max-age=86400"
        return response
