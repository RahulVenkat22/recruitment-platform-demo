"""Static collection only; never use this module to run a server."""

from .base import *  # noqa: F403

DEBUG = False
SECRET_KEY = "static-build-no-runtime-secrets-are-used-in-this-module"
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage"},
}
