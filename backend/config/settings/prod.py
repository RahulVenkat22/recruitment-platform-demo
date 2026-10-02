"""AWS production settings. Missing security requirements prevent startup."""

from urllib.parse import urlsplit

from django.core.exceptions import ImproperlyConfigured

from .base import *  # noqa: F403
from .base import (
    ALLOWED_HOSTS,
    AWS_REGION,
    DATABASES,
    DEFAULT_FROM_EMAIL,
    EMAIL_HOST,
    EMBEDDING_PROVIDER,
    JWT_COOKIE_SECURE,
    LLM_ALLOWED_PROVIDERS,
    LLM_PROVIDER,
    LOGGING,
    MIDDLEWARE,
    REST_FRAMEWORK,
    RESUME_S3_BUCKET,
    SECRET_KEY,
    VAPI_WEBHOOK_SECRET,
    VOICE_PROVIDER,
    WORK_QUEUE_URL,
    env,
)

DEBUG = False
ALLOW_DEMO_SEED = False


def require(condition, message):
    if not condition:
        raise ImproperlyConfigured(message)


require(
    len(SECRET_KEY) >= 50 and len(set(SECRET_KEY)) >= 8 and "change-me" not in SECRET_KEY,
    "Production requires a strong DJANGO_SECRET_KEY (at least 50 characters).",
)
require(
    ALLOWED_HOSTS
    and all(
        h not in {"*", "localhost", "127.0.0.1"} and not h.startswith(".") for h in ALLOWED_HOSTS
    ),
    "Set explicit production DJANGO_ALLOWED_HOSTS.",
)
require(JWT_COOKIE_SECURE, "Production requires JWT_COOKIE_SECURE=true.")
require(env.str("DATABASE_URL", default=""), "Production requires DATABASE_URL.")
require(
    DATABASES["default"].get("OPTIONS", {}).get("sslmode") == "verify-full",
    "DATABASE_URL must use sslmode=verify-full and sslrootcert pointing to the RDS CA bundle.",
)
require(DATABASES["default"].get("OPTIONS", {}).get("sslrootcert"), "Set the database CA bundle.")
require(
    env.str("CACHE_URL", default="").startswith("rediss://"),
    "Production requires an authenticated TLS Redis/Valkey CACHE_URL (rediss://).",
)
require(urlsplit(env.str("CACHE_URL")).password, "CACHE_URL requires a Redis/Valkey auth token.")
require(RESUME_S3_BUCKET, "Production requires RESUME_S3_BUCKET for private durable media.")
require(WORK_QUEUE_URL.startswith("https://sqs."), "Production requires WORK_QUEUE_URL.")
require(
    LLM_PROVIDER in LLM_ALLOWED_PROVIDERS and EMBEDDING_PROVIDER in LLM_ALLOWED_PROVIDERS,
    "Chat and embedding providers must be in LLM_ALLOWED_PROVIDERS.",
)
require(env.str("LLM_ALLOWED_PROVIDERS", default=""), "Explicitly approve LLM_ALLOWED_PROVIDERS.")
require(
    not env.str("AWS_ACCESS_KEY_ID", default=""), "Use ECS task IAM roles, not static AWS keys."
)
require(
    EMAIL_HOST and "@" in DEFAULT_FROM_EMAIL and not DEFAULT_FROM_EMAIL.endswith("@localhost"),
    "Production requires SMTP and a verified DEFAULT_FROM_EMAIL.",
)
require(
    not VOICE_PROVIDER or (VOICE_PROVIDER == "vapi" and len(VAPI_WEBHOOK_SECRET) >= 32),
    "Enabled voice calls require VAPI_WEBHOOK_SECRET of at least 32 characters.",
)
ORIGIN_VERIFY_SECRET = env.str("ORIGIN_VERIFY_SECRET", default="")
require(len(ORIGIN_VERIFY_SECRET) >= 32, "Set ORIGIN_VERIFY_SECRET on CloudFront and the API.")
PUBLIC_BASE_URL = env.str("PUBLIC_BASE_URL", default="")
require(
    urlsplit(PUBLIC_BASE_URL).scheme == "https"
    and urlsplit(PUBLIC_BASE_URL).hostname in ALLOWED_HOSTS,
    "PUBLIC_BASE_URL must be HTTPS on an allowed hostname.",
)
CORS_ALLOWED_ORIGINS = [PUBLIC_BASE_URL.rstrip("/")]
CSRF_TRUSTED_ORIGINS = CORS_ALLOWED_ORIGINS
CSRF_COOKIE_SECURE = SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SAMESITE = SESSION_COOKIE_SAMESITE = "Lax"
SESSION_COOKIE_HTTPONLY = True
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_SSL_REDIRECT = True
SECURE_HSTS_SECONDS = env.int("DJANGO_SECURE_HSTS_SECONDS", default=31536000)
SECURE_HSTS_INCLUDE_SUBDOMAINS = env.bool("DJANGO_HSTS_INCLUDE_SUBDOMAINS", default=False)
SECURE_HSTS_PRELOAD = False
SECURE_REFERRER_POLICY = "same-origin"
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = "DENY"
MIDDLEWARE = ["common.middleware.ProductionBoundaryMiddleware", *MIDDLEWARE]
MIDDLEWARE.insert(
    MIDDLEWARE.index("django.middleware.security.SecurityMiddleware") + 1,
    "whitenoise.middleware.WhiteNoiseMiddleware",
)
STORAGES = {
    "default": {
        "BACKEND": "storages.backends.s3.S3Storage",
        "OPTIONS": {
            "bucket_name": RESUME_S3_BUCKET,
            "region_name": AWS_REGION,
            "default_acl": None,
            "file_overwrite": False,
            "querystring_expire": 300,
            "object_parameters": {"ServerSideEncryption": "AES256"},
        },
    },
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage"},
}
DATABASES["default"]["OPTIONS"]["connect_timeout"] = 5
DATABASES["default"]["OPTIONS"]["options"] = (
    f"-c statement_timeout={env.int('DATABASE_STATEMENT_TIMEOUT_MS', default=30000)}"
    " -c lock_timeout=5000"
)
REST_FRAMEWORK = {
    **REST_FRAMEWORK,
    "DEFAULT_THROTTLE_CLASSES": [
        "common.throttles.ApiRateThrottle",
        "common.throttles.MutationRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {
        **REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"],
        "api": "120/min",
        "mutation": "30/min",
    },
    "NUM_PROXIES": 0,
}
# An HTTP body is bounded before Django parses multipart data (ALB has no such limit).
DATA_UPLOAD_MAX_MEMORY_SIZE = 32 * 1024 * 1024
RESUME_UPLOAD_MAX_FILES = 10
RESUME_UPLOAD_MAX_MB = 20
FILE_UPLOAD_MAX_MEMORY_SIZE = 1024 * 1024
LOGGING["formatters"]["json"] = {"()": "common.logging.JsonFormatter"}
LOGGING["handlers"]["console"]["formatter"] = "json"
SPECTACULAR_SETTINGS = {
    **SPECTACULAR_SETTINGS,  # noqa: F405
    "SERVE_PERMISSIONS": ["rest_framework.permissions.IsAdminUser"],
}

STREAM_HEARTBEAT_ENABLED = True
STREAM_MAX_SECONDS = 180

CANDIDATE_SOURCE_PROVIDERS = ["internal"]
SIMPLE_JWT = {**SIMPLE_JWT, "CHECK_REVOKE_TOKEN": True}  # noqa: F405

CACHES["default"]["OPTIONS"] = {"socket_connect_timeout": 3, "socket_timeout": 3}  # noqa: F405

require(
    env.bool("EMAIL_USE_TLS", default=True) != env.bool("EMAIL_USE_SSL", default=False),
    "Enable exactly one of SMTP STARTTLS or implicit TLS.",
)
require(env.str("COMPANY_PROFILE", default="").strip(), "Set an accurate COMPANY_PROFILE.")
require(
    env.str(f"{LLM_PROVIDER.upper()}_API_KEY", default="").strip(),
    "Configure the primary LLM provider credential.",
)
