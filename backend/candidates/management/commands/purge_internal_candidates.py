"""``manage.py purge_internal_candidates``: empty the Internal Database pool.

    python manage.py purge_internal_candidates --dry-run   # counts only, changes nothing
    python manage.py purge_internal_candidates             # remove them

Every candidate with an ``internal`` source row is removed from the Internal
Database, the ones created from uploaded or ingested PDFs included. A
candidate who also belongs to another source (LinkedIn, Naukri, Referral
Email) keeps that source and only loses the ``internal`` row. A candidate whose
only source is ``internal`` is deleted outright, together with skills, roles,
education, certifications, applications, matches, resume documents and resume
chunks; activities keep their text and lose the candidate link.

PDF files on disk are never touched, so the next ``ingest_resumes`` run or
browser upload treats every file as new. ``make seed`` re-creates the seeded
candidates; run it afterwards only if you want the demo pool back.
"""

from __future__ import annotations

from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import Count

from candidates.models import Candidate, CandidateSource
from common.enums import CandidateSource as SourceKey
from resumes.models import ResumeDocument


class Command(BaseCommand):
    help = "Remove every candidate from the Internal Database (kept if they have another source)."

    def add_arguments(self, parser) -> None:
        parser.add_argument(
            "--dry-run", action="store_true", help="print what would be removed and change nothing"
        )

    def handle(self, *args, **options) -> None:
        dry_run = options["dry_run"]
        ids = list(
            Candidate.objects.filter(sources__source=SourceKey.INTERNAL)
            .distinct()
            .values_list("pk", flat=True)
        )
        # Also listed under LinkedIn, Naukri or Referral: keep them there.
        other_sourced = set(
            CandidateSource.objects.filter(candidate_id__in=ids)
            .exclude(source=SourceKey.INTERNAL)
            .values_list("candidate_id", flat=True)
        )
        to_unlink = [pk for pk in ids if pk in other_sourced]
        to_delete = [pk for pk in ids if pk not in other_sourced]

        applications = (
            Candidate.objects.filter(pk__in=to_delete).aggregate(n=Count("applications"))["n"] or 0
        )
        documents = ResumeDocument.objects.filter(candidate_id__in=to_delete).count()

        prefix = "[dry-run] would remove" if dry_run else "removing"
        self.stdout.write(f"{prefix}:")
        self.stdout.write(f"  {len(to_delete):4d} candidates (with {applications} applications)")
        self.stdout.write(
            f"  {len(to_unlink):4d} internal rows from candidates kept under another source"
        )
        self.stdout.write(f"  {documents:4d} resume documents (and their chunks)")
        if dry_run:
            return

        with transaction.atomic():
            if to_unlink:
                CandidateSource.objects.filter(
                    candidate_id__in=to_unlink, source=SourceKey.INTERNAL
                ).delete()
            if documents:
                ResumeDocument.objects.filter(candidate_id__in=to_delete).delete()
            Candidate.objects.filter(pk__in=to_delete).delete()

        remaining = Candidate.objects.filter(sources__source=SourceKey.INTERNAL).distinct().count()
        self.stdout.write(
            self.style.SUCCESS(f"done; the Internal Database now holds {remaining} candidates")
        )
        self.stdout.write("(`make seed` would re-create the seeded candidates)")
