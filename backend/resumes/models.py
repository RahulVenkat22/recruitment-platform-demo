"""Resume PDFs ingested into the candidate pool and their embedded chunks.

``ResumeDocument`` is one PDF, identified by its SHA-256 so the same file is
never processed twice; it keeps the extracted text, the LLM's structured
output and where the file lives (local path now, S3 key once uploaded).
``ResumeChunk`` holds the semantic sections of a parsed resume with their
pgvector embeddings for candidate search. The candidate profile itself stays in
``candidates.*``: this app only adds the file, the text and the vectors.
"""

from __future__ import annotations

from django.conf import settings
from django.db import models
from pgvector.django import HnswIndex, VectorField

from common.models import UUIDTimestampedModel


class ResumeStatus(models.TextChoices):
    PENDING = "pending", "Pending"
    PARSED = "parsed", "Parsed"
    # Text was extracted but the profile could not be trusted (no identity, LLM
    # fallback, scanned PDF); nothing searchable was created.
    NEEDS_REVIEW = "needs_review", "Needs review"
    FAILED = "failed", "Failed"
    # A newer file at the same path replaced this one.
    SUPERSEDED = "superseded", "Superseded"


class StorageStatus(models.TextChoices):
    PENDING_UPLOAD = "pending_upload", "Pending upload"
    UPLOADED = "uploaded", "Uploaded"
    FAILED = "failed", "Upload failed"


class ChunkSection(models.TextChoices):
    SUMMARY = "summary", "Summary"
    SKILLS = "skills", "Skills"
    EXPERIENCE = "experience", "Experience"
    EDUCATION = "education", "Education"
    CERTIFICATIONS = "certifications", "Certifications"
    PROJECTS = "projects", "Projects"
    # Windows over the raw extracted text, so nothing the parser dropped is lost.
    TEXT = "text", "Resume text"


class DocumentOrigin(models.TextChoices):
    FOLDER = "folder", "Folder scan"
    UPLOAD = "upload", "Uploaded"


class ResumeDocument(UUIDTimestampedModel):
    # How the file arrived: `manage.py ingest_resumes` over a folder, or the upload API.
    origin = models.CharField(
        max_length=10, choices=DocumentOrigin.choices, default=DocumentOrigin.FOLDER
    )
    # Files uploaded together share a batch id; the upload page polls it.
    upload_batch = models.UUIDField(null=True, blank=True, db_index=True)
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="uploaded_resumes",
    )
    candidate = models.ForeignKey(
        "candidates.Candidate",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="resume_documents",
    )
    file_name = models.CharField(max_length=255)
    # Absolute path of the file that was ingested (RESUME_STORAGE_PATH or the CLI argument).
    source_path = models.TextField()
    file_hash = models.CharField(max_length=64, unique=True)
    file_size = models.PositiveIntegerField()
    page_count = models.PositiveSmallIntegerField(default=0)
    status = models.CharField(
        max_length=20, choices=ResumeStatus.choices, default=ResumeStatus.PENDING
    )
    # Why the document is needs_review / failed.
    status_reason = models.TextField(blank=True)
    extracted_text = models.TextField(blank=True)
    text_chars = models.PositiveIntegerField(default=0)
    # The validated structured output of the parser (resumes.engines.schemas.ParsedResume).
    parsed_data = models.JSONField(null=True, blank=True)
    # "llm_pdf": the model read the PDF itself. Rows from the earlier text
    # pipeline may still hold "llm" or "heuristic".
    parse_source = models.CharField(max_length=20, blank=True)
    warnings = models.JSONField(default=list, blank=True)
    llm_model = models.CharField(max_length=80, blank=True)
    embedding_model = models.CharField(max_length=80, blank=True)
    chunk_count = models.PositiveIntegerField(default=0)
    storage_status = models.CharField(
        max_length=20, choices=StorageStatus.choices, default=StorageStatus.PENDING_UPLOAD
    )
    storage_key = models.CharField(max_length=512, blank=True)
    storage_error = models.TextField(blank=True)
    uploaded_at = models.DateTimeField(null=True, blank=True)
    ingested_at = models.DateTimeField(null=True, blank=True)
    processing_ms = models.PositiveIntegerField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["status"], name="resumes_doc_status_idx"),
            models.Index(fields=["storage_status"], name="resumes_doc_storage_idx"),
        ]

    def __str__(self) -> str:
        return f"{self.file_name} ({self.get_status_display()})"

    @property
    def is_uploaded(self) -> bool:
        return self.storage_status == StorageStatus.UPLOADED and bool(self.storage_key)


class ResumeChunk(UUIDTimestampedModel):
    document = models.ForeignKey(ResumeDocument, on_delete=models.CASCADE, related_name="chunks")
    # Denormalised from the document so a similarity query joins nothing.
    candidate = models.ForeignKey(
        "candidates.Candidate", on_delete=models.CASCADE, related_name="resume_chunks"
    )
    section = models.CharField(max_length=20, choices=ChunkSection.choices)
    chunk_index = models.PositiveSmallIntegerField()
    content = models.TextField()
    char_count = models.PositiveIntegerField()
    embedding = VectorField(dimensions=settings.EMBEDDING_DIMENSIONS)

    class Meta:
        ordering = ["document", "section", "chunk_index"]
        constraints = [
            models.UniqueConstraint(
                fields=["document", "section", "chunk_index"],
                name="resumes_chunk_doc_section_idx_uniq",
            ),
        ]
        indexes = [
            HnswIndex(
                name="resumes_chunk_embedding_hnsw",
                fields=["embedding"],
                m=16,
                ef_construction=64,
                opclasses=["vector_cosine_ops"],
            ),
        ]

    def __str__(self) -> str:
        return f"{self.document.file_name} · {self.section} #{self.chunk_index}"
