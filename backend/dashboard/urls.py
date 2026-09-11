"""Routes owned by the dashboard app: meta/enums now, dashboard/* aggregates in phase 9."""

from django.urls import path

from dashboard.views import MetaEnumsView

urlpatterns = [
    path("meta/enums/", MetaEnumsView.as_view(), name="meta-enums"),
]
