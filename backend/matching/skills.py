"""Skill normalisation shared by seed data, JD saving, candidate saving and matching.

Pure Python: no Django imports. Every stored skill name passes through
``normalize_skill`` so that comparisons between JD and candidate skills are exact
string equality on canonical keys (plan.md 6.6).

Pipeline for ``normalize_skill``:

1. lowercase, trim, collapse whitespace
2. synonym lookup on the raw form (catches ``ci/cd``, ``node.js``, ``s3`` before
   punctuation and version stripping would mangle them)
3. replace punctuation other than ``+`` and ``#`` with spaces and collapse again
4. strip a trailing version number (``python 3.11`` -> ``python``, ``vue 3`` -> ``vue``)
5. synonym lookup on the cleaned form

A version is only recognised after whitespace: digits glued to letters are part of
the name (``d3``, ``web3``, ``es6``, ``s3``), so the common glued forms that *are*
versions (``python3``, ``html5``, ``css3``) live in ``SYNONYMS`` instead.

Every value in ``SYNONYMS`` is a fixed point of the function, so normalising twice
equals normalising once, and no entry maps a key to itself.
"""

from __future__ import annotations

import re
from collections.abc import Iterable

_WHITESPACE = re.compile(r"\s+")
_PUNCTUATION = re.compile(r"[^\w\s+#]", re.UNICODE)
_UNDERSCORE = re.compile(r"_+")
# A trailing version: whitespace, then digits with optional dotted parts, at the end.
_TRAILING_VERSION = re.compile(r"\s+\d+(?:\.\d+)*$")

SYNONYMS: dict[str, str] = {
    # languages
    "py": "python",
    "python3": "python",
    "golang": "go",
    "js": "javascript",
    "ecmascript": "javascript",
    "ts": "typescript",
    "c plus plus": "c++",
    "cpp": "c++",
    "csharp": "c#",
    "c sharp": "c#",
    "objective-c": "objective c",
    "dotnet": ".net",
    "net": ".net",
    ".net core": ".net",
    "dotnet core": ".net",
    # frontend
    "reactjs": "react",
    "react.js": "react",
    "react js": "react",
    "next": "nextjs",
    "next.js": "nextjs",
    "next js": "nextjs",
    "vue.js": "vue",
    "vuejs": "vue",
    "vue js": "vue",
    "angularjs": "angular",
    "angular.js": "angular",
    "tailwind": "tailwind css",
    "tailwindcss": "tailwind css",
    "html5": "html",
    "css3": "css",
    # backend / frameworks
    "node": "nodejs",
    "node.js": "nodejs",
    "node js": "nodejs",
    "drf": "django rest framework",
    "django-rest-framework": "django rest framework",
    "expressjs": "express",
    "express.js": "express",
    "express js": "express",
    "springboot": "spring boot",
    "d3.js": "d3",
    "d3 js": "d3",
    "d3js": "d3",
    # data stores
    "postgres": "postgresql",
    "postgre": "postgresql",
    "psql": "postgresql",
    "mongo": "mongodb",
    "ms sql": "sql server",
    "mssql": "sql server",
    "ms sql server": "sql server",
    "microsoft sql server": "sql server",
    "elastic search": "elasticsearch",
    # cloud / devops
    "k8s": "kubernetes",
    "gcp": "google cloud",
    "google cloud platform": "google cloud",
    "amazon web services": "aws",
    "aws lambda": "aws",
    "lambda": "aws",
    "ec2": "aws",
    "aws ec2": "aws",
    "s3": "aws",
    "aws s3": "aws",
    "ci/cd": "cicd",
    "ci cd": "cicd",
    "ci-cd": "cicd",
    "continuous integration": "cicd",
    "continuous delivery": "cicd",
    "tf": "tensorflow",
    # apis
    "restful": "rest",
    "rest api": "rest",
    "rest apis": "rest",
    "restful api": "rest",
    "restful apis": "rest",
    "restful services": "rest",
    "graph ql": "graphql",
    # data science / ai
    "ml": "machine learning",
    "torch": "pytorch",
    "sklearn": "scikit-learn",
    "scikit learn": "scikit-learn",
    "scikitlearn": "scikit-learn",
    "llms": "llm",
    "large language models": "llm",
    "large language model": "llm",
    "gen ai": "generative ai",
    "genai": "generative ai",
    "gen-ai": "generative ai",
    "natural language processing": "nlp",
    "ai": "artificial intelligence",
    "dl": "deep learning",
    "cv": "computer vision",
}

DISPLAY: dict[str, str] = {
    "postgresql": "PostgreSQL",
    "mysql": "MySQL",
    "sql server": "SQL Server",
    "sqlite": "SQLite",
    "mongodb": "MongoDB",
    "dynamodb": "DynamoDB",
    "elasticsearch": "Elasticsearch",
    "javascript": "JavaScript",
    "typescript": "TypeScript",
    "nodejs": "Node.js",
    "nextjs": "Next.js",
    "vue": "Vue.js",
    "react": "React",
    "langchain": "LangChain",
    "d3": "D3.js",
    "django rest framework": "Django REST Framework",
    "fastapi": "FastAPI",
    "aws": "AWS",
    "google cloud": "Google Cloud",
    "azure": "Azure",
    "cicd": "CI/CD",
    "rest": "REST",
    "graphql": "GraphQL",
    "grpc": "gRPC",
    "machine learning": "Machine Learning",
    "nlp": "NLP",
    "llm": "LLMs",
    "generative ai": "Generative AI",
    "artificial intelligence": "Artificial Intelligence",
    "sql": "SQL",
    "nosql": "NoSQL",
    "html": "HTML",
    "css": "CSS",
    "tailwind css": "Tailwind CSS",
    "c++": "C++",
    "c#": "C#",
    ".net": ".NET",
    "php": "PHP",
    "ios": "iOS",
    "macos": "macOS",
    "scikit-learn": "scikit-learn",
    "pytorch": "PyTorch",
    "tensorflow": "TensorFlow",
    "numpy": "NumPy",
    "opencv": "OpenCV",
    "github actions": "GitHub Actions",
    "gitlab": "GitLab",
    "rabbitmq": "RabbitMQ",
    "openapi": "OpenAPI",
    "oauth": "OAuth",
    "jwt": "JWT",
    "json": "JSON",
    "xml": "XML",
    "api": "API",
    "ui": "UI",
    "ux": "UX",
    "devops": "DevOps",
    "mlops": "MLOps",
    "etl": "ETL",
    "tdd": "TDD",
    "dbt": "dbt",
    "bigquery": "BigQuery",
    "power bi": "Power BI",
    "testng": "TestNG",
    "jmeter": "JMeter",
    "api testing": "API Testing",
}


def _collapse(value: str) -> str:
    return _WHITESPACE.sub(" ", value).strip()


def _strip_version(value: str) -> str:
    """Drop a whitespace-separated trailing version number (``python 3.11`` -> ``python``)."""
    return _TRAILING_VERSION.sub("", value)


def normalize_skill(name: str) -> str:
    """Return the canonical lowercase key for a skill name."""
    key = _collapse(str(name).lower())
    if not key:
        return ""
    key = SYNONYMS.get(key, key)
    key = _strip_version(key)
    key = _collapse(_UNDERSCORE.sub(" ", _PUNCTUATION.sub(" ", key)))
    key = _strip_version(key)
    return SYNONYMS.get(key, key)


def normalize_skills(names: Iterable[str]) -> list[str]:
    """Normalise each name, dropping blanks and duplicates while preserving order."""
    seen: set[str] = set()
    result: list[str] = []
    for name in names:
        key = normalize_skill(name)
        if key and key not in seen:
            seen.add(key)
            result.append(key)
    return result


def display_name(key: str) -> str:
    """Human-readable label for a skill key; curated spelling where known, else Title Case."""
    normalised = normalize_skill(key)
    if normalised in DISPLAY:
        return DISPLAY[normalised]
    return " ".join(word[:1].upper() + word[1:] for word in normalised.split(" "))
