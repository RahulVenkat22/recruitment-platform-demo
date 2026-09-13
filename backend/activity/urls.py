"""Routes owned by the activity app: ``activities/`` (plan.md 6.10)."""

from django.urls import path

from activity.views import ActivityListView

urlpatterns = [
    path("activities/", ActivityListView.as_view(), name="activities"),
]
