"""pytest settings: same PostgreSQL server (pytest-django creates test_<db>), fast hashing."""

from .base import *  # noqa: F403
from .base import REST_FRAMEWORK, SIMPLE_JWT

DEBUG = False

# A signing key of the length PyJWT expects for HS256, whatever .env says.
SECRET_KEY = "test-only-secret-key-that-is-long-enough-for-hs256-signing"
SIMPLE_JWT = {**SIMPLE_JWT, "SIGNING_KEY": SECRET_KEY}

# The suite logs in far more than ten times a minute from one address. The
# throttle tests lower these again with override_settings.
REST_FRAMEWORK = {
    **REST_FRAMEWORK,
    "DEFAULT_THROTTLE_RATES": {"login": "1000/min", "password_reset": "1000/min"},
}

CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
        "LOCATION": "aimious-recruit-test",
    }
}

# Argon2 is deliberately slow; tests create many users.
PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]

EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"

# Keep the static files pipeline trivial under test.
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.InMemoryStorage"},
    "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"},
}

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "root": {"handlers": [], "level": "WARNING"},
}

# The suite never talks to an LLM provider or spawns search threads. The provider
# is pinned so a developer's own .env cannot point the tests at their paid
# account -- and with it EVERY value base.py derives from LLM_PROVIDER, not just
# the model names. Both keys are blanked, so a call that does slip through fails
# at the client constructor with LLMUnavailable, before any network request.
LLM_PROVIDER = "gemini"
GEMINI_MODEL = "gemini-2.5-flash"
GEMINI_SEARCH_MODEL = "gemini-2.5-flash-lite"
GEMINI_FALLBACK_MODEL = ""
OPENAI_MODEL = "gpt-4.1-mini"
OPENAI_SEARCH_MODEL = OPENAI_MODEL
OPENAI_FALLBACK_MODEL = "gpt-4o-mini"
OPENAI_BASE_URL = ""
LLM_MODEL = GEMINI_MODEL
LLM_SEARCH_MODEL = GEMINI_SEARCH_MODEL
LLM_FALLBACK_MODEL = GEMINI_FALLBACK_MODEL
LLM_TIMEOUT_SECONDS = 120
LLM_MAX_RETRIES = 2
OPENAI_API_KEY = ""
GEMINI_API_KEY = ""
EMBEDDING_PROVIDER = "gemini"
EMBEDDING_MODEL = "gemini-embedding-001"
SEARCH_RUN_ASYNC = False
RESUME_INGEST_ASYNC = False
SEMANTIC_JD_ANALYSIS_ENABLED = False
SEMANTIC_RERANK_ENABLED = False
