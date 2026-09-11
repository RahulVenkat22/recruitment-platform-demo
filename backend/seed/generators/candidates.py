"""About 180 candidates built from the pools (plan.md section 10 "Candidates").

Drafting is pure Python on the seeded RNG (``build_candidate_drafts``), so the
shape of the population can be inspected without a database; ``persist_candidates``
bulk-inserts the drafts and their child rows.

Population
----------
* four scripted candidates for the Senior Python Developer JD: John Doe (the
  prompt's 95% match and journey) plus Jane Smith, Alex Kumar and David Raj from
  the prompt's ranking table;
* ``CANDIDATES_PER_FAMILY`` candidates per JD whose skills are sampled from that
  JD's role pool with a stratified "fit" so match scores later spread from
  roughly 40% to 97%;
* ``SHARED_POOL_SIZE`` generalists whose skills straddle two role pools.
"""

from __future__ import annotations

import math
import re
from collections import deque
from collections.abc import Callable, Sequence
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta
from decimal import Decimal
from itertools import combinations
from random import Random

from accounts.models import User
from candidates.models import (
    Candidate,
    CandidateCertification,
    CandidateEducation,
    CandidateExperience,
    CandidateSkill,
    CandidateSource,
)
from common.enums import CandidateSource as SourceKey
from common.enums import UserRole
from matching.skills import display_name, normalize_skill
from seed.context import SeedContext
from seed.pools import journey, people, text
from seed.pools import skills as skill_pools
from seed.pools.jobs import JOBS, JobSpec
from seed.pools.users import LAKSHMI, USERS

CANDIDATES_PER_FAMILY = 28
SHARED_POOL_SIZE = 8
SINGLE_SOURCE_SHARE = 0.4  # the rest have two sources (plan.md 10)
NO_AVATAR_SHARE = 0.08  # exercises the initials fallback
JD_DOMAIN_SHARE = 0.4  # candidates with a stint in the JD's domain
JD_CITY_SHARE = 0.4
MIN_STINT_MONTHS = 6
# A stint carries one title, so one employer for longer than this would read as an
# unchanged title for years; the split forces a job change instead.
MAX_STINT_MONTHS = 72
MAX_STINTS = 3
RESUME_BASE_URL = "https://files.aimious.demo/resumes"

_SOURCE_PAIRS: tuple[tuple[str, str], ...] = tuple(combinations(SourceKey.values, 2))
_PORTRAIT_INDEX = re.compile(r"/(\d+)\.jpg$")
_NON_ALNUM = re.compile(r"[^a-z0-9]")
_CITY_WEIGHTS = {
    "Chennai": 18,
    "Bengaluru": 22,
    "Hyderabad": 14,
    "Pune": 12,
    "Mumbai": 10,
    "Delhi NCR": 8,
    "Kolkata": 4,
    "Coimbatore": 4,
    "Kochi": 4,
    "Ahmedabad": 4,
}
_CTC_MULTIPLIER = {
    "backend": 1.0,
    "frontend": 0.95,
    "ai_ml": 1.3,
    "data_science": 1.1,
    "devops": 1.0,
    "qa": 0.8,
}
_QUANT_FAMILIES = frozenset({"ai_ml", "data_science"})

# ---------------------------------------------------------------------- drafts


@dataclass
class SkillDraft:
    key: str
    display: str
    proficiency: int
    years: float | None
    is_primary: bool = False


@dataclass
class ExperienceDraft:
    company: str
    title: str
    domain: str | None
    start_date: date
    end_date: date | None
    is_current: bool
    description: str


@dataclass
class EducationDraft:
    degree: str
    field: str
    institution: str
    start_year: int
    end_year: int
    grade: str | None = None


@dataclass
class CertificationDraft:
    name: str
    issuer: str
    issued_year: int
    credential_url: str | None = None


@dataclass
class SourceDraft:
    source: str
    source_reference: str
    discovered_at: datetime
    referred_by_email: str | None = None


@dataclass
class CandidateDraft:
    full_name: str
    email: str
    phone: str
    gender: str
    family: str
    location: str
    avatar_url: str | None
    current_company: str
    current_title: str
    total_experience_years: float
    summary: str
    resume_text: str
    notice_period_days: int
    current_ctc: int
    expected_ctc: int
    skills: list[SkillDraft]
    experiences: list[ExperienceDraft]
    education: list[EducationDraft]
    certifications: list[CertificationDraft]
    sources: list[SourceDraft] = field(default_factory=list)
    linkedin_url: str | None = None
    github_url: str | None = None
    created_at: datetime | None = None  # first discovery; set once sources are known

    @property
    def headline(self) -> str:
        return f"{self.current_title} at {self.current_company}"

    @property
    def resume_url(self) -> str | None:
        """Placeholder link for the resume text; names are unique so the slug is too."""
        if not self.resume_text:
            return None
        slug = "-".join(_NON_ALNUM.sub("", part.lower()) for part in self.full_name.split())
        return f"{RESUME_BASE_URL}/{slug}.pdf"


# ------------------------------------------------------------------ entrypoint


def seed_candidates(ctx: SeedContext, users: dict[str, User]) -> list[Candidate]:
    return persist_candidates(build_candidate_drafts(ctx), users)


def build_candidate_drafts(ctx: SeedContext) -> list[CandidateDraft]:
    """Every candidate as plain data, scripted ones first, in a deterministic order."""
    rng = ctx.rng
    registry = _Registry(rng)
    scripted = [_john_doe(ctx), *_ranked_examples(ctx)]
    for draft in scripted:
        registry.reserve(draft)

    generated: list[CandidateDraft] = []
    for spec in JOBS:
        for fit in _stratified_fits(rng, CANDIDATES_PER_FAMILY):
            generated.append(_generated(ctx, registry, spec, fit))
    for _ in range(SHARED_POOL_SIZE):
        primary, secondary = rng.sample(JOBS, 2)
        generated.append(_generated(ctx, registry, primary, rng.uniform(0.3, 0.8), secondary))
    _assign_sources(ctx, generated)
    return scripted + generated


# -------------------------------------------------------------------- registry


class _Registry:
    """Uniqueness bookkeeping: names, emails, phones and portrait indices."""

    def __init__(self, rng: Random) -> None:
        self.names: set[str] = {user.full_name for user in USERS}
        self.emails: set[str] = {user.email for user in USERS}
        self.phones: set[str] = {user.phone for user in USERS}
        taken = {"male": set(), "female": set()}
        for user in USERS:
            if user.avatar_url:
                taken[user.gender].add(_portrait_index(user.avatar_url))
        taken[journey.JOHN_DOE.gender].add(_portrait_index(journey.JOHN_DOE.avatar_url))
        self.portraits: dict[str, deque[int]] = {}
        for gender, used in taken.items():
            free = [index for index in range(people.PORTRAIT_COUNT) if index not in used]
            rng.shuffle(free)
            self.portraits[gender] = deque(free)

    def reserve(self, draft: CandidateDraft) -> None:
        self.names.add(draft.full_name)
        self.emails.add(draft.email)
        self.phones.add(draft.phone)
        if draft.avatar_url:
            gender_queue = self.portraits[draft.gender]
            index = _portrait_index(draft.avatar_url)
            if index in gender_queue:
                gender_queue.remove(index)

    def unique_name(self, rng: Random, gender: str) -> tuple[str, str]:
        first_names = people.MALE_FIRST_NAMES if gender == "male" else people.FEMALE_FIRST_NAMES
        while True:
            first, last = rng.choice(first_names), rng.choice(people.LAST_NAMES)
            if f"{first} {last}" not in self.names:
                self.names.add(f"{first} {last}")
                return first, last

    def unique_email(self, rng: Random, first: str, last: str) -> str:
        first_key, last_key = _NON_ALNUM.sub("", first.lower()), _NON_ALNUM.sub("", last.lower())
        patterns = (
            f"{first_key}.{last_key}",
            f"{first_key}{last_key}",
            f"{first_key}.{last_key}{rng.randint(1, 99)}",
            f"{first_key}_{last_key[0]}",
            f"{first_key[0]}{last_key}",
            f"{first_key}{rng.randint(1980, 2001)}",
        )
        local = rng.choice(patterns)
        domain = rng.choice(people.EMAIL_DOMAINS)
        email = f"{local}@{domain}"
        while email in self.emails:
            email = f"{local}{rng.randint(1, 999)}@{domain}"
        self.emails.add(email)
        return email

    def unique_phone(self, rng: Random) -> str:
        while True:
            phone = (
                f"+91 {rng.randint(6, 9)}{rng.randint(1000, 9999):04d} {rng.randint(0, 99999):05d}"
            )
            if phone not in self.phones:
                self.phones.add(phone)
                return phone

    def portrait(self, gender: str) -> str:
        queue = self.portraits[gender]
        index = queue.popleft()
        queue.append(index)  # wraps once every free portrait has been used
        return people.portrait_url(gender, index)


def _portrait_index(url: str) -> int:
    match = _PORTRAIT_INDEX.search(url)
    if match is None:
        raise ValueError(f"not a portrait url: {url!r}")
    return int(match.group(1))


# ---------------------------------------------------------------- generation


def _stratified_fits(rng: Random, count: int) -> list[float]:
    """``count`` fit values covering [0, 1) evenly, in random order."""
    fits = [(index + rng.random()) / count for index in range(count)]
    rng.shuffle(fits)
    return fits


def _generated(
    ctx: SeedContext,
    registry: _Registry,
    spec: JobSpec,
    fit: float,
    secondary: JobSpec | None = None,
) -> CandidateDraft:
    rng = ctx.rng
    family = spec.role_family
    gender = "male" if rng.random() < 0.56 else "female"
    first, last = registry.unique_name(rng, gender)
    email = registry.unique_email(rng, first, last)
    phone = registry.unique_phone(rng)
    avatar_url = None if rng.random() < NO_AVATAR_SHARE else registry.portrait(gender)
    city = _pick_city(rng, spec)

    total_years = _total_years(rng, spec, fit)
    skills = _skills(rng, spec, fit, total_years, secondary)
    experiences = _experiences(ctx, spec, total_years, skills)
    career_start_year = experiences[0].start_date.year
    education = _education(rng, family, career_start_year)
    certifications = _certifications(ctx, skills, career_start_year)
    current_ctc, expected_ctc = _compensation(rng, family, total_years)

    draft = CandidateDraft(
        full_name=f"{first} {last}",
        email=email,
        phone=phone,
        gender=gender,
        family=family,
        location=people.location_label(city),
        avatar_url=avatar_url,
        current_company=experiences[-1].company,
        current_title=experiences[-1].title,
        total_experience_years=total_years,
        summary="",
        resume_text="",
        notice_period_days=rng.choices((0, 15, 30, 45, 60, 90), (8, 12, 40, 15, 20, 5))[0],
        current_ctc=current_ctc,
        expected_ctc=expected_ctc,
        skills=skills,
        experiences=experiences,
        education=education,
        certifications=certifications,
    )
    values = template_values(draft, city.name)
    draft.summary = rng.choice(text.SUMMARY_TEMPLATES[family]).format(**values)
    draft.resume_text = _resume(rng, draft, values)
    return draft


def _pick_city(rng: Random, spec: JobSpec) -> people.City:
    jd_city = people.CITIES_BY_NAME.get(spec.location)
    if jd_city is not None and rng.random() < JD_CITY_SHARE:
        return jd_city
    return rng.choices(people.CITIES, [_CITY_WEIGHTS[city.name] for city in people.CITIES])[0]


def _total_years(rng: Random, spec: JobSpec, fit: float) -> float:
    """Years of experience, in half years; strong fits land inside the JD's range."""
    low, high = spec.experience_min_years, spec.experience_max_years
    if fit >= 0.7:
        years = rng.uniform(low, high)
    elif fit >= 0.4:
        years = rng.uniform(max(1.0, low - 2), high + 3)
    else:
        years = rng.uniform(1.0, high + 6)
    return max(1.0, round(years * 2) / 2)


# ---------------------------------------------------------------------- skills


def _tier_multiplier(tier: str, fit: float) -> float:
    """Scale a pool weight by fit: strong fits draw core skills, weak fits stray ones."""
    if tier == "core":
        return 0.4 + 2.2 * fit
    if tier == "adjacent":
        return 1.3 - 0.7 * fit
    return 2.2 - 2.0 * fit


def _required_count(rng: Random, fit: float, total: int) -> int:
    if fit >= 0.9:
        return total
    return max(0, min(total, round(fit * total + rng.uniform(-0.5, 0.5))))


def _skills(
    rng: Random,
    spec: JobSpec,
    fit: float,
    total_years: float,
    secondary: JobSpec | None = None,
) -> list[SkillDraft]:
    pool: dict[str, tuple[skill_pools.SkillWeight, float]] = {}
    for entry in skill_pools.ROLE_SKILL_POOLS[spec.title]:
        key = normalize_skill(entry.display)
        pool[key] = (entry, entry.weight * _tier_multiplier(entry.tier, fit))
    if secondary is not None:
        for entry in skill_pools.ROLE_SKILL_POOLS[secondary.title]:
            key = normalize_skill(entry.display)
            if entry.tier == "core" and key not in pool:
                pool[key] = (entry, entry.weight * 0.6)

    required = list(spec.required_skills)
    chosen = rng.sample(required, _required_count(rng, fit, len(required)))
    wanted = rng.randint(6, 9) if fit >= 0.6 else rng.randint(4, 8)
    wanted = max(wanted, len(chosen) + 1)
    remaining = [key for key in pool if key not in chosen]
    chosen += _weighted_sample(rng, remaining, lambda key: pool[key][1], wanted - len(chosen))

    drafts: list[SkillDraft] = []
    for key in chosen:
        entry = pool[key][0]
        proficiency = _proficiency(rng, entry.tier, fit)
        drafts.append(
            SkillDraft(
                key, display_name(key), proficiency, _skill_years(rng, total_years, proficiency)
            )
        )
    drafts.sort(key=lambda skill: (-skill.proficiency, -pool[skill.key][1]))
    _mark_primary(drafts, lambda skill: pool[skill.key][0].tier)
    return drafts


def _mark_primary(drafts: list[SkillDraft], tier_of: Callable[[SkillDraft], str]) -> None:
    """Flag the strongest two or three skills as primary and move them to the front.

    Stray-tier skills (a Data Scientist's React) only qualify when fewer than two
    core or adjacent skills exist, so summaries lead with the skills of the role.
    ``drafts`` must already be sorted strongest first.
    """
    count = 3 if len(drafts) >= 7 else 2
    eligible = [skill for skill in drafts if tier_of(skill) != "stray"]
    if len(eligible) < 2:
        eligible = drafts
    for skill in eligible[:count]:
        skill.is_primary = True
    drafts.sort(key=lambda skill: not skill.is_primary)  # stable: keeps strength order


def _proficiency(rng: Random, tier: str, fit: float) -> int:
    if tier == "core":
        if fit >= 0.75:
            return rng.randint(4, 5)
        if fit >= 0.5:
            return rng.randint(3, 5)
        if fit >= 0.25:
            return rng.randint(2, 4)
        return rng.randint(1, 3)
    if tier == "adjacent":
        return rng.randint(2, 4)
    return rng.randint(1, 3)


def _skill_years(rng: Random, total_years: float, proficiency: int) -> float:
    low, high = {5: (0.7, 1.0), 4: (0.5, 0.9), 3: (0.3, 0.7), 2: (0.15, 0.5), 1: (0.1, 0.3)}[
        proficiency
    ]
    years = min(total_years, total_years * rng.uniform(low, high))
    return max(0.5, round(years * 2) / 2)


def _weighted_sample[T](
    rng: Random, items: Sequence[T], weight_of: Callable[[T], float], count: int
) -> list[T]:
    """Weighted sampling without replacement (Efraimidis-Spirakis keys)."""
    count = min(count, len(items))
    if count <= 0:
        return []
    keyed = sorted(items, key=lambda item: -(rng.random() ** (1.0 / weight_of(item))))
    return keyed[:count]


# ----------------------------------------------------------------- experience


def _experience_count(rng: Random, total_years: float) -> int:
    """Number of employers; nobody with six or more years has held a single job."""
    if total_years < 2:
        return 1
    if total_years < 4:
        return rng.choices((1, 2), (45, 55))[0]
    if total_years < 6:
        return rng.choices((1, 2, 3), (20, 45, 35))[0]
    return rng.choices((2, 3), (50, 50))[0]


def _split_months(rng: Random, total: int, parts: int, minimum: int, maximum: int) -> list[int]:
    """Split ``total`` months into ``parts`` stints of ``minimum`` to ``maximum`` months.

    ``parts`` grows (up to ``MAX_STINTS``) when the cap needs it and shrinks when the
    floor does; the cap is best effort once ``MAX_STINTS`` stints cannot hold ``total``.
    """
    parts = max(1, min(parts, total // minimum))
    parts = min(MAX_STINTS, max(parts, math.ceil(total / maximum)))
    weights = [rng.uniform(0.6, 1.4) for _ in range(parts)]
    spare = total - parts * minimum
    stints = [minimum + int(spare * weight / sum(weights)) for weight in weights]
    stints[-1] += total - sum(stints)  # rounding remainder goes to the current job
    if total <= parts * maximum:
        while max(stints) > maximum:  # move the excess onto the shortest stint
            longest, shortest = stints.index(max(stints)), stints.index(min(stints))
            excess = stints[longest] - maximum
            stints[longest] -= excess
            stints[shortest] += excess
    return stints


def _shift_months(day: date, months: int) -> date:
    index = day.year * 12 + (day.month - 1) + months
    return date(index // 12, index % 12 + 1, 1)


def _pick_companies(rng: Random, spec: JobSpec, count: int) -> list[people.Company]:
    """Distinct employers, chronological; sometimes one of them is in the JD's domain."""
    in_domain = [company for company in people.COMPANIES if company.domain == spec.domain]
    domain_slot: int | None = None
    if rng.random() < JD_DOMAIN_SHARE:
        domain_slot = count - 1 if count == 1 or rng.random() < 0.6 else rng.randrange(count - 1)
    chosen: list[people.Company] = []
    for index in range(count):
        options = in_domain if index == domain_slot else people.COMPANIES
        chosen.append(rng.choice([company for company in options if company not in chosen]))
    return chosen


def _experiences(
    ctx: SeedContext, spec: JobSpec, total_years: float, skills: Sequence[SkillDraft]
) -> list[ExperienceDraft]:
    rng = ctx.rng
    family = spec.role_family
    months_total = round(total_years * 12)
    stints = _split_months(
        rng, months_total, _experience_count(rng, total_years), MIN_STINT_MONTHS, MAX_STINT_MONTHS
    )
    companies = _pick_companies(rng, spec, len(stints))

    # Walk backwards from the anchor month; small gaps between jobs do not count as experience.
    spans: list[tuple[date, date | None]] = []
    cursor = _shift_months(ctx.anchor_date, 0)
    for index in reversed(range(len(stints))):
        start = _shift_months(cursor, -stints[index])
        spans.append((start, None if index == len(stints) - 1 else cursor))
        cursor = _shift_months(start, -rng.choice((0, 0, 1, 1, 2, 3)))
    spans.reverse()

    templates = list(text.EXPERIENCE_TEMPLATES[family])
    rng.shuffle(templates)
    primary, other_skills = _primary_and_others(skills, 3)
    rows: list[ExperienceDraft] = []
    cumulative = 0.0
    for index, ((start, end), company) in enumerate(zip(spans, companies, strict=True)):
        is_current = end is None
        years_at = total_years if is_current else cumulative + stints[index] / 24
        title = rng.choice(people.JOB_TITLES_BY_FAMILY[family][people.seniority_for(years_at)])
        description = templates[index % len(templates)].format(
            company=company.name,
            domain=company.domain,
            skills=", ".join(skill.display for skill in skills[:3]),
            other_skills=other_skills,
            primary_skill=primary.display,
            title=title,
            years=_years_phrase(stints[index] / 12),
        )
        rows.append(
            ExperienceDraft(
                company.name, title, company.domain, start, end, is_current, description
            )
        )
        cumulative += stints[index] / 12
    return rows


# ------------------------------------------------------------------ education


def _education(rng: Random, family: str, career_start_year: int) -> list[EducationDraft]:
    """One or two degrees, all finished before the career started; chronological."""
    quant = family in _QUANT_FAMILIES
    higher: str | None = None
    roll = rng.random()
    if quant and roll < 0.05:
        higher = "PhD"
    elif roll < (0.4 if quant else 0.28):
        higher = rng.choice(("M.Tech", "M.Sc", "MCA") if quant else ("M.Tech", "MCA", "MBA"))
    bachelor = rng.choices(("B.Tech", "B.E", "B.Sc"), (55, 32, 13))[0]

    rows: list[EducationDraft] = []
    end_year = career_start_year - rng.choice((0, 0, 0, 1))
    for degree in filter(None, (higher, bachelor)):
        start_year = end_year - people.DEGREE_YEARS[degree]
        rows.append(
            EducationDraft(
                degree,
                _field_of_study(rng, degree, quant),
                rng.choice(people.INSTITUTIONS),
                start_year,
                end_year,
                _grade(rng),
            )
        )
        end_year = start_year
    rows.reverse()
    return rows


def _field_of_study(rng: Random, degree: str, quant: bool) -> str:
    track = "quantitative" if quant else "engineering"
    if degree in people.FIXED_FIELDS:
        return people.FIXED_FIELDS[degree]
    if degree in people.SCIENCE_DEGREES:
        return rng.choice(people.SCIENCE_FIELDS_BY_TRACK[track])
    weights = people.ENGINEERING_FIELD_WEIGHTS_BY_TRACK[track]
    return rng.choices(list(weights), list(weights.values()))[0]


def _grade(rng: Random) -> str | None:
    roll = rng.random()
    if roll < 0.45:
        return f"{rng.uniform(6.5, 9.6):.1f} CGPA"
    if roll < 0.6:
        return rng.choice(("First Class", "First Class with Distinction"))
    return None


def _certifications(
    ctx: SeedContext, skills: Sequence[SkillDraft], career_start_year: int
) -> list[CertificationDraft]:
    rng = ctx.rng
    count = rng.choices((0, 1, 2), (55, 35, 10))[0]
    if not count:
        return []
    keys = {skill.key for skill in skills}

    def weight(cert: skill_pools.Certification) -> float:
        return 6.0 if keys & set(cert.related_skills) else 1.0

    year_low = max(career_start_year, ctx.anchor_date.year - 6)
    rows = []
    for cert in _weighted_sample(rng, skill_pools.CERTIFICATIONS, weight, count):
        url = f"https://www.credly.com/badges/{ctx.faker.uuid4()}" if rng.random() < 0.5 else None
        rows.append(
            CertificationDraft(
                cert.name, cert.issuer, rng.randint(year_low, ctx.anchor_date.year), url
            )
        )
    return rows


def _compensation(rng: Random, family: str, total_years: float) -> tuple[int, int]:
    """Annual INR, rounded to ten thousand; expected is 15 to 45 percent above current."""
    lakh = (3.5 + total_years * rng.uniform(1.6, 2.6)) * _CTC_MULTIPLIER[family]
    current = round(lakh * 100_000 / 10_000) * 10_000
    expected = round(current * rng.uniform(1.15, 1.45) / 10_000) * 10_000
    return current, expected


# ------------------------------------------------------------------------ text


def _years_phrase(years: float) -> str:
    """``1 year``, ``1.5 years``, ``6 years``."""
    number = str(int(years)) if float(years).is_integer() else f"{years:.1f}"
    return f"{number} year" if years == 1 else f"{number} years"


def _primary_and_others(skills: Sequence[SkillDraft], count: int) -> tuple[SkillDraft, str]:
    """The primary skill and a comma-separated list of the next ``count`` strongest skills."""
    primary = next(skill for skill in skills if skill.is_primary)
    others = [skill.display for skill in skills if skill is not primary]
    return primary, ", ".join(others[:count])


def template_values(draft: CandidateDraft, city_name: str) -> dict[str, str]:
    """Placeholders shared by the summary, resume and experience templates."""
    primary, other_skills = _primary_and_others(draft.skills, 4)
    highest = draft.education[-1]
    current = draft.experiences[-1]
    return {
        "name": draft.full_name,
        "years": _years_phrase(draft.total_experience_years),
        "skills": ", ".join(skill.display for skill in draft.skills[:5]),
        "other_skills": other_skills,
        "primary_skill": primary.display,
        "company": current.company,
        "domain": current.domain or "product",
        "title": current.title,
        "city": city_name,
        "degree": highest.degree,
        "field": highest.field,
        "institution": highest.institution,
    }


def _resume(rng: Random, draft: CandidateDraft, values: dict[str, str]) -> str:
    experience_section = "\n".join(
        f"{row.title}, {row.company} ({row.start_date:%b %Y} - "
        f"{row.end_date.strftime('%b %Y') if row.end_date else 'Present'})\n  {row.description}"
        for row in reversed(draft.experiences)
    )
    education_section = "\n".join(
        f"{row.degree} in {row.field}, {row.institution} ({row.start_year}-{row.end_year})"
        + (f", {row.grade}" if row.grade else "")
        for row in reversed(draft.education)
    )
    certifications_section = (
        "\n".join(f"{row.name}, {row.issuer} ({row.issued_year})" for row in draft.certifications)
        or "None"
    )
    template = rng.choice(text.RESUME_TEMPLATES[draft.family])
    return template.format(
        **values,
        email=draft.email,
        phone=draft.phone,
        summary=draft.summary,
        experience_section=experience_section,
        education_section=education_section,
        certifications_section=certifications_section,
    )


# --------------------------------------------------------------------- sources


def _referrer_emails() -> list[str]:
    return [user.email for user in USERS if user.role in (UserRole.EMPLOYEE, UserRole.HR)]


def _assign_sources(ctx: SeedContext, drafts: Sequence[CandidateDraft]) -> None:
    """40% single source, 60% two sources, balanced so every source is well represented."""
    rng = ctx.rng
    referrers = _referrer_emails()
    singles = round(len(drafts) * SINGLE_SOURCE_SHARE)
    plan: list[tuple[str, ...]] = [(SourceKey.values[i % 4],) for i in range(singles)]
    plan += [_SOURCE_PAIRS[i % len(_SOURCE_PAIRS)] for i in range(len(drafts) - singles)]
    rng.shuffle(plan)
    for draft, sources in zip(drafts, plan, strict=True):
        draft.sources = sorted(
            (_source_draft(ctx, draft, source, referrers) for source in sources),
            key=lambda row: row.discovered_at,
        )
        _finish_draft(rng, draft)


def _finish_draft(rng: Random, draft: CandidateDraft) -> None:
    """Derive created_at and the profile links once the sources are known."""
    draft.created_at = draft.sources[0].discovered_at
    linkedin = next((row for row in draft.sources if row.source == SourceKey.LINKEDIN), None)
    if linkedin is not None:
        draft.linkedin_url = f"https://www.{linkedin.source_reference}"
    elif rng.random() < 0.45:
        draft.linkedin_url = f"https://www.linkedin.com/in/{_slug(rng, draft.full_name)}"
    if draft.family != "qa" and rng.random() < 0.35:
        draft.github_url = f"https://github.com/{_slug(rng, draft.full_name)}"


def _slug(rng: Random, full_name: str) -> str:
    base = "-".join(_NON_ALNUM.sub("", part.lower()) for part in full_name.split())
    return f"{base}-{rng.randint(10, 999)}"


def _source_draft(
    ctx: SeedContext, draft: CandidateDraft, source: str, referrers: Sequence[str]
) -> SourceDraft:
    rng, faker = ctx.rng, ctx.faker
    referred_by = None
    if source == SourceKey.INTERNAL:
        reference, days = f"ATS-{rng.randint(10_000, 99_999)}", rng.randint(60, 400)
    elif source == SourceKey.REFERRAL:
        reference, days = f"REF-{faker.hexify('^^^^^^', upper=True)}", rng.randint(5, 60)
        referred_by = rng.choice(referrers)
    elif source == SourceKey.NAUKRI:
        reference, days = f"NK-{faker.hexify('^^^^^^', upper=True)}", rng.randint(3, 55)
    else:
        reference, days = f"linkedin.com/in/{_slug(rng, draft.full_name)}", rng.randint(3, 55)
    discovered_at = ctx.days_before_anchor(
        days, time(rng.randint(9, 18), rng.choice((0, 10, 20, 30, 40, 50)))
    )
    return SourceDraft(source, reference, discovered_at, referred_by)


# ----------------------------------------------------------- scripted people


def _years_ago(ctx: SeedContext, years: float | None) -> date | None:
    return None if years is None else _shift_months(ctx.anchor_date, -round(years * 12))


def _search_time(ctx: SeedContext, minutes: int = 0) -> datetime:
    """The moment the prompt's candidate search ran, when the ranked examples surfaced."""
    event = journey.JOURNEY_EVENTS_BY_KEY["search_completed"]
    return journey.event_time(event, ctx.anchor_date, journey.TIMEZONE) + timedelta(minutes=minutes)


def _john_doe(ctx: SeedContext) -> CandidateDraft:
    spec = journey.JOHN_DOE
    skills = [
        SkillDraft(
            normalize_skill(skill.display),
            display_name(skill.display),
            skill.proficiency,
            skill.years,
            skill.is_primary,
        )
        for skill in spec.skills
    ]
    experiences = [
        ExperienceDraft(
            row.company,
            row.title,
            row.domain,
            _years_ago(ctx, row.started_years_ago),
            _years_ago(ctx, row.ended_years_ago),
            row.ended_years_ago is None,
            row.description,
        )
        for row in reversed(spec.experiences)  # pools list newest first
    ]
    education = [
        EducationDraft(
            row.degree, row.field, row.institution, row.start_year, row.end_year, row.grade
        )
        for row in spec.education
    ]
    certifications = [
        CertificationDraft(row.name, row.issuer, row.issued_year) for row in spec.certifications
    ]
    draft = CandidateDraft(
        full_name=spec.full_name,
        email=spec.email,
        phone=spec.phone,
        gender=spec.gender,
        family="backend",
        location=spec.location,
        avatar_url=spec.avatar_url,
        current_company=spec.current_company,
        current_title=spec.current_title,
        total_experience_years=spec.total_experience_years,
        summary=spec.summary,
        resume_text="",
        notice_period_days=spec.notice_period_days,
        current_ctc=spec.current_ctc,
        expected_ctc=spec.expected_ctc,
        skills=skills,
        experiences=experiences,
        education=education,
        certifications=certifications,
        linkedin_url=spec.linkedin_url,
        github_url=spec.github_url,
    )
    draft.sources = sorted(
        (_john_doe_source(ctx, spec, source) for source in spec.sources),
        key=lambda row: row.discovered_at,
    )
    draft.created_at = draft.sources[0].discovered_at
    draft.resume_text = _resume(ctx.rng, draft, template_values(draft, "Chennai"))
    return draft


def _john_doe_source(ctx: SeedContext, spec: journey.JourneyCandidate, source: str) -> SourceDraft:
    """The reference behind each source ``JOHN_DOE.sources`` names: an old internal ATS
    record, and the LinkedIn profile surfaced by the prompt's search."""
    if source == SourceKey.INTERNAL:
        return SourceDraft(
            SourceKey.INTERNAL, "ATS-10417", ctx.days_before_anchor(180, time(11, 20))
        )
    if source == SourceKey.LINKEDIN:
        reference = spec.linkedin_url.removeprefix("https://www.")
        return SourceDraft(SourceKey.LINKEDIN, reference, _search_time(ctx))
    raise ValueError(f"no scripted reference for John Doe via {source!r}")


@dataclass(frozen=True)
class _Stint:
    company: str
    title: str
    started_years_ago: float
    ended_years_ago: float | None
    description: str


def _scripted(
    ctx: SeedContext,
    *,
    full_name: str,
    email: str,
    phone: str,
    gender: str,
    portrait: int,
    city: str,
    total_years: float,
    summary: str,
    notice_period_days: int,
    current_ctc: int,
    expected_ctc: int,
    skills: Sequence[tuple[str, int, float, bool]],
    stints: Sequence[_Stint],
    education: Sequence[EducationDraft],
    certifications: Sequence[CertificationDraft],
    sources: Sequence[SourceDraft],
    linkedin_url: str | None = None,
    github_url: str | None = None,
) -> CandidateDraft:
    skill_drafts = [
        SkillDraft(normalize_skill(display), display, proficiency, years, primary)
        for display, proficiency, years, primary in skills
    ]
    experiences = [
        ExperienceDraft(
            stint.company,
            stint.title,
            people.COMPANIES_BY_NAME[stint.company].domain,
            _years_ago(ctx, stint.started_years_ago),
            _years_ago(ctx, stint.ended_years_ago),
            stint.ended_years_ago is None,
            stint.description,
        )
        for stint in stints
    ]
    draft = CandidateDraft(
        full_name=full_name,
        email=email,
        phone=phone,
        gender=gender,
        family="backend",
        location=people.location_label(people.CITIES_BY_NAME[city]),
        avatar_url=people.portrait_url(gender, portrait),
        current_company=experiences[-1].company,
        current_title=experiences[-1].title,
        total_experience_years=total_years,
        summary=summary,
        resume_text="",
        notice_period_days=notice_period_days,
        current_ctc=current_ctc,
        expected_ctc=expected_ctc,
        skills=skill_drafts,
        experiences=experiences,
        education=list(education),
        certifications=list(certifications),
        sources=sorted(sources, key=lambda row: row.discovered_at),
        github_url=github_url,
    )
    linkedin = next((row for row in draft.sources if row.source == SourceKey.LINKEDIN), None)
    draft.linkedin_url = f"https://www.{linkedin.source_reference}" if linkedin else linkedin_url
    draft.created_at = draft.sources[0].discovered_at
    draft.resume_text = _resume(ctx.rng, draft, template_values(draft, city))
    return draft


def _ranked_examples(ctx: SeedContext) -> list[CandidateDraft]:
    """Jane Smith, Alex Kumar and David Raj: the other rows of the prompt's ranking
    table, all strong Senior Python Developer matches below John Doe. Each has exactly
    the one source ``journey.RANKED_EXAMPLES`` names."""
    jane = _scripted(
        ctx,
        full_name="Jane Smith",
        email="jane.smith.dev@gmail.com",
        phone="+91 98844 30217",
        gender="female",
        portrait=48,
        city="Chennai",
        total_years=5.0,
        summary=(
            "Backend engineer with 5 years of experience building payment and account APIs in "
            "Python, Django and PostgreSQL. Currently Senior Software Engineer at PhonePe, "
            "owning merchant settlement services on AWS; earlier built core banking integrations "
            "at TCS. Strong on REST design, testing discipline and production support."
        ),
        notice_period_days=45,
        current_ctc=1_900_000,
        expected_ctc=2_500_000,
        skills=(
            ("Python", 5, 5.0, True),
            ("Django", 4, 4.0, True),
            ("PostgreSQL", 4, 4.5, True),
            ("REST", 5, 5.0, False),
            ("Docker", 4, 3.0, False),
            ("Git", 5, 5.0, False),
            ("FastAPI", 3, 1.5, False),
            ("AWS", 3, 2.5, False),
            ("Redis", 3, 2.0, False),
            ("Celery", 3, 2.0, False),
        ),
        stints=(
            _Stint(
                "TCS",
                "Software Engineer",
                5.0,
                2.5,
                "Built core banking integration services in Python and Django for a retail "
                "banking client; owned REST API design and release support.",
            ),
            _Stint(
                "PhonePe",
                "Senior Software Engineer",
                2.5,
                None,
                "Own merchant settlement and reconciliation services in Django and FastAPI on "
                "PostgreSQL and AWS; introduced contract tests and Celery-based retries.",
            ),
        ),
        education=(
            EducationDraft(
                "B.E", "Computer Science and Engineering", "NIT Trichy", 2017, 2021, "8.7 CGPA"
            ),
        ),
        certifications=(),
        sources=(SourceDraft(SourceKey.NAUKRI, "NK-7F3A2C", _search_time(ctx)),),
        linkedin_url="https://www.linkedin.com/in/jane-smith-dev",
    )
    alex = _scripted(
        ctx,
        full_name="Alex Kumar",
        email="alex.kumar.eng@gmail.com",
        phone="+91 99017 45320",
        gender="male",
        portrait=23,
        city="Bengaluru",
        total_years=7.0,
        summary=(
            "Lead backend engineer with 7 years across fintech and ecommerce platforms. Deep in "
            "Python, Django and PostgreSQL; currently leads the credit ledger squad at CRED and "
            "earlier scaled order services at Flipkart. Mentors engineers and drives design "
            "reviews; keen to go deeper into payments infrastructure."
        ),
        notice_period_days=60,
        current_ctc=3_000_000,
        expected_ctc=3_600_000,
        skills=(
            ("Python", 5, 7.0, True),
            ("Django", 5, 6.0, True),
            ("PostgreSQL", 4, 6.0, True),
            ("REST", 4, 7.0, False),
            ("Docker", 4, 4.0, False),
            ("Git", 4, 7.0, False),
            ("Flask", 4, 3.0, False),
            ("AWS", 4, 4.0, False),
            ("Kafka", 3, 2.0, False),
            ("Redis", 3, 3.0, False),
        ),
        stints=(
            _Stint(
                "Infosys",
                "Software Engineer",
                7.0,
                5.0,
                "Developed REST services in Python and Flask for an enterprise banking client; "
                "wrote integration tests and handled production incidents.",
            ),
            _Stint(
                "Flipkart",
                "Senior Software Engineer",
                5.0,
                2.0,
                "Scaled order management services in Django and PostgreSQL for peak sale events; "
                "introduced Kafka-based event pipelines and Redis caching.",
            ),
            _Stint(
                "CRED",
                "Lead Backend Engineer",
                2.0,
                None,
                "Lead the credit ledger squad: Django services on PostgreSQL and AWS, design "
                "reviews, on-call ownership and mentoring five engineers.",
            ),
        ),
        education=(
            EducationDraft("B.Tech", "Information Technology", "VIT Vellore", 2015, 2019, None),
        ),
        certifications=(
            CertificationDraft("AWS Solutions Architect Associate", "Amazon Web Services", 2023),
        ),
        sources=(
            SourceDraft(
                SourceKey.REFERRAL,
                "REF-4B9E1D",
                ctx.days_before_anchor(20, time(16, 40)),
                referred_by_email=LAKSHMI,
            ),
        ),
        linkedin_url="https://www.linkedin.com/in/alex-kumar-eng",
        github_url="https://github.com/alex-kumar-eng",
    )
    david = _scripted(
        ctx,
        full_name="David Raj",
        email="david.raj.backend@outlook.com",
        phone="+91 97909 12488",
        gender="male",
        portrait=61,
        city="Chennai",
        total_years=4.0,
        summary=(
            "Backend developer with 4 years of experience in Python and Django, building billing "
            "and subscription APIs for SaaS products at Chargebee and Zoho. Comfortable with "
            "PostgreSQL schema design, REST API versioning and Docker-based deployments; looking "
            "for a senior role with more ownership."
        ),
        notice_period_days=30,
        current_ctc=1_400_000,
        expected_ctc=1_900_000,
        skills=(
            ("Python", 4, 4.0, True),
            ("Django", 4, 3.5, True),
            ("PostgreSQL", 3, 3.0, False),
            ("REST", 4, 4.0, False),
            ("Docker", 3, 2.0, False),
            ("Git", 4, 4.0, False),
            ("MySQL", 3, 2.0, False),
            ("FastAPI", 3, 1.0, False),
        ),
        stints=(
            _Stint(
                "Zoho",
                "Software Engineer",
                4.0,
                2.0,
                "Built REST APIs and background jobs for a CRM product in Python and Django; "
                "owned MySQL to PostgreSQL migration scripts.",
            ),
            _Stint(
                "Chargebee",
                "Software Engineer II",
                2.0,
                None,
                "Develop billing and subscription APIs in Django on PostgreSQL; containerised "
                "services with Docker and improved API test coverage.",
            ),
        ),
        education=(
            EducationDraft(
                "B.Tech",
                "Computer Science and Engineering",
                "Anna University",
                2018,
                2022,
                "8.1 CGPA",
            ),
        ),
        certifications=(),
        sources=(
            SourceDraft(SourceKey.INTERNAL, "ATS-10982", ctx.days_before_anchor(120, time(15, 10))),
        ),
    )
    return [jane, alex, david]


# --------------------------------------------------------------------- persist


def persist_candidates(drafts: Sequence[CandidateDraft], users: dict[str, User]) -> list[Candidate]:
    """Bulk-insert the drafts and their child rows; returns the Candidate rows in draft order."""
    candidates = [
        Candidate(
            full_name=draft.full_name,
            email=draft.email.strip().lower(),  # bulk_create bypasses Candidate.save()
            phone=draft.phone,
            location=draft.location,
            avatar_url=draft.avatar_url,
            headline=draft.headline,
            current_company=draft.current_company,
            current_title=draft.current_title,
            total_experience_years=Decimal(f"{draft.total_experience_years:.1f}"),
            summary=draft.summary,
            resume_url=draft.resume_url,
            resume_text=draft.resume_text,
            linkedin_url=draft.linkedin_url,
            github_url=draft.github_url,
            notice_period_days=draft.notice_period_days,
            current_ctc=draft.current_ctc,
            expected_ctc=draft.expected_ctc,
        )
        for draft in drafts
    ]
    Candidate.objects.bulk_create(candidates, batch_size=200)
    pairs = list(zip(candidates, drafts, strict=True))

    CandidateSkill.objects.bulk_create(
        [
            CandidateSkill(
                candidate_id=candidate.id,
                skill=skill.key,
                display_name=skill.display,
                proficiency=skill.proficiency,
                years=None if skill.years is None else Decimal(f"{skill.years:.1f}"),
                is_primary=skill.is_primary,
            )
            for candidate, draft in pairs
            for skill in draft.skills
        ],
        batch_size=500,
    )
    CandidateExperience.objects.bulk_create(
        [
            CandidateExperience(
                candidate_id=candidate.id,
                company=row.company,
                title=row.title,
                domain=row.domain,
                start_date=row.start_date,
                end_date=row.end_date,
                is_current=row.is_current,
                description=row.description,
            )
            for candidate, draft in pairs
            for row in draft.experiences
        ],
        batch_size=500,
    )
    CandidateEducation.objects.bulk_create(
        [
            CandidateEducation(
                candidate_id=candidate.id,
                degree=row.degree,
                field=row.field,
                institution=row.institution,
                start_year=row.start_year,
                end_year=row.end_year,
                grade=row.grade,
            )
            for candidate, draft in pairs
            for row in draft.education
        ],
        batch_size=500,
    )
    CandidateCertification.objects.bulk_create(
        [
            CandidateCertification(
                candidate_id=candidate.id,
                name=row.name,
                issuer=row.issuer,
                issued_year=row.issued_year,
                credential_url=row.credential_url,
            )
            for candidate, draft in pairs
            for row in draft.certifications
        ],
        batch_size=500,
    )
    CandidateSource.objects.bulk_create(
        [
            CandidateSource(
                candidate_id=candidate.id,
                source=row.source,
                source_reference=row.source_reference,
                referred_by=users[row.referred_by_email] if row.referred_by_email else None,
                discovered_at=row.discovered_at,
            )
            for candidate, draft in pairs
            for row in draft.sources
        ],
        batch_size=500,
    )

    # Backdate the candidate rows to their first discovery (auto_now_add ignored the value).
    for candidate, draft in pairs:
        candidate.created_at = candidate.updated_at = draft.created_at
    Candidate.objects.bulk_update(candidates, ["created_at", "updated_at"], batch_size=200)
    return candidates
