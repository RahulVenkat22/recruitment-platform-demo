"""The scripted "John Doe" journey on the Senior Python Developer JD.

It reproduces the sample timeline from the prompt (section 13; plan.md 9.6 and
10) exactly, plus two supporting events (offer accepted, onboarding started)
so the application's status chain is coherent and ends ``onboarded``.

Offsets are relative to the *end* of the journey (John onboarded at
``JOURNEY_END_TIME``), so ``schedule(anchor)`` shifts the whole thing to finish
on the seed anchor date. The prompt's dates (11 to 20 Sep 2026) are just an
example; ``schedule(date(2026, 9, 20))`` reproduces them.

JD-level version events (``jd.updated``) are not listed here: the generator
materialises them from ``jobs.JOBS_BY_TITLE[JOURNEY_JD_TITLE].versions`` using
each version's ``offset_minutes`` after the ``jd.created`` event.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from seed.pools.people import portrait_url
from seed.pools.skills import skill_key
from seed.pools.users import ARUN, PRIYA, RAHUL

TIMEZONE = "Asia/Kolkata"
JOURNEY_END_TIME = time(9, 0)  # John is onboarded at 09:00 on the anchor date
JOURNEY_JD_TITLE = "Senior Python Developer"
SHORTLISTED_NAMES: tuple[str, ...] = ("John Doe", "Jane Smith", "Alex Kumar")

# Day 0 in the prompt is 11 Sep; onboarding is day 9 at 09:00.
_END_DAY = 9


def _offset(day: int, hour: int, minute: int = 0) -> timedelta:
    """Offset of ``day hour:minute`` (prompt day numbering) from the journey end."""
    return timedelta(days=day - _END_DAY, hours=hour - JOURNEY_END_TIME.hour, minutes=minute)


@dataclass(frozen=True)
class JourneyEvent:
    key: str  # stable identifier, e.g. "jd_created"
    offset: timedelta  # relative to journey_end(anchor)
    category: str  # activity category key
    event_type: str  # activity event_type
    actor_email: str | None  # None means system
    title: str  # Activity.title
    description: str
    status_after: str | None  # John's application status after this event; None for JD events
    from_prompt: bool  # True for the nine events shown in the prompt's example
    # Extra detail for the child rows (communication, interview, offer, onboarding).
    # Values may be ``timedelta`` offsets relative to ``journey_end(anchor)``; use
    # ``activity_metadata`` for the JSON-safe subset that goes on the Activity row.
    metadata: Mapping[str, Any] = field(default_factory=dict)

    @property
    def activity_metadata(self) -> dict[str, Any]:
        """``metadata`` minus the timedelta offsets: safe for ``Activity.metadata`` (jsonb)."""
        return {
            key: value for key, value in self.metadata.items() if not isinstance(value, timedelta)
        }


JOURNEY_EVENTS: tuple[JourneyEvent, ...] = (
    JourneyEvent(
        key="jd_created",
        offset=_offset(0, 9, 30),
        category="job_description",
        event_type="jd.created",
        actor_email=RAHUL,
        title="Rahul created the Job Description.",
        description="Senior Python Developer was created as version 1.",
        status_after=None,
        from_prompt=True,
        metadata={"version": 1},
    ),
    JourneyEvent(
        key="search_completed",
        offset=_offset(0, 10, 15),
        category="candidate_search",
        event_type="search.completed",
        actor_email=PRIYA,
        title="Priya searched for candidates.",
        description="127 candidates found across Naukri and LinkedIn; 12 AI shortlisted.",
        status_after="ai_shortlisted",
        from_prompt=True,
        metadata={
            "sources": ["naukri", "linkedin"],
            "total_found": 127,
            "new_candidates": 98,
            "existing_candidates": 29,
            "shortlisted": 12,
        },
    ),
    JourneyEvent(
        key="shortlisted",
        offset=_offset(0, 11, 0),
        category="candidate_shortlisted",
        event_type="application.shortlisted",
        actor_email=RAHUL,
        title="Rahul shortlisted John Doe, Jane Smith and Alex Kumar.",
        description="Moved to TA Review for recruiter outreach.",
        status_after="hr_review",
        from_prompt=True,
        metadata={"candidate_names": list(SHORTLISTED_NAMES), "to": "hr_review"},
    ),
    JourneyEvent(
        key="contacted",
        offset=_offset(0, 14, 30),
        category="candidate_contact",
        event_type="communication.logged",
        actor_email=PRIYA,
        title="Priya contacted John Doe.",
        description="Status: Connected. Next: Schedule technical interview.",
        status_after="contacted",
        from_prompt=True,
        metadata={
            "channel": "phone",
            "direction": "outbound",
            "outcome": "connected",
            "summary": "Priya contacted John Doe",
            "notes": (
                "Spoke with John about the Senior Python Developer role. Interested, serving a "
                "30-day notice; walked through the team, stack and interview process."
            ),
            "next_action": "Schedule technical interview",
            "next_action_offset": _offset(1, 15, 0),
        },
    ),
    JourneyEvent(
        key="interview_scheduled",
        offset=_offset(1, 15, 0),
        category="interview",
        event_type="interview.scheduled",
        actor_email=PRIYA,
        title="Technical Interview scheduled for John Doe.",
        description="Interviewer: Arun. 60 minutes over video.",
        status_after="interview_scheduled",
        from_prompt=True,
        metadata={
            "round": "technical",
            "sequence": 1,
            "interviewer_email": ARUN,
            "duration_minutes": 60,
            "mode": "video",
            "meeting_link": "https://meet.aimious.demo/tech-round-john-doe",
            "scheduled_offset": _offset(1, 15, 0),
        },
    ),
    JourneyEvent(
        key="feedback_submitted",
        offset=_offset(1, 17, 0),
        category="interview_feedback",
        event_type="interview.feedback_submitted",
        actor_email=ARUN,
        title="Arun submitted interview feedback for John Doe.",
        description="Score 8.5/10. Recommendation: Proceed.",
        status_after="technical_interview",
        from_prompt=True,
        metadata={
            "score": 8.5,
            "recommendation": "proceed",
            "feedback": (
                "Strong Python and Django fundamentals; designed the ledger service cleanly and "
                "reasoned well about idempotency and PostgreSQL locking. Kubernetes exposure is "
                "limited but not a blocker for this role. Recommend proceeding."
            ),
        },
    ),
    JourneyEvent(
        key="selected",
        offset=_offset(3, 11, 0),
        category="candidate_selected",
        event_type="application.status_changed",
        actor_email=ARUN,
        title="John Doe selected for the position.",
        description="Hiring manager sign-off after the technical round.",
        status_after="selected",
        from_prompt=True,
        metadata={"from": "technical_interview", "to": "selected"},
    ),
    JourneyEvent(
        key="offer_sent",
        offset=_offset(4, 10, 0),
        category="offer",
        event_type="offer.sent",
        actor_email=RAHUL,
        title="Offer sent to John Doe.",
        description="Senior Python Developer, ₹26,00,000 per year, joining in five days.",
        status_after="offer_sent",
        from_prompt=True,
        metadata={
            "designation": "Senior Python Developer",
            "annual_ctc": 2_600_000,
            "currency": "INR",
            "joining_offset_days": 5,  # after the offer date: day 9, the onboarding day
            "expires_offset_days": 3,
        },
    ),
    JourneyEvent(
        key="offer_accepted",
        offset=_offset(5, 16, 30),
        category="offer",
        event_type="offer.accepted",
        actor_email=PRIYA,
        title="John Doe accepted the offer.",
        description="Signed offer letter received.",
        status_after="offer_accepted",
        from_prompt=False,
        metadata={"from": "offer_sent", "to": "offer_accepted"},
    ),
    JourneyEvent(
        key="onboarding_started",
        offset=_offset(8, 10, 0),
        category="onboarding",
        event_type="onboarding.started",
        actor_email=PRIYA,
        title="Onboarding started for John Doe.",
        description="Documents collected and laptop requested ahead of day one.",
        status_after="onboarding",
        from_prompt=False,
        metadata={
            "from": "offer_accepted",
            "to": "onboarding",
            "buddy_email": "divya@aimious.demo",
            "hr_contact_email": PRIYA,
        },
    ),
    JourneyEvent(
        key="onboarded",
        offset=_offset(_END_DAY, JOURNEY_END_TIME.hour, JOURNEY_END_TIME.minute),
        category="onboarding",
        event_type="onboarding.completed",
        actor_email=PRIYA,
        title="John Doe successfully onboarded.",
        description="All checklist items complete; day-one orientation done.",
        status_after="onboarded",
        from_prompt=True,
        metadata={
            "from": "onboarding",
            "to": "onboarded",
            "checklist": [
                "offer_letter_signed",
                "documents_collected",
                "background_check",
                "laptop_and_accounts",
                "day_one_orientation",
            ],
        },
    ),
)

JOURNEY_EVENTS_BY_KEY: dict[str, JourneyEvent] = {event.key: event for event in JOURNEY_EVENTS}


def journey_end(anchor: date, tz: str = TIMEZONE) -> datetime:
    """The moment John is onboarded: ``JOURNEY_END_TIME`` on the anchor date."""
    return datetime.combine(anchor, JOURNEY_END_TIME, tzinfo=ZoneInfo(tz))


def event_time(event: JourneyEvent, anchor: date, tz: str = TIMEZONE) -> datetime:
    return journey_end(anchor, tz) + event.offset


def schedule(anchor: date, tz: str = TIMEZONE) -> list[tuple[datetime, JourneyEvent]]:
    """Every journey event with its absolute time, in chronological order.

    Consumed by the seed history generator (plan.md 12, phases 5 and 7: applications,
    then interviews, communications, offers and onboardings) and by the pool tests.
    """
    end = journey_end(anchor, tz)
    return [(end + event.offset, event) for event in JOURNEY_EVENTS]


# ------------------------------------------------------------------ John Doe


@dataclass(frozen=True)
class JourneySkill:
    display: str
    proficiency: int  # 1..5
    years: float
    is_primary: bool = False

    @property
    def key(self) -> str:
        return skill_key(self.display)


@dataclass(frozen=True)
class JourneyExperience:
    company: str
    title: str
    domain: str
    started_years_ago: float
    ended_years_ago: float | None  # None means current
    description: str


@dataclass(frozen=True)
class JourneyEducation:
    degree: str
    field: str
    institution: str
    start_year: int
    end_year: int
    grade: str | None = None


@dataclass(frozen=True)
class JourneyCertification:
    name: str
    issuer: str
    issued_year: int


@dataclass(frozen=True)
class JourneyCandidate:
    full_name: str
    email: str
    phone: str
    gender: str
    location: str
    current_company: str  # the stored headline is "{current_title} at {current_company}"
    current_title: str
    total_experience_years: float
    summary: str
    avatar_url: str
    linkedin_url: str
    github_url: str | None
    notice_period_days: int
    current_ctc: int
    expected_ctc: int
    sources: tuple[str, ...]  # CandidateSource keys; the generator builds the rows from these
    skills: tuple[JourneySkill, ...]
    experiences: tuple[JourneyExperience, ...]
    education: tuple[JourneyEducation, ...]
    certifications: tuple[JourneyCertification, ...]


# Matches the prompt's sample profile: 95% match, Python / Django / FastAPI /
# PostgreSQL / AWS, 6 years, sources Internal + LinkedIn, limited Kubernetes.
JOHN_DOE = JourneyCandidate(
    full_name="John Doe",
    email="john.doe.dev@outlook.com",
    phone="+91 98410 20456",
    gender="male",
    location="Chennai, Tamil Nadu",
    current_company="Freshworks",
    current_title="Senior Backend Engineer",
    total_experience_years=6,
    summary=(
        "Backend engineer with 6 years of experience building APIs and services in Python, "
        "Django, FastAPI, PostgreSQL and AWS. Currently Senior Backend Engineer at Freshworks; "
        "earlier built payment and ledger services at Razorpay, where correctness, idempotent "
        "processing and audit trails were part of every design. Comfortable owning a service "
        "from data model to production support, writing tests first and mentoring engineers."
    ),
    avatar_url=portrait_url("male", 77),
    linkedin_url="https://www.linkedin.com/in/john-doe-demo",
    github_url="https://github.com/john-doe-demo",
    notice_period_days=30,
    current_ctc=2_100_000,
    expected_ctc=2_600_000,
    sources=("internal", "linkedin"),
    skills=(
        JourneySkill("Python", 5, 6.0, is_primary=True),
        JourneySkill("Django", 5, 5.0, is_primary=True),
        JourneySkill("PostgreSQL", 4, 5.0, is_primary=True),
        JourneySkill("REST", 5, 6.0),
        JourneySkill("Docker", 4, 4.0),
        JourneySkill("Git", 5, 6.0),
        JourneySkill("FastAPI", 4, 2.0),
        JourneySkill("AWS", 4, 3.0),
        JourneySkill("Redis", 3, 3.0),
        JourneySkill("Celery", 3, 3.0),
        JourneySkill("Kubernetes", 2, 1.0),
    ),
    experiences=(
        JourneyExperience(
            company="Freshworks",
            title="Senior Backend Engineer",
            domain="saas",
            started_years_ago=2.5,
            ended_years_ago=None,
            description=(
                "Own billing and subscription services built with Django and FastAPI on "
                "PostgreSQL; led the move to containerised deployments on AWS and mentor two "
                "engineers."
            ),
        ),
        JourneyExperience(
            company="Razorpay",
            title="Backend Engineer",
            domain="fintech",
            started_years_ago=4.0,
            ended_years_ago=2.5,
            description=(
                "Built payment, settlement and ledger APIs in Python and Django; designed "
                "idempotent processing and reconciliation jobs with Celery and Redis."
            ),
        ),
        JourneyExperience(
            company="Zoho",
            title="Software Engineer",
            domain="saas",
            started_years_ago=6.0,
            ended_years_ago=4.0,
            description=(
                "Developed REST APIs and background jobs for a CRM product in Python; wrote "
                "tests first and handled production support."
            ),
        ),
    ),
    education=(
        JourneyEducation(
            "B.Tech",
            "Computer Science and Engineering",
            "Anna University",
            2016,
            2020,
            "8.4 CGPA",
        ),
    ),
    certifications=(
        JourneyCertification("AWS Solutions Architect Associate", "Amazon Web Services", 2024),
    ),
)


@dataclass(frozen=True)
class RankedExample:
    """A row of the prompt's ranking table (section 19). ``gender`` picks the portrait."""

    full_name: str
    match_pct: int
    experience_years: int
    source: str  # CandidateSource key that surfaced the candidate
    status: str  # ApplicationStatus key shown in the table
    gender: str  # "male" | "female"


# The prompt's ranking example. John's row describes him at search time; the
# journey then carries him to onboarded. The other three stay where the table
# puts them so the ranked list on the JD looks like the prompt.
RANKED_EXAMPLES: tuple[RankedExample, ...] = (
    RankedExample("John Doe", 95, 6, "linkedin", "ai_shortlisted", JOHN_DOE.gender),
    RankedExample("Jane Smith", 92, 5, "naukri", "new", "female"),
    RankedExample("Alex Kumar", 89, 7, "referral", "contacted", "male"),
    RankedExample("David Raj", 85, 4, "internal", "new", "male"),
)
