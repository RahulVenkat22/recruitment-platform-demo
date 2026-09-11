from django.contrib.auth.models import AbstractBaseUser, PermissionsMixin
from django.db import models
from django.db.models.functions import Lower
from django.utils import timezone

from accounts.managers import UserManager
from common.enums import UserRole
from common.models import UUIDTimestampedModel


class User(UUIDTimestampedModel, AbstractBaseUser, PermissionsMixin):
    """Staff account that logs in with an email address (plan.md 6.3 accounts.User)."""

    email = models.EmailField(max_length=254, unique=True)
    first_name = models.CharField(max_length=80)
    last_name = models.CharField(max_length=80)
    designation = models.CharField(max_length=120, blank=True)
    department = models.CharField(max_length=120, blank=True)
    # Placeholder photo URL; null triggers the initials fallback in the UI.
    avatar_url = models.TextField(null=True, blank=True)
    role = models.CharField(max_length=20, choices=UserRole.choices, default=UserRole.EMPLOYEE)
    phone = models.CharField(max_length=32, null=True, blank=True)
    timezone = models.CharField(max_length=64, default="Asia/Kolkata")
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)

    objects = UserManager()

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["first_name", "last_name"]

    class Meta:
        ordering = ["first_name", "last_name"]
        constraints = [
            models.UniqueConstraint(Lower("email"), name="accounts_user_email_ci_unique"),
        ]

    def __str__(self) -> str:
        return f"{self.full_name} <{self.email}>"

    @property
    def full_name(self) -> str:
        return f"{self.first_name} {self.last_name}".strip()

    @property
    def initials(self) -> str:
        return "".join(part[0] for part in (self.first_name, self.last_name) if part).upper()

    def get_full_name(self) -> str:
        return self.full_name

    def get_short_name(self) -> str:
        return self.first_name


class PasswordResetRequest(UUIDTimestampedModel):
    """A forgot-password submission (plan.md 6.3 accounts.PasswordResetRequest).

    The endpoint stores a row and answers 202; no email is sent in the MVP, so
    ``used_at`` only gets set once a real reset flow exists. Only the hash of the
    token is stored, never the token itself.
    """

    email = models.EmailField(max_length=254)
    token_hash = models.CharField(max_length=128, db_index=True)
    requested_at = models.DateTimeField(default=timezone.now)
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)

    class Meta:
        ordering = ["-requested_at"]
        indexes = [
            models.Index(fields=["email", "-requested_at"], name="accounts_pwreset_email_idx"),
        ]

    def __str__(self) -> str:
        return f"Password reset for {self.email} at {self.requested_at:%Y-%m-%d %H:%M}"

    @property
    def is_usable(self) -> bool:
        """Unused and not yet expired."""
        return self.used_at is None and self.expires_at > timezone.now()
