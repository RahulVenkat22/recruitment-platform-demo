"""Routes owned by the support app: ``support/tickets/`` and ``support/attachments/``."""

from django.urls import path
from rest_framework.routers import SimpleRouter

from support.views import TicketAttachmentView, TicketViewSet

router = SimpleRouter()
router.register("support/tickets", TicketViewSet, basename="support-ticket")

urlpatterns = [
    path(
        "support/attachments/<uuid:pk>/",
        TicketAttachmentView.as_view(),
        name="support-attachment",
    ),
    *router.urls,
]
