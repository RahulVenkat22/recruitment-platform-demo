"""``/assistant/chat/`` and ``/assistant/actions/{id}/confirm|cancel/``."""

from __future__ import annotations

from django.http import StreamingHttpResponse
from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.renderers import JSONRenderer
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from assistant.serializers import (
    AssistantAskSerializer,
    AssistantMessageSerializer,
    AssistantThreadSerializer,
)
from assistant.services import AssistantService
from pipeline.views import ERROR_ENVELOPE, EventStreamRenderer


class AssistantChatView(APIView):
    """The user's conversation with the assistant: ``GET`` the thread, ``POST`` an
    instruction (the turn streams back as server-sent events), ``DELETE`` to start over."""

    permission_classes = [IsAuthenticated]
    renderer_classes = [JSONRenderer, EventStreamRenderer]

    @extend_schema(
        operation_id="assistant_chat_retrieve",
        summary="The conversation with the assistant",
        responses={200: AssistantThreadSerializer},
        tags=["assistant"],
    )
    def get(self, request: Request) -> Response:
        thread = AssistantService.thread(request.user)
        return Response(AssistantThreadSerializer(thread).data)

    @extend_schema(
        operation_id="assistant_chat_ask",
        summary="Give the assistant an instruction; the turn streams back",
        description=(
            "The response is `text/event-stream`: `token` events carry the text as it is "
            "written, `step` events announce each action (running, then done, failed or "
            "pending), then `done` with the stored question and answer, or `error` with a "
            "message. A `pending` action waits for `POST /assistant/actions/{id}/confirm/`."
        ),
        request=AssistantAskSerializer,
        responses={
            200: OpenApiResponse(description="text/event-stream of token, step, done or error"),
            400: ERROR_ENVELOPE,
            503: ERROR_ENVELOPE,
        },
        tags=["assistant"],
    )
    def post(self, request: Request) -> StreamingHttpResponse:
        serializer = AssistantAskSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        stream = AssistantService.ask(request.user, serializer.validated_data["message"])
        response = StreamingHttpResponse(stream, content_type="text/event-stream; charset=utf-8")
        response["Cache-Control"] = "no-cache"
        response["X-Accel-Buffering"] = "no"
        return response

    @extend_schema(
        operation_id="assistant_chat_clear",
        summary="Forget the conversation",
        responses={204: None},
        tags=["assistant"],
    )
    def delete(self, request: Request) -> Response:
        AssistantService.clear(request.user)
        return Response(status=status.HTTP_204_NO_CONTENT)


class AssistantActionView(APIView):
    """Confirm or cancel an action the assistant left pending."""

    permission_classes = [IsAuthenticated]

    @extend_schema(
        operation_id="assistant_action_decide",
        summary="Run (confirm) or drop (cancel) a pending action",
        request=None,
        responses={200: AssistantMessageSerializer, 404: ERROR_ENVELOPE, 409: ERROR_ENVELOPE},
        tags=["assistant"],
    )
    def post(self, request: Request, step_id: str, decision: str) -> Response:
        if decision == "confirm":
            message = AssistantService.confirm(request.user, step_id)
        else:
            message = AssistantService.cancel(request.user, step_id)
        return Response(AssistantMessageSerializer(message).data)
