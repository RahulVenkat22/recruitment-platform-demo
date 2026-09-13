"""Request throttles (plan.md 6.9 "Other": login limited to 10 per minute per IP).

Rates live in ``REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]`` under each class's
``scope``; the test settings raise them and individual tests lower them again
with ``override_settings``. Counters live in the default cache.
"""

from __future__ import annotations

from django.core.exceptions import ImproperlyConfigured
from rest_framework.settings import api_settings
from rest_framework.throttling import SimpleRateThrottle


class LoginRateThrottle(SimpleRateThrottle):
    """Per-client-IP limit on ``POST /auth/login/`` (scope ``login``).

    Unlike ``AnonRateThrottle`` this never exempts authenticated callers: a
    stale bearer header on the login page must not lift the limit.
    """

    scope = "login"

    def get_rate(self) -> str:
        # DRF copies DEFAULT_THROTTLE_RATES onto the class when it is defined;
        # reading api_settings per request lets override_settings(REST_FRAMEWORK=...)
        # lower the rate in tests.
        try:
            return api_settings.DEFAULT_THROTTLE_RATES[self.scope]
        except KeyError as exc:
            raise ImproperlyConfigured(
                f'No default throttle rate set for "{self.scope}" scope'
            ) from exc

    def get_cache_key(self, request, view) -> str:
        return self.cache_format % {"scope": self.scope, "ident": self.get_ident(request)}


class PasswordResetRateThrottle(LoginRateThrottle):
    """Per-client-IP limit on ``POST /auth/forgot-password/`` (scope ``password_reset``)."""

    scope = "password_reset"
