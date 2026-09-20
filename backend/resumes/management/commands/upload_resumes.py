"""``manage.py upload_resumes``: push ingested PDFs that are still pending to S3."""

from __future__ import annotations

from django.core.management.base import BaseCommand, CommandError

from resumes.engines.storage import StorageError
from resumes.services.uploads import upload_pending


class Command(BaseCommand):
    help = "Upload ingested resume PDFs that have not reached S3 yet."

    def add_arguments(self, parser) -> None:
        parser.add_argument("--limit", type=int, default=None)

    def handle(self, *args, **options) -> None:
        def progress(index: int, total: int, document, status: str) -> None:
            self.stdout.write(f"[{index}/{total}] {document.file_name} ... {status}")

        try:
            stats = upload_pending(limit=options["limit"], progress=progress)
        except StorageError as exc:
            raise CommandError(str(exc)) from exc
        self.stdout.write(
            self.style.SUCCESS(
                f"Uploaded {stats.uploaded}/{stats.total}; failed {stats.failed}; "
                f"missing local files {stats.missing_files}"
            )
        )
        for error in stats.errors:
            self.stdout.write(f"  - {error}")
