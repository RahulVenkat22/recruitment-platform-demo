from drf_spectacular.utils import extend_schema
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from dashboard.serializers import MetaEnumsSerializer
from dashboard.services import build_enum_catalogue


class MetaEnumsView(APIView):
    """``GET /api/v1/meta/enums/``: every enum with labels and colour tokens (plan.md 6.10).

    Public for now so the SPA can load it at boot; it becomes authenticated once
    the auth phase lands (the session-restore refresh will then precede it).
    """

    permission_classes = [AllowAny]
    throttle_classes: list = []

    @extend_schema(
        operation_id="meta_enums",
        summary="Enum catalogue: labels, colour tokens, status order and Kanban mapping",
        responses={200: MetaEnumsSerializer},
        auth=[],
        tags=["meta"],
    )
    def get(self, request: Request) -> Response:
        return Response(MetaEnumsSerializer(instance=build_enum_catalogue()).data)
