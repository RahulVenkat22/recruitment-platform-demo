"""Where the resume PDFs live: S3 through boto3, opened with pre-signed URLs.

Until the bucket and credentials are in ``.env`` the storage is simply "not
configured": ingestion records every document as ``pending_upload`` and the
API explains exactly that to anyone who clicks "Open resume". Nothing else in
the pipeline depends on the upload having happened.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path

from django.conf import settings
from django.utils import timezone

logger = logging.getLogger(__name__)

_UNSAFE = re.compile(r"[^A-Za-z0-9._-]+")


class StorageError(Exception):
    pass


class StorageNotConfigured(StorageError):
    pass


@dataclass(frozen=True)
class StorageConfig:
    bucket: str
    prefix: str
    region: str
    endpoint_url: str
    access_key: str
    secret_key: str
    url_expiry_seconds: int

    @classmethod
    def from_settings(cls) -> StorageConfig:
        return cls(
            bucket=settings.RESUME_S3_BUCKET,
            prefix=settings.RESUME_S3_PREFIX,
            region=settings.AWS_REGION,
            endpoint_url=settings.AWS_S3_ENDPOINT_URL,
            access_key=settings.AWS_ACCESS_KEY_ID,
            secret_key=settings.AWS_SECRET_ACCESS_KEY,
            url_expiry_seconds=settings.RESUME_S3_URL_EXPIRY_SECONDS,
        )

    @property
    def missing(self) -> list[str]:
        wanted = {
            "RESUME_S3_BUCKET": self.bucket,
            "AWS_ACCESS_KEY_ID": self.access_key,
            "AWS_SECRET_ACCESS_KEY": self.secret_key,
        }
        return [name for name, value in wanted.items() if not value]

    @property
    def configured(self) -> bool:
        return not self.missing


@dataclass(frozen=True)
class PresignedLink:
    url: str
    expires_at: datetime


class S3ResumeStorage:
    def __init__(self, config: StorageConfig | None = None) -> None:
        self.config = config or StorageConfig.from_settings()
        self._client = None

    @property
    def configured(self) -> bool:
        return self.config.configured

    def not_configured_message(self) -> str:
        return (
            "Resume file storage (S3) is not configured: set "
            + ", ".join(self.config.missing)
            + " in .env, then run `manage.py upload_resumes`."
        )

    def object_key(self, document_id: str, file_name: str) -> str:
        safe = _UNSAFE.sub("_", Path(file_name).name).strip("_") or "resume.pdf"
        prefix = self.config.prefix.strip("/")
        return f"{prefix}/{document_id}/{safe}" if prefix else f"{document_id}/{safe}"

    def _require_client(self):
        if not self.configured:
            raise StorageNotConfigured(self.not_configured_message())
        if self._client is None:
            import boto3
            from botocore.config import Config

            self._client = boto3.client(
                "s3",
                region_name=self.config.region or None,
                endpoint_url=self.config.endpoint_url or None,
                aws_access_key_id=self.config.access_key,
                aws_secret_access_key=self.config.secret_key,
                config=Config(signature_version="s3v4", retries={"max_attempts": 3}),
            )
        return self._client

    def upload_file(self, local_path: str, key: str) -> None:
        client = self._require_client()
        try:
            client.upload_file(
                local_path,
                self.config.bucket,
                key,
                ExtraArgs={"ContentType": "application/pdf"},
            )
        except Exception as exc:  # noqa: BLE001 - botocore raises many types; the caller records the text
            raise StorageError(f"Upload to s3://{self.config.bucket}/{key} failed: {exc}") from exc

    def presigned_url(self, key: str, *, expires_in: int | None = None) -> PresignedLink:
        client = self._require_client()
        seconds = expires_in or self.config.url_expiry_seconds
        try:
            url = client.generate_presigned_url(
                "get_object",
                Params={"Bucket": self.config.bucket, "Key": key},
                ExpiresIn=seconds,
            )
        except Exception as exc:  # noqa: BLE001
            raise StorageError(
                f"Could not sign a link for s3://{self.config.bucket}/{key}: {exc}"
            ) from exc
        return PresignedLink(url=url, expires_at=timezone.now() + timedelta(seconds=seconds))


def get_storage() -> S3ResumeStorage:
    return S3ResumeStorage()
