from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from workqueue.models import WorkItem


class Command(BaseCommand):
    help = "Retry one dead work item after its underlying failure has been resolved."

    def add_arguments(self, parser):
        parser.add_argument("id")

    def handle(self, *args, **options):
        count = WorkItem.objects.filter(pk=options["id"], status=WorkItem.Status.DEAD).update(
            status=WorkItem.Status.PENDING,
            attempts=0,
            available_at=timezone.now(),
            lease_token=None,
            lease_until=None,
            published_at=None,
            error="",
        )
        if not count:
            raise CommandError("No dead work item with that id")
        self.stdout.write("Work item scheduled for retry")
