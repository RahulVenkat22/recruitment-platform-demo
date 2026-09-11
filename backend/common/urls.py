"""Routes owned by the common app: health now, meta/enums in phase 1."""

from django.urls import path

from common.views import HealthView

urlpatterns = [
    path("health/", HealthView.as_view(), name="health"),
]
