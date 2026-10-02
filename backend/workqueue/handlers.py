"""Closed handler registry; queue messages cannot name arbitrary Python code."""

from workqueue.services import write_guard


def execute(item):
    if item.kind == "password_reset":
        from accounts.services import deliver_password_reset

        deliver_password_reset(item.payload["id"])
    elif item.kind == "voice_webhook":
        from pipeline.services.calls import process_voice_webhook

        process_voice_webhook(item.payload["id"])
    elif item.kind == "resume":
        from resumes.models import ResumeDocument
        from resumes.services.ingestion import ResumeIngestionService

        document = ResumeDocument.objects.filter(pk=item.payload["id"]).first()
        if document is None:
            return
        result = ResumeIngestionService.ingest_document(document)
        if result.outcome == "failed":
            raise RuntimeError("resume ingestion failed")
    elif item.kind == "search":
        from pipeline.models import SearchRun
        from sourcing.services import SearchService

        if SearchRun.objects.filter(pk=item.payload["id"]).exists():
            SearchService.execute(item.payload["id"])
    elif item.kind == "job_upload":
        from jobs.models import JobDescriptionUpload
        from jobs.services import JobUploadService

        upload = JobDescriptionUpload.objects.filter(pk=item.payload["id"]).first()
        if upload is None or upload.status != JobDescriptionUpload.Status.PROCESSING:
            return
        with upload.input_file.open("rb") as source:
            data = source.read(10 * 1024 * 1024 + 1)
        if len(data) > 10 * 1024 * 1024:
            raise ValueError("job upload exceeds size limit")
        JobUploadService.process(upload.pk, upload.file_name, data)
    else:
        raise ValueError("unknown work kind")
    # Detect a lost lease even when a handler made no final database change.
    with write_guard():
        pass
