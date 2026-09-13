"""Routes owned by the notifications app: ``notifications/`` (plan.md 6.10)."""

from rest_framework.routers import SimpleRouter

from notifications.views import NotificationViewSet

router = SimpleRouter()
router.register("notifications", NotificationViewSet, basename="notification")

urlpatterns = router.urls
