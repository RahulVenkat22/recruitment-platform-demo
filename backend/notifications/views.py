"""``/api/v1/notifications/``: the signed-in user's in-app notifications, the
unread count the bell polls, and the read / read-all actions (plan.md 6.10)."""

from __future__ import annotations

from typing import Any

from django.db.models import QuerySet
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, extend_schema, extend_schema_view
from rest_framework import mixins, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response

from notifications.models import Notification
from notifications.serializers import (
    NotificationSerializer,
    ReadAllSerializer,
    UnreadCountSerializer,
)


@extend_schema_view(
    list=extend_schema(
        operation_id="notifications_list",
        summary="The current user's notifications, newest first",
        parameters=[
            OpenApiParameter("unread", bool, description="Only unread rows"),
            OpenApiParameter("type", str, description="comma list of notification types"),
        ],
        tags=["notifications"],
    ),
    retrieve=extend_schema(operation_id="notifications_retrieve", tags=["notifications"]),
)
class NotificationViewSet(
    mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet
):
    permission_classes = [IsAuthenticated]
    serializer_class = NotificationSerializer
    # Schema generation only; get_queryset scopes to the request user.
    queryset = Notification.objects.none()
    ordering = ["-created_at"]

    def get_queryset(self) -> QuerySet[Notification]:
        qs = Notification.objects.filter(recipient=self.request.user).select_related("actor")
        params = self.request.query_params
        if params.get("unread") in ("true", "1", "yes"):
            qs = qs.filter(is_read=False)
        types = [item for item in (params.get("type") or "").split(",") if item]
        if types:
            qs = qs.filter(type__in=types)
        return qs

    @extend_schema(
        operation_id="notifications_unread_count",
        summary="Unread count for the bell (polled every 60 seconds)",
        responses={200: UnreadCountSerializer},
        tags=["notifications"],
    )
    @action(detail=False, methods=["get"], url_path="unread-count", throttle_classes=[])
    def unread_count(self, request: Request) -> Response:
        unread = Notification.objects.filter(recipient=request.user, is_read=False).count()
        return Response(UnreadCountSerializer({"unread": unread}).data)

    @extend_schema(
        operation_id="notifications_read",
        summary="Mark one notification read",
        request=None,
        responses={200: NotificationSerializer},
        tags=["notifications"],
    )
    @action(detail=True, methods=["post"])
    def read(self, request: Request, pk: str | None = None) -> Response:
        row = self.get_object()
        if not row.is_read:
            row.is_read = True
            row.read_at = timezone.now()
            row.save(update_fields=["is_read", "read_at", "updated_at"])
        return Response(self.get_serializer(row).data)

    @extend_schema(
        operation_id="notifications_read_all",
        summary="Mark every unread notification read",
        request=None,
        responses={200: ReadAllSerializer},
        tags=["notifications"],
    )
    @action(detail=False, methods=["post"], url_path="read-all")
    def read_all(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        marked = Notification.objects.filter(recipient=request.user, is_read=False).update(
            is_read=True, read_at=timezone.now()
        )
        return Response(ReadAllSerializer({"marked": marked}).data)
