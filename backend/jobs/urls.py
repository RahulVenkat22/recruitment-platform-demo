"""Routes owned by the jobs app: ``job-descriptions/`` and ``skills/`` (plan.md 6.10)."""

from django.urls import path
from rest_framework.routers import SimpleRouter

from jobs.views import JobDescriptionViewSet, SkillSuggestionView

router = SimpleRouter()
router.register("job-descriptions", JobDescriptionViewSet, basename="job-description")

urlpatterns = [
    path("skills/", SkillSuggestionView.as_view(), name="skills"),
    *router.urls,
]
