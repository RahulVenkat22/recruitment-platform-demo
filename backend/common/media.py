"""Short-lived bearer links for private browser media."""

from django.conf import settings
from django.core import signing


def media_token(kind, object_id):
    return signing.TimestampSigner(salt=kind).sign(str(object_id))


def valid_media_token(kind, object_id, token):
    try:
        return signing.TimestampSigner(salt=kind).unsign(
            token, max_age=settings.MEDIA_LINK_MAX_AGE
        ) == str(object_id)
    except signing.BadSignature:
        return False
