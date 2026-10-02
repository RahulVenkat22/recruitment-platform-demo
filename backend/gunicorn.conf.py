"""Bounded threaded HTTP workers; AI batch work runs in the separate worker service."""

import os

bind = "0.0.0.0:8200"
worker_class = "gthread"
workers = int(os.getenv("WEB_WORKERS", "2"))
threads = int(os.getenv("WEB_THREADS", "4"))
timeout = 210
graceful_timeout = 100
keepalive = 5
max_requests = 1500
max_requests_jitter = 150
worker_tmp_dir = "/tmp"
accesslog = "-"
errorlog = "-"
# Omit query strings, cookies, authorization headers and signed media tokens.
access_log_format = "%(t)s %(s)s %(m)s %(U)s %(L)s"
limit_request_line = 4094
limit_request_fields = 60
limit_request_field_size = 8190
forwarded_allow_ips = "*"  # ECS security group admits only the ALB; boundary checks edge secret.

# ECS manages the process lifecycle; no local control socket on the read-only image.
control_socket_disable = True
