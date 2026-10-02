"""CloudWatch embedded metrics, emitted without a CloudWatch API permission."""

import json
import time

from django.conf import settings
from django.db import connections
from django.utils import timezone

from workqueue.models import WorkItem


def emit_metrics():
    try:
        oldest = (
            WorkItem.objects.filter(status=WorkItem.Status.PENDING).order_by("available_at").first()
        )
        age = max(0, (timezone.now() - oldest.available_at).total_seconds()) if oldest else 0
        dead = WorkItem.objects.filter(status=WorkItem.Status.DEAD).count()
        print(
            json.dumps(
                {
                    "_aws": {
                        "Timestamp": int(time.time() * 1000),
                        "CloudWatchMetrics": [
                            {
                                "Namespace": "TalentOS/Workers",
                                "Dimensions": [["Service", "Deployment"]],
                                "Metrics": [
                                    {"Name": "OldestPendingSeconds", "Unit": "Seconds"},
                                    {"Name": "DeadJobs", "Unit": "Count"},
                                    {"Name": "Heartbeat", "Unit": "Count"},
                                ],
                            }
                        ],
                    },
                    "Service": "workqueue",
                    "Deployment": settings.DEPLOYMENT_ID,
                    "OldestPendingSeconds": age,
                    "DeadJobs": dead,
                    "Heartbeat": 1,
                }
            ),
            flush=True,
        )
    finally:
        connections.close_all()
