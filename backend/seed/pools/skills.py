"""Skill dictionary, per-role weighted skill pools, domains and certifications.

Skill *keys* are the normalised form plan.md 6.6 describes (lowercase, no
punctuation or versions, synonyms folded): they are what ``matching.skills``
should produce for the display name, and what JD ``required_skills`` and
``CandidateSkill.skill`` store. ``SKILL_DISPLAY`` maps key -> display name.
"""

from __future__ import annotations

import re
from typing import NamedTuple

# ----------------------------------------------------------------- dictionary

SKILL_DISPLAY: dict[str, str] = {
    # Languages
    "python": "Python",
    "java": "Java",
    "javascript": "JavaScript",
    "typescript": "TypeScript",
    "go": "Go",
    "php": "PHP",
    "r": "R",
    "bash": "Bash",
    "sql": "SQL",
    "html": "HTML",
    "css": "CSS",
    "sass": "Sass",
    # Backend frameworks and data stores
    "django": "Django",
    "fastapi": "FastAPI",
    "flask": "Flask",
    "nodejs": "Node.js",
    "spring boot": "Spring Boot",
    "rest": "REST",
    "graphql": "GraphQL",
    "postgresql": "PostgreSQL",
    "mysql": "MySQL",
    "mongodb": "MongoDB",
    "redis": "Redis",
    "elasticsearch": "Elasticsearch",
    "celery": "Celery",
    "rabbitmq": "RabbitMQ",
    "kafka": "Kafka",
    "nginx": "Nginx",
    # Frontend
    "react": "React",
    "nextjs": "Next.js",
    "redux": "Redux",
    "tailwind css": "Tailwind CSS",
    "jest": "Jest",
    "webpack": "Webpack",
    "vite": "Vite",
    "storybook": "Storybook",
    "figma": "Figma",
    "react native": "React Native",
    "angular": "Angular",
    "vuejs": "Vue.js",
    "android": "Android",
    # AI and data
    "machine learning": "Machine Learning",
    "deep learning": "Deep Learning",
    "nlp": "NLP",
    "computer vision": "Computer Vision",
    "llm": "LLMs",
    "mlops": "MLOps",
    "pytorch": "PyTorch",
    "tensorflow": "TensorFlow",
    "langchain": "LangChain",
    "hugging face": "Hugging Face",
    "vector databases": "Vector Databases",
    "scikitlearn": "scikit-learn",
    "pandas": "Pandas",
    "numpy": "NumPy",
    "statistics": "Statistics",
    "data visualization": "Data Visualization",
    "spark": "Spark",
    "airflow": "Airflow",
    "dbt": "dbt",
    "snowflake": "Snowflake",
    "bigquery": "BigQuery",
    "tableau": "Tableau",
    "power bi": "Power BI",
    "excel": "Excel",
    # Cloud and operations
    "aws": "AWS",
    "azure": "Azure",
    "google cloud": "Google Cloud",
    "docker": "Docker",
    "kubernetes": "Kubernetes",
    "helm": "Helm",
    "terraform": "Terraform",
    "ansible": "Ansible",
    "cicd": "CI/CD",
    "jenkins": "Jenkins",
    "github actions": "GitHub Actions",
    "linux": "Linux",
    "networking": "Networking",
    "prometheus": "Prometheus",
    "grafana": "Grafana",
    "git": "Git",
    # Quality
    "selenium": "Selenium",
    "playwright": "Playwright",
    "cypress": "Cypress",
    "appium": "Appium",
    "cucumber": "Cucumber",
    "testng": "TestNG",
    "postman": "Postman",
    "jmeter": "JMeter",
    "test automation": "Test Automation",
    "api testing": "API Testing",
    "manual testing": "Manual Testing",
    "jira": "Jira",
    # Ways of working
    "agile": "Agile",
    "scrum": "Scrum",
    "project management": "Project Management",
}

# Synonym map from plan.md 6.6: alias -> canonical key.
SYNONYMS: dict[str, str] = {
    "postgres": "postgresql",
    "js": "javascript",
    "reactjs": "react",
    "node": "nodejs",
    "k8s": "kubernetes",
    "ml": "machine learning",
    "gcp": "google cloud",
    "ts": "typescript",
    "tf": "tensorflow",
    "ci/cd": "cicd",
    "restful": "rest",
}

_DISPLAY_TO_KEY: dict[str, str] = {display.lower(): key for key, display in SKILL_DISPLAY.items()}
_PUNCTUATION = re.compile(r"[^a-z0-9 ]+")
_VERSION_SUFFIX = re.compile(r"\s*\d+(\.\d+)*$")


def skill_key(name: str) -> str:
    """Normalised key for a display name or alias, consistent with plan.md 6.6.

    Known display names and synonyms resolve exactly; anything else is
    lowercased, stripped of a trailing version and punctuation, and
    whitespace-collapsed ("Python 3" -> "python", "Node.js" -> "nodejs").
    """
    lowered = name.strip().lower()
    if lowered in SYNONYMS:
        return SYNONYMS[lowered]
    if lowered in _DISPLAY_TO_KEY:
        return _DISPLAY_TO_KEY[lowered]
    stripped = _VERSION_SUFFIX.sub("", lowered)
    stripped = _PUNCTUATION.sub("", stripped)
    return " ".join(stripped.split())


# ------------------------------------------------------------------ role pools

TIERS: tuple[str, ...] = ("core", "adjacent", "stray")


class SkillWeight(NamedTuple):
    """One entry in a role pool. Weight is a sampling weight, tier says why it is there."""

    display: str
    weight: int
    tier: str

    @property
    def key(self) -> str:
        return skill_key(self.display)


def _pool(
    core: dict[str, int], adjacent: dict[str, int], stray: dict[str, int]
) -> tuple[SkillWeight, ...]:
    entries = [SkillWeight(display, weight, "core") for display, weight in core.items()]
    entries += [SkillWeight(display, weight, "adjacent") for display, weight in adjacent.items()]
    entries += [SkillWeight(display, weight, "stray") for display, weight in stray.items()]
    return tuple(entries)


# Keyed by JD title (plan.md section 10). Core skills include every required and
# preferred JD skill so a candidate sampling mostly core skills scores in the
# nineties; adjacent skills keep profiles realistic, stray skills pull weaker
# candidates down toward the 40 percent mark.
ROLE_SKILL_POOLS: dict[str, tuple[SkillWeight, ...]] = {
    "Senior Python Developer": _pool(
        core={
            "Python": 100, "Django": 90, "PostgreSQL": 88, "REST": 85, "Docker": 80, "Git": 95,
            "FastAPI": 70, "AWS": 72, "Redis": 68, "Celery": 60, "Kubernetes": 55, "SQL": 85,
        },
        adjacent={
            "Flask": 45, "MySQL": 40, "RabbitMQ": 30, "GraphQL": 30, "Linux": 40, "Nginx": 28,
            "MongoDB": 32, "CI/CD": 38, "Elasticsearch": 26,
        },
        stray={"React": 15, "Java": 12, "Selenium": 8, "Tableau": 6, "Android": 5, "PHP": 10},
    ),
    "React Developer": _pool(
        core={
            "React": 100, "TypeScript": 88, "JavaScript": 98, "HTML": 95, "CSS": 95, "REST": 80,
            "Next.js": 65, "Redux": 70, "Tailwind CSS": 62, "Jest": 66, "GraphQL": 50, "Git": 92,
        },
        adjacent={
            "Node.js": 45, "Webpack": 35, "Vite": 32, "Cypress": 30, "Sass": 38, "Figma": 28,
            "Storybook": 25, "React Native": 30,
        },
        stray={"Python": 15, "Java": 12, "Angular": 14, "Vue.js": 12, "PHP": 8, "MySQL": 10},
    ),
    "AI Engineer": _pool(
        core={
            "Python": 100, "PyTorch": 85, "Machine Learning": 95, "Deep Learning": 88, "NLP": 80,
            "MLOps": 62, "LangChain": 55, "TensorFlow": 60, "AWS": 58, "Vector Databases": 50,
            "Hugging Face": 65, "Docker": 70, "LLMs": 72,
        },
        adjacent={
            "Kubernetes": 35, "FastAPI": 40, "Spark": 30, "SQL": 45, "Computer Vision": 38,
            "scikit-learn": 42, "Airflow": 28, "Kafka": 22,
        },
        stray={"React": 12, "Java": 14, "Selenium": 6, "Tableau": 10, "Terraform": 8, "Android": 5},
    ),
    "Data Scientist": _pool(
        core={
            "Python": 100, "SQL": 95, "Statistics": 90, "Machine Learning": 85, "Pandas": 92,
            "Data Visualization": 80, "Spark": 55, "Tableau": 60, "scikit-learn": 78, "Airflow": 45,
            "Power BI": 50, "NumPy": 85,
        },
        adjacent={
            "R": 40, "Deep Learning": 35, "TensorFlow": 30, "Excel": 45, "Snowflake": 32,
            "dbt": 28, "BigQuery": 30, "Kafka": 18,
        },
        stray={"React": 10, "Java": 12, "Selenium": 5, "Kubernetes": 8, "Django": 12, "Android": 4},
    ),
    "DevOps Engineer": _pool(
        core={
            "AWS": 100, "Kubernetes": 90, "Docker": 95, "Terraform": 85, "CI/CD": 92, "Linux": 96,
            "Python": 70, "Ansible": 60, "Prometheus": 62, "Helm": 55, "Bash": 88, "Jenkins": 58,
        },
        adjacent={
            "Azure": 40, "Google Cloud": 38, "Grafana": 45, "GitHub Actions": 42, "Nginx": 35,
            "Kafka": 22, "Networking": 44, "Go": 30,
        },
        stray={"React": 8, "Django": 10, "Tableau": 5, "Selenium": 8, "Android": 4, "PyTorch": 6},
    ),
    "QA Automation Engineer": _pool(
        core={
            "Selenium": 100, "Java": 88, "Test Automation": 95, "API Testing": 90, "CI/CD": 70,
            "Playwright": 55, "Cypress": 58, "Postman": 80, "JMeter": 50, "TestNG": 65,
            "Manual Testing": 85, "SQL": 72,
        },
        adjacent={
            "Python": 45, "JavaScript": 42, "Appium": 35, "Cucumber": 40, "Jenkins": 44,
            "REST": 40, "Git": 45, "Jira": 44,
        },
        stray={
            "React": 10, "Kubernetes": 8, "PyTorch": 4,
            "Tableau": 6, "Terraform": 5, "Django": 8,
        },
    ),
}  # fmt: skip

# --------------------------------------------------------------------- domains

DOMAINS: tuple[str, ...] = (
    "fintech",
    "banking",
    "healthcare",
    "pharma",
    "ecommerce",
    "retail",
    "saas",
    "enterprise software",
    "edtech",
    "logistics",
    "telecom",
    "insurance",
    "travel",
)

_ADJACENT_PAIRS: tuple[tuple[str, str], ...] = (
    ("fintech", "banking"),
    ("healthcare", "pharma"),
    ("ecommerce", "retail"),
    ("saas", "enterprise software"),
)


def _adjacency() -> dict[str, frozenset[str]]:
    neighbours: dict[str, set[str]] = {domain: set() for domain in DOMAINS}
    for left, right in _ADJACENT_PAIRS:
        neighbours[left].add(right)
        neighbours[right].add(left)
    return {domain: frozenset(found) for domain, found in neighbours.items()}


# Symmetric adjacency map from plan.md 6.6 (adjacent domains score 60, not 100).
DOMAIN_ADJACENCY: dict[str, frozenset[str]] = _adjacency()

# -------------------------------------------------------------- certifications


class Certification(NamedTuple):
    name: str
    issuer: str
    related_skills: tuple[str, ...]  # skill keys; a name overlapping a required skill adds 10


CERTIFICATIONS: tuple[Certification, ...] = (
    Certification("AWS Solutions Architect Associate", "Amazon Web Services", ("aws",)),
    Certification(
        "CKA: Certified Kubernetes Administrator",
        "Cloud Native Computing Foundation",
        ("kubernetes", "docker", "helm"),
    ),
    Certification(
        "GCP Professional Data Engineer", "Google Cloud", ("google cloud", "bigquery", "spark")
    ),
    Certification(
        "PMP: Project Management Professional",
        "Project Management Institute",
        ("project management", "agile"),
    ),
    Certification("Azure Fundamentals (AZ-900)", "Microsoft", ("azure",)),
    Certification(
        "TensorFlow Developer Certificate",
        "Google",
        ("tensorflow", "deep learning", "machine learning"),
    ),
    Certification(
        "ISTQB Certified Tester Foundation Level", "ISTQB", ("manual testing", "test automation")
    ),
    Certification("Certified Scrum Master", "Scrum Alliance", ("scrum", "agile")),
)

CERTIFICATIONS_BY_NAME: dict[str, Certification] = {cert.name: cert for cert in CERTIFICATIONS}
