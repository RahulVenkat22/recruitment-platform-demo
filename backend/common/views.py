"""Operational endpoints and the JSON fallbacks for errors raised outside DRF."""

from __future__ import annotations

from django.db import DatabaseError, connection
from django.http import HttpRequest, HttpResponse, JsonResponse
from django.views import defaults as django_defaults
from drf_spectacular.utils import OpenApiResponse, extend_schema, inline_serializer
from rest_framework import serializers, status
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from common.exceptions import error_payload

API_PREFIX = "/api/"


def _check_database() -> None:
    """Round-trip to PostgreSQL; raises ``DatabaseError`` when it is unreachable."""
    with connection.cursor() as cursor:
        cursor.execute("SELECT 1")
        cursor.fetchone()


class HealthView(APIView):
    """``GET /api/v1/health/``: liveness plus a database round-trip (plan.md 6.10)."""

    permission_classes = [AllowAny]
    # No authentication at all: a stale token must never make the probe fail.
    authentication_classes: list = []
    throttle_classes: list = []

    @extend_schema(
        operation_id="health",
        summary="Service and database health",
        responses={
            200: inline_serializer(
                "Health",
                fields={
                    "status": serializers.CharField(),
                    "database": serializers.CharField(),
                },
            ),
            503: OpenApiResponse(description="Database unreachable"),
        },
        auth=[],
        tags=["meta"],
    )
    def get(self, request: Request) -> Response:
        try:
            _check_database()
        except DatabaseError:
            return Response(
                {"status": "degraded", "database": "error"},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        return Response({"status": "ok", "database": "ok"})


# ------------------------------------------------------------------ error handlers
# Django-level handlers (ROOT_URLCONF handlerNNN). API paths answer with the
# plan.md 6.10 envelope; everything else (admin, docs) keeps Django's defaults.


def _is_api(request: HttpRequest) -> bool:
    return request.path.startswith(API_PREFIX)


def bad_request(request: HttpRequest, exception: Exception | None = None) -> HttpResponse:
    if _is_api(request):
        return JsonResponse(error_payload("bad_request", "Bad request."), status=400)
    return django_defaults.bad_request(request, exception)


def permission_denied(request: HttpRequest, exception: Exception | None = None) -> HttpResponse:
    if _is_api(request):
        return JsonResponse(
            error_payload(
                "permission_denied", "You do not have permission to perform this action."
            ),
            status=403,
        )
    return django_defaults.permission_denied(request, exception)


def not_found(request: HttpRequest, exception: Exception | None = None) -> HttpResponse:
    if _is_api(request):
        return JsonResponse(error_payload("not_found", "Not found."), status=404)
    return django_defaults.page_not_found(request, exception)


def server_error(request: HttpRequest) -> HttpResponse:
    if _is_api(request):
        return JsonResponse(
            error_payload("server_error", "Something went wrong on our side."), status=500
        )
    return django_defaults.server_error(request)
