"""Bounded SSE production with idle heartbeats and cooperative cancellation."""

import contextvars
import queue
import threading
import time

from django.conf import settings
from django.db import connections

from resumes.engines.llm import cancellable_llm

_slots = threading.BoundedSemaphore(4)  # Maximum live producers per Gunicorn process.


def heartbeat_stream(source):
    if not getattr(settings, "STREAM_HEARTBEAT_ENABLED", False):
        yield from source
        return
    if not _slots.acquire(blocking=False):
        yield 'event: error\ndata: {"message":"Chat is busy. Please try again shortly."}\n\n'
        return
    output = queue.Queue(maxsize=32)
    stop = threading.Event()
    deadline = time.monotonic() + getattr(settings, "STREAM_MAX_SECONDS", 180)
    sentinel = object()

    def put(value):
        while not stop.is_set() and time.monotonic() < deadline:
            try:
                output.put(value, timeout=0.5)
                return True
            except queue.Full:
                continue
        return False

    def produce():
        try:
            with cancellable_llm(lambda: stop.is_set() or time.monotonic() >= deadline):
                for part in source:
                    if not put(part):
                        break
        except Exception:
            put('event: error\ndata: {"message":"Response interrupted. Please try again."}\n\n')
        finally:
            close = getattr(source, "close", None)
            if close:
                close()
            connections.close_all()
            put(sentinel)
            _slots.release()

    context = contextvars.copy_context()
    thread = threading.Thread(target=context.run, args=(produce,), daemon=True, name="sse-producer")
    thread.start()
    try:
        yield ": connected\n\n"
        while time.monotonic() < deadline:
            try:
                part = output.get(timeout=min(10, max(0.01, deadline - time.monotonic())))
                if part is sentinel:
                    return
                yield part
            except queue.Empty:
                yield ": heartbeat\n\n"
        yield 'event: error\ndata: {"message":"The response timed out. Please try again."}\n\n'
    finally:
        stop.set()
