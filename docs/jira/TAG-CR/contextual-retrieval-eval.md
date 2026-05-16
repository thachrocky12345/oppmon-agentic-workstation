# TAG-CR — Contextual Retrieval A/B Evaluation

**Status:** template (fill after first real A/B run)
**Plan:** `~/.claude/plans/snazzy-prancing-peach.md`
**Branch:** `feature/contextual-retrieval-ab-eval` (off `feature/TAG-65-swarm-deploy`)
**RUNBOOK:** [`evals/scripts/RUNBOOK.md`](../../../evals/scripts/RUNBOOK.md)

---

## Objective

Adopt Anthropic's Contextual Retrieval pattern (Sept 2024) on OppMon's RAG
pipeline, and prove the win on the existing eval scaffolding before flipping
it on for production tenants.

The pattern adds, at ingest time:

1. A document-level summary (~150 words) generated once per document.
2. A chunk-specific situating prefix (~50–100 tokens) generated once per chunk.
3. Embeddings + BM25 tokens computed over `prefix + "\n\n" + content` so the
   retriever itself improves, not just the displayed context.

The A/B evaluation answers one question: does serving the contextual variant
beat the vanilla baseline on retrieval quality (P@k, R@k, MRR, NDCG against
`expected_citations`) on the OppMon eval corpus, and is the lift large enough
to justify the ingest-time cost?

---

## Methodology

### Sources

- [Contextual Retrieval — Anthropic, Sept 2024](https://www.anthropic.com/news/contextual-retrieval) — reported -49% failed retrievals (-67% with reranker).
- [TAG-CR plan](../../../../.claude/plans/snazzy-prancing-peach.md) — full implementation contract.
- [docs/architecture.md](../../architecture.md) — RAG pipeline overview.

### A/B setup

| Arm | Collection | Ingest flag | Display flag |
|---|---|---|---|
| Baseline | `col_eval_baseline` | `RAG_CONTEXTUALIZER_ENABLED=false` | `useContextualRetrieval=false` |
| Contextual | `col_eval_contextual` | `RAG_CONTEXTUALIZER_ENABLED=true` | `useContextualRetrieval=true` |

Both arms see the **same source documents** and the **same questions**. The
only differences are:

1. Whether the contextualizer ran at ingest (summary + per-chunk prefix
   written to `rag_documents.summary` / `rag_chunks.context_prefix`).
2. Whether retrieval indexes (BM25 + vector) used the augmented text.
3. Whether the planner saw the summary + prefix in `context_block()`.

The driver issues each question twice via `POST /solve` (TAG-58 authenticated
endpoint), once per arm. SSE references are accumulated into:

- `retrieved[]` — union of every chunk id surfaced by any searcher event
  (the retriever's recall set).
- `cited[]` — chunk ids the planner's final synthesis references
  (the answer's grounding set).

Both arrays are normalized to `doc_id:chunk_id` form (sentinel `[[ ]]`
stripped) and scored against the question's `expected_citations[]` from
[`evals/corpus-questions.json`](../../../../evals/corpus-questions.json).

### Metrics

For each (question, arm, view ∈ {retrieved, cited}):

- **Precision@k:** `|retrieved ∩ relevant| / k`
- **Recall@k:** `|retrieved ∩ relevant| / |relevant|`
- **MRR:** Mean reciprocal rank of first relevant hit
- **NDCG@k:** Discounted gain with binary relevance + log2 position weights

`k=5` by default.

### Significance

Per-metric paired Wilcoxon signed-rank test (normal approximation) across
the question set. p-values reported only when n ≥ 10; below that the test
is undefined and the result is *descriptive only*.

### Ship criteria

| Outcome | Criteria |
|---|---|
| **ship** | ΔP@k > +0.10 AND ΔMRR > +0.10 AND (n < 10 OR p < 0.05) |
| **do-not-ship** | Either ΔP@k < -0.10 or ΔMRR < -0.10 (regression) |
| **inconclusive** | Everything else — likely insufficient n or small effect |

Configurable via `--win-threshold` / `--regression-threshold` on
`retrieval-report.ts`.

---

## Baseline numbers

> **TODO** — populate after running RUNBOOK Steps 5 + 6.

- n (grounded questions evaluated): **TBD**
- Mean P@5 (retrieved): **TBD**
- Mean R@5 (retrieved): **TBD**
- Mean MRR (retrieved): **TBD**
- Mean NDCG@5 (retrieved): **TBD**
- Mean P@5 (cited): **TBD**
- Mean MRR (cited): **TBD**
- Mean answer-quality weighted total (judge, optional): **TBD**

---

## Contextual numbers

> **TODO** — populate after running RUNBOOK Steps 5 + 6.

- Mean P@5 (retrieved): **TBD**
- Mean R@5 (retrieved): **TBD**
- Mean MRR (retrieved): **TBD**
- Mean NDCG@5 (retrieved): **TBD**
- Mean P@5 (cited): **TBD**
- Mean MRR (cited): **TBD**
- Mean answer-quality weighted total (judge, optional): **TBD**

---

## Δ table + significance

> **TODO** — paste rows from `evals/reports/contextual-retrieval-<run-id>.md`.

### Retrieved view

| Metric | Baseline | Contextual | Δ | Wilcoxon p | Verdict |
|---|---|---|---|---|---|
| P@5 | — | — | — | — | — |
| R@5 | — | — | — | — | — |
| MRR | — | — | — | — | — |
| NDCG@5 | — | — | — | — | — |

### Cited view

| Metric | Baseline | Contextual | Δ | Wilcoxon p | Verdict |
|---|---|---|---|---|---|
| P@5 | — | — | — | — | — |
| MRR | — | — | — | — | — |

### Per-question wins / regressions

- Wins (ΔP@5 ≥ +0.1): **TBD**
- Regressions (ΔP@5 ≤ -0.1): **TBD**
- Ties: **TBD**

---

## Decision

> **TODO** — pick one and justify.

- [ ] **Ship** — Roll out contextual retrieval. Default
  `RAG_CONTEXTUALIZER_ENABLED=true` and `AGENT_USE_CONTEXTUAL_RETRIEVAL=true`
  in prod. Run `apps/api/scripts/backfill-rag-context.ts` per tenant
  collection on opt-in schedule.
- [ ] **Do not ship** — Keep `RAG_CONTEXTUALIZER_ENABLED=false` and
  `AGENT_USE_CONTEXTUAL_RETRIEVAL=false`. Schema columns + index stay
  (additive, nullable, zero runtime cost). File follow-up to investigate
  why the published win didn't reproduce on our corpus.
- [ ] **Inconclusive** — Expand `corpus-questions.json` to n ≥ 25 grounded
  entries, re-run.

**Reasoning:** TBD.

---

## Cost summary

> **TODO** — populate after running ingest on the contextual arm.

| Item | Model | Calls | Tokens (input/output) | $ |
|---|---|---|---|---|
| Document summaries | `claude-haiku-4-5-*` (`CONTEXTUALIZER_MODEL`) | 1 per doc | ~doc_tokens / ~150 | TBD |
| Chunk prefixes | same | N per doc | ~doc_tokens / ~50 (cached) | TBD |
| Total per ingest of N chunks | — | N+1 | — | TBD |

Notes:
- Prompt caching (`cache_control: ephemeral` on the document block) saves
  ~90% of input cost for chunks 2..N. Confirm with Anthropic billing API
  after the first ingest.
- One-time cost — the contextualizer never re-runs unless documents change.
- Backfill cost = (#docs across tenants opting in) × per-ingest cost.

---

## Rollback steps

If the A/B result is negative or a regression appears in prod:

1. **Disable ingest contextualization** — flip
   `RAG_CONTEXTUALIZER_ENABLED=false` in the api service env (Docker Swarm
   `apps/api/.env` then `set -a && . apps/api/.env && set +a &&
   docker stack deploy --with-registry-auth -c docker-stack.yml oppmon`).
   New uploads skip contextualization. Existing data is untouched.

2. **Disable display contextualization** — flip
   `AGENT_USE_CONTEXTUAL_RETRIEVAL=false` in the graph-agent service env
   (same deploy procedure). The planner falls back to the legacy minimal
   hit shape; the existing `context_prefix` / `summary` columns are still
   in the DB but ignored at query time.

3. **Schema stays put.** The migration
   (`apps/api/scripts/migrations/004_contextual_retrieval.sql`) added only
   nullable columns + a stored generated column + a GIN index — none of
   which break the baseline path. Drop them later in a clean migration if
   the decision is permanent; do not drop them as part of the rollback
   itself (avoids racing in-flight reads).

4. **BM25 SQL fallback.** If the `content_search` column path causes a
   perf regression (unlikely, since it's GIN-indexed), one-line revert in
   `apps/agent_graph_backend/agent_search/agent_v2/rag/corpus_search.py`
   pointing `_BM25_SQL` back at `c.content`. Embeddings always reflect
   ingest-time choice, so this only affects keyword recall.

5. **Document the outcome.** Update this file's "Decision" section with
   the rollback rationale and link to the run id in
   `evals/runs/contextual-AB-*/manifest.json`.

---

## Open follow-ups

- Reranker (Cohere / Voyage) for the published `-67%` reduction
  (Anthropic's full result). Out of scope for this ticket — file when the
  baseline A/B clears.
- Late chunking (arXiv 2409.04701) — requires upgrading to a long-context
  embedder. Out of scope.
- Web hit contextualization (Tavily / DDG path) — separate ingest model,
  different cost profile. File when baseline A/B clears.
- Per-doc / per-tenant in-place A/B via an `embedding_kind` column —
  unnecessary for the one-time experiment, but useful if we ever want a
  prod-side canary.
- Citation-key arm suffix mismatch: the seeded chunks share doc ids across
  arms (e.g. `doc_eng:chk_eng_3` in both `col_eval_baseline` and
  `col_eval_contextual`). The RUNBOOK Step 4 normalizes them via a
  one-time UPDATE, but a cleaner long-term fix is for the contextualizer
  / backfill CLI to mint deterministic per-collection ids.

---

## Run history

> **TODO** — append rows per A/B run.

| Run id | Date | Operator | n | Verdict | Notes |
|---|---|---|---|---|---|
| — | — | — | — | — | — |
