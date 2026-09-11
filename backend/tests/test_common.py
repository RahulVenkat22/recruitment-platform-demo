"""common.exceptions and common.pagination behave as plan.md 6.10 specifies."""

import pytest
from django.http import Http404
from rest_framework import serializers, status
from rest_framework.exceptions import NotFound, PermissionDenied, Throttled, ValidationError
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.test import APIRequestFactory
from rest_framework.views import APIView

from common.pagination import StandardPagination

factory = APIRequestFactory()


def _view_raising(exc):
    class RaisingView(APIView):
        permission_classes = [AllowAny]
        authentication_classes = []

        def get(self, request):
            raise exc

    return RaisingView.as_view()


class TitleSerializer(serializers.Serializer):
    title = serializers.CharField()


def test_validation_error_uses_the_plan_error_shape():
    serializer = TitleSerializer(data={})
    assert not serializer.is_valid()

    response = _view_raising(ValidationError(serializer.errors))(factory.get("/x/"))

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert response.data == {
        "error": {
            "code": "validation_error",
            "message": "Invalid input.",
            "details": {"title": ["This field is required."]},
        }
    }


def test_list_style_validation_errors_are_wrapped_as_non_field_errors():
    response = _view_raising(ValidationError(["Nope."]))(factory.get("/x/"))

    assert response.data["error"]["details"] == {"non_field_errors": ["Nope."]}


@pytest.mark.parametrize(
    ("exc", "expected_status", "expected_code", "expected_message"),
    [
        (NotFound(), 404, "not_found", "Not found."),
        (Http404("gone"), 404, "not_found", "Not found."),
        (
            PermissionDenied(),
            403,
            "permission_denied",
            "You do not have permission to perform this action.",
        ),
        (PermissionDenied("Owners only.", code="owners_only"), 403, "owners_only", "Owners only."),
    ],
)
def test_other_api_errors_use_the_same_shape(exc, expected_status, expected_code, expected_message):
    response = _view_raising(exc)(factory.get("/x/"))

    assert response.status_code == expected_status
    assert response.data == {
        "error": {"code": expected_code, "message": expected_message, "details": {}}
    }


def test_throttled_reports_wait_seconds_in_details():
    response = _view_raising(Throttled(wait=30))(factory.get("/x/"))

    assert response.status_code == 429
    assert response.data["error"]["code"] == "throttled"
    assert response.data["error"]["details"] == {"wait": 30}
    assert response["Retry-After"] == "30"


def test_unauthenticated_request_to_a_protected_view_uses_the_shape(db):
    class ProtectedView(APIView):
        def get(self, request):
            return Response({"ok": True})

    response = ProtectedView.as_view()(factory.get("/x/"))

    assert response.status_code == 401
    assert response.data["error"]["code"] == "not_authenticated"
    assert response.data["error"]["details"] == {}


def test_unknown_api_path_returns_the_json_error_shape(client):
    response = client.get("/api/v1/does-not-exist/")

    assert response.status_code == 404
    assert response["Content-Type"] == "application/json"
    assert response.json()["error"]["code"] == "not_found"


def test_standard_pagination_limits():
    paginator = StandardPagination()

    assert paginator.page_size == 20
    assert paginator.page_size_query_param == "page_size"
    assert paginator.max_page_size == 100
    assert paginator.get_page_size(Request(factory.get("/x/", {"page_size": 500}))) == 100
    assert paginator.get_page_size(Request(factory.get("/x/", {"page_size": 5}))) == 5
    assert paginator.get_page_size(Request(factory.get("/x/"))) == 20
