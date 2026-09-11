"""pytest settings: same PostgreSQL server (pytest-django creates test_<db>), fast hashing."""

from .base import *  # noqa: F403

DEBUG = False

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
