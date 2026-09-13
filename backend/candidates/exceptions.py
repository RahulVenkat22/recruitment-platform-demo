"""Candidate rule violations in the plan.md 6.10 error envelope."""

from __future__ import annotations

from rest_framework import status
from rest_framework.exceptions import APIException


class DuplicateCandidate(APIException):
    status_code = status.HTTP_409_CONFLICT
    default_detail = "A candidate with this email or phone already exists."
    default_code = "duplicate_candidate"
