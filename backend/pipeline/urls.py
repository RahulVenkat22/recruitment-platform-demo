"""Routes owned by the pipeline app: ``sources/``, ``searches/``, ``applications/``,
``interviews/``, ``communications/``, ``offers/``, ``onboardings/`` (plan.md 6.10)."""

from django.urls import path
from rest_framework.routers import SimpleRouter

from pipeline.views import (
    ApplicationViewSet,
    CommunicationViewSet,
    EmailConfigView,
    InterviewViewSet,
    MessageTemplateViewSet,
    OfferViewSet,
    OnboardingViewSet,
    PhoneCallViewSet,
    SearchRunViewSet,
    SourcesView,
    VapiWebhookView,
)

router = SimpleRouter()
router.register("searches", SearchRunViewSet, basename="search")
router.register("applications", ApplicationViewSet, basename="application")
router.register("interviews", InterviewViewSet, basename="interview")
router.register("communications", CommunicationViewSet, basename="communication")
router.register("offers", OfferViewSet, basename="offer")
router.register("onboardings", OnboardingViewSet, basename="onboarding")
router.register("email/templates", MessageTemplateViewSet, basename="message-template")
router.register("calls", PhoneCallViewSet, basename="call")

urlpatterns = [
    path("sources/", SourcesView.as_view(), name="sources"),
    path("email/", EmailConfigView.as_view(), name="email-config"),
    path("calls/webhook/vapi/", VapiWebhookView.as_view(), name="vapi-webhook"),
    *router.urls,
]
