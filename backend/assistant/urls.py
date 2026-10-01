"""Routes owned by the assistant app: ``assistant/chat/`` and ``assistant/actions/``."""

from django.urls import path, re_path

from assistant.views import AssistantActionView, AssistantChatView

urlpatterns = [
    path("assistant/chat/", AssistantChatView.as_view(), name="assistant-chat"),
    re_path(
        r"^assistant/actions/(?P<step_id>[0-9a-f-]{36})/(?P<decision>confirm|cancel)/$",
        AssistantActionView.as_view(),
        name="assistant-action",
    ),
]
