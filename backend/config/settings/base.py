"""Settings shared by every environment.

Every value that differs between machines comes from the environment (or the
repo-root ``.env``) through django-environ, using exactly the variable names
and defaults listed in plan.md section 5.2.
"""

from __future__ import annotations

from datetime import date, timedelta
from pathlib import Path

import environ
from django.core.exceptions import ImproperlyConfigured

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
    "resumes",
    "activity",
    "notifications",
    "audit",
    "dashboard",
    "support",
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
        "TicketStatusEnum": "common.enums.TicketStatus.choices",
        "TicketPriorityEnum": "common.enums.TicketPriority.choices",
        "TicketCategoryEnum": "common.enums.TicketCategory.choices",
        "TicketEventKindEnum": "common.enums.TicketEventKind.choices",
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

# --------------------------------------------- resumes, the LLM and vector search
# Folder scanned by `manage.py ingest_resumes` when no path is given; point it at
# any directory of PDFs. Files are never moved or modified.
RESUME_STORAGE_PATH = env.str("RESUME_STORAGE_PATH", default=str(REPO_ROOT / "resumes"))
# A PDF yielding fewer characters than this has no usable text layer: it is
# scanned, or empty. The PDF file itself goes to the model either way, so the
# resume still parses; this threshold decides only whether the text layer is
# indexed as the candidate's searchable text or the text is rebuilt from the
# model's answer (resumes/services/ingestion.py). No field comes from it.
RESUME_MIN_TEXT_CHARS = env.int("RESUME_MIN_TEXT_CHARS", default=200)
RESUME_CHUNK_SIZE = env.int("RESUME_CHUNK_SIZE", default=1200)
RESUME_CHUNK_OVERLAP = env.int("RESUME_CHUNK_OVERLAP", default=150)
# Pages of the PDF sent to the model. A page is billed as an image, so an
# unbounded document is an unbounded invoice, and a 60-page PDF is almost never
# a 60-page resume: it is a resume with transcripts or a portfolio stapled to
# it. Over the cap the FIRST N pages are sent and a warning naming the cap is
# recorded, so no file ever dead-ends for being long. 12 covers the
# six-to-eight-page resumes this library holds with room to spare. At least 1,
# because the model is the only parser: "send nothing" would shelve every
# document, and a non-positive value can only be a typo.
RESUME_LLM_PDF_MAX_PAGES = max(1, env.int("RESUME_LLM_PDF_MAX_PAGES", default=12))
# Megabytes that PDF may occupy AFTER the page cap has been applied. Not a
# second cost limit -- the request limit, since an inline attachment travels
# base64-encoded (1.3333x) inside one request body. A PDF whose first 12 pages
# are still larger than this is 600-dpi scans rather than a document; it is
# shelved as needs_review with the size and this setting named in the reason.
#
# The default is set from the REQUEST limit, not from anything local: Gemini
# caps an inline-data request at 20 MB, and base64 costs 4 bytes per 3, so the
# cap must leave that expansion room. The two units are NOT the same unit and
# mixing them is how this margin was overstated: this setting is read in MiB
# (max_mb * 1024 * 1024, as `load_pdf_for_model` computes it) and the provider
# limit is 20 decimal MB = 20,000,000 bytes. 14 MiB = 14,680,064 bytes encodes
# to 19,573,420 bytes = 19.57 MB, which clears the limit by about 0.43 MB --
# roughly 2%, not the 1.33 MiB a MiB-against-MiB reading suggests. The previous
# 15 MiB encoded to 20,971,520 bytes = 20.97 MB and did not clear it, which made
# the very largest PDFs this setting admitted the ones guaranteed to fail at the
# provider. Raise the default only against a measured provider limit: at 15 MiB
# the margin is already negative.
#
# RESUME_UPLOAD_MAX_MB (20) is a SEPARATE, larger limit and does not protect
# this one -- a 17 MB PDF is a perfectly legal upload and is refused here. That
# is intended: the document then records the size and this setting by name.
RESUME_LLM_PDF_MAX_MB = max(0, env.int("RESUME_LLM_PDF_MAX_MB", default=14))
# Upload API: per-file size cap, files per request, and whether a batch is
# processed by the in-process worker thread (false = inline, for scripts/tests).
RESUME_UPLOAD_MAX_MB = env.int("RESUME_UPLOAD_MAX_MB", default=20)
RESUME_UPLOAD_MAX_FILES = env.int("RESUME_UPLOAD_MAX_FILES", default=200)
RESUME_INGEST_ASYNC = env.bool("RESUME_INGEST_ASYNC", default=True)
# Django's own multipart limits, raised so a whole folder can be dropped at once.
DATA_UPLOAD_MAX_NUMBER_FILES = RESUME_UPLOAD_MAX_FILES + 10

# Which provider runs resume parsing, JD analysis, candidate evaluation AND the
# embeddings: "openai" or "gemini". Only the clients change -- the prompts and
# the Pydantic schemas are the same for both (only the structured-output
# mechanism differs, see resumes/engines/llm.py), so switching providers changes
# answer quality and nothing else -- except the embedding space, which is why a
# switch is followed by `ingest_resumes --reprocess` (see EMBEDDING_MODEL).
# An unknown value stops the process here rather than degrading silently at the
# first parse: unlike MATCH_ENGINE, which matching/registry.py validates lazily
# inside get_engine(), LLM_PROVIDER is read by settings themselves (LLM_MODEL
# below branches on it), so there is no later moment at which a typo could be
# caught with the same information.
LLM_PROVIDERS = ("openai", "gemini")
LLM_PROVIDER = env.str("LLM_PROVIDER", default="gemini").strip().lower() or "gemini"
if LLM_PROVIDER not in LLM_PROVIDERS:
    raise ImproperlyConfigured(
        f"LLM_PROVIDER={LLM_PROVIDER!r} is not one of {', '.join(LLM_PROVIDERS)}"
    )

# The *_SEARCH_MODEL split is a cheaper model for the interactive search path.
# OpenAI falls back to the main model when it is left empty; Gemini is the
# exception -- its default search model is the cheaper -lite tier, so raising
# GEMINI_MODEL alone does not silently raise the per-search bill. Set
# GEMINI_SEARCH_MODEL explicitly to use one model for both.
# The keys come from the environment; .env.example ships them empty, and a
# missing key is reported when a call is made, not at startup, so a container
# can still migrate with the key injected later. OPENAI_BASE_URL is only for
# OpenAI-compatible gateways; empty means api.openai.com.
# .strip() before the fallback, here and for every other model name: a line
# left as `OPENAI_MODEL= ` (or with a trailing space) otherwise reaches the
# client as a name with whitespace in it, which fails at the first call instead
# of falling back to the documented default.
OPENAI_API_KEY = env.str("OPENAI_API_KEY", default="")
OPENAI_MODEL = env.str("OPENAI_MODEL", default="").strip() or "gpt-4o-mini"
OPENAI_SEARCH_MODEL = env.str("OPENAI_SEARCH_MODEL", default="").strip() or OPENAI_MODEL
OPENAI_BASE_URL = env.str("OPENAI_BASE_URL", default="")
# GEMINI_API_KEY, not GOOGLE_API_KEY: the key is passed to the client explicitly,
# never picked up from an ambient GOOGLE_API_KEY belonging to another tool. The
# defaults must be models the pinned langchain-google-genai knows: the 1.5 and
# 2.0 families are gone from its model profiles, so gemini-2.5-flash is the
# oldest flash still recognised, with the cheaper -lite on the search path.
GEMINI_API_KEY = env.str("GEMINI_API_KEY", default="")
GEMINI_MODEL = env.str("GEMINI_MODEL", default="").strip() or "gemini-2.5-flash"
GEMINI_SEARCH_MODEL = env.str("GEMINI_SEARCH_MODEL", default="").strip() or "gemini-2.5-flash-lite"
# A second model for the resume parse when the main one is busy -- a 5xx or a
# rate limit that outlived LLM_MAX_RETRIES. Tried once; the document records
# which model answered (ResumeDocument.llm_model plus a warning). Empty disables
# it. The search path does not use it: it already runs on the *_SEARCH_MODEL.
OPENAI_FALLBACK_MODEL = env.str("OPENAI_FALLBACK_MODEL", default="").strip()
GEMINI_FALLBACK_MODEL = env.str("GEMINI_FALLBACK_MODEL", default="").strip()

# Resolved once, here: resumes.engines.llm, the JD planner, sourcing.services and
# the ingestion graph read LLM_MODEL / LLM_SEARCH_MODEL / LLM_TIMEOUT_SECONDS and
# never ask which provider is configured.
if LLM_PROVIDER == "openai":
    LLM_MODEL, LLM_SEARCH_MODEL = OPENAI_MODEL, OPENAI_SEARCH_MODEL
    LLM_FALLBACK_MODEL = OPENAI_FALLBACK_MODEL
else:
    LLM_MODEL, LLM_SEARCH_MODEL = GEMINI_MODEL, GEMINI_SEARCH_MODEL
    LLM_FALLBACK_MODEL = GEMINI_FALLBACK_MODEL
# Seconds allowed for one structured answer. env.str then int(), not env.int:
# an empty `LLM_TIMEOUT_SECONDS=` line means "use the default", and env.int("")
# raises ValueError. Reading a 12-page PDF takes the hosted models well under a
# minute; 120 leaves room for a busy hour.
_llm_timeout = env.str("LLM_TIMEOUT_SECONDS", default="").strip() or "120"
try:
    LLM_TIMEOUT_SECONDS = int(_llm_timeout)
except ValueError as exc:
    raise ImproperlyConfigured(
        f"LLM_TIMEOUT_SECONDS={_llm_timeout!r} is not a whole number of seconds"
    ) from exc
# Retries the clients make before raising, counted as retries after the first
# attempt (resumes.engines.llm translates it to the shape each client wants;
# Gemini counts total attempts, not retries, and its own default is 6, which
# against a long timeout is a multi-minute hang on the search path).
# env.str then int(), like LLM_TIMEOUT_SECONDS above: an empty
# `LLM_MAX_RETRIES=` line means "use the default", and env.int("") raises a raw
# ValueError out of django-environ at import time.
_llm_max_retries = env.str("LLM_MAX_RETRIES", default="").strip() or "2"
try:
    LLM_MAX_RETRIES = int(_llm_max_retries)
except ValueError as exc:
    raise ImproperlyConfigured(
        f"LLM_MAX_RETRIES={_llm_max_retries!r} is not a whole number of retries"
    ) from exc

# Embeddings run on the same provider as the chat model and are stored in
# PostgreSQL (pgvector). EMBEDDING_DIMENSIONS is baked into the
# resumes_resumechunk column, so both defaults are asked for 768-wide vectors
# (OpenAI's `dimensions`, Gemini's `output_dimensionality` -- both models
# support a reduced width natively). Two models' vector spaces are not
# comparable, so changing the provider or the model means `ingest_resumes
# --reprocess`; changing the WIDTH additionally needs a resumes migration.
_EMBEDDING_DEFAULTS = {"openai": "text-embedding-3-small", "gemini": "gemini-embedding-001"}
EMBEDDING_MODEL = (
    env.str("EMBEDDING_MODEL", default="").strip() or _EMBEDDING_DEFAULTS[LLM_PROVIDER]
)
EMBEDDING_DIMENSIONS = env.int("EMBEDDING_DIMENSIONS", default=768)
EMBEDDING_BATCH_SIZE = env.int("EMBEDDING_BATCH_SIZE", default=32)

# Semantic candidate search: chunks fetched per query vector, candidates returned,
# and how many of the top candidates the LLM evaluates (each costs one LLM call).
VECTOR_SEARCH_LIMIT = env.int("VECTOR_SEARCH_LIMIT", default=60)
CANDIDATE_RESULT_LIMIT = env.int("CANDIDATE_RESULT_LIMIT", default=10)
SEMANTIC_JD_ANALYSIS_ENABLED = env.bool("SEMANTIC_JD_ANALYSIS_ENABLED", default=True)
SEMANTIC_RERANK_ENABLED = env.bool("SEMANTIC_RERANK_ENABLED", default=True)
SEMANTIC_RERANK_LIMIT = env.int("SEMANTIC_RERANK_LIMIT", default=4)
# Search runs execute in a background thread and the UI polls GET /searches/{id}/;
# false runs them inside the request (tests, scripts).
SEARCH_RUN_ASYNC = env.bool("SEARCH_RUN_ASYNC", default=True)

# Resume PDFs are pushed to S3 after ingestion and opened through pre-signed URLs.
# Leave the bucket and keys empty until the credentials exist: ingestion still
# works, documents wait as pending_upload, and `manage.py upload_resumes` pushes
# them later.
AWS_ACCESS_KEY_ID = env.str("AWS_ACCESS_KEY_ID", default="")
AWS_SECRET_ACCESS_KEY = env.str("AWS_SECRET_ACCESS_KEY", default="")
AWS_REGION = env.str("AWS_REGION", default="ap-south-1")
# Optional, for S3-compatible stores (MinIO, LocalStack).
AWS_S3_ENDPOINT_URL = env.str("AWS_S3_ENDPOINT_URL", default="")
RESUME_S3_BUCKET = env.str("RESUME_S3_BUCKET", default="")
RESUME_S3_PREFIX = env.str("RESUME_S3_PREFIX", default="resumes/")
RESUME_S3_URL_EXPIRY_SECONDS = env.int("RESUME_S3_URL_EXPIRY_SECONDS", default=900)

# -------------------------------------------------------------------------- email
# Candidate outreach from the search results and the candidate page. SMTP when
# EMAIL_HOST is set, otherwise the console backend, which prints the mail in the
# server log and makes the UI say "not configured". Zoho: smtp.zoho.com / .in /
# .eu (match the account's region) with an app-specific password. env.str then
# int(), like the LLM settings: an empty `EMAIL_PORT=` line means the default.
EMAIL_HOST = env.str("EMAIL_HOST", default="").strip()
EMAIL_PORT = int(env.str("EMAIL_PORT", default="").strip() or "587")
EMAIL_USE_TLS = (env.str("EMAIL_USE_TLS", default="").strip() or "true").lower() in {
    "1",
    "true",
    "yes",
    "on",
}
EMAIL_USE_SSL = env.str("EMAIL_USE_SSL", default="").strip().lower() in {"1", "true", "yes", "on"}
EMAIL_HOST_USER = env.str("EMAIL_HOST_USER", default="").strip()
EMAIL_HOST_PASSWORD = env.str("EMAIL_HOST_PASSWORD", default="")
EMAIL_TIMEOUT = int(env.str("EMAIL_TIMEOUT", default="").strip() or "20")
DEFAULT_FROM_EMAIL = (
    env.str("DEFAULT_FROM_EMAIL", default="").strip() or EMAIL_HOST_USER or "talent@localhost"
)
EMAIL_BACKEND = (
    "django.core.mail.backends.smtp.EmailBackend"
    if EMAIL_HOST
    else "django.core.mail.backends.console.EmailBackend"
)
# Replies go to one monitored mailbox: the demo staff accounts have no real addresses.
EMAIL_REPLY_TO = env.str("EMAIL_REPLY_TO", default="").strip() or EMAIL_HOST_USER
# Safe mode: while set, EVERY outgoing mail is delivered to this address instead
# of the candidate, with the intended recipient named in the subject and body.
EMAIL_SAFE_RECIPIENT = env.str("EMAIL_SAFE_RECIPIENT", default="").strip()
# The organisation the outreach speaks for: `{company}` in the templates.
EMAIL_COMPANY_NAME = env.str("EMAIL_COMPANY_NAME", default="").strip() or "Aimious"

# --------------------------------------------------------------- AI phone calls
# The interview script and the assessment run on the project LLM (VOICE_MODEL,
# default: the search model). Placing a REAL call needs a voice platform:
# VOICE_PROVIDER=vapi with VAPI_API_KEY, VAPI_PHONE_NUMBER_ID and a public
# PUBLIC_BASE_URL for its webhooks. Without them calls run as a simulated text
# chat in the browser. VOICE_SAFE_NUMBER redirects every real call to one number
# (yours) until go-live. VOICE_DEFAULT_REGION parses national numbers.
VOICE_PROVIDER = env.str("VOICE_PROVIDER", default="").strip().lower()
VOICE_MODEL = env.str("VOICE_MODEL", default="").strip() or LLM_SEARCH_MODEL
VOICE_SAFE_NUMBER = env.str("VOICE_SAFE_NUMBER", default="").strip()
VOICE_DEFAULT_REGION = env.str("VOICE_DEFAULT_REGION", default="").strip().upper() or "IN"
PUBLIC_BASE_URL = env.str("PUBLIC_BASE_URL", default="").strip()
VAPI_API_KEY = env.str("VAPI_API_KEY", default="")
VAPI_PHONE_NUMBER_ID = env.str("VAPI_PHONE_NUMBER_ID", default="").strip()
VAPI_WEBHOOK_SECRET = env.str("VAPI_WEBHOOK_SECRET", default="")
VAPI_MODEL_PROVIDER = env.str("VAPI_MODEL_PROVIDER", default="").strip() or "openai"
VAPI_MODEL = env.str("VAPI_MODEL", default="").strip() or "gpt-4o-mini"
VAPI_VOICE_PROVIDER = env.str("VAPI_VOICE_PROVIDER", default="").strip() or "vapi"
VAPI_VOICE_ID = env.str("VAPI_VOICE_ID", default="").strip() or "Elliot"

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
        "httpx": {"handlers": ["console"], "level": "WARNING", "propagate": False},
        "botocore": {"handlers": ["console"], "level": "WARNING", "propagate": False},
    },
}
