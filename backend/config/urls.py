"""Root URL configuration: admin, the versioned API, and the OpenAPI schema and docs."""

from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/v1/", include(("config.api_router", "api-v1"), namespace="api-v1")),
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="docs"),
]

# Errors raised outside DRF (unknown URL, CSRF failure, unhandled exception) still
# answer in the plan.md 6.10 shape when the request targets the API.
handler400 = "common.views.bad_request"
handler403 = "common.views.permission_denied"
handler404 = "common.views.not_found"
handler500 = "common.views.server_error"
