"""Routes owned by the dashboard app: ``meta/enums/``, ``meta/countries/`` and
``dashboard/*`` (plan.md 6.10)."""

from django.urls import path

from dashboard.views import (
    DashboardAttentionView,
    DashboardFunnelView,
    DashboardInterviewsView,
    DashboardPipelineView,
    DashboardSummaryView,
    DashboardTeamView,
    DashboardTrendsView,
    DashboardUpcomingInterviewsView,
    MetaCitiesView,
    MetaCountriesView,
    MetaEnumsView,
)

urlpatterns = [
    path("meta/enums/", MetaEnumsView.as_view(), name="meta-enums"),
    path("meta/countries/", MetaCountriesView.as_view(), name="meta-countries"),
    path("meta/countries/<str:code>/cities/", MetaCitiesView.as_view(), name="meta-cities"),
    path("dashboard/summary/", DashboardSummaryView.as_view(), name="dashboard-summary"),
    path("dashboard/trends/", DashboardTrendsView.as_view(), name="dashboard-trends"),
    path("dashboard/pipeline/", DashboardPipelineView.as_view(), name="dashboard-pipeline"),
    path("dashboard/funnel/", DashboardFunnelView.as_view(), name="dashboard-funnel"),
    path("dashboard/interviews/", DashboardInterviewsView.as_view(), name="dashboard-interviews"),
    path("dashboard/attention/", DashboardAttentionView.as_view(), name="dashboard-attention"),
    path("dashboard/team/", DashboardTeamView.as_view(), name="dashboard-team"),
    path(
        "dashboard/upcoming-interviews/",
        DashboardUpcomingInterviewsView.as_view(),
        name="dashboard-upcoming-interviews",
    ),
]
