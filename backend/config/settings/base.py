"""Settings shared by every environment.

Every value that differs between machines comes from the environment (or the
repo-root ``.env``) through django-environ, using exactly the variable names
and defaults listed in plan.md section 5.2.
"""

from __future__ import annotations

from datetime import date, timedelta
from pathlib import Path

import environ

# backend/ (contains manage.py)
BASE_DIR = Path(__file__).resolve().parent.parent.parent
# repository root (contains .env and .env.example)
REPO_ROOT = BASE_DIR.parent

env = environ.Env()

# `make` and scripts/dev.sh export .env before running anything, so this is a
# convenience for running manage.py directly. Variables already present in the
# environment always win over the file.
_ENV_FILE = REPO_ROOT / ".env"
if _ENV_FILE.is_file():
    environ.Env.read_env(str(_ENV_FILE), overwrite=False)

# --------------------------------------------------------------------------- core
SECRET_KEY = env.str("DJANGO_SECRET_KEY", default="change-me")
DEBUG = env.bool("DJANGO_DEBUG", default=False)
ALLOWED_HOSTS = env.list("DJANGO_ALLOWED_HOSTS", default=["localhost", "127.0.0.1"])

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

DJANGO_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "django.contrib.postgres",
]

THIRD_PARTY_APPS = [
    "corsheaders",
    "rest_framework",
    "rest_framework_simplejwt",
    "rest_framework_simplejwt.token_blacklist",
    "django_filters",
    "drf_spectacular",
]

# One app per bounded context (plan.md section 6.1).
LOCAL_APPS = [
    "common",
    "accounts",
    "jobs",
    "candidates",
    "pipeline",
    "sourcing",
    "matching",
    "activity",
    "notifications",
    "audit",
    "dashboard",
    "seed",
]

INSTALLED_APPS = DJANGO_APPS + THIRD_PARTY_APPS + LOCAL_APPS

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    # Last, so it wraps the view directly: it captures the JSON body before DRF
    # parses it and reads the final status code (plan.md 6.9 "Audit").
    "audit.middleware.AuditMiddleware",
]

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

# ----------------------------------------------------------------------- database
DATABASES = {
    "default": env.db_url(
        "DATABASE_URL",
        default="postgres://recruit:recruit@localhost:5434/recruitment_demo",
    ),
}
DATABASES["default"]["CONN_MAX_AGE"] = env.int("DATABASE_CONN_MAX_AGE", default=60)
DATABASES["default"]["CONN_HEALTH_CHECKS"] = True

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# ---------------------------------------------------------------------------- cache
# Throttle counters (plan.md 6.9 login rate limit) live here. Local memory is
# per process; point CACHE_URL at Redis/memcached when the API runs multi-worker.
CACHES = {
    "default": env.cache_url("CACHE_URL", default="locmemcache://aimious-recruit"),
}

# --------------------------------------------------------------------------- auth
AUTH_USER_MODEL = "accounts.User"

PASSWORD_HASHERS = [
    "django.contrib.auth.hashers.Argon2PasswordHasher",
    "django.contrib.auth.hashers.PBKDF2PasswordHasher",
    "django.contrib.auth.hashers.PBKDF2SHA1PasswordHasher",
    "django.contrib.auth.hashers.BCryptSHA256PasswordHasher",
    "django.contrib.auth.hashers.ScryptPasswordHasher",
]

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
        "OPTIONS": {"min_length": 8},
    },
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

# ------------------------------------------------------------------------- i18n
LANGUAGE_CODE = "en-us"
TIME_ZONE = "Asia/Kolkata"
USE_I18N = True
USE_TZ = True

# ------------------------------------------------------------------- static/media
STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
MEDIA_URL = "media/"
MEDIA_ROOT = BASE_DIR / "media"

STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"},
}

# --------------------------------------------------------------------------- CORS
CORS_ALLOWED_ORIGINS = env.list(
    "CORS_ALLOWED_ORIGINS",
    default=["http://localhost:5175", "http://localhost:8201"],
)
CORS_ALLOW_CREDENTIALS = True
CORS_URLS_REGEX = r"^/api/.*$"

# ---------------------------------------------------------------------------- DRF
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_PARSER_CLASSES": [
        "rest_framework.parsers.JSONParser",
        "rest_framework.parsers.FormParser",
        "rest_framework.parsers.MultiPartParser",
    ],
    "DEFAULT_PAGINATION_CLASS": "common.pagination.StandardPagination",
    "PAGE_SIZE": 20,
    "DEFAULT_FILTER_BACKENDS": [
        "django_filters.rest_framework.DjangoFilterBackend",
        "rest_framework.filters.SearchFilter",
        "rest_framework.filters.OrderingFilter",
    ],
    "EXCEPTION_HANDLER": "common.exceptions.api_exception_handler",
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    # No global throttle; the login and forgot-password views opt in through
    # the scoped classes in common.throttles.
    "DEFAULT_THROTTLE_CLASSES": [],
    "DEFAULT_THROTTLE_RATES": {
        # plan.md 6.9: login is limited to 10 attempts per minute per IP.
        "login": "10/min",
        "password_reset": "5/min",
    },
    "TEST_REQUEST_DEFAULT_FORMAT": "json",
}

# ---------------------------------------------------------------------------- JWT
JWT_ACCESS_MINUTES = env.int("JWT_ACCESS_MINUTES", default=15)
JWT_REFRESH_HOURS = env.int("JWT_REFRESH_HOURS", default=12)
JWT_REFRESH_REMEMBER_DAYS = env.int("JWT_REFRESH_REMEMBER_DAYS", default=14)
JWT_COOKIE_SECURE = env.bool("JWT_COOKIE_SECURE", default=False)
JWT_COOKIE_SAMESITE = env.str("JWT_COOKIE_SAMESITE", default="Lax")
# The refresh token travels in an httpOnly cookie scoped to the auth endpoints (plan.md 6.9).
JWT_REFRESH_COOKIE_NAME = "aimious_refresh"
JWT_REFRESH_COOKIE_PATH = "/api/v1/auth/"

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=JWT_ACCESS_MINUTES),
    "REFRESH_TOKEN_LIFETIME": timedelta(hours=JWT_REFRESH_HOURS),
    # accounts.services.rotate_session honours both: every refresh issues a new
    # token for the remaining session lifetime and blacklists the old one.
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "UPDATE_LAST_LOGIN": True,
    "ALGORITHM": "HS256",
    "SIGNING_KEY": SECRET_KEY,
    "AUTH_HEADER_TYPES": ("Bearer",),
    "USER_ID_FIELD": "id",
    "USER_ID_CLAIM": "user_id",
}

# --------------------------------------------------------------------- OpenAPI docs
SPECTACULAR_SETTINGS = {
    "TITLE": "Aimious AI Recruitment API",
    "DESCRIPTION": "REST API for the AI Recruitment & Requirement Agent (see plan.md).",
    "VERSION": "1.0.0",
    "SERVE_INCLUDE_SCHEMA": False,
    "SCHEMA_PATH_PREFIX": r"/api/v1",
    "COMPONENT_SPLIT_REQUEST": True,
    "SORT_OPERATIONS": False,
    # Stable, human-named enum components so `make openapi` produces readable TS types.
    "ENUM_NAME_OVERRIDES": {
        "ApplicationStatusEnum": "common.enums.ApplicationStatus.choices",
        "ActivityCategoryEnum": "common.enums.ActivityCategory.choices",
        "UserRoleEnum": "common.enums.UserRole.choices",
        "ParticipantRoleEnum": "common.enums.ParticipantRole.choices",
        "CandidateSourceEnum": "common.enums.CandidateSource.choices",
        "JDStatusEnum": "common.enums.JDStatus.choices",
        "WorkModeEnum": "common.enums.WorkMode.choices",
        "EmploymentTypeEnum": "common.enums.EmploymentType.choices",
        "InterviewRoundEnum": "common.enums.InterviewRound.choices",
        "InterviewModeEnum": "common.enums.InterviewMode.choices",
        "InterviewStatusEnum": "common.enums.InterviewStatus.choices",
        "RecommendationEnum": "common.enums.Recommendation.choices",
        "CommunicationChannelEnum": "common.enums.CommunicationChannel.choices",
        "CommunicationDirectionEnum": "common.enums.CommunicationDirection.choices",
        "CommunicationOutcomeEnum": "common.enums.CommunicationOutcome.choices",
        "OfferStatusEnum": "common.enums.OfferStatus.choices",
        "OnboardingStatusEnum": "common.enums.OnboardingStatus.choices",
        "SearchRunStatusEnum": "common.enums.SearchRunStatus.choices",
        "NotificationTypeEnum": "common.enums.NotificationType.choices",
        "AuditActionEnum": "common.enums.AuditAction.choices",
    },
}

# -------------------------------------------------------------------- recruitment
MATCH_ENGINE = env.str("MATCH_ENGINE", default="rule_based")
AI_SHORTLIST_THRESHOLD = env.int("AI_SHORTLIST_THRESHOLD", default=80)
SEARCH_RESULT_LIMIT_PER_SOURCE = env.int("SEARCH_RESULT_LIMIT_PER_SOURCE", default=60)
CANDIDATE_SOURCE_PROVIDERS = env.list(
    "CANDIDATE_SOURCE_PROVIDERS",
    default=["internal", "referral", "naukri", "linkedin"],
)

# --------------------------------------------------------------------------- seed
SEED_RANDOM_SEED = env.int("SEED_RANDOM_SEED", default=42)
SEED_ANCHOR_DATE = date.fromisoformat(env.str("SEED_ANCHOR_DATE", default="2026-09-11"))

# ------------------------------------------------------------------------ logging
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "plain": {"format": "%(asctime)s %(levelname)s %(name)s %(message)s"},
    },
    "handlers": {
        "console": {"class": "logging.StreamHandler", "formatter": "plain"},
    },
    "root": {"handlers": ["console"], "level": env.str("DJANGO_LOG_LEVEL", default="INFO")},
    "loggers": {
        "django": {"handlers": ["console"], "level": "INFO", "propagate": False},
        "django.request": {"handlers": ["console"], "level": "WARNING", "propagate": False},
    },
}
