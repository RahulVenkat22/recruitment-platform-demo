"""Production / Docker image: DEBUG off, security headers, whitenoise for admin static files."""

from .base import *  # noqa: F403
from .base import JWT_COOKIE_SECURE, MIDDLEWARE, env

DEBUG = False

# whitenoise must sit right after SecurityMiddleware.
MIDDLEWARE = [
    *MIDDLEWARE[: MIDDLEWARE.index("django.middleware.security.SecurityMiddleware") + 1],
    "whitenoise.middleware.WhiteNoiseMiddleware",
    *MIDDLEWARE[MIDDLEWARE.index("django.middleware.security.SecurityMiddleware") + 1 :],
]

STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage"},
}

# Security headers (plan.md 6.9 and 13). The API sits behind nginx, which
# terminates TLS when there is any; JWT_COOKIE_SECURE=true is the single flag
# that says "we are served over HTTPS", so the session/CSRF cookies follow it.
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_SSL_REDIRECT = env.bool("DJANGO_SECURE_SSL_REDIRECT", default=False)
SECURE_HSTS_SECONDS = env.int("DJANGO_SECURE_HSTS_SECONDS", default=0)
SECURE_HSTS_INCLUDE_SUBDOMAINS = SECURE_HSTS_SECONDS > 0
SECURE_HSTS_PRELOAD = False
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "same-origin"
SECURE_CROSS_ORIGIN_OPENER_POLICY = "same-origin"
X_FRAME_OPTIONS = "DENY"
SESSION_COOKIE_SECURE = JWT_COOKIE_SECURE
CSRF_COOKIE_SECURE = JWT_COOKIE_SECURE
SESSION_COOKIE_HTTPONLY = True
CSRF_COOKIE_SAMESITE = "Lax"
SESSION_COOKIE_SAMESITE = "Lax"
