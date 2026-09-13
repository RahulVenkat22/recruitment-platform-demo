"""``RuleBasedEngine``: the weighted, explainable v1 matcher of plan.md 6.6.

Every component scores 0..100; the overall percentage is the weighted sum.
Pure Python (profiles in, result out), so it runs the same in the API, the
seeder and a notebook.
"""

from __future__ import annotations

import re
from statistics import fmean

from matching.engine import WEIGHTS, CandidateProfile, JDProfile, MatchResult
from matching.explain import build_gaps, build_strengths

ENGINE_NAME = "rule_based"
ENGINE_VERSION = "1.0"

# Adjacent domains score 60 instead of 20 (plan.md 6.6 domain row).
_ADJACENT_PAIRS: tuple[tuple[str, str], ...] = (
    ("fintech", "banking"),
    ("healthcare", "pharma"),
    ("ecommerce", "retail"),
    ("saas", "enterprise software"),
)
ADJACENT_DOMAINS: dict[str, frozenset[str]] = {}
for _left, _right in _ADJACENT_PAIRS:
    ADJACENT_DOMAINS.setdefault(_left, frozenset())
    ADJACENT_DOMAINS[_left] = ADJACENT_DOMAINS[_left] | {_right}
    ADJACENT_DOMAINS.setdefault(_right, frozenset())
    ADJACENT_DOMAINS[_right] = ADJACENT_DOMAINS[_right] | {_left}

STOPWORDS: frozenset[str] = frozenset(
    """
    a about above across after again against all also an and any are around as at be because
    been before being below between both but by can could did do does doing down during each
    etc few for from further had has have having he her here hers herself him himself his how
    i if in into is it its itself just let may me might more most must my myself no nor not
    now of off on once only or other our ours ourselves out over own per same shall she should
    so some such than that the their theirs them themselves then there these they this those
    through to too under until up us use used using very was we were what when where which
    while who whom why will with within without would you your yours yourself yourselves
    ability able across strong good great excellent solid proven years year experience
    experienced work working team teams role roles day new high end level levels including
    include includes ensure ensuring help helping take taking part join keep keeping own owning
    """.split()
)
_TOKEN = re.compile(r"[a-z0-9][a-z0-9+#.\-]*")
_LEVEL_PATTERNS: tuple[tuple[int, re.Pattern[str]], ...] = (
    (3, re.compile(r"\b(ph\.?\s?d|doctor(?:ate|al))\b", re.IGNORECASE)),
    (
        2,
        re.compile(
            r"\b(m\.?\s?tech|m\.?\s?e|m\.?\s?sc|mca|mba|m\.?\s?s|master'?s?|post\s?graduate)\b",
            re.IGNORECASE,
        ),
    ),
    (
        1,
        re.compile(
            r"\b(b\.?\s?tech|b\.?\s?e|b\.?\s?sc|bca|b\.?\s?a|bachelor'?s?|graduate|degree)\b",
            re.IGNORECASE,
        ),
    ),
)


def stem(token: str) -> str:
    """A light suffix stemmer: "services" -> "servic", "mentoring" -> "mentor", "apis" -> "api"."""
    if len(token) > 4 and token.endswith("ies"):
        return token[:-3] + "y"
    for suffix in ("ing", "ed", "es", "s"):
        if len(token) - len(suffix) >= 4 and token.endswith(suffix) and not token.endswith("ss"):
            return token[: -len(suffix)]
    return token


def tokenize(text: str) -> set[str]:
    """Lowercase, stemmed word tokens of three or more characters, minus stopwords."""
    tokens: set[str] = set()
    for raw in _TOKEN.findall((text or "").lower()):
        token = raw.strip(".-")
        if len(token) < 3 or token in STOPWORDS:
            continue
        tokens.add(stem(token))
    return tokens


def degree_level(text: str) -> int:
    """3 for a doctorate, 2 for a master's, 1 for a bachelor's, 0 when unspecified."""
    for level, pattern in _LEVEL_PATTERNS:
        if pattern.search(text or ""):
            return level
    return 0


class RuleBasedEngine:
    name = ENGINE_NAME
    version = ENGINE_VERSION

    def __init__(self, weights: dict[str, int] | None = None) -> None:
        self.weights = dict(weights or WEIGHTS)

    # ------------------------------------------------------------ components

    @staticmethod
    def required_component(jd: JDProfile, candidate: CandidateProfile):
        matched: list[str] = []
        missing: list[str] = []
        points: list[float] = []
        for key in jd.required_skills:
            skill = candidate.skill(key)
            if skill is None:
                missing.append(key)
                points.append(0.0)
            else:
                matched.append(key)
                points.append(1.0 if skill.proficiency >= 3 else 0.7)
        score = fmean(points) * 100 if points else 100.0
        return score, matched, missing

    @staticmethod
    def preferred_component(jd: JDProfile, candidate: CandidateProfile):
        matched = [key for key in jd.preferred_skills if candidate.skill(key) is not None]
        if not jd.preferred_skills:
            return 100.0, matched
        return len(matched) / len(jd.preferred_skills) * 100, matched

    @staticmethod
    def experience_component(jd: JDProfile, candidate: CandidateProfile) -> float:
        years = candidate.total_experience_years
        if years < jd.experience_min:
            return max(0.0, 100 - 25 * (jd.experience_min - years))
        if years > jd.experience_max:
            return max(60.0, 100 - 10 * (years - jd.experience_max))
        return 100.0

    @staticmethod
    def responsibility_component(jd: JDProfile, candidate: CandidateProfile) -> float:
        jd_tokens = tokenize(jd.responsibilities)
        if not jd_tokens:
            return 100.0
        for key in (*jd.required_skills, *jd.preferred_skills):
            jd_tokens |= tokenize(key)
        candidate_text = " ".join(
            [
                candidate.summary,
                *(f"{exp.title} {exp.description}" for exp in candidate.experiences),
                *(skill.display_name for skill in candidate.skills),
            ]
        )
        candidate_tokens = tokenize(candidate_text)
        for skill in candidate.skills:
            candidate_tokens |= tokenize(skill.key)
        overlap = len(jd_tokens & candidate_tokens) / len(jd_tokens)
        return min(100.0, overlap * 150)

    @staticmethod
    def domain_component(jd: JDProfile, candidate: CandidateProfile) -> float:
        if not jd.domain:
            return 100.0
        wanted = jd.domain.lower()
        domains = {(exp.domain or "").lower() for exp in candidate.experiences if exp.domain}
        if wanted in domains:
            return 100.0
        if domains & ADJACENT_DOMAINS.get(wanted, frozenset()):
            return 60.0
        return 20.0

    @staticmethod
    def education_component(jd: JDProfile, candidate: CandidateProfile) -> tuple[float, int]:
        required = degree_level(jd.education_requirements)
        if required == 0:
            return 100.0, 0
        candidate_level = max((degree_level(degree) for degree in candidate.degrees), default=0)
        if candidate_level == 0:
            score = 20.0
        elif candidate_level >= required:
            score = 100.0
        elif required - candidate_level == 1:
            score = 50.0
        else:
            score = 20.0
        required_tokens: set[str] = set()
        for key in jd.required_skills:
            required_tokens |= tokenize(key)
        for cert in candidate.certifications:
            if tokenize(cert) & required_tokens:
                score = min(100.0, score + 10)
                break
        return score, required

    # ----------------------------------------------------------------- score

    def score(self, jd: JDProfile, candidate: CandidateProfile) -> MatchResult:
        required_score, matched_required, missing_required = self.required_component(jd, candidate)
        preferred_score, matched_preferred = self.preferred_component(jd, candidate)
        experience_score = self.experience_component(jd, candidate)
        responsibility_score = self.responsibility_component(jd, candidate)
        domain_score = self.domain_component(jd, candidate)
        education_score, required_level = self.education_component(jd, candidate)

        weights = self.weights
        overall = (
            weights["required"] * required_score
            + weights["preferred"] * preferred_score
            + weights["experience"] * experience_score
            + weights["responsibilities"] * responsibility_score
            + weights["domain"] * domain_score
            + weights["education"] * education_score
        ) / sum(weights.values())
        skills_weight = weights["required"] + weights["preferred"]
        skills_score = (
            weights["required"] * required_score + weights["preferred"] * preferred_score
        ) / skills_weight

        return MatchResult(
            overall_pct=round(overall, 2),
            skills_score=round(skills_score, 2),
            experience_score=round(experience_score, 2),
            education_score=round(education_score, 2),
            domain_score=round(domain_score, 2),
            responsibility_score=round(responsibility_score, 2),
            required_score=round(required_score, 2),
            preferred_score=round(preferred_score, 2),
            matched_required_skills=matched_required,
            missing_required_skills=missing_required,
            matched_preferred_skills=matched_preferred,
            strengths=build_strengths(
                jd,
                candidate,
                matched_required=matched_required,
                matched_preferred=matched_preferred,
                experience_score=experience_score,
                domain_score=domain_score,
            ),
            gaps=build_gaps(
                jd,
                candidate,
                matched_required=matched_required,
                missing_required=missing_required,
                domain_score=domain_score,
                education_score=education_score,
                required_level=required_level,
            ),
            engine=self.name,
            engine_version=self.version,
        )
