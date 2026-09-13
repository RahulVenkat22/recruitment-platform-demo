"""Read-side querysets shared by the pipeline views and the Kanban aggregation."""

from __future__ import annotations

from typing import Any

from django.db.models import Prefetch, QuerySet

from candidates.models import CandidateSkill, CandidateSource
from common.permissions import visible_job_descriptions_for
from jobs.models import RecruitmentParticipant
from pipeline.models import Application, Communication


def application_queryset(user: Any) -> QuerySet[Application]:
    """Applications on JDs visible to ``user`` with everything a ranked row renders."""
    visible = visible_job_descriptions_for(user).values("pk")
    participants = RecruitmentParticipant.objects.select_related("user")
    return (
        Application.objects.filter(job_description_id__in=visible)
        .select_related(
            "candidate",
            "owner",
            "job_description__created_by",
            "match",
            "search_run",
            "offer__created_by",
            "onboarding__buddy",
            "onboarding__hr_contact",
        )
        .prefetch_related(
            Prefetch(
                "candidate__skills",
                queryset=CandidateSkill.objects.order_by("-is_primary", "-proficiency"),
            ),
            Prefetch(
                "candidate__sources", queryset=CandidateSource.objects.order_by("discovered_at")
            ),
            Prefetch("job_description__participants", queryset=participants),
        )
    )


def with_next_actions(qs: QuerySet[Application]) -> QuerySet[Application]:
    """Prefetch the logged contacts that carry a next action, newest first, so a
    card can show "next action due" without a query per card."""
    return qs.prefetch_related(
        Prefetch(
            "communications",
            queryset=Communication.objects.filter(next_action_at__isnull=False).order_by(
                "-occurred_at"
            ),
            to_attr="pending_actions",
        )
    )
