# TAG-80: TS-Side Embedding base_url + Dim Guard Parity

## Description

**Suggested Points:** 3
**Type:** Story
**Epic:** [TAG-78](./TAG-78-residency-governance-hardening-epic.md)
**Status:** Open

Backport the TAG-60 pattern (Python `EmbeddingProvider` Protocol with
`base_url`-overridable OpenAI impl, FakeEmbeddingProvider, per-call dim
assertion, empty-key boot failure) to the TypeScript side at
`apps/api/src/lib/embedding/openai.ts`.

The TS surface is the older one and currently assumes one OpenAI account
with a process-wide key. BYO-VPC customers cannot use it, and there's no
dim guard, which means a silent model swap could corrupt the pgvector
index without anyone noticing.

## Objective

Bring the TS embedding seam to parity with the Python seam shipped in
TAG-60:

```ts
// expected shape in apps/api/src/lib/embedding/openai.ts
export interface EmbeddingProvider {
  embedQuery(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
  readonly dim: number;
}

export class OpenAIEmbeddingProvider implements EmbeddingProvider { ... }
export class FakeEmbeddingProvider implements EmbeddingProvider { ... }
```

Add a factory under `apps/api/src/lib/embedding/index.ts` that mirrors the
Python `factory.py` shape.

## Requirements

### Env surface (must match TAG-60 names where applicable)

| Env var | Required | Notes |
|---|---|---|
| `OPENAI_API_KEY` | yes (or BYO-key per request) | empty key MUST fail at boot when `EMBED_PROVIDER=openai` |
| `OPENAI_EMBED_API_BASE` | optional | override for BYO-VPC OpenAI-compatible endpoints |
| `OPENAI_EMBED_MODEL` | optional | default `text-embedding-3-small` |
| `EMBED_DIM` | yes | expected vector dimension (e.g. 1536); per-call assertion |
| `EMBED_PROVIDER` | optional | `openai` \| `fake` (default `openai` in prod, `fake` in test) |

### Per-call dim assertion

Every `embedQuery` / `embedBatch` response MUST be checked:

```ts
if (vec.length !== this.dim) {
  throw new EmbeddingDimMismatchError(
    `expected dim ${this.dim}, got ${vec.length} from ${this.model}`
  );
}
```

This catches silent model swaps (e.g. someone changes `OPENAI_EMBED_MODEL`
to a 3072-dim model without re-indexing pgvector).

### Empty key boot failure

If `EMBED_PROVIDER=openai` and `OPENAI_API_KEY` is empty/missing, the
process MUST fail to start. Not log-and-continue. Not return 500s
forever. Fail at boot, exit non-zero. Same shape as the Python version.

### Diff vs Python source

The PR description MUST link
`apps/agent_graph_backend/agent_search/agent_v2/rag/embedding.py` and call
out any intentional divergence. Drift between the two stacks is the
ongoing risk this story exists to manage.

## Implementation Notes

- The existing `OpenAI` SDK client in `apps/api` likely already supports
  `baseURL` as a constructor option. Use that, do not hand-roll the HTTP.
- `FakeEmbeddingProvider` returns a deterministic vector seeded from a
  hash of the input string. Same shape as TAG-60.
- The factory function MUST take credentials + base_url + dim as
  arguments, not read env directly. Env reading happens at the call site
  (so per-request override stays possible for future BYOK).
- Add the factory entry point at `apps/api/src/lib/embedding/index.ts`
  mirroring the Python pattern.

## Tests

Mirror the 13 tests from TAG-60. Minimum required:

| File | Test | Assertion |
|---|---|---|
| `apps/api/src/lib/embedding/openai.test.ts` | `embedQuery` mocked round-trip | bytes match |
| `apps/api/src/lib/embedding/openai.test.ts` | `embedBatch` mocked round-trip | shape matches |
| `apps/api/src/lib/embedding/openai.test.ts` | empty `OPENAI_API_KEY` → throws at construction | `MissingApiKeyError` |
| `apps/api/src/lib/embedding/openai.test.ts` | dim mismatch from mocked response → throws | `EmbeddingDimMismatchError` |
| `apps/api/src/lib/embedding/openai.test.ts` | `OPENAI_EMBED_API_BASE` honored | mock sees override URL |
| `apps/api/src/lib/embedding/fake.test.ts` | `embedQuery` deterministic for same input | identical vectors |
| `apps/api/src/lib/embedding/fake.test.ts` | configurable dim | length matches |
| `apps/api/src/lib/embedding/index.test.ts` | factory selects impl per env | correct typeof |
| `apps/api/src/lib/embedding/index.test.ts` | unknown provider → throws | descriptive error |

Add at least 4 more parity tests to hit 13 total (TAG-60 count).

## Acceptance Criteria

- [ ] `OpenAIEmbeddingProvider` honors `OPENAI_EMBED_API_BASE`.
- [ ] Empty `OPENAI_API_KEY` fails the process at boot (or factory
      construction) — not later.
- [ ] Per-call dim assertion throws on mismatch (test proves it).
- [ ] At least 13 tests pass (parity with TAG-60).
- [ ] PR description includes a diff (or link) against
      `apps/agent_graph_backend/agent_search/agent_v2/rag/embedding.py`
      and explicitly lists any divergence.
- [ ] `docs/residency/architecture.md` "Embedding seam (TypeScript)" row
      flipped to ✅ with the merged commit SHA.

## Dependencies

**Depends on:** [TAG-60](./TAG-60-embedding-provider.md) (done)
**Blocks:** [TAG-85](./TAG-85-byo-vpc-deployment-package.md)

## Risk Factors

| Risk | Mitigation |
|---|---|
| `apps/api` already has an inline embeddings call site that doesn't go through the seam | Audit before starting — list call sites in PR description; refactor in same PR. |
| OpenAI SDK version skew between TS and Python sides | Pin a minimum version in `apps/api/package.json`; document in PR. |
| Tests that mock the SDK drift from the real SDK shape | Use the SDK's own test helpers if available; otherwise use `vitest`'s `vi.spyOn` and import the real types so a SDK upgrade breaks the test at the type level. |
| Existing callers pass keys around in headers | This story is about the seam, not auth refactor. Document existing call sites and leave them, unless trivially convertible. |
