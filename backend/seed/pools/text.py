"""Text templates for generated candidates, communications, interview feedback,
timeline activities (JD-level and candidate-level) and decision reasons. Render
with ``template.format(**values)``; each pool documents its placeholder set so
generators (and tests) know what to supply.
"""

from __future__ import annotations

from typing import NamedTuple

# --------------------------------------------------------------- candidate text

# Placeholders available to summary templates.
CANDIDATE_PLACEHOLDERS: frozenset[str] = frozenset(
    {
        "name",
        "years",  # "6 years", "1 year", "1.5 years"
        "skills",  # comma-separated display names, primary skill first
        "other_skills",  # the same list without the primary skill, for use next to it
        "primary_skill",
        "company",  # current company
        "domain",
        "title",  # current title
        "city",
        "degree",
        "field",
        "institution",
    }
)

RESUME_PLACEHOLDERS: frozenset[str] = CANDIDATE_PLACEHOLDERS | {
    "email",
    "phone",
    "summary",
    "experience_section",  # experience entries already rendered, newline separated
    "education_section",
    "certifications_section",
}

EXPERIENCE_PLACEHOLDERS: frozenset[str] = frozenset(
    {"company", "domain", "skills", "other_skills", "primary_skill", "title", "years"}
)

SUMMARY_TEMPLATES: dict[str, tuple[str, ...]] = {
    "backend": (
        "Backend engineer with {years} of experience building APIs and services in "
        "{skills}. Currently {title} at {company}, working on {domain} systems where "
        "correctness and throughput both matter.",
        "{years} of server-side development, most recently at {company}. Strong in "
        "{primary_skill} with hands-on experience in {other_skills}; comfortable owning a service "
        "from "
        "design through production support.",
        "Product-minded backend developer ({years}) who has shipped {domain} platforms at "
        "{company}. Day-to-day stack: {skills}. Enjoys performance work, clean data models and "
        "mentoring.",
    ),
    "frontend": (
        "Frontend engineer with {years} of experience crafting fast, accessible web "
        "interfaces in {skills}. {title} at {company}, building {domain} experiences used by "
        "millions of users.",
        "{years} of UI development centred on {primary_skill}. At {company} I own "
        "component libraries and performance budgets; toolset includes {other_skills}.",
        "Design-aware frontend developer ({years}) who turns Figma into production React. "
        "Currently {title} at {company}; strengths: {skills}.",
    ),
    "ai_ml": (
        "Machine learning engineer with {years} taking models from notebook to production "
        "using {skills}. {title} at {company}, applying ML to {domain} problems.",
        "{years} across applied ML and MLOps, currently at {company}. Deep experience in "
        "{primary_skill}; recent work on {other_skills}.",
        "Applied AI practitioner ({years}) who cares about evaluation and safety as much as "
        "accuracy. Ships {domain} models at {company} with {skills}.",
    ),
    "data_science": (
        "Data scientist with {years} turning messy {domain} data into decisions using "
        "{other_skills}. {title} at {company}; strongest in {primary_skill} and experiment design.",
        "{years} in analytics and data science at {company} and earlier. Comfortable across "
        "the stack: {skills}. Known for clear narratives and metrics people trust.",
        "Analytical generalist ({years}) with production models and dashboards behind me. "
        "Current focus at {company}: churn, retention and pricing, built with {skills}.",
    ),
    "devops": (
        "DevOps engineer with {years} running cloud infrastructure and delivery pipelines "
        "built on {skills}. {title} at {company}, keeping {domain} platforms reliable.",
        "{years} of platform and reliability work, currently at {company}. Strong in "
        "{primary_skill}; daily tools include {other_skills}. Automates the second time, every "
        "time.",
        "Infrastructure engineer ({years}) who treats infra as a product. Runs the platform "
        "for {domain} teams at {company} with {skills}.",
    ),
    "qa": (
        "QA automation engineer with {years} building test frameworks in {skills}. "
        "{title} at {company}, guarding daily releases for {domain} products.",
        "{years} across manual and automated testing, most recently at {company}. Strong in "
        "{primary_skill} with working knowledge of {other_skills}.",
        "Quality engineer ({years}) who partners with developers early and hunts flaky "
        "tests to root cause. Stack at {company}: {skills}.",
    ),
}

RESUME_TEMPLATES: dict[str, tuple[str, ...]] = {
    "backend": (
        "{name}\n{title} | {city}\n{email} | {phone}\n\n"
        "SUMMARY\n{summary}\n\n"
        "SKILLS\n{skills}\n\n"
        "EXPERIENCE\n{experience_section}\n\n"
        "EDUCATION\n{education_section}\n\n"
        "CERTIFICATIONS\n{certifications_section}",
        "{name} - {title}\n{city} | {email} | {phone}\n\n"
        "PROFILE\n{years} of backend engineering with {primary_skill} at the centre. "
        "{summary}\n\n"
        "TECHNICAL SKILLS\n{skills}\n\n"
        "WORK HISTORY\n{experience_section}\n\n"
        "EDUCATION\n{education_section}\n\n"
        "CERTIFICATIONS\n{certifications_section}",
    ),
    "frontend": (
        "{name}\n{title} | {city}\n{email} | {phone}\n\n"
        "SUMMARY\n{summary}\n\n"
        "SKILLS\n{skills}\n\n"
        "EXPERIENCE\n{experience_section}\n\n"
        "EDUCATION\n{education_section}\n\n"
        "CERTIFICATIONS\n{certifications_section}",
        "{name} - {title}\n{city} | {email} | {phone}\n\n"
        "PROFILE\nFrontend engineer, {years}, specialising in {primary_skill}. {summary}\n\n"
        "TOOLS AND FRAMEWORKS\n{skills}\n\n"
        "WORK HISTORY\n{experience_section}\n\n"
        "EDUCATION\n{education_section}\n\n"
        "CERTIFICATIONS\n{certifications_section}",
    ),
    "ai_ml": (
        "{name}\n{title} | {city}\n{email} | {phone}\n\n"
        "SUMMARY\n{summary}\n\n"
        "SKILLS\n{skills}\n\n"
        "EXPERIENCE\n{experience_section}\n\n"
        "EDUCATION\n{education_section}\n\n"
        "CERTIFICATIONS\n{certifications_section}",
        "{name} - {title}\n{city} | {email} | {phone}\n\n"
        "PROFILE\nApplied ML engineer with {years}; core strength {primary_skill}. "
        "{summary}\n\n"
        "TECHNICAL SKILLS\n{skills}\n\n"
        "SELECTED WORK\n{experience_section}\n\n"
        "EDUCATION\n{education_section}\n\n"
        "CERTIFICATIONS\n{certifications_section}",
    ),
    "data_science": (
        "{name}\n{title} | {city}\n{email} | {phone}\n\n"
        "SUMMARY\n{summary}\n\n"
        "SKILLS\n{skills}\n\n"
        "EXPERIENCE\n{experience_section}\n\n"
        "EDUCATION\n{education_section}\n\n"
        "CERTIFICATIONS\n{certifications_section}",
        "{name} - {title}\n{city} | {email} | {phone}\n\n"
        "PROFILE\nData scientist, {years}, strongest in {primary_skill}. {summary}\n\n"
        "TOOLKIT\n{skills}\n\n"
        "EXPERIENCE\n{experience_section}\n\n"
        "EDUCATION\n{education_section}\n\n"
        "CERTIFICATIONS\n{certifications_section}",
    ),
    "devops": (
        "{name}\n{title} | {city}\n{email} | {phone}\n\n"
        "SUMMARY\n{summary}\n\n"
        "SKILLS\n{skills}\n\n"
        "EXPERIENCE\n{experience_section}\n\n"
        "EDUCATION\n{education_section}\n\n"
        "CERTIFICATIONS\n{certifications_section}",
        "{name} - {title}\n{city} | {email} | {phone}\n\n"
        "PROFILE\nPlatform and DevOps engineer, {years}, deepest in {primary_skill}. "
        "{summary}\n\n"
        "INFRASTRUCTURE SKILLS\n{skills}\n\n"
        "EXPERIENCE\n{experience_section}\n\n"
        "EDUCATION\n{education_section}\n\n"
        "CERTIFICATIONS\n{certifications_section}",
    ),
    "qa": (
        "{name}\n{title} | {city}\n{email} | {phone}\n\n"
        "SUMMARY\n{summary}\n\n"
        "SKILLS\n{skills}\n\n"
        "EXPERIENCE\n{experience_section}\n\n"
        "EDUCATION\n{education_section}\n\n"
        "CERTIFICATIONS\n{certifications_section}",
        "{name} - {title}\n{city} | {email} | {phone}\n\n"
        "PROFILE\nQuality engineer, {years}, automation-first with {primary_skill}. "
        "{summary}\n\n"
        "TESTING SKILLS\n{skills}\n\n"
        "EXPERIENCE\n{experience_section}\n\n"
        "EDUCATION\n{education_section}\n\n"
        "CERTIFICATIONS\n{certifications_section}",
    ),
}

EXPERIENCE_TEMPLATES: dict[str, tuple[str, ...]] = {
    "backend": (
        "Built and maintained {domain} services at {company} using {skills}; owned API design, "
        "data modelling and production support.",
        "Led migration of a monolith into {primary_skill} services at {company}, cutting p95 "
        "latency and simplifying deployments with {other_skills}.",
        "Delivered payment, order and ledger features for {company}'s {domain} platform; wrote "
        "tests first and instrumented services end to end.",
        "Worked as {title} in a squad of six at {company}, reviewing code, mentoring juniors and "
        "shipping weekly with {skills}.",
    ),
    "frontend": (
        "Built customer-facing {domain} interfaces at {company} with {skills}; owned the design "
        "system and accessibility standards.",
        "Improved Core Web Vitals and conversion on {company}'s storefront using {primary_skill} "
        "and performance profiling.",
        "Shipped checkout, search and account flows as {title} at {company}, pairing closely with "
        "design and backend on {skills}.",
        "Maintained a shared component library at {company} used across several {domain} "
        "products; introduced testing with {skills}.",
    ),
    "ai_ml": (
        "Trained, evaluated and deployed {domain} models at {company} with {skills}; owned "
        "monitoring and retraining.",
        "Built retrieval-augmented and fine-tuned language model pipelines at {company} using "
        "{primary_skill} and {other_skills}.",
        "Worked as {title} at {company} turning research prototypes into production services "
        "for {domain} customers.",
        "Set up MLOps foundations at {company}: experiment tracking, model registry and CI for "
        "models with {skills}.",
    ),
    "data_science": (
        "Analysed {domain} product data at {company} with {skills}; designed experiments and "
        "reported to leadership.",
        "Built churn and demand forecasting models at {company} using {primary_skill}; "
        "productionised with the data engineering team.",
        "Worked as {title} at {company} defining metrics, building dashboards and running A/B "
        "tests for {domain} teams.",
        "Owned the analytics layer at {company}: warehouse models, notebooks and self-serve "
        "reporting built with {skills}.",
    ),
    "devops": (
        "Ran cloud infrastructure and CI/CD for {domain} services at {company} using {skills}.",
        "Migrated {company}'s workloads to Kubernetes with {primary_skill}, adding observability "
        "and cost controls.",
        "Worked as {title} at {company} on infrastructure as code, on-call and incident response "
        "for {domain} platforms.",
        "Built a paved-road deployment pipeline at {company} that cut release time from days to "
        "minutes using {skills}.",
    ),
    "qa": (
        "Built and maintained automated regression suites for {company}'s {domain} products with "
        "{skills}.",
        "Introduced {primary_skill} at {company}, raising automation coverage and removing flaky "
        "tests from the pipeline.",
        "Worked as {title} at {company} on API and UI test automation, performance checks and "
        "release sign-off for {domain} releases.",
        "Partnered with developers at {company} to shift testing left, defining acceptance "
        "criteria and test data strategies using {skills}.",
    ),
}

# ------------------------------------------------------------- communications

COMMUNICATION_PLACEHOLDERS: frozenset[str] = frozenset({"name", "role", "recruiter"})


class CommunicationTemplate(NamedTuple):
    summary: str  # <= 300 chars, Communication.summary
    notes: str
    next_action: str | None  # <= 200 chars


# Keyed by Communication.outcome. Channels that make sense for each outcome are in
# OUTCOME_CHANNELS.
COMMUNICATION_TEMPLATES: dict[str, tuple[CommunicationTemplate, ...]] = {
    "connected": (
        CommunicationTemplate(
            "{recruiter} contacted {name}",
            "Spoke with {name} about the {role} role. Interested, currently exploring options; "
            "walked through the team, stack and interview process.",
            "Schedule technical interview",
        ),
        CommunicationTemplate(
            "Intro call with {name} about the {role} position",
            "{name} confirmed interest and availability. Notice period and compensation "
            "expectations discussed; within range.",
            "Share JD and collect updated resume",
        ),
        CommunicationTemplate(
            "Screening call with {name}",
            "Good conversation. {name} explained recent projects and reasons for looking; "
            "communication is clear and motivation fits the {role} role.",
            "Align interview slots with the hiring manager",
        ),
    ),
    "no_answer": (
        CommunicationTemplate(
            "Called {name}, no answer",
            "Two attempts in the afternoon, no response. Left a WhatsApp message with the role "
            "summary.",
            "Retry call tomorrow morning",
        ),
        CommunicationTemplate(
            "Attempted to reach {name}",
            "Phone rang out. Will try a different time slot and send an email as a fallback.",
            "Send follow-up email",
        ),
    ),
    "voicemail": (
        CommunicationTemplate(
            "Left voicemail for {name}",
            "Introduced the {role} opportunity briefly and asked for a callback at a convenient "
            "time.",
            "Follow up if no callback within two days",
        ),
        CommunicationTemplate(
            "Voicemail left for {name} about {role}",
            "Mentioned {recruiter}'s number and email in the message. No callback yet.",
            "Try LinkedIn message",
        ),
    ),
    "email_sent": (
        CommunicationTemplate(
            "Emailed {name} about the {role} role",
            "Sent the JD, a short note about the team and a link to book an intro call.",
            "Wait for reply, follow up in three days",
        ),
        CommunicationTemplate(
            "Sent interview details to {name}",
            "Shared the interview schedule, panel names and video link; asked for confirmation.",
            "Confirm attendance a day before",
        ),
    ),
    "replied": (
        CommunicationTemplate(
            "{name} replied to the outreach",
            "{name} is interested and shared availability for a call this week.",
            "Book intro call",
        ),
        CommunicationTemplate(
            "{name} responded with questions about {role}",
            "Asked about work mode, team size and compensation band. Answered in detail.",
            "Schedule call to discuss further",
        ),
    ),
    "not_interested": (
        CommunicationTemplate(
            "{name} not interested at this time",
            "Recently accepted another offer; happy to stay in touch for future {role} openings.",
            None,
        ),
        CommunicationTemplate(
            "{name} declined the {role} opportunity",
            "Not looking to move right now because of an ongoing project. Asked to reconnect in "
            "six months.",
            None,
        ),
    ),
    "callback_requested": (
        CommunicationTemplate(
            "{name} asked for a callback",
            "Was in a meeting; requested {recruiter} call back after 6 PM.",
            "Call back this evening",
        ),
        CommunicationTemplate(
            "{name} requested a call at a later time",
            "Travelling this week. Prefers a conversation early next week.",
            "Call back on Monday",
        ),
    ),
}

OUTCOME_CHANNELS: dict[str, tuple[str, ...]] = {
    "connected": ("phone", "whatsapp", "linkedin", "in_person"),
    "no_answer": ("phone",),
    "voicemail": ("phone",),
    "email_sent": ("email",),
    "replied": ("email", "linkedin", "whatsapp"),
    "not_interested": ("phone", "email", "linkedin"),
    "callback_requested": ("phone", "whatsapp"),
}

# ---------------------------------------------------------- interview feedback

FEEDBACK_PLACEHOLDERS: frozenset[str] = frozenset(
    {"name", "primary_skill", "role", "round", "score"}
)


class ScoreBand(NamedTuple):
    """Interview scores in ``[low, high)`` (the last band includes 10.0) map to one
    recommendation and a pool of feedback templates."""

    low: float
    high: float
    recommendation: str  # pipeline.Interview.recommendation key
    templates: tuple[str, ...]


FEEDBACK_BANDS: tuple[ScoreBand, ...] = (
    ScoreBand(
        0.0,
        5.5,
        "reject",
        (
            "{name} struggled with the core {primary_skill} questions in the {round} round and "
            "could not reason through the design exercise. Communication was fine but depth is "
            "below what the {role} role needs. Score {score}/10.",
            "Fundamentals gaps in {primary_skill}; several answers were memorised rather than "
            "understood. Not a fit for {role} at this level. Score {score}/10.",
        ),
    ),
    ScoreBand(
        5.5,
        7.0,
        "hold",
        (
            "{name} has decent {primary_skill} knowledge but the {round} round exposed gaps in "
            "debugging and trade-off reasoning. Could work with mentoring; hold pending other "
            "candidates. Score {score}/10.",
            "Mixed round: strong on practical {primary_skill} tasks, weaker on system-level "
            "thinking expected from a {role}. Worth another conversation. Score {score}/10.",
        ),
    ),
    ScoreBand(
        7.0,
        9.0,
        "proceed",
        (
            "Strong {primary_skill} fundamentals and clear problem-solving in the {round} round. "
            "Good design instincts; a few gaps in scaling questions. Recommend proceeding for the "
            "{role} role. Score {score}/10.",
            "{name} explained past work in depth, handled follow-ups well and wrote clean code "
            "under time pressure. Proceed to the next round. Score {score}/10.",
        ),
    ),
    ScoreBand(
        9.0,
        10.0,
        "strong_proceed",
        (
            "Exceptional {round} round. {name} solved every problem with production-quality "
            "{primary_skill} and articulated trade-offs better than most of our current team. "
            "Strong hire for {role}. Score {score}/10.",
            "Outstanding depth and communication; {name} would raise the bar for the {role} team. "
            "Fast-track. Score {score}/10.",
        ),
    ),
)


def feedback_band(score: float) -> ScoreBand:
    """The band a 0..10 interview score falls into."""
    for band in FEEDBACK_BANDS:
        if band.low <= score < band.high:
            return band
    if score == FEEDBACK_BANDS[-1].high:
        return FEEDBACK_BANDS[-1]
    raise ValueError(f"score must be between 0 and 10, got {score!r}")


# --------------------------------------------------------------- JD activities

JD_ACTIVITY_PLACEHOLDERS: frozenset[str] = frozenset(
    {
        "actor",
        "title",
        "version",
        "fields",
        "from_status",
        "to_status",
        "person",
        "role",
        "source_title",
    }
)


class ActivityText(NamedTuple):
    title: str  # Activity.title, ready to render after format()
    description: str


# Keyed by the job_description event types from plan.md 6.4.
JD_ACTIVITY_DESCRIPTIONS: dict[str, ActivityText] = {
    "jd.created": ActivityText(
        "{actor} created the Job Description.",
        "{title} was created as version 1.",
    ),
    "jd.updated": ActivityText(
        "{actor} updated the Job Description.",
        "Version {version}: {fields}.",
    ),
    "jd.published": ActivityText(
        "{actor} published the Job Description.",
        "{title} is now open and visible in candidate search.",
    ),
    "jd.status_changed": ActivityText(
        "{actor} changed the status from {from_status} to {to_status}.",
        "{title}",
    ),
    "jd.participant_added": ActivityText(
        "{actor} added {person} as {role}.",
        "{person} now appears under People Involved in the Recruitment for {title}.",
    ),
    "jd.participant_removed": ActivityText(
        "{actor} removed {person} from the recruitment team.",
        "{person} no longer has a role on {title}.",
    ),
    "jd.duplicated": ActivityText(
        "{actor} duplicated {source_title}.",
        "Created {title} as a draft copy.",
    ),
    "jd.archived": ActivityText(
        "{actor} archived the Job Description.",
        "{title} no longer accepts candidates.",
    ),
}


# ---------------------------------------------------- candidate-level activities

# Event types whose timeline category depends on the status entered rather than
# on the type itself; look the category up with ``common.enums.STATUS_ENTRY_CATEGORY``.
STATUS_DEPENDENT_EVENT_TYPES: frozenset[str] = frozenset({"application.status_changed"})

# Every other event type from plan.md 6.4 with its fixed timeline category.
EVENT_TYPE_CATEGORIES: dict[str, str] = {
    "jd.created": "job_description",
    "jd.updated": "job_description",
    "jd.published": "job_description",
    "jd.status_changed": "job_description",
    "jd.participant_added": "job_description",
    "jd.participant_removed": "job_description",
    "jd.duplicated": "job_description",
    "jd.archived": "job_description",
    "search.completed": "candidate_search",
    "application.added_manually": "candidate_search",
    "application.ai_shortlisted": "candidate_shortlisted",
    "application.shortlisted": "candidate_shortlisted",
    "communication.logged": "candidate_contact",
    "interview.scheduled": "interview",
    "interview.rescheduled": "interview",
    "interview.cancelled": "interview",
    "interview.feedback_submitted": "interview_feedback",
    "offer.created": "offer",
    "offer.sent": "offer",
    "offer.accepted": "offer",
    "offer.declined": "offer",
    "offer.withdrawn": "offer",
    "onboarding.started": "onboarding",
    "onboarding.checklist_updated": "onboarding",
    "onboarding.completed": "onboarding",
    "application.rejected": "decision",
    "application.withdrawn": "decision",
    "application.on_hold": "decision",
    "application.resumed": "decision",
}

APPLICATION_ACTIVITY_PLACEHOLDERS: frozenset[str] = frozenset(
    {
        "actor",  # actor's first name
        "candidate",  # candidate full name
        "names",  # "John Doe, Jane Smith and Alex Kumar"
        "count",
        "sources",  # "Naukri and LinkedIn"
        "shortlisted",
        "source",  # single source label
        "from_status",  # status labels, not keys
        "to_status",
        "outcome",  # communication outcome label
        "next_action",
        "round",  # "Technical Interview"
        "interviewer",  # interviewer first name
        "duration",  # minutes
        "mode",  # interview mode label
        "score",
        "recommendation",  # recommendation label
        "designation",
        "ctc",  # formatted, e.g. "₹26,00,000"
        "start_date",  # formatted date
        "buddy",
        "item",  # onboarding checklist label
        "reason",
    }
)

# Keyed by the candidate-level event types from plan.md 6.4; the JD-level ones
# live in JD_ACTIVITY_DESCRIPTIONS. Titles reproduce the prompt's phrasing
# ("Priya contacted John Doe.", "Arun submitted interview feedback for John Doe.").
APPLICATION_ACTIVITY_DESCRIPTIONS: dict[str, ActivityText] = {
    "search.completed": ActivityText(
        "{actor} searched for candidates.",
        "{count} candidates found across {sources}; {shortlisted} AI shortlisted.",
    ),
    "application.added_manually": ActivityText(
        "{actor} added {candidate} manually.",
        "Added from {source} and placed in New.",
    ),
    "application.ai_shortlisted": ActivityText(
        "AI shortlisted {count} candidates.",
        "{names} scored at or above the shortlist threshold.",
    ),
    "application.shortlisted": ActivityText(
        "{actor} shortlisted {names}.",
        "Moved to TA Review for recruiter outreach.",
    ),
    "application.status_changed": ActivityText(
        "{actor} moved {candidate} from {from_status} to {to_status}.",
        "{candidate} is now in {to_status}.",
    ),
    "communication.logged": ActivityText(
        "{actor} contacted {candidate}.",
        "Status: {outcome}. Next: {next_action}.",
    ),
    "interview.scheduled": ActivityText(
        "{round} scheduled for {candidate}.",
        "Interviewer: {interviewer}. {duration} minutes over {mode}.",
    ),
    "interview.rescheduled": ActivityText(
        "{round} for {candidate} rescheduled.",
        "Interviewer: {interviewer}. New slot confirmed with the candidate.",
    ),
    "interview.cancelled": ActivityText(
        "{round} for {candidate} cancelled.",
        "Reason: {reason}",
    ),
    "interview.feedback_submitted": ActivityText(
        "{actor} submitted interview feedback for {candidate}.",
        "Score {score}/10. Recommendation: {recommendation}.",
    ),
    "offer.created": ActivityText(
        "{actor} drafted an offer for {candidate}.",
        "{designation}, {ctc} per year.",
    ),
    "offer.sent": ActivityText(
        "Offer sent to {candidate}.",
        "{designation}, {ctc} per year, joining on {start_date}.",
    ),
    "offer.accepted": ActivityText(
        "{candidate} accepted the offer.",
        "Signed offer letter received.",
    ),
    "offer.declined": ActivityText(
        "{candidate} declined the offer.",
        "Reason: {reason}",
    ),
    "offer.withdrawn": ActivityText(
        "{actor} withdrew the offer to {candidate}.",
        "Reason: {reason}",
    ),
    "onboarding.started": ActivityText(
        "Onboarding started for {candidate}.",
        "Start date {start_date}; buddy {buddy}.",
    ),
    "onboarding.checklist_updated": ActivityText(
        '{actor} completed "{item}" for {candidate}.',
        "Onboarding checklist updated.",
    ),
    "onboarding.completed": ActivityText(
        "{candidate} successfully onboarded.",
        "All checklist items complete; day-one orientation done.",
    ),
    "application.rejected": ActivityText(
        "{actor} rejected {candidate}.",
        "Reason: {reason}",
    ),
    "application.withdrawn": ActivityText(
        "{candidate} withdrew from the process.",
        "Reason: {reason}",
    ),
    "application.on_hold": ActivityText(
        "{actor} put {candidate} on hold.",
        "Reason: {reason}",
    ),
    "application.resumed": ActivityText(
        "{actor} resumed {candidate}.",
        "Back to {to_status}.",
    ),
}

# Status changes whose title the prompt spells out; fall back to the generic
# ``application.status_changed`` title for every other status.
STATUS_ENTRY_TITLES: dict[str, str] = {
    "selected": "{candidate} selected for the position.",
    "onboarded": "{candidate} successfully onboarded.",
}

# ------------------------------------------------------------ decision reasons

# Reasons required when an application enters rejected / withdrawn / on_hold
# (plan.md 6.5); also used as the second line of the matching timeline event.

REJECTION_REASONS: tuple[str, ...] = (
    "Did not clear the technical round; gaps in core fundamentals",
    "Experience below the minimum required for the role",
    "Compensation expectations well above the approved band",
    "Weak communication during the screening call",
    "Limited hands-on depth in the primary required skill",
    "Position filled by a stronger candidate",
    "Unable to relocate to the office location",
    "Did not turn up for the scheduled interview",
)

WITHDRAWAL_REASONS: tuple[str, ...] = (
    "Accepted another offer",
    "Received a counter-offer from current employer",
    "Offer declined",
    "Personal reasons; not looking to change right now",
    "Preferred a fully remote role",
)

HOLD_REASONS: tuple[str, ...] = (
    "Hiring freeze on the team until next quarter",
    "Waiting for the candidate's notice period clarification",
    "Awaiting hiring manager availability for the next round",
    "Candidate travelling; asked to reconnect in two weeks",
    "Budget approval pending for an additional opening",
)

DECISION_REASONS: dict[str, tuple[str, ...]] = {
    "rejected": REJECTION_REASONS,
    "withdrawn": WITHDRAWAL_REASONS,
    "on_hold": HOLD_REASONS,
}
