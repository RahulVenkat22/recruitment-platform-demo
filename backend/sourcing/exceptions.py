"""Sourcing rule violations in the plan.md 6.10 error envelope."""

from __future__ import annotations

from rest_framework import status
from rest_framework.exceptions import APIException


class UnknownSource(APIException):
    status_code = status.HTTP_400_BAD_REQUEST
    default_detail = "One of the requested candidate sources is not configured."
    default_code = "unknown_source"


class NoSourcesSelected(APIException):
    status_code = status.HTTP_400_BAD_REQUEST
    default_detail = "Select at least one candidate source."
    default_code = "no_sources_selected"


class JobNotSearchable(APIException):
    status_code = status.HTTP_409_CONFLICT
    default_detail = "Candidates can only be searched for open or on-hold job descriptions."
    default_code = "job_not_searchable"


class SearchNotRunning(APIException):
    status_code = status.HTTP_409_CONFLICT
    default_detail = "Only a search that is still running can be cancelled."
    default_code = "search_not_running"


class SearchCancelled(Exception):
    """Raised inside the worker when the run's row is gone: someone cancelled it."""
