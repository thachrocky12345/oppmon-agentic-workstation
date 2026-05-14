# TAG-60: Python Embedding Provider for Corpus Queries

## Description

**Suggested Points:** 2
**Type:** Story
**Epic:** [TAG-50](./TAG-50-authenticated-solve-endpoint-epic.md)
**Status:** Open

`PgCorpusSearch` (TAG-59) needs to embed the user's query at request time using
the **same model and dimension** that `apps/api` used at ingestion time —
otherwise the vector search will return nonsense.

## Objective

```python
class EmbeddingProvider(Protocol):
    dim: int
    async def embed_query(self, text: str) -> list[float]: ...
```

with two implementations:

- `OpenAIEmbeddingProvider` — `text-embedding-3-small` / `-3-large` /
  `text-embedding-ada-002`, whichever `apps/api` uses.
- `FakeEmbeddingProvider` — deterministic hash-based vector for unit tests.

## Requirements

### Determine the source-of-truth model

Read `apps/api/src/lib/embedding/` (in particular `openai.ts` and the seed
script that built the existing corpus). The model and dim there are the
source of truth. Bake them into Python config as defaults:

```python
# agent_v2/config.py additions
embedding_provider: Literal["openai","fake"] = "openai"
embedding_model: str = "text-embedding-3-small"    # CONFIRM against apps/api
embedding_dim: int = 1536                          # CONFIRM
openai_embed_api_key: str = ""                     # may differ from openai_api_key for chat
openai_embed_api_base: str = "https://api.openai.com/v1"
```

### Implementation

`agent_v2/rag/embedding.py`:

```python
from openai import AsyncOpenAI

class OpenAIEmbeddingProvider(EmbeddingProvider):
    def __init__(self, *, api_key: str, model: str, api_base: str | None = None, dim: int):
        if not api_key:
            raise RuntimeError("OpenAI embedding api_key required")
        self._client = AsyncOpenAI(api_key=api_key, base_url=api_base)
        self._model = model
        self.dim    = dim

    async def embed_query(self, text: str) -> list[float]:
        # OpenAI rate-limits at ~3500 RPM on tier 1; we call once per /solve.
        resp = await self._client.embeddings.create(model=self._model, input=text)
        vec = resp.data[0].embedding
        if len(vec) != self.dim:
            raise RuntimeError(f"embedding dim mismatch: got {len(vec)} expected {self.dim}")
        return vec

class FakeEmbeddingProvider(EmbeddingProvider):
    def __init__(self, dim: int = 16):
        self.dim = dim
    async def embed_query(self, text):
        h = hashlib.sha256(text.encode()).digest()
        return [(b/255.0) for b in h[:self.dim]]
```

### Factory

`agent_v2/rag/embedding.py`:

```python
def create_embedding_provider(s: Settings | None = None) -> EmbeddingProvider:
    s = s or settings
    if s.embedding_provider == "fake":
        return FakeEmbeddingProvider(dim=s.embedding_dim or 16)
    return OpenAIEmbeddingProvider(
        api_key=s.openai_embed_api_key or s.openai_api_key,
        model=s.embedding_model,
        api_base=s.openai_embed_api_base,
        dim=s.embedding_dim,
    )
```

### Why request-time, not cached

`/solve` is called with arbitrary user queries; cache hit rate would be near
zero. A per-call OpenAI embedding call costs ~$0.00002 — negligible.

## Implementation Notes

- DO NOT use the user's `LLMSpec.api_key` for embeddings. Embeddings are a
  tenant-pool capability (one OpenAI account for the corpus side, owned by the
  OppMon operator), not a per-user model. Use a separate env var
  `OPENAI_EMBED_API_KEY`.
- Dim is asserted on every embed — if the operator swaps the model env behind
  an existing corpus, fail loud immediately rather than return garbage hits.

## Tests

| File | Test | Assertion |
|---|---|---|
| `tests/rag/test_embedding.py` | `FakeEmbeddingProvider.embed_query` deterministic | same input → same vector |
| `tests/rag/test_embedding.py` | `FakeEmbeddingProvider.dim` matches output length | always |
| `tests/rag/test_embedding.py` | OpenAI provider w/ mocked SDK returns expected dim | mock |
| `tests/rag/test_embedding.py` | dim mismatch raises | sets model that returns 384-dim, expected 1536 |
| `tests/rag/test_embedding.py` | empty api_key for OpenAI provider | RuntimeError |

## Acceptance Criteria

- [ ] All five tests pass.
- [ ] Dim parity with `apps/api` corpus ingestion documented in PR.
- [ ] No tenant-scoped key used for embedding calls.
- [ ] Fake provider works without network for unit tests.

## Dependencies

**Blocks:** TAG-59
**Depends on:** none

## Risk Factors

| Risk | Mitigation |
|---|---|
| Embedding model drift vs corpus | Hard dim check, loud failure. |
| Operator's OpenAI account rate-limited | Embeddings cache layer is a future ticket; for now log the 429 and fall through to BM25-only via TAG-59. |
| Per-user OpenAI key accidentally used for embeds | Separate env var; code asserts `openai_embed_api_key` only. |
