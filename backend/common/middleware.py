"""Trusted edge boundary and inexpensive, dependency-aware container probes."""

import ipaddress
import secrets

from django.conf import settings
from django.core.cache import cache
from django.db import connection
from django.http import JsonResponse


class ProductionBoundaryMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        # ALB probes use the private task IP as Host and do not carry edge headers.
        # These paths expose no configuration and do not accept mutations.
        if request.path in {"/health/live", "/health/ready"} and request.method in {"GET", "HEAD"}:
            healthy = True
            if request.path == "/health/ready":
                try:
                    with connection.cursor() as cursor:
                        cursor.execute("SELECT 1")
                        cursor.fetchone()
                    cache.get("readiness")
                except Exception:
                    healthy = False
            return JsonResponse(
                {"status": "ok" if healthy else "unavailable"}, status=200 if healthy else 503
            )
        expected = getattr(settings, "ORIGIN_VERIFY_SECRET", "")
        if expected and not secrets.compare_digest(
            request.headers.get("X-Origin-Verify", ""), expected
        ):
            return JsonResponse(
                {"error": {"code": "forbidden", "message": "Forbidden"}}, status=403
            )
        # CloudFront overwrites this header with event.viewer.ip; network rules
        # restrict the ALB to CloudFront. Never trust the first X-Forwarded-For hop.
        if expected:
            try:
                address = str(ipaddress.ip_address(request.headers.get("X-Talent-Client-IP", "")))
            except ValueError:
                return JsonResponse({"error": {"code": "invalid_client"}}, status=400)
            request.META["REMOTE_ADDR"] = address
            request.META.pop("HTTP_X_FORWARDED_FOR", None)
        if request.method in {"POST", "PUT", "PATCH"}:
            length = request.META.get("CONTENT_LENGTH", "")
            # Require a length on production uploads; streaming bodies cannot
            # bypass the aggregate body limit (Gunicorn is not a body limiter).
            if not length and request.content_type.startswith("multipart/"):
                return JsonResponse({"error": {"code": "length_required"}}, status=411)
            if length and (not length.isdecimal() or int(length) > 32 * 1024 * 1024):
                return JsonResponse({"error": {"code": "body_too_large"}}, status=413)
        response = self.get_response(request)
        if request.path.startswith("/api/"):
            response["Cache-Control"] = "private, no-store"
            response["X-Content-Type-Options"] = "nosniff"
        return response
