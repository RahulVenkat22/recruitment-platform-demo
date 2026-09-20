"""Local development: DEBUG on by default, browsable API, verbose SQL off."""

from .base import *  # noqa: F403
from .base import REST_FRAMEWORK, env

DEBUG = env.bool("DJANGO_DEBUG", default=True)

ALLOWED_HOSTS = env.list("DJANGO_ALLOWED_HOSTS", default=["localhost", "127.0.0.1", "0.0.0.0"])

REST_FRAMEWORK = {
    **REST_FRAMEWORK,
    "DEFAULT_RENDERER_CLASSES": [
        "rest_framework.renderers.JSONRenderer",
        "rest_framework.renderers.BrowsableAPIRenderer",
    ],
}

# Email follows base.py: SMTP when EMAIL_HOST is set in .env, the console otherwise.
