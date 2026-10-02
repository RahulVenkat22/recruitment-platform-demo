"""Copy legacy local media into configured default storage before ECS cutover."""

from pathlib import Path

from django.conf import settings
from django.core.files import File
from django.core.files.storage import default_storage
from django.core.management.base import BaseCommand, CommandError

from candidates.models import Candidate
from resumes.models import ResumeDocument
from support.models import TicketAttachment


class Command(BaseCommand):
    help = "Inventory legacy media; --apply copies bytes and changes DB pointers. Back up first."

    def add_arguments(self, parser):
        parser.add_argument("--apply", action="store_true")
        parser.add_argument("--media-root", type=Path, required=True)
        parser.add_argument("--resume-root", type=Path, required=True)

    def handle(self, *args, **options):
        if options["apply"] and not settings.STORAGES["default"]["BACKEND"].startswith("storages."):
            raise CommandError("--apply requires remote default storage")
        copied = missing = 0
        entries = []
        for doc in ResumeDocument.objects.filter(input_file="").iterator():
            source = Path(doc.source_path)
            if not source.is_absolute():
                source = options["resume_root"] / source
            entries.append((doc, "input_file", source, f"inputs/legacy/{doc.pk}/{doc.file_name}"))
        for candidate in Candidate.objects.exclude(photo="").iterator():
            if "/" not in candidate.photo:
                entries.append(
                    (
                        candidate,
                        "photo",
                        options["resume_root"] / "photos" / candidate.photo,
                        f"photos/{candidate.pk}.jpg",
                    )
                )
        for attachment in TicketAttachment.objects.all().iterator():
            # Same object key; a second run sees the existing remote object and skips it.
            entries.append(
                (
                    attachment,
                    "file",
                    options["media_root"] / attachment.file.name,
                    attachment.file.name,
                )
            )
        for obj, field, source, key in entries:
            if not source.is_file():
                if default_storage.exists(key):
                    continue
                missing += 1
                self.stderr.write(f"Missing bytes for {obj._meta.label} {obj.pk}")
                continue
            if options["apply"]:
                if not default_storage.exists(key):
                    with source.open("rb") as data:
                        key = default_storage.save(key, File(data))
                setattr(obj, field, key)
                obj.save(update_fields=[field, "updated_at"])
            copied += 1
        self.stdout.write(
            f"{'Copied' if options['apply'] else 'Would copy'} {copied}; missing {missing}"
        )
        if missing:
            raise CommandError("Resolve missing files before cutover; source files were retained")
