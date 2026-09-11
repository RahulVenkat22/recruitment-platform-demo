"""``manage.py seed_demo [--reset] [--quiet]`` (plan.md section 10).

Deterministic for a given ``SEED_RANDOM_SEED`` and ``SEED_ANCHOR_DATE``. A marker
row makes repeated runs no-ops; ``--reset`` wipes the demo data and seeds again.
"""

from __future__ import annotations

from django.core.management.base import BaseCommand

from seed.services import SeedSummary, run_seed


class Command(BaseCommand):
    help = "Load the deterministic demo dataset: users, job descriptions and candidates."

    def add_arguments(self, parser) -> None:
        parser.add_argument(
            "--reset",
            action="store_true",
            help="Delete every candidate, job description and demo user first, then seed again.",
        )
        parser.add_argument("--quiet", action="store_true", help="Print nothing except errors.")

    def handle(self, *args, **options) -> None:
        quiet: bool = options["quiet"]
        log = (lambda _message: None) if quiet else self.stdout.write
        summary = run_seed(reset=options["reset"], log=log)
        if quiet:
            return
        if summary.skipped:
            self.stdout.write(self.style.WARNING(_skip_message(summary)))
            return
        self.stdout.write(self.style.SUCCESS(render_summary(summary)))


def _skip_message(summary: SeedSummary) -> str:
    seeded_at = summary.seeded_at.astimezone(summary.anchor.tzinfo) if summary.seeded_at else None
    when = f" on {seeded_at:%d %b %Y %H:%M}" if seeded_at else ""
    counts = summary.counts
    detail = ", ".join(
        f"{counts[label]} {label.lower()}"
        for label in ("Users", "Job descriptions", "Candidates")
        if label in counts
    )
    return (
        f"Demo data already seeded{when} ({detail}). "
        "Nothing changed; run with --reset to wipe and seed again."
    )


def render_summary(summary: SeedSummary) -> str:
    """The summary table printed after a successful run."""
    width = max(len(label) for label in summary.counts)
    lines = [
        f"Seeded demo data (seed {summary.seed}, anchor "
        f"{summary.anchor:%d %b %Y %H:%M %Z}) in {summary.elapsed_seconds:.1f}s",
        "",
        f"  {'Table':<{width}}  {'Rows':>6}",
        f"  {'-' * width}  {'-' * 6}",
    ]
    lines += [f"  {label:<{width}}  {count:>6}" for label, count in summary.counts.items()]
    return "\n".join(lines)
