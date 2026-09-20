"""``EmbeddingService``: text -> vectors through the configured provider's embedding model.

The embeddings follow ``LLM_PROVIDER`` exactly as the chat model does: OpenAI's
``text-embedding-3-small`` or Gemini's ``gemini-embedding-001``, both asked for
``EMBEDDING_DIMENSIONS``-wide vectors (768 by default). Both models support a
reduced output width natively -- ``dimensions`` on OpenAI,
``output_dimensionality`` on Gemini -- which is what keeps the pgvector column
fixed across providers: switching provider means re-embedding the library
(``ingest_resumes --reprocess``, since two models' spaces are not comparable),
but never a migration.

Separate from the chat LLM on purpose: embedding runs in batches, is cheap, and
never fails for schema reasons. The first successful call checks the vector
width against ``EMBEDDING_DIMENSIONS`` so a model that ignores the requested
width is caught with one clear error instead of a database exception per chunk.
"""

from __future__ import annotations

import logging
from functools import lru_cache
from typing import Any

from django.conf import settings

from resumes.engines.llm import (
    LLMError,
    _import,
    api_key_for,
    as_llm_error,
    key_setting_for,
    require_api_key,
)

logger = logging.getLogger(__name__)


class EmbeddingError(Exception):
    pass


class EmbeddingService:
    def __init__(
        self,
        model: str | None = None,
        *,
        provider: str | None = None,
        batch_size: int | None = None,
        dimensions: int | None = None,
    ) -> None:
        self.provider = provider or settings.LLM_PROVIDER
        self.model = model or settings.EMBEDDING_MODEL
        self.batch_size = max(1, batch_size or settings.EMBEDDING_BATCH_SIZE)
        self.dimensions = dimensions or settings.EMBEDDING_DIMENSIONS
        self._client: Any = None
        self._checked = False

    @property
    def client(self) -> Any:
        """The LangChain embeddings client, built once; ``EmbeddingError`` if it cannot be."""
        if self._client is None:
            try:
                self._client = self._build()
            except LLMError as exc:
                raise EmbeddingError(str(exc)) from exc
        return self._client

    def _build(self) -> Any:
        key = require_api_key(self.provider)
        timeout = float(settings.LLM_TIMEOUT_SECONDS)
        if self.provider == "openai":
            openai_embeddings = _import("langchain_openai", "OpenAIEmbeddings", "langchain-openai")
            return openai_embeddings(
                model=self.model,
                api_key=key,
                base_url=settings.OPENAI_BASE_URL or None,
                dimensions=self.dimensions,
                timeout=timeout,
                max_retries=settings.LLM_MAX_RETRIES,
                # One request per batch: the service already batches, so the
                # client must not split a batch again on its own schedule.
                chunk_size=self.batch_size,
                # The tokenizer check downloads tiktoken data and fails offline;
                # the chunks are sized well under the 8k-token input limit.
                check_embedding_ctx_length=False,
            )
        gemini_embeddings = _import(
            "langchain_google_genai", "GoogleGenerativeAIEmbeddings", "langchain-google-genai"
        )
        return gemini_embeddings(
            model=self.model,
            google_api_key=key,
            output_dimensionality=self.dimensions,
            # Forwarded to the underlying httpx client; the class has no
            # first-class timeout of its own.
            client_args={"timeout": timeout},
        )

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        vectors: list[list[float]] = []
        for start in range(0, len(texts), self.batch_size):
            vectors.extend(self._embed(texts[start : start + self.batch_size], query=False))
        return vectors

    def embed_queries(self, texts: list[str]) -> list[list[float]]:
        return self._embed(texts, query=True) if texts else []

    def embed_query(self, text: str) -> list[float]:
        return self.embed_queries([text])[0]

    def _embed(self, texts: list[str], *, query: bool) -> list[list[float]]:
        if not texts:
            return []
        client = self.client
        try:
            if query and self.provider == "gemini":
                # Gemini embeds documents and queries with different task types
                # (RETRIEVAL_DOCUMENT / RETRIEVAL_QUERY); the client picks the
                # right one per method, so queries must go through embed_query.
                vectors = [client.embed_query(text) for text in texts]
            else:
                vectors = client.embed_documents(texts)
        except Exception as exc:  # noqa: BLE001 - mapped onto EmbeddingError below
            mapped = as_llm_error(self.provider, self.model, exc, model_setting="EMBEDDING_MODEL")
            raise EmbeddingError(f"Embedding failed: {mapped}") from exc
        if not self._checked and vectors:
            width = len(vectors[0])
            if width != self.dimensions:
                raise EmbeddingError(
                    f"{self.model} returns {width}-dimensional vectors but EMBEDDING_DIMENSIONS is "
                    f"{self.dimensions}; align the setting (and migrate resumes) with the model."
                )
            self._checked = True
        return [list(map(float, vector)) for vector in vectors]


@lru_cache(maxsize=1)
def get_embedding_service() -> EmbeddingService:
    return EmbeddingService()


def embedding_status() -> dict[str, Any]:
    """Can the configured provider embed? Key present and client constructible; no network."""
    provider = settings.LLM_PROVIDER
    error = ""
    if not api_key_for(provider):
        error = f"{key_setting_for(provider)} is not set"
    else:
        try:
            get_embedding_service().client  # noqa: B018 - construction is the check
        except EmbeddingError as exc:
            error = str(exc)
        except Exception as exc:  # noqa: BLE001 - a client we cannot build is unavailable
            logger.exception("Could not build the %s embeddings client", provider)
            error = f"The {provider} embeddings client could not be built ({type(exc).__name__})."
    return {
        "provider": provider,
        "model": settings.EMBEDDING_MODEL,
        "dimensions": settings.EMBEDDING_DIMENSIONS,
        "available": not error,
        "error": error,
    }
