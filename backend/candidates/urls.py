"""Routes owned by the candidates app: ``candidates/`` (plan.md 6.10)."""

from rest_framework.routers import SimpleRouter

from candidates.views import CandidateViewSet

router = SimpleRouter()
router.register("candidates", CandidateViewSet, basename="candidate")

urlpatterns = router.urls
