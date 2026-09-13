"""PII masking for candidate contact details (plan.md 6.9 "PII").

HR roles see everything; interviewers and employees (and anyone unknown) see
``+91 98xxx xx210`` and ``j***@gmail.com``. Nothing here touches the ORM, so
serializers in any app can use the helpers or mix ``PIIMaskingMixin`` in.
"""

from __future__ import annotations

from collections.abc import Callable, Mapping
from typing import Any

from common.enums import UserRole

# Roles that see unmasked candidate phone numbers and emails.
UNMASKED_ROLES: frozenset[str] = frozenset({UserRole.HR_ADMIN, UserRole.HR})
MASKED_ROLES: frozenset[str] = frozenset({UserRole.INTERVIEWER, UserRole.EMPLOYEE})

MASK_CHAR = "x"

# ITU-T E.164 country calling codes are one, two or three digits long. Only the
# one- and two-digit codes need listing; everything else is three digits.
_ONE_DIGIT_COUNTRY_CODES = frozenset({"1", "7"})
_TWO_DIGIT_COUNTRY_CODES = frozenset(
    {
        "20", "27", "30", "31", "32", "33", "34", "36", "39", "40", "41", "43", "44", "45",
        "46", "47", "48", "49", "51", "52", "53", "54", "55", "56", "57", "58", "60", "61",
        "62", "63", "64", "65", "66", "81", "82", "84", "86", "90", "91", "92", "93", "94",
        "95", "98",
    }
)  # fmt: skip

# National numbers shorter than this only keep their last three digits.
_MIN_DIGITS_FOR_VISIBLE_PREFIX = 8
_VISIBLE_PREFIX = 2
_VISIBLE_SUFFIX = 3


def should_mask_pii(user: Any) -> bool:
    """True unless ``user`` is an authenticated HR admin or HR user.

    Anonymous, ``None`` and unknown roles are masked, so a serializer used
    outside a request context never leaks contact details by accident.
    """
    if user is None or not getattr(user, "is_authenticated", False):
        return True
    return getattr(user, "role", None) not in UNMASKED_ROLES


def mask_email(value: str | None) -> str:
    """``john.doe@gmail.com`` -> ``j***@gmail.com``; the domain stays readable."""
    if not value:
        return ""
    local, at, domain = value.partition("@")
    masked = f"{local[:1]}***"
    return f"{masked}@{domain}" if at else masked


def mask_phone(value: str | None) -> str:
    """``+91 98765 43210`` -> ``+91 98xxx xx210``.

    The country code (after a leading ``+``), the first two national digits and
    the last three digits stay visible; every other digit becomes ``x``.
    Spaces, dashes and brackets are kept in place. Short numbers keep only
    their last three digits.
    """
    if not value:
        return ""
    digit_positions = [index for index, char in enumerate(value) if char.isdigit()]
    digits = "".join(value[index] for index in digit_positions)
    country_length = _country_code_length(digits) if value.lstrip().startswith("+") else 0
    national_length = len(digits) - country_length
    visible_prefix = _VISIBLE_PREFIX if national_length >= _MIN_DIGITS_FOR_VISIBLE_PREFIX else 0
    suffix_start = national_length - min(_VISIBLE_SUFFIX, national_length)

    chars = list(value)
    for offset, position in enumerate(digit_positions):
        national_index = offset - country_length
        if national_index < 0:  # country code
            continue
        if national_index < visible_prefix or national_index >= suffix_start:
            continue
        chars[position] = MASK_CHAR
    return "".join(chars)


def _country_code_length(digits: str) -> int:
    if not digits:
        return 0
    if digits[0] in _ONE_DIGIT_COUNTRY_CODES:
        return 1
    if digits[:2] in _TWO_DIGIT_COUNTRY_CODES:
        return 2
    return min(3, len(digits))


# Field name -> masking function, for the dict and serializer helpers below.
PII_MASKERS: dict[str, Callable[[str | None], str]] = {
    "email": mask_email,
    "phone": mask_phone,
}


def mask_contact(
    data: dict[str, Any],
    user: Any,
    fields: Mapping[str, str] | None = None,
) -> dict[str, Any]:
    """Mask the contact fields of ``data`` in place when ``user`` must not see them.

    ``fields`` maps a key in ``data`` to a masker kind (``"email"`` or
    ``"phone"``); the default masks the ``email`` and ``phone`` keys. ``None``
    values stay ``None`` so nullable fields keep their meaning.
    """
    if not should_mask_pii(user):
        return data
    field_kinds = fields if fields is not None else {name: name for name in PII_MASKERS}
    for field, kind in field_kinds.items():
        if data.get(field) is not None:
            data[field] = PII_MASKERS[kind](data[field])
    return data


class PIIMaskingMixin:
    """Serializer mixin: masks ``pii_fields`` for viewers that must not see them.

    Reads the viewer from ``context["request"].user``; without a request the
    output is masked (safe default). Override ``pii_fields`` to map differently
    named fields, e.g. ``{"contact_email": "email", "mobile": "phone"}``.
    """

    pii_fields: Mapping[str, str] = {"email": "email", "phone": "phone"}

    def to_representation(self, instance: Any) -> dict[str, Any]:
        data = super().to_representation(instance)  # type: ignore[misc]
        request = self.context.get("request")  # type: ignore[attr-defined]
        viewer = getattr(request, "user", None) if request is not None else None
        return mask_contact(data, viewer, self.pii_fields)
