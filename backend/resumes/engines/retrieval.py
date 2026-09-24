"""pgvector similarity search over resume chunks, aggregated per candidate.

Several query vectors (the JD's title + skills, the ideal-candidate summary,
the planner's focused queries) each fetch their nearest chunks; the lists are
fused with reciprocal rank fusion and grouped by candidate, so a person with
three strong chunks outranks one lucky paragraph. Candidates whose structured
skills cover the must-haves are added as a floor, which keeps exact-keyword
matches in the pool even when the embedding missed them.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field

from django.db.models import Count
from pgvector.django import CosineDistance

from candidates.models import CandidateSkill
from resumes.models import ResumeChunk, ResumeStatus

RRF_K = 60
EVIDENCE_PER_CANDIDATE = 3
EXCERPT_CHARS = 420


@dataclass(frozen=True)
class ChunkHit:
    chunk_id: str
    candidate_id: str
    section: str
    content: str
    similarity: float


@dataclass
class Evidence:
    section: str
    excerpt: str
    similarity: float

    def as_dict(self) -> dict:
        return {
            "section": self.section,
            "excerpt": self.excerpt,
            "similarity": round(self.similarity, 3),
        }


@dataclass
class RetrievedCandidate:
    candidate_id: str
    score: float = 0.0
    best_similarity: float = 0.0
    hits: int = 0
    skill_coverage: float = 0.0
    evidence: list[Evidence] = field(default_factory=list)

    def as_dict(self) -> dict:
        return {
            "retrieval_score": round(self.score, 4),
            "best_similarity": round(self.best_similarity, 4),
            "hits": self.hits,
            "skill_coverage": round(self.skill_coverage, 3),
            "evidence": [item.as_dict() for item in self.evidence],
        }


def _excerpt(content: str) -> str:
    # Drop the "Name — Section" header line the chunk was embedded with.
    body = content.split("\n", 1)[1] if "\n" in content else content
    body = " ".join(body.split())
    return body[:EXCERPT_CHARS] + ("…" if len(body) > EXCERPT_CHARS else "")


def nearest_chunks(
    vector: list[float], *, limit: int, candidate_id=None, candidate_ids=None
) -> list[ChunkHit]:
    """The chunks closest to ``vector``, optionally within one candidate or a set of them."""
    qs = ResumeChunk.objects.filter(document__status=ResumeStatus.PARSED)
    if candidate_id is not None:
        qs = qs.filter(candidate_id=candidate_id)
    if candidate_ids is not None:
        qs = qs.filter(candidate_id__in=list(candidate_ids))
    rows = (
        qs.annotate(distance=CosineDistance("embedding", vector))
        .order_by("distance")
        .values_list("id", "candidate_id", "section", "content", "distance")[:limit]
    )
    return [
        ChunkHit(str(chunk_id), str(cand_id), section, content, 1.0 - float(distance))
        for chunk_id, cand_id, section, content, distance in rows
    ]


def fuse(hit_lists: list[list[ChunkHit]], *, k: int = RRF_K) -> dict[str, RetrievedCandidate]:
    """Reciprocal rank fusion across query result lists, aggregated per candidate."""
    pool: dict[str, RetrievedCandidate] = {}
    best_chunks: dict[str, dict[str, ChunkHit]] = defaultdict(dict)
    for hits in hit_lists:
        seen_in_query: set[str] = set()
        for rank, hit in enumerate(hits, start=1):
            entry = pool.setdefault(
                hit.candidate_id, RetrievedCandidate(candidate_id=hit.candidate_id)
            )
            entry.score += 1.0 / (k + rank)
            entry.best_similarity = max(entry.best_similarity, hit.similarity)
            if hit.candidate_id not in seen_in_query:
                entry.hits += 1
                seen_in_query.add(hit.candidate_id)
            current = best_chunks[hit.candidate_id].get(hit.chunk_id)
            if current is None or hit.similarity > current.similarity:
                best_chunks[hit.candidate_id][hit.chunk_id] = hit
    for candidate_id, entry in pool.items():
        top = sorted(best_chunks[candidate_id].values(), key=lambda h: -h.similarity)
        entry.evidence = [
            Evidence(section=hit.section, excerpt=_excerpt(hit.content), similarity=hit.similarity)
            for hit in top[:EVIDENCE_PER_CANDIDATE]
        ]
    if pool:
        top_score = max(entry.score for entry in pool.values())
        for entry in pool.values():
            entry.score = entry.score / top_score if top_score else 0.0
    return pool


def skill_coverage(skill_keys: list[str], *, limit: int) -> dict[str, float]:
    """``{candidate_id: fraction of skill_keys the candidate lists}`` for resume candidates."""
    if not skill_keys:
        return {}
    rows = (
        CandidateSkill.objects.filter(
            skill__in=skill_keys,
            candidate__resume_documents__status=ResumeStatus.PARSED,
        )
        .values("candidate_id")
        .annotate(matched=Count("skill", distinct=True))
        .order_by("-matched")[:limit]
    )
    return {str(row["candidate_id"]): row["matched"] / len(skill_keys) for row in rows}


def search_candidates(
    query_vectors: list[list[float]],
    *,
    required_skills: list[str],
    chunks_per_query: int,
    limit: int,
) -> list[RetrievedCandidate]:
    """Hybrid retrieval: fused vector hits plus a structured-skill floor, best first."""
    hit_lists = [nearest_chunks(vector, limit=chunks_per_query) for vector in query_vectors]
    pool = fuse(hit_lists)
    coverage = skill_coverage(required_skills, limit=max(limit * 3, 50))
    for candidate_id, fraction in coverage.items():
        entry = pool.setdefault(candidate_id, RetrievedCandidate(candidate_id=candidate_id))
        entry.skill_coverage = fraction
    for entry in pool.values():
        # Vector evidence carries the ranking; skill coverage lifts exact matches
        # (0.35 of the scale at full coverage) and seeds candidates the vectors missed.
        entry.score = (
            min(1.0, 0.65 * entry.score + 0.35 * entry.skill_coverage)
            if entry.hits
            else 0.35 * entry.skill_coverage
        )
    ranked = sorted(pool.values(), key=lambda entry: (-entry.score, -entry.best_similarity))
    return [entry for entry in ranked if entry.score > 0][:limit]


def evidence_for(
    candidate_id, vector: list[float], *, limit: int = EVIDENCE_PER_CANDIDATE
) -> list[Evidence]:
    """The candidate's own chunks closest to the job, for the evaluator's prompt."""
    return [
        Evidence(section=hit.section, excerpt=_excerpt(hit.content), similarity=hit.similarity)
        for hit in nearest_chunks(vector, limit=limit, candidate_id=candidate_id)
    ]


def has_resume_chunks(candidate_id) -> bool:
    return ResumeChunk.objects.filter(
        candidate_id=candidate_id, document__status=ResumeStatus.PARSED
    ).exists()


def any_resume_chunks(candidate_ids) -> bool:
    return ResumeChunk.objects.filter(
        candidate_id__in=list(candidate_ids), document__status=ResumeStatus.PARSED
    ).exists()


def library_size() -> int:
    return (
        ResumeChunk.objects.filter(document__status=ResumeStatus.PARSED).aggregate(
            n=Count("candidate_id", distinct=True)
        )["n"]
        or 0
    )
