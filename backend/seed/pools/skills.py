"""Skill dictionary, per-role weighted skill pools, domains and certifications.

Skill *keys* are the canonical form plan.md 6.6 describes: exactly what
``matching.skills.normalize_skill`` returns, so they are what JD
``required_skills`` and ``CandidateSkill.skill`` store. ``SKILL_KEYS`` lists
every skill the pools know about; ``SKILL_DISPLAY`` maps each key to its display
name and is derived from ``matching.skills.display_name`` so the seed data and
the UI never disagree on spelling. ``matching.skills`` is pure Python, so this
package stays Django-free.
"""

from __future__ import annotations

from typing import NamedTuple

from matching.skills import display_name, normalize_skill

# ----------------------------------------------------------------- dictionary

SKILL_KEYS: tuple[str, ...] = (
    # Languages
    "python",
    "java",
    "javascript",
    "typescript",
    "go",
    "php",
    "r",
    "bash",
    "sql",
    "html",
    "css",
    "sass",
    # Backend frameworks and data stores
    "django",
    "fastapi",
    "flask",
    "nodejs",
    "spring boot",
    "rest",
    "graphql",
    "postgresql",
    "mysql",
    "mongodb",
    "redis",
    "elasticsearch",
    "celery",
    "rabbitmq",
    "kafka",
    "nginx",
    # Frontend
    "react",
    "nextjs",
    "redux",
    "tailwind css",
    "jest",
    "webpack",
    "vite",
    "storybook",
    "figma",
    "react native",
    "angular",
    "vue",
    "android",
    # AI and data
    "machine learning",
    "deep learning",
    "nlp",
    "computer vision",
    "llm",
    "mlops",
    "pytorch",
    "tensorflow",
    "langchain",
    "hugging face",
    "vector databases",
    "scikit-learn",
    "pandas",
    "numpy",
    "statistics",
    "data visualization",
    "spark",
    "airflow",
    "dbt",
    "snowflake",
    "bigquery",
    "tableau",
    "power bi",
    "excel",
    # Cloud and operations
    "aws",
    "azure",
    "google cloud",
    "docker",
    "kubernetes",
    "helm",
    "terraform",
    "ansible",
    "cicd",
    "jenkins",
    "github actions",
    "linux",
    "networking",
    "prometheus",
    "grafana",
    "git",
    # Quality
    "selenium",
    "playwright",
    "cypress",
    "appium",
    "cucumber",
    "testng",
    "postman",
    "jmeter",
    "test automation",
    "api testing",
    "manual testing",
    "jira",
    # Ways of working
    "agile",
    "scrum",
    "project management",
)

SKILL_DISPLAY: dict[str, str] = {key: display_name(key) for key in SKILL_KEYS}


def skill_key(name: str) -> str:
    """Canonical key for a display name or alias: the project-wide normaliser."""
    return normalize_skill(name)


# ------------------------------------------------------------------ role pools


class SkillWeight(NamedTuple):
    """One entry in a role pool. Weight is a sampling weight; tier ("core", "adjacent"
    or "stray") says why it is there."""

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
