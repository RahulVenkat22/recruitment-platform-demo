"""Table-driven tests for the shared skill normaliser (plan.md 6.6)."""

from __future__ import annotations

import pytest

from matching.skills import DISPLAY, SYNONYMS, display_name, normalize_skill, normalize_skills


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("Python", "python"),
        ("  Python  ", "python"),
        ("Machine   Learning", "machine learning"),
        ("\tDjango \n", "django"),
    ],
)
def test_lowercase_trim_and_collapse_whitespace(raw: str, expected: str) -> None:
    assert normalize_skill(raw) == expected


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("Python 3", "python"),
        ("Python 3.11", "python"),
        ("python3", "python"),
        ("HTML5", "html"),
        ("CSS3", "css"),
        ("Vue 3", "vue"),
        ("Angular 17", "angular"),
        ("Java 17", "java"),
        ("Vue.js 3", "vue"),
        ("3", "3"),
    ],
)
def test_trailing_version_numbers_are_stripped(raw: str, expected: str) -> None:
    assert normalize_skill(raw) == expected


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("d3", "d3"),
        ("D3.js", "d3"),
        ("D3js", "d3"),
        ("web3", "web3"),
        ("Web3", "web3"),
        ("es6", "es6"),
        ("log4j", "log4j"),
    ],
)
def test_digits_glued_to_letters_are_part_of_the_name(raw: str, expected: str) -> None:
    assert normalize_skill(raw) == expected


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("C++", "c++"),
        ("C#", "c#"),
        ("Scikit-Learn", "scikit-learn"),
        ("Objective-C", "objective c"),
        ("Django, ", "django"),
        ("(Docker)", "docker"),
        ('"Kafka"', "kafka"),
        ("Spring/Boot", "spring boot"),
    ],
)
def test_punctuation_is_stripped_except_plus_and_hash(raw: str, expected: str) -> None:
    assert normalize_skill(raw) == expected


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        # plan.md 6.6 pairs
        ("postgres", "postgresql"),
        ("JS", "javascript"),
        ("ReactJS", "react"),
        ("node", "nodejs"),
        ("k8s", "kubernetes"),
        ("ML", "machine learning"),
        ("GCP", "google cloud"),
        ("TS", "typescript"),
        ("TF", "tensorflow"),
        ("CI/CD", "cicd"),
        ("RESTful", "rest"),
        # extra pairs from the task
        ("React.js", "react"),
        ("Node.js", "nodejs"),
        ("py", "python"),
        ("Golang", "go"),
        ("torch", "pytorch"),
        ("REST API", "rest"),
        ("RESTful APIs", "rest"),
        ("MS SQL", "sql server"),
        ("MSSQL", "sql server"),
        ("Mongo", "mongodb"),
        ("AWS Lambda", "aws"),
        ("EC2", "aws"),
        ("S3", "aws"),
        ("sklearn", "scikit-learn"),
        ("LLMs", "llm"),
        ("Gen AI", "generative ai"),
        ("GenAI", "generative ai"),
        ("DRF", "django rest framework"),
        ("Django REST Framework", "django rest framework"),
        ("Next", "nextjs"),
        ("Next.js", "nextjs"),
        ("Vue.js", "vue"),
        ("Tailwind", "tailwind css"),
        ("Postgres 14", "postgresql"),
    ],
)
def test_synonyms(raw: str, expected: str) -> None:
    assert normalize_skill(raw) == expected


def test_all_synonym_keys_map_to_a_fixed_point() -> None:
    for key, value in SYNONYMS.items():
        assert normalize_skill(key) == value, key
        assert normalize_skill(value) == value, value


def test_synonyms_have_no_identity_entries() -> None:
    assert [key for key, value in SYNONYMS.items() if key == value] == []


@pytest.mark.parametrize(
    "raw",
    ["Python 3", "Node.js", "C++", "C#", "CI/CD", "Scikit-Learn", "MS SQL", "  Machine  Learning "],
)
def test_normalise_is_idempotent(raw: str) -> None:
    once = normalize_skill(raw)
    assert normalize_skill(once) == once


def test_normalize_skills_dedupes_and_preserves_order() -> None:
    result = normalize_skills(["Python 3", "Postgres", "python", "PostgreSQL", "JS", "  ", "React"])
    assert result == ["python", "postgresql", "javascript", "react"]


def test_normalize_skills_accepts_any_iterable() -> None:
    assert normalize_skills(iter(("Go", "golang"))) == ["go"]
    assert normalize_skills([]) == []


@pytest.mark.parametrize(
    ("key", "expected"),
    [
        ("postgresql", "PostgreSQL"),
        ("javascript", "JavaScript"),
        ("typescript", "TypeScript"),
        ("nodejs", "Node.js"),
        ("aws", "AWS"),
        ("google cloud", "Google Cloud"),
        ("cicd", "CI/CD"),
        ("rest", "REST"),
        ("graphql", "GraphQL"),
        ("machine learning", "Machine Learning"),
        ("nlp", "NLP"),
        ("llm", "LLMs"),
        ("sql", "SQL"),
        ("nosql", "NoSQL"),
        ("html", "HTML"),
        ("css", "CSS"),
        ("c++", "C++"),
        ("c#", "C#"),
        ("sql server", "SQL Server"),
        ("django rest framework", "Django REST Framework"),
        ("scikit-learn", "scikit-learn"),
        ("django", "Django"),
        ("some unknown skill", "Some Unknown Skill"),
        # curated spellings Title Case would get wrong (shared with the seed pools)
        ("vue", "Vue.js"),
        ("langchain", "LangChain"),
        ("dbt", "dbt"),
        ("bigquery", "BigQuery"),
        ("power bi", "Power BI"),
        ("testng", "TestNG"),
        ("jmeter", "JMeter"),
        ("api testing", "API Testing"),
        ("d3", "D3.js"),
    ],
)
def test_display_name(key: str, expected: str) -> None:
    assert display_name(key) == expected


def test_display_name_normalises_raw_input() -> None:
    assert display_name("Node.js") == "Node.js"
    assert display_name("postgres") == "PostgreSQL"


def test_display_keys_are_normalised_fixed_points() -> None:
    for key in DISPLAY:
        assert normalize_skill(key) == key, key


def test_package_exports() -> None:
    import matching

    assert matching.normalize_skill is normalize_skill
    assert matching.normalize_skills is normalize_skills
    assert matching.display_name is display_name
