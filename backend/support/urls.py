"""Routes owned by the support app: ``support/tickets/``."""

from rest_framework.routers import SimpleRouter

from support.views import TicketViewSet

router = SimpleRouter()
router.register("support/tickets", TicketViewSet, basename="support-ticket")

urlpatterns = router.urls
