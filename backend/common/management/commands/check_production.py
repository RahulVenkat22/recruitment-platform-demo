"""Fail releases on deployment warnings except deliberate HSTS policy decisions."""

from django.core import checks
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = "Validate Django deployment checks with explicit HSTS policy exceptions."

    def handle(self, *args, **options):
        exceptions = {"security.W005", "security.W021"}
        issues = checks.run_checks(include_deployment_checks=True)
        blockers = [
            issue
            for issue in issues
            if issue.level >= checks.WARNING and issue.id not in exceptions
        ]
        for issue in issues:
            self.stdout.write(str(issue))
        if blockers:
            raise CommandError("Production deployment checks failed")
        self.stdout.write(
            "Production checks passed; subdomain HSTS/preload require domain-owner review."
        )
