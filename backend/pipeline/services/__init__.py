"""Pipeline services (plan.md 6.1): status moves, interviews, communications,
offers and onboardings. ``PipelineService.transition`` is the only writer of
``Application.status``; the domain services call it for their side effects."""

from pipeline.services.calls import CallService
from pipeline.services.communications import CommunicationService
from pipeline.services.interviews import ROUND_STATUS, InterviewService
from pipeline.services.kanban import Board, BoardColumn, KanbanService
from pipeline.services.offers import OfferService, format_ctc
from pipeline.services.onboardings import OnboardingService, checklist_progress
from pipeline.services.outreach import (
    PLACEHOLDERS,
    PURPOSES,
    TONES,
    OutreachService,
    draft_email,
    email_config,
    recipient_for,
    render_template,
    render_text,
    set_default_template,
)
from pipeline.services.pipeline import Move, PipelineService, allowed_moves, find_move

__all__ = [
    "ROUND_STATUS",
    "CallService",
    "CommunicationService",
    "Board",
    "BoardColumn",
    "InterviewService",
    "KanbanService",
    "Move",
    "OfferService",
    "OnboardingService",
    "OutreachService",
    "PLACEHOLDERS",
    "PURPOSES",
    "TONES",
    "PipelineService",
    "allowed_moves",
    "checklist_progress",
    "draft_email",
    "email_config",
    "find_move",
    "format_ctc",
    "recipient_for",
    "render_template",
    "render_text",
    "set_default_template",
]
