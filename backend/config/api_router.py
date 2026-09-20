"""Everything mounted under ``/api/v1/`` (plan.md section 6.10).

Each app owns ``backend/<app>/urls.py`` and builds its own DRF router or path
list there, so apps can be developed in parallel; registering an app here is a
one-line change. Prefixes are empty because the resource names already live at
the top level of ``/api/v1/`` (``/api/v1/job-descriptions/``,
``/api/v1/auth/login/``, ...).

Registration list, in the order of the API table in plan.md 6.10:

    common         health/                                    (registered below)
    accounts       auth/login|refresh|logout|me|change-password|forgot-password, users/
    jobs           job-descriptions/ (+ duplicate, publish, archive, unarchive, status,
                   versions, participants, metrics, kanban)
    pipeline       searches/, applications/, interviews/, communications/, offers/,
                   onboardings/
    candidates     candidates/ (+ resume-link)
    resumes        resumes/uploads/ (multi-file PDF intake and batch status)
    activity       activities/
    notifications  notifications/, notifications/unread-count/, notifications/read-all/
    dashboard      meta/enums/                                (registered below)
                   dashboard/summary|funnel|recent-activity|top-candidates|upcoming-interviews

To register an app, add ``path("", include("<app>.urls"))`` to ``urlpatterns``.
"""

from django.urls import include, path

urlpatterns = [
    path("", include("common.urls")),
    path("", include("accounts.urls")),
    path("", include("jobs.urls")),
    path("", include("activity.urls")),
    path("", include("pipeline.urls")),
    path("", include("candidates.urls")),
    path("", include("resumes.urls")),
    path("", include("notifications.urls")),
    path("", include("dashboard.urls")),
]
