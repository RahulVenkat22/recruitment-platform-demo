"""``/api/v1/resumes/uploads/``: multi-file PDF intake and batch progress (HR staff only)."""

from __future__ import annotations

from uuid import UUID

from drf_spectacular.utils import OpenApiParameter, OpenApiResponse, extend_schema
from rest_framework import status
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from common.permissions import IsHrStaff
from resumes.serializers import (
    IntakeResultSerializer,
    ResumeUploadRequestSerializer,
    UploadBatchSerializer,
    UploadBatchSummarySerializer,
)
from resumes.services.intake import batch_status, recent_batches, store_uploads

ERROR_ENVELOPE = OpenApiResponse(description="plan.md 6.10 error envelope")


class ResumeUploadView(APIView):
    """``POST``: accept PDFs and queue them; ``GET``: recent upload batches."""

    permission_classes = [IsAuthenticated, IsHrStaff]
    parser_classes = [MultiPartParser, FormParser]
    throttle_classes: list = []

    @extend_schema(
        operation_id="resumes_upload",
        summary="Upload resume PDFs (any number) and ingest them in the background",
        description=(
            "Multipart body with one or more `files` parts. Each PDF is validated, "
            "de-duplicated by content hash and queued through the ingestion pipeline "
            "(text extraction, parsing, candidate upsert, embeddings). Poll "
            "`GET /resumes/uploads/{batch_id}/` for per-file progress."
        ),
        request={"multipart/form-data": ResumeUploadRequestSerializer},
        responses={202: IntakeResultSerializer, 400: ERROR_ENVELOPE, 403: ERROR_ENVELOPE},
        tags=["resumes"],
    )
    def post(self, request: Request) -> Response:
        files = request.FILES.getlist("files") or request.FILES.getlist("files[]")
        if not files:
            raise ValidationError({"files": ["Attach at least one PDF file."]})
        result = store_uploads(files, request.user)
        payload = {
            "batch_id": result.batch_id,
            "accepted": [item.as_dict() for item in result.accepted],
            "duplicates": [item.as_dict() for item in result.duplicates],
            "rejected": [item.as_dict() for item in result.rejected],
        }
        return Response(IntakeResultSerializer(payload).data, status=status.HTTP_202_ACCEPTED)

    @extend_schema(
        operation_id="resumes_upload_batches",
        summary="Recent upload batches with their per-status counts",
        parameters=[OpenApiParameter("limit", int)],
        responses={200: UploadBatchSummarySerializer(many=True)},
        tags=["resumes"],
    )
    def get(self, request: Request) -> Response:
        try:
            limit = max(1, min(50, int(request.query_params.get("limit", 10))))
        except ValueError:
            limit = 10
        return Response(UploadBatchSummarySerializer(recent_batches(limit), many=True).data)


class UploadBatchView(APIView):
    permission_classes = [IsAuthenticated, IsHrStaff]
    throttle_classes: list = []

    @extend_schema(
        operation_id="resumes_upload_batch",
        summary="Progress of one upload batch: every file with its status, reason and candidate",
        responses={200: UploadBatchSerializer, 404: ERROR_ENVELOPE},
        tags=["resumes"],
    )
    def get(self, request: Request, batch_id: UUID) -> Response:
        payload = batch_status(batch_id)
        if payload is None:
            raise NotFound("No upload batch with this id.")
        return Response(UploadBatchSerializer(payload, context={"request": request}).data)
