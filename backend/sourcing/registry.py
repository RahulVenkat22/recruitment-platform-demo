"""Provider registry (plan.md 6.7): ``CANDIDATE_SOURCE_PROVIDERS`` lists the keys
that are switched on; each key maps to a class path here."""

from __future__ import annotations

from django.conf import settings
from django.utils.module_loading import import_string

from sourcing.providers.base import CandidateSourceProvider

ALL_SOURCES = "all"

PROVIDER_CLASSES: dict[str, str] = {
    "internal": "sourcing.providers.database.InternalDatabaseProvider",
    "referral": "sourcing.providers.database.MockReferralProvider",
    "naukri": "sourcing.providers.database.MockNaukriProvider",
    "linkedin": "sourcing.providers.database.MockLinkedInProvider",
    "resume": "sourcing.providers.resume.ResumeLibraryProvider",
}


def provider_keys() -> list[str]:
    """Configured keys in settings order, ignoring anything without a class."""
    configured = getattr(settings, "CANDIDATE_SOURCE_PROVIDERS", list(PROVIDER_CLASSES))
    return [key for key in configured if key in PROVIDER_CLASSES]


def get_provider(key: str) -> CandidateSourceProvider:
    if key not in provider_keys():
        raise KeyError(key)
    return import_string(PROVIDER_CLASSES[key])()


def available_providers() -> list[CandidateSourceProvider]:
    return [get_provider(key) for key in provider_keys()]
