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
