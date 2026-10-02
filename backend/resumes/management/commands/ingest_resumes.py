"""``manage.py ingest_resumes [folder]``: PDFs -> the model -> candidates -> chunks -> pgvector.

    python manage.py ingest_resumes                    # RESUME_STORAGE_PATH from .env
    python manage.py ingest_resumes /path/to/pdfs --limit 20
    python manage.py ingest_resumes --file a.pdf --file b.pdf
    python manage.py ingest_resumes --reprocess        # re-send files already ingested

Every PDF goes to the configured provider's model (``LLM_PROVIDER``), which
returns the structured profile; the text layer is only embedded for search.
Files already ingested are skipped by hash, so re-running over the same folder
retries only the needs_review / failed rows and costs nothing for the rest.
``--reprocess`` re-sends everything -- a per-page bill -- and is what a change
of provider or embedding model needs, since two models' vector spaces are not
comparable.

The command never stops on a bad file: each PDF reports processed / skipped /
needs_review / failed and the summary counts them.
"""

from __future__ import annotations

from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from resumes.engines.embeddings import embedding_status
from resumes.engines.llm import chat_status
from resumes.services.ingestion import (
    IngestionResult,
    ResumeIngestionService,
    list_pdfs,
    stats_summary,
)


class Command(BaseCommand):
    help = "Ingest resume PDFs from a folder into candidates, resume chunks and embeddings."

    def add_arguments(self, parser) -> None:
        parser.add_argument(
            "folder", nargs="?", default=None, help="Folder of PDFs (default: RESUME_STORAGE_PATH)"
        )
        parser.add_argument("--limit", type=int, default=None, help="Process at most N files")
        parser.add_argument(
            "--reprocess", action="store_true", help="Re-ingest files that were already processed"
        )
        parser.add_argument(
            "--file", action="append", default=[], help="Ingest only this file (repeatable)"
        )

    def handle(self, *args, **options) -> None:
        folder = options["folder"] or settings.RESUME_STORAGE_PATH
        try:
            files = [Path(item) for item in options["file"]] or list_pdfs(folder)
        except FileNotFoundError as exc:
            raise CommandError(str(exc)) from exc
        if options["limit"]:
            files = files[: options["limit"]]
        if not files:
            raise CommandError(f"No PDF files found in {folder}")

        # Both checks are about the configured provider and neither makes a
        # network call: a missing key or an uninstalled client package is
        # reported here rather than on the first file.
        chat = chat_status()
        if not chat["available"]:
            raise CommandError(f"LLM_PROVIDER={settings.LLM_PROVIDER}: {chat['error']}")
        # The search model is only used by the interactive search path.
        # Ingestion never calls it, so this is a note, not a blocker.
        if chat["warning"]:
            self.stdout.write(
                self.style.WARNING(
                    f"Note: {chat['warning']}; semantic search will fall back to "
                    "scores without LLM evaluation. Ingestion does not use it."
                )
            )
        embeddings = embedding_status()
        if not embeddings["available"]:
            raise CommandError(f"Embeddings ({settings.EMBEDDING_PROVIDER}): {embeddings['error']}")

        s3 = "configured" if settings.RESUME_S3_BUCKET and settings.AWS_ACCESS_KEY_ID else "off"
        self.stdout.write(
            f"Resume ingestion: {len(files)} PDF(s) from {folder}\n"
            f"  parser: {settings.LLM_PROVIDER}: {settings.LLM_MODEL} "
            f"(first {settings.RESUME_LLM_PDF_MAX_PAGES} pages of each PDF) | "
            f"embeddings: {settings.EMBEDDING_MODEL} ({settings.EMBEDDING_DIMENSIONS}d) | "
            f"S3 upload: {s3}"
        )

        def on_result(index: int, total: int, result: IngestionResult) -> None:
            self.stdout.write(
                f"[{index}/{total}] {Path(result.path).name} ... {self._describe(result)}"
            )
            self.stdout.flush()

        stats = ResumeIngestionService.ingest_folder(
            folder, force=options["reprocess"], on_result=on_result, paths=files
        )
        summary = stats_summary(stats)
        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS("Summary"))
        for key, value in summary.items():
            self.stdout.write(f"  {key.replace('_', ' '):<22} {value}")
        if stats.failed:
            self.stdout.write(self.style.WARNING("Failed files:"))
            for result in stats.results:
                if result.outcome == "failed":
                    self.stdout.write(f"  - {Path(result.path).name}: {result.reason}")

    @staticmethod
    def _describe(result: IngestionResult) -> str:
        if result.outcome == "processed":
            who = result.candidate.full_name if result.candidate else "?"
            state = "new candidate" if result.candidate_created else "updated candidate"
            upload = "uploaded to S3" if result.uploaded else "S3 upload pending"
            warn = f", {len(result.warnings)} warning(s)" if result.warnings else ""
            return (
                f"parsed -> {who} ({state}), {result.chunk_count} chunks, "
                f"{upload}, {result.seconds}s{warn}"
            )
        if result.outcome == "skipped":
            return f"skipped ({result.reason})"
        if result.outcome == "needs_review":
            return f"NEEDS REVIEW: {result.reason}"
        return f"FAILED: {result.reason}"
