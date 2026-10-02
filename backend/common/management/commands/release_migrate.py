"""Serialize deployment migrations without locking the application tables globally."""

from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError
from django.db import connection


class Command(BaseCommand):
    help = "Acquire the deployment lock and apply forward migrations once."

    def handle(self, *args, **options):
        call_command("check_production")
        with connection.cursor() as cursor:
            cursor.execute("SELECT pg_try_advisory_lock(81200421)")
            acquired = cursor.fetchone()[0]
        if not acquired:
            raise CommandError("Another deployment holds the migration lock")
        try:
            call_command("migrate", interactive=False)
        finally:
            with connection.cursor() as cursor:
                cursor.execute("SELECT pg_advisory_unlock(81200421)")
