"""Embedding providers for corpus-query vectorisation (TAG-60).

`PgCorpusSearch` (TAG-59) needs to embed the user's natural-language
query at request time using the **same model and dimension** the
TypeScript ingestion pipeline (`apps/api/src/lib/embedding/`) used when
it wrote the row. A drift here returns nonsense vector hits silently,
so the dimension is asserted on every call and a mismatch raises loud.

Two providers ship in this ticket:

  * :class:`OpenAIEmbeddingProvider` — wraps ``openai.AsyncOpenAI`` and
    targets the production model (``text-embedding-3-small`` / 1536-d
    by default; confirmed against ``apps/api/src/lib/embedding/index.ts``
    line 31-32). The embed-side key is **separate from the chat-side
    key** by design — embeddings are an operator-pool capability, not
    a per-user model. The factory falls back to the chat key when the
    embed-specific key is unset so a single-account dev box still works.
  * :class:`FakeEmbeddingProvider` — deterministic SHA-256-derived
    vector for unit tests. No network. Same input → same vector.

Why request-time and not cached: ``/solve`` is called with arbitrary
user queries; cache hit rate is near zero. A per-call OpenAI embedding
costs ~$0.00002 — negligible. A cache layer is a future ticket.
"""

from __future__ import annotations

import hashlib
from typing import Protocol, runtime_checkable

from openai import AsyncOpenAI

from ..config import Settings, settings as default_settings


@runtime_checkable
class EmbeddingProvider(Protocol):
    """Async, single-query embedder. Implementations expose ``dim``
    so callers (notably :class:`PgCorpusSearch` from TAG-59) can pin
    their vector index assertions at construction time rather than on
    every request."""

    dim: int

    async def embed_query(self, text: str) -> list[float]:
        """Return a fixed-dimension embedding for ``text``.

        Implementations MUST raise ``RuntimeError`` if the provider
        returns a vector whose length doesn't match ``self.dim`` — a
        silent mismatch ends in junk retrieval downstream.
        """
        ...


class OpenAIEmbeddingProvider:
    """OpenAI embeddings via ``openai.AsyncOpenAI``.

    The model and dimension default to ``apps/api``'s confirmed
    production values (``text-embedding-3-small`` / 1536) but are
    overridable through :class:`Settings` so an operator who re-embeds
    onto ``text-embedding-3-large`` can flip the env vars without code
    changes. Dim is asserted on every call — if the operator swaps the
    model env behind an existing corpus, we fail loudly rather than
    return useless cosine distances.
    """

    def __init__(
        self,
        *,
        api_key: str,
        model: str,
        dim: int,
        api_base: str | None = None,
    ) -> None:
        if not api_key:
            # Loud at construction, not on first request — operators
            # see the boot crash in logs immediately rather than the
            # first ``/solve`` returning a 500.
            raise RuntimeError("OpenAI embedding api_key required")
        # ``base_url`` defaults to OpenAI's prod endpoint when None.
        self._client = AsyncOpenAI(api_key=api_key, base_url=api_base)
        self._model = model
        self.dim = dim

    async def embed_query(self, text: str) -> list[float]:
        # OpenAI rate-limits at ~3500 RPM on tier 1; we call once per
        # /solve so a per-tenant rate ceiling lands elsewhere.
        resp = await self._client.embeddings.create(
            model=self._model,
            input=text,
        )
        vec = resp.data[0].embedding
        if len(vec) != self.dim:
            raise RuntimeError(
                f"embedding dim mismatch: got {len(vec)} expected {self.dim} "
                f"(model={self._model!r}) — corpus and query embedders disagree, "
                "check OPENAI_EMBEDDING_MODEL / EMBEDDING_DIM env parity",
            )
        # OpenAI returns ``list[float]`` already; the cast is a noop at
        # runtime but makes the return type explicit for downstream
        # callers that hand the vector straight into asyncpg-pgvector.
        return list(vec)


class FakeEmbeddingProvider:
    """Deterministic SHA-256-derived embeddings for tests.

    Same ``text`` → same vector, every time. No network, no API key,
    no SDK round-trip. ``dim`` defaults to 16 (a single SHA-256 digest
    is 32 bytes; we slice to ``dim``). Bumping ``dim`` past 32 would
    require chained hashing — out of scope, tests don't need it.
    """

    def __init__(self, *, dim: int = 16) -> None:
        if dim < 1 or dim > 32:
            raise RuntimeError(
                "FakeEmbeddingProvider dim must be 1..32 (SHA-256 produces "
                "32 bytes; chaining for larger vectors isn't supported here)",
            )
        self.dim = dim

    async def embed_query(self, text: str) -> list[float]:
        digest = hashlib.sha256(text.encode("utf-8")).digest()
        # Normalise each byte into [0, 1]. Float granularity is fine —
        # downstream BM25/RRF treat the vector list as opaque.
        return [b / 255.0 for b in digest[: self.dim]]


def create_embedding_provider(s: Settings | None = None) -> EmbeddingProvider:
    """Resolve the configured provider, with a chat-key fallback.

    Resolution order:

      1. ``embedding_provider == "fake"`` → :class:`FakeEmbeddingProvider`,
         using ``embedding_dim`` clipped to ``[1, 32]`` (or default 16
         when ``embedding_dim`` is 1536 — too large for the fake hash).
      2. ``embedding_provider == "openai"`` → :class:`OpenAIEmbeddingProvider`
         with ``openai_embed_api_key`` if set, else ``openai_api_key``.
         A missing key raises ``RuntimeError`` from the constructor.

    The chat-key fallback is a dev-ergonomics choice: a single-account
    dev box has only ``OPENAI_API_KEY`` set. Operators running with a
    dedicated embedding-pool account set both keys.
    """
    s = s or default_settings
    if s.embedding_provider == "fake":
        # Don't let the production-sized 1536 leak into the fake — it
        # can't represent that range. Clamp to a sensible test dim.
        dim = s.embedding_dim if 1 <= s.embedding_dim <= 32 else 16
        return FakeEmbeddingProvider(dim=dim)
    return OpenAIEmbeddingProvider(
        api_key=s.openai_embed_api_key or s.openai_api_key,
        model=s.embedding_model,
        api_base=s.openai_embed_api_base or None,
        dim=s.embedding_dim,
    )


__all__ = [
    "EmbeddingProvider",
    "FakeEmbeddingProvider",
    "OpenAIEmbeddingProvider",
    "create_embedding_provider",
]
