"""Routes owned by the dashboard app: ``meta/enums/`` and ``dashboard/*`` (plan.md 6.10)."""

from django.urls import path

from dashboard.views import (
    DashboardFunnelView,
    DashboardRecentActivityView,
    DashboardSummaryView,
    DashboardTopCandidatesView,
    DashboardUpcomingInterviewsView,
    MetaEnumsView,
)

urlpatterns = [
    path("meta/enums/", MetaEnumsView.as_view(), name="meta-enums"),
    path("dashboard/summary/", DashboardSummaryView.as_view(), name="dashboard-summary"),
    path("dashboard/funnel/", DashboardFunnelView.as_view(), name="dashboard-funnel"),
    path(
        "dashboard/recent-activity/",
        DashboardRecentActivityView.as_view(),
        name="dashboard-recent-activity",
    ),
    path(
        "dashboard/top-candidates/",
        DashboardTopCandidatesView.as_view(),
        name="dashboard-top-candidates",
    ),
    path(
        "dashboard/upcoming-interviews/",
        DashboardUpcomingInterviewsView.as_view(),
        name="dashboard-upcoming-interviews",
    ),
]
