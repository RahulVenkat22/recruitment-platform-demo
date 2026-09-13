"""``CandidateSourceProvider``: what every source (internal pool, referral inbox,
Naukri, LinkedIn) looks like to ``SearchService`` (plan.md 6.7)."""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import Iterator

from sourcing.dtos import NormalizedCandidate, ProviderHealth, SearchCriteria


class CandidateSourceProvider(ABC):
    key: str = ""
    display_name: str = ""

    @abstractmethod
    def search(self, criteria: SearchCriteria) -> Iterator[NormalizedCandidate]:
        """Yield up to ``criteria.limit`` candidates, most relevant first."""

    @abstractmethod
    def health(self) -> ProviderHealth:
        """Availability and the size of the pool behind this provider."""
