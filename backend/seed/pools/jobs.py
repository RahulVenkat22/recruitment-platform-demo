"""The six seeded job descriptions (plan.md section 10), with participants and
three versions each. Field names mirror ``jobs.JobDescription`` (plan.md 6.3) so a
spec's ``content_fields()`` can be passed straight to the model.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import Any

from seed.pools.users import (
    ANITHA,
    ARUN,
    DIVYA,
    KARTHIK,
    LAKSHMI,
    NISHA,
    PRIYA,
    RAHUL,
    SURESH,
)

# JobDescription columns captured in a version snapshot (plan.md 6.3 "all content fields").
CONTENT_FIELDS: tuple[str, ...] = (
    "title",
    "department",
    "location",
    "work_mode",
    "employment_type",
    "experience_min_years",
    "experience_max_years",
    "salary_min",
    "salary_max",
    "salary_currency",
    "required_skills",
    "preferred_skills",
    "education_requirements",
    "responsibilities",
    "qualifications",
    "additional_requirements",
    "description",
    "domain",
    "openings",
)

_LINE_FIELDS = frozenset({"responsibilities", "qualifications"})
_LIST_FIELDS = frozenset({"required_skills", "preferred_skills"})


@dataclass(frozen=True)
class Participant:
    email: str
    role: str  # jobs.RecruitmentParticipant.role_in_recruitment key


@dataclass(frozen=True)
class VersionSpec:
    """One ``JobDescriptionVersion``. ``overrides`` are the content fields whose value
    differed from the *current* JD at that version, so ``snapshot(v)`` is
    ``content_fields() | overrides``; the final version has none."""

    version: int
    change_summary: str
    author_email: str
    offset_minutes: int  # minutes after the JD's created_at
    overrides: Mapping[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class JobSpec:
    title: str
    role_family: str  # people.ROLE_FAMILIES key
    department: str
    location: str
    work_mode: str
    employment_type: str
    experience_min_years: int
    experience_max_years: int
    salary_min: int  # INR per year
    salary_max: int
    required_skills: tuple[str, ...]  # normalised skill keys
    preferred_skills: tuple[str, ...]
    education_requirements: str
    responsibilities: tuple[str, ...]  # one entry per line
    qualifications: tuple[str, ...]
    additional_requirements: str
    description: str
    domain: str
    status: str
    openings: int
    created_by: str  # user email; also the "owner" participant
    participants: tuple[Participant, ...]
    versions: tuple[VersionSpec, ...]
    salary_currency: str = "INR"

    def content_fields(self) -> dict[str, Any]:
        """Current content in model shape: skills as lists, line fields newline-joined."""
        return {name: _coerce(name, getattr(self, name)) for name in CONTENT_FIELDS}

    def snapshot(self, version: int) -> dict[str, Any]:
        """Content of ``version`` (1-based) in the same shape as ``content_fields()``."""
        spec = next(v for v in self.versions if v.version == version)
        content = self.content_fields()
        content.update({name: _coerce(name, value) for name, value in spec.overrides.items()})
        return content


def _coerce(name: str, value: Any) -> Any:
    if name in _LINE_FIELDS and not isinstance(value, str):
        return "\n".join(value)
    if name in _LIST_FIELDS:
        return list(value)
    return value


def _paragraph(raw: str) -> str:
    return " ".join(raw.split())


def _description(*paragraphs: str) -> str:
    return "\n\n".join(_paragraph(p) for p in paragraphs)


# ------------------------------------------------------------------- the jobs

SENIOR_PYTHON_DEVELOPER = JobSpec(
    title="Senior Python Developer",
    role_family="backend",
    department="Engineering",
    location="Chennai",
    work_mode="hybrid",
    employment_type="full_time",
    experience_min_years=4,
    experience_max_years=8,
    salary_min=1_800_000,
    salary_max=2_800_000,
    required_skills=("python", "django", "postgresql", "rest", "docker", "git"),
    preferred_skills=("fastapi", "aws", "redis", "celery", "kubernetes"),
    education_requirements="B.Tech / B.E in Computer Science or a related field",
    responsibilities=(
        "Design, build and operate Django and FastAPI services for payments and ledgers",
        "Model financial workflows in PostgreSQL with attention to consistency and performance",
        "Expose well-documented REST APIs to partner banks and merchant applications",
        "Write tests first and keep coverage high on the services you own",
        "Instrument services with metrics, logs and traces and join a light on-call rotation",
        "Review pull requests and mentor two to three mid-level engineers",
        "Work with product and compliance to turn regulatory requirements into technical designs",
    ),
    qualifications=(
        "4 to 8 years of professional software development, most of it in Python",
        "Production experience with Django or a comparable web framework",
        "Strong relational database skills, ideally PostgreSQL",
        "Experience shipping containerised services on a public cloud",
        "Clear written and spoken communication with technical and non-technical colleagues",
    ),
    additional_requirements=(
        "Hybrid: three days a week from the Chennai office. Prior fintech or payments experience "
        "is a strong plus. Candidates must be able to join within 60 days."
    ),
    description=_description(
        """
        Aimious is building the payments and lending platform that powers a fast-growing fintech
        customer base across India, and we are looking for a Senior Python Developer to join the
        core platform team in Chennai. You will own services that move money, reconcile ledgers
        and expose clean APIs to partner banks and merchant applications, so correctness,
        observability and thoughtful design matter more here than raw feature velocity.
        """,
        """
        The role sits inside a squad of six engineers working closely with product, compliance
        and the data team. Day to day you will design and build Django and FastAPI services
        backed by PostgreSQL, model complex financial workflows, and make pragmatic trade-offs
        between consistency, latency and cost. You will review pull requests, mentor two or three
        mid-level engineers, and take part in a light on-call rotation with strong runbooks and
        tooling to support you.
        """,
        """
        We expect you to bring deep Python fluency, a good understanding of relational data
        modelling and query performance, and experience running services in containers on a
        public cloud. Familiarity with event-driven patterns, idempotent processing and audit
        trails will help you ramp quickly, as much of our domain revolves around ledgers and
        settlement. You should be comfortable writing tests first, instrumenting code with
        metrics and traces, and explaining technical decisions to non-engineers.
        """,
        """
        We work hybrid from our Chennai office, typically three days a week on site, with
        flexible hours around core collaboration time. Compensation is competitive for the market
        and includes health insurance for you and your family, a learning budget and an annual
        performance bonus. If you enjoy building dependable systems in a regulated domain and want
        your work to be visible to millions of end users, we would like to talk to you.
        """,
    ),
    domain="fintech",
    status="open",
    openings=1,
    created_by=RAHUL,
    participants=(
        Participant(RAHUL, "owner"),
        Participant(PRIYA, "recruiter"),
        Participant(ARUN, "hiring_manager"),
        Participant(DIVYA, "interviewer"),
    ),
    versions=(
        VersionSpec(
            1,
            "Created",
            RAHUL,
            0,
            {
                "experience_min_years": 3,
                "experience_max_years": 6,
                "preferred_skills": ("fastapi", "redis", "celery", "kubernetes"),
            },
        ),
        VersionSpec(
            2,
            "Added AWS to preferred skills",
            RAHUL,
            130,
            {"experience_min_years": 3, "experience_max_years": 6},
        ),
        VersionSpec(3, "Raised experience to 4–8 yrs", PRIYA, 280),
    ),
)

REACT_DEVELOPER = JobSpec(
    title="React Developer",
    role_family="frontend",
    department="Engineering",
    location="Bengaluru",
    work_mode="onsite",
    employment_type="full_time",
    experience_min_years=2,
    experience_max_years=5,
    salary_min=800_000,
    salary_max=1_500_000,
    required_skills=("react", "typescript", "javascript", "html", "css", "rest"),
    preferred_skills=("nextjs", "redux", "tailwind css", "jest", "graphql"),
    education_requirements="Bachelor's degree in Computer Science, IT or equivalent experience",
    responsibilities=(
        "Build product discovery, cart and checkout experiences in React and TypeScript",
        "Translate Figma designs into accessible, reusable and well-tested components",
        "Improve Core Web Vitals on the storefront pages that drive conversion",
        "Extend the shared design system and component library used across three web properties",
        "Integrate REST and GraphQL APIs and handle loading, error and empty states gracefully",
        "Ship behind feature flags and review experiment results with product every week",
    ),
    qualifications=(
        "2 to 5 years of frontend development with React in production",
        "Solid TypeScript and modern JavaScript, including async patterns and bundling",
        "Good understanding of browser rendering, layout and network performance",
        "Experience writing unit and integration tests for UI code",
        "Portfolio, open-source work or side projects that show shipped frontend work",
    ),
    additional_requirements=(
        "On-site in Bengaluru, five days a week. Experience with A/B testing platforms and "
        "server-side rendering is a plus."
    ),
    description=_description(
        """
        Our ecommerce storefront serves millions of shoppers every month across web and mobile
        web, and the React Developer we hire will shape what those customers see first. You will
        join the storefront team in Bengaluru to build product discovery, cart and checkout
        experiences that are fast on low-end devices, accessible by default and easy for
        merchandising teams to configure without engineering help.
        """,
        """
        You will work in a cross-functional squad with a product manager, a designer and backend
        engineers who expose REST and GraphQL APIs. Expect to translate high-fidelity Figma
        designs into reusable, well-tested components, improve Core Web Vitals on the pages that
        matter most for conversion, and take part in weekly experiment reviews where we look at
        how your changes moved real business metrics. You will also help evolve our design system
        and component library, which is shared across three web properties.
        """,
        """
        We are looking for someone with solid production experience in React and TypeScript who
        understands the browser: rendering, layout, network waterfalls and the trade-offs of
        client versus server rendering. You should be comfortable with modern state management,
        writing unit and integration tests, and debugging performance issues with the browser
        profiler. Experience with Next.js, Tailwind CSS or a large design system is a plus, as is
        any exposure to A/B testing platforms.
        """,
        """
        This is an on-site role in our Bengaluru office. The team ships to production several
        times a day behind feature flags, so you will see the impact of your work quickly. We
        offer a competitive salary, comprehensive health cover, meals on site and a generous
        learning allowance. Early-career engineers who have shipped meaningful frontend work,
        including strong open-source contributions or side projects, are encouraged to apply.
        """,
    ),
    domain="ecommerce",
    status="open",
    openings=3,
    created_by=PRIYA,
    participants=(
        Participant(PRIYA, "owner"),
        Participant(KARTHIK, "recruiter"),
        Participant(LAKSHMI, "hiring_manager"),
        Participant(DIVYA, "interviewer"),
    ),
    versions=(
        VersionSpec(
            1,
            "Created",
            PRIYA,
            0,
            {"required_skills": ("react", "javascript", "html", "css", "rest"), "openings": 2},
        ),
        VersionSpec(2, "Added TypeScript to required skills", LAKSHMI, 95, {"openings": 2}),
        VersionSpec(3, "Increased openings from 2 to 3", PRIYA, 2_880),
    ),
)

AI_ENGINEER = JobSpec(
    title="AI Engineer",
    role_family="ai_ml",
    department="Data",
    location="Remote",
    work_mode="remote",
    employment_type="full_time",
    experience_min_years=3,
    experience_max_years=7,
    salary_min=2_000_000,
    salary_max=3_500_000,
    required_skills=("python", "pytorch", "machine learning", "deep learning", "nlp", "mlops"),
    preferred_skills=("langchain", "tensorflow", "aws", "vector databases"),
    education_requirements=(
        "Master's degree in Computer Science, AI or a quantitative field, or a Bachelor's with "
        "equivalent applied experience"
    ),
    responsibilities=(
        "Fine-tune open large language models on de-identified clinical text",
        "Build retrieval-augmented pipelines over medical knowledge bases",
        "Design evaluation suites with clinicians that go beyond accuracy",
        "Own the MLOps stack: versioning, monitoring, rollback and reproducible training",
        "Containerise and serve models efficiently on cloud GPUs",
        "Define human-in-the-loop review, bias checks and audit logging for production models",
        "Explain model behaviour, failure modes and guardrails to non-technical stakeholders",
    ),
    qualifications=(
        "3 to 7 years in applied machine learning with at least one system shipped to real users",
        "Strong Python and hands-on PyTorch experience",
        "Practical NLP experience, including transformer models and modern fine-tuning workflows",
        "Comfort with vector databases, prompt engineering and evaluation tooling",
        "Experience with containers, cloud deployment and MLOps practices",
        "Respect for patient privacy and the ability to work with de-identified data responsibly",
    ),
    additional_requirements=(
        "Fully remote within India with quarterly in-person meetups. Healthcare experience is "
        "valuable but not required."
    ),
    description=_description(
        """
        We are hiring an AI Engineer to build the intelligence layer of our healthcare platform,
        which helps hospitals and diagnostic chains across India triage patient records,
        summarise clinical notes and surface risks earlier. This is a fully remote role open to
        candidates anywhere in India, with quarterly in-person meetups and a small, senior team
        that ships applied machine learning to production every sprint.
        """,
        """
        You will take models from experiment to deployed service: fine-tuning open large language
        models on de-identified clinical text, building retrieval-augmented pipelines over medical
        knowledge bases, evaluating outputs with clinicians, and running everything inside a
        reproducible MLOps stack with proper versioning, monitoring and rollback. You will
        collaborate with a Lead Data Scientist, backend engineers and a clinical advisory group,
        and you will be expected to explain model behaviour, failure modes and safety guardrails
        clearly to people who do not write code.
        """,
        """
        The ideal candidate has strong Python skills, hands-on experience with PyTorch and modern
        NLP, and has deployed at least one machine learning system that real users depended on.
        You should understand evaluation beyond accuracy, be comfortable with vector databases
        and prompt or fine-tuning workflows, and know how to containerise and serve models
        efficiently on cloud GPUs. Healthcare experience is valuable but not required; curiosity
        about the domain and respect for patient privacy are.
        """,
        """
        We care about responsible AI. You will help define our human-in-the-loop review process,
        bias checks and audit logging, and you will have time set aside for reading and
        experimentation. Compensation is at the top of the market for applied AI roles in India,
        with health insurance, home-office setup and a hardware budget. If you want your work to
        make clinicians faster and patients safer, apply with a note on a system you shipped and
        what you learned from it.
        """,
    ),
    domain="healthcare",
    status="open",
    openings=1,
    created_by=RAHUL,
    participants=(
        Participant(RAHUL, "owner"),
        Participant(ANITHA, "recruiter"),
        Participant(SURESH, "hiring_manager"),
    ),
    versions=(
        VersionSpec(
            1,
            "Created",
            RAHUL,
            0,
            {
                "work_mode": "hybrid",
                "location": "Bengaluru",
                "salary_min": 1_800_000,
                "salary_max": 3_000_000,
            },
        ),
        VersionSpec(
            2,
            "Switched from hybrid in Bengaluru to fully remote to widen the talent pool",
            ANITHA,
            1_440,
            {"salary_min": 1_800_000, "salary_max": 3_000_000},
        ),
        VersionSpec(3, "Raised salary band to ₹20L–₹35L", RAHUL, 4_320),
    ),
)

DATA_SCIENTIST = JobSpec(
    title="Data Scientist",
    role_family="data_science",
    department="Data",
    location="Hyderabad",
    work_mode="hybrid",
    employment_type="full_time",
    experience_min_years=2,
    experience_max_years=6,
    salary_min=1_200_000,
    salary_max=2_400_000,
    required_skills=(
        "python",
        "sql",
        "statistics",
        "machine learning",
        "pandas",
        "data visualization",
    ),
    preferred_skills=("spark", "tableau", "scikit-learn", "airflow"),
    education_requirements=(
        "Bachelor's or Master's degree in Statistics, Mathematics, Computer Science or a related "
        "quantitative field"
    ),
    responsibilities=(
        "Frame ambiguous product and growth questions as analytical problems",
        "Pull and shape data with SQL and Python and communicate findings with clear visuals",
        "Design and analyse A/B tests and guard experiment validity",
        "Build forecasting and propensity models and productionise the useful ones",
        "Maintain metric definitions, reusable notebooks and lightweight Tableau dashboards",
        "Partner with product, growth and customer success on churn, retention and expansion",
    ),
    qualifications=(
        "2 to 6 years of applied analytics or data science experience",
        "Strong applied statistics and experiment design",
        "Fluency in Python's data stack: pandas, NumPy and scikit-learn",
        "Advanced SQL on large analytical datasets",
        "Ability to explain reasoning and trade-offs to sceptical stakeholders",
    ),
    additional_requirements=(
        "Hybrid from the Hyderabad office, two to three days a week. Familiarity with SaaS metrics "
        "such as retention, expansion and cohort analysis is a plus."
    ),
    description=_description(
        """
        Our SaaS platform is used by more than eight thousand businesses to run their customer
        support and billing, and every interaction generates data that can make the product
        better. We are looking for a Data Scientist to join the analytics team in Hyderabad and
        turn that data into insight: understanding churn, sizing the impact of new features,
        designing experiments and building models that product managers actually use.
        """,
        """
        You will partner with product, growth and customer success teams to frame ambiguous
        business questions as analytical problems, pull and shape data with SQL and Python, and
        communicate findings through clear visualisations and short written narratives. You will
        design and analyse A/B tests, build and maintain forecasting and propensity models, and
        productionise the ones that prove useful with our data engineers using Airflow and Spark.
        Along the way you will help raise the analytical bar for the company through reusable
        notebooks, metric definitions and lightweight dashboards in Tableau.
        """,
        """
        We expect strong applied statistics, fluency in Python's data stack, and the judgement
        to know when a simple regression beats a complex model. You should be comfortable owning
        a question from raw data to recommendation, be rigorous about data quality and experiment
        validity, and enjoy explaining your reasoning to sceptical stakeholders. Familiarity with
        SaaS metrics such as retention, expansion and cohort analysis will help you move fast.
        """,
        """
        The role is hybrid from our Hyderabad office, with two to three days a week on site. We
        offer a competitive salary, health cover, a learning stipend for courses and conferences,
        and time to publish internal research. Candidates from two years of experience upward
        are welcome; we value evidence of impact over tenure and are happy to talk to people
        making the move from analytics engineering or research.
        """,
    ),
    domain="saas",
    status="open",
    openings=2,
    created_by=KARTHIK,
    participants=(Participant(KARTHIK, "owner"), Participant(SURESH, "hiring_manager")),
    versions=(
        VersionSpec(
            1,
            "Created",
            KARTHIK,
            0,
            {"preferred_skills": ("spark", "tableau", "scikit-learn"), "experience_min_years": 3},
        ),
        VersionSpec(
            2,
            "Added Airflow to preferred skills",
            SURESH,
            200,
            {"experience_min_years": 3},
        ),
        VersionSpec(3, "Lowered minimum experience to 2 years", KARTHIK, 5_760),
    ),
)

DEVOPS_ENGINEER = JobSpec(
    title="DevOps Engineer",
    role_family="devops",
    department="Platform",
    location="Chennai",
    work_mode="onsite",
    employment_type="full_time",
    experience_min_years=3,
    experience_max_years=6,
    salary_min=1_400_000,
    salary_max=2_400_000,
    required_skills=("aws", "kubernetes", "docker", "terraform", "cicd", "linux"),
    preferred_skills=("python", "ansible", "prometheus", "helm"),
    education_requirements="B.Tech / B.E in Computer Science, IT or a related engineering field",
    responsibilities=(
        "Own infrastructure as code with Terraform across multiple AWS accounts",
        "Harden, upgrade and operate the Kubernetes platform that runs payment services",
        "Build and maintain CI/CD pipelines that application teams trust",
        "Drive the reliability practice: SLOs, alerting and blameless post-incident reviews",
        "Pair with application teams to make services production-ready",
        "Lead capacity planning and cloud cost optimisation",
        "Produce compliance evidence such as access reviews and change records for auditors",
    ),
    qualifications=(
        "3 to 6 years of hands-on Linux, cloud and container operations",
        "Kubernetes in production, including upgrades and troubleshooting",
        "Fluency in Python or Bash for automation",
        "Solid networking fundamentals, secrets management and security controls",
        "Experience with Terraform or another infrastructure-as-code tool",
    ),
    additional_requirements=(
        "On-site in Chennai with a paid on-call rotation. Experience with Prometheus, Grafana, "
        "Helm and GitOps workflows is a strong plus."
    ),
    description=_description(
        """
        The platform team keeps a regulated fintech stack running for banks, lenders and
        merchants who expect their money movement to work every second of the day. We are hiring
        a DevOps Engineer in Chennai to help us run and continuously improve that infrastructure:
        multi-account AWS, Kubernetes clusters, a paved-road CI/CD pipeline and the observability
        that lets a small team sleep at night.
        """,
        """
        You will own infrastructure as code with Terraform, harden and upgrade our Kubernetes
        platform, build and maintain deployment pipelines that engineers trust, and drive our
        reliability practice with SLOs, alerting and blameless post-incident reviews. You will
        pair with application teams to make services production-ready, help with capacity
        planning and cost optimisation, and contribute to the compliance evidence our auditors
        ask for, from access reviews to change records.
        """,
        """
        We are looking for hands-on Linux and cloud experience, comfort with containers and
        Kubernetes in production, and real fluency in at least one scripting language, ideally
        Python or Bash. You should understand networking fundamentals, secrets management and the
        security controls a payments company needs, and you should be the kind of engineer who
        automates a task the second time it comes up. Experience with Prometheus and Grafana,
        Helm charts and GitOps workflows is a strong plus.
        """,
        """
        This is an on-site role in our Chennai office because the team works closely with
        security and operations colleagues, with a paid on-call rotation and generous time off
        after incidents. We offer a competitive salary, health insurance for your family,
        certification sponsorship and a modern engineering culture that treats infrastructure as
        a product. If you enjoy making complex systems boring and reliable, we would like to hear
        from you.
        """,
    ),
    domain="fintech",
    status="open",
    openings=1,
    created_by=ANITHA,
    participants=(
        Participant(ANITHA, "owner"),
        Participant(NISHA, "hiring_manager"),
        Participant(ARUN, "interviewer"),
    ),
    versions=(
        VersionSpec(
            1,
            "Created",
            ANITHA,
            0,
            {
                "required_skills": ("aws", "kubernetes", "docker", "terraform", "jenkins", "linux"),
                "preferred_skills": ("python", "ansible", "prometheus"),
            },
        ),
        VersionSpec(
            2,
            "Replaced Jenkins with a general CI/CD requirement so GitHub Actions and GitLab "
            "candidates qualify",
            NISHA,
            300,
            {"preferred_skills": ("python", "ansible", "prometheus")},
        ),
        VersionSpec(3, "Added Helm to preferred skills", ANITHA, 3_000),
    ),
)

QA_AUTOMATION_ENGINEER = JobSpec(
    title="QA Automation Engineer",
    role_family="qa",
    department="Engineering",
    location="Pune",
    work_mode="hybrid",
    employment_type="full_time",
    experience_min_years=2,
    experience_max_years=5,
    salary_min=700_000,
    salary_max=1_400_000,
    required_skills=("selenium", "java", "test automation", "api testing", "cicd"),
    preferred_skills=("playwright", "cypress", "postman", "jmeter"),
    education_requirements="Bachelor's degree in Computer Science, IT or a related field",
    responsibilities=(
        "Build and maintain end-to-end test suites for the web storefront and public APIs",
        "Extend the automation framework so product teams can add tests easily",
        "Integrate test suites into the CI/CD pipeline with fast, reliable feedback",
        "Analyse flaky tests to root cause and keep the release train green",
        "Define acceptance criteria and testability with developers during refinement",
        "Run targeted performance checks on checkout and payment paths before peak sale events",
    ),
    qualifications=(
        "2 to 5 years of test automation experience on web and API layers",
        "Practical Selenium experience, or Playwright / Cypress with willingness to work in both",
        "Strong programming skills in Java or a comparable language",
        "Hands-on API testing with Postman or REST Assured",
        "Comfort reading logs and querying databases to isolate defects",
    ),
    additional_requirements=(
        "Hybrid from the Pune office, three days a week. Exposure to JMeter or another load "
        "testing tool is welcome; ISTQB certification is sponsored."
    ),
    description=_description(
        """
        We are looking for a QA Automation Engineer to join the quality engineering team behind
        our ecommerce marketplace in Pune. The marketplace handles catalogue, search, checkout
        and post-order flows for millions of customers, and releases ship daily, so automated
        confidence is not optional. You will design and grow the test automation that keeps that
        release train safe.
        """,
        """
        You will build and maintain end-to-end test suites for web and API layers, extend the
        framework so product teams can add tests easily, and integrate everything into the CI/CD
        pipeline with fast, reliable feedback. You will analyse flaky tests to their root cause,
        partner with developers during story refinement to define acceptance criteria and
        testability, and run targeted performance checks on checkout and payment paths before
        peak sale events.
        """,
        """
        The ideal candidate has practical experience with Selenium or a modern browser automation
        tool such as Playwright or Cypress, strong programming skills in Java or a similar
        language, and hands-on API testing with tools such as Postman or REST Assured. You should
        be comfortable reading logs and databases to isolate defects, understand how to structure
        test data and environments, and be able to explain risk to product stakeholders in plain
        language. Exposure to JMeter or another load testing tool is welcome.
        """,
        """
        This is a hybrid role from our Pune office with three days a week on site. We offer a
        competitive salary, health cover, sponsored certifications such as ISTQB and a clear
        growth path into SDET and quality architecture roles. Early-career engineers with a
        strong automation portfolio and a habit of asking how things could break are encouraged
        to apply.
        """,
    ),
    domain="ecommerce",
    status="archived",
    openings=1,
    created_by=PRIYA,
    participants=(Participant(PRIYA, "owner"),),
    versions=(
        VersionSpec(
            1,
            "Created",
            PRIYA,
            0,
            {
                "preferred_skills": ("cypress", "postman", "jmeter"),
                "experience_min_years": 3,
                "experience_max_years": 6,
            },
        ),
        VersionSpec(
            2,
            "Added Playwright to preferred skills",
            PRIYA,
            420,
            {"experience_min_years": 3, "experience_max_years": 6},
        ),
        VersionSpec(
            3, "Reduced required experience to 2–5 years after hiring manager review", PRIYA, 2_160
        ),
    ),
)

JOBS: tuple[JobSpec, ...] = (
    SENIOR_PYTHON_DEVELOPER,
    REACT_DEVELOPER,
    AI_ENGINEER,
    DATA_SCIENTIST,
    DEVOPS_ENGINEER,
    QA_AUTOMATION_ENGINEER,
)

JOBS_BY_TITLE: dict[str, JobSpec] = {job.title: job for job in JOBS}
