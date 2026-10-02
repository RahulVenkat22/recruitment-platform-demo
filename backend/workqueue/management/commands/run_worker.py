"""Run one job at a time. Scale by increasing the ECS worker desired count."""

import json
import logging
import signal
import threading
import time
from datetime import timedelta

import boto3
from botocore.config import Config
from django.conf import settings
from django.core.management.base import BaseCommand
from django.db import close_old_connections, connections
from django.db.models import Q
from django.utils import timezone

from workqueue.handlers import execute
from workqueue.observability import emit_metrics
from workqueue.services import claim, due, finish, heartbeat, job_context

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Run durable jobs; SIGTERM drains the current job before exiting."

    def add_arguments(self, parser):
        parser.add_argument("--once", action="store_true")

    def handle(self, *args, **options):
        stopping = threading.Event()
        signal.signal(signal.SIGTERM, lambda *_: stopping.set())
        signal.signal(signal.SIGINT, lambda *_: stopping.set())
        sqs = (
            boto3.client(
                "sqs",
                region_name=settings.AWS_REGION,
                config=Config(connect_timeout=3, read_timeout=15, retries={"max_attempts": 0}),
            )
            if settings.WORK_QUEUE_URL
            else None
        )
        last_metrics = 0
        retry_transport_at = 0
        while not stopping.is_set():
            close_old_connections()
            if time.monotonic() - last_metrics >= 60:
                emit_metrics()
                last_metrics = time.monotonic()
            transport_available = sqs is not None and time.monotonic() >= retry_transport_at
            if transport_available and not self.publish(sqs):
                retry_transport_at = time.monotonic() + 60
                transport_available = False
            # Polling is also a recovery path when SQS is unavailable or a
            # notification arrived before its scheduled retry was due.
            item = claim()
            if item:
                self.run(item)
            elif transport_available and not options["once"]:
                try:
                    messages = sqs.receive_message(
                        QueueUrl=settings.WORK_QUEUE_URL,
                        MaxNumberOfMessages=10,
                        WaitTimeSeconds=10,
                        VisibilityTimeout=30,
                    ).get("Messages", [])
                    for message in messages:
                        # ACK notifications only. The durable database job is
                        # retained until succeeded or explicitly retried by ops.
                        sqs.delete_message(
                            QueueUrl=settings.WORK_QUEUE_URL, ReceiptHandle=message["ReceiptHandle"]
                        )
                except Exception as exc:
                    logger.warning("queue transport unavailable: %s", type(exc).__name__)
                    retry_transport_at = time.monotonic() + 60
                    stopping.wait(2)
            elif not options["once"]:
                stopping.wait(2)
            if options["once"]:
                break
        connections.close_all()

    def publish(self, sqs):
        cutoff = timezone.now() - timedelta(seconds=60)
        rows = due().filter(Q(published_at__isnull=True) | Q(published_at__lt=cutoff))[:10]
        for item in rows:
            try:
                sqs.send_message(
                    QueueUrl=settings.WORK_QUEUE_URL,
                    MessageBody=json.dumps({"v": 1, "id": str(item.pk)}),
                )
                type(item).objects.filter(pk=item.pk).update(published_at=timezone.now())
            except Exception as exc:
                logger.warning("queue publication deferred: %s", type(exc).__name__)
                return False
        return True

    def run(self, item):
        done = threading.Event()
        started = time.monotonic()

        def renew():
            try:
                while not done.wait(settings.WORK_LEASE_SECONDS / 3):
                    if time.monotonic() - started > settings.WORK_MAX_SECONDS:
                        # No further renewal: another worker can recover it;
                        # write_guard rejects stale mutations by this worker.
                        return
                    if not heartbeat(item):
                        return
                    emit_metrics()
            finally:
                connections.close_all()

        thread = threading.Thread(target=renew, name="lease-heartbeat", daemon=True)
        thread.start()
        try:
            from resumes.engines.llm import cancellable_llm

            with (
                job_context(item),
                cancellable_llm(lambda: time.monotonic() - started > settings.WORK_MAX_SECONDS),
            ):
                execute(item)
            finish(item)
            logger.info("job completed id=%s kind=%s attempt=%s", item.pk, item.kind, item.attempts)
        except Exception as exc:
            finish(item, exc)
            # Exceptions from providers may contain PII or request credentials.
            logger.error(
                "job failed id=%s kind=%s error=%s", item.pk, item.kind, type(exc).__name__
            )
        finally:
            done.set()
            thread.join(timeout=5)
            connections.close_all()
