"""Resume rule violations in the plan.md 6.10 error envelope."""

from __future__ import annotations

from rest_framework import status
from rest_framework.exceptions import APIException


class ResumeNotFound(APIException):
    status_code = status.HTTP_404_NOT_FOUND
    default_detail = "This candidate has no resume on file."
    default_code = "resume_not_found"


class ResumeStorageNotConfigured(APIException):
    status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    default_detail = (
        "Resume file storage (S3) is not configured yet. The PDF was ingested locally but "
        "cannot be opened until the AWS credentials and bucket are added to .env and "
        "`manage.py upload_resumes` has pushed the files."
    )
    default_code = "resume_storage_not_configured"


class ResumeNotUploaded(APIException):
    status_code = status.HTTP_409_CONFLICT
    default_detail = (
        "This resume has not been uploaded to S3 yet. Run `manage.py upload_resumes` to push "
        "the pending files."
    )
    default_code = "resume_not_uploaded"


class ResumeStorageError(APIException):
    status_code = status.HTTP_502_BAD_GATEWAY
    default_detail = "The resume storage service could not be reached."
    default_code = "resume_storage_error"
