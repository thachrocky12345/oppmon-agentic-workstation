# TAG-CR — Contextual Retrieval A/B Eval RUNBOOK

This runbook walks an operator through a clean A/B comparison of the
legacy (un-contextualized) RAG pipeline vs the Anthropic Sept-2024
Contextual Retrieval pipeline, using the eval harness shipped in
this directory.

**Owner:** RAG infra. **Cost per run:** ~25× contextualizer LLM calls +
~25× 2 SSE eval requests. **Ship gate:** `evals/scripts/retrieval-report.ts`
emits `SHIP` on `n ≥ 25` grounded with paired Wilcoxon `p < 0.05`.

---

## Prerequisites

1. **Branch:** `feature/contextual-retrieval-ab-eval` (or wherever phases
   1–3 from `~/.claude/plans/snazzy-prancing-peach.md` have landed).
2. **Schema migrated:**
   ```bash
   psql $DATABASE_URL -c '\d rag_chunks' | grep content_search
   # Expect: content_search | text  | not null generated always as ... stored
   ```
3. **Contextualizer service tests green:**
   ```bash
   pnpm --filter @oppmon/api test src/services/rag-contextualizer.test.ts
   ```
4. **Python retrieval tests green:**
   ```bash
   cd apps/agent_graph_backend
   pytest agent_search/tests/rag/test_corpus_search_contextual.py -v
   ```
5. **Bearer JWT for a `tnt_alpha` user.** Generate via
   `pnpm tsx apps/api/scripts/dev-jwt.ts --user usr_alice` or copy the
   `auth_token` cookie value from a logged-in browser session against
   the dev API. Export:
   ```bash
   export EVAL_AUTH_BEARER="eyJhbGc..."
   ```

---

## Step 1 — Seed the eval collections

The seed creates two empty collections under the existing `tnt_alpha`
tenant from `seed_two_tenants.sql` (which must have run first):

```bash
psql $DATABASE_URL -f evals/fixtures/contextual-AB-seed.sql

# Verify:
psql $DATABASE_URL -c "SELECT id, name FROM rag_collections WHERE id LIKE 'col_eval_%';"
# Expect two rows: col_eval_baseline, col_eval_contextual
```

The seed is idempotent — re-running is safe.

---

## Step 2 — Ingest fixture corpus into the **baseline** collection

The baseline arm must NOT have contextualization applied. Flip the
flag off, then upload all four markdown fixtures under
`evals/corpus-fixtures/`:

```bash
# Stop API, set env, restart.
export RAG_CONTEXTUALIZER_ENABLED=false
pnpm dev:api  # or restart docker-compose api service
```

Upload via the admin API (replace `$BEARER` with your JWT):

```bash
for f in evals/corpus-fixtures/*.md; do
  curl -sS -X POST \
    -H "Authorization: Bearer $EVAL_AUTH_BEARER" \
    -F "file=@$f" \
    "http://localhost:3001/api/admin/rag/collections/col_eval_baseline/documents" \
    | jq -r '"baseline ← " + .data.id + " " + .data.originalFilename'
done
```

Wait for ingestion to complete (poll `/api/admin/rag/collections/col_eval_baseline/documents`
and look for `status: "READY"` on every row), then verify the contextualizer
truly did NOT run:

```bash
psql $DATABASE_URL -c "
SELECT id, summary IS NULL AS no_summary, summary_model
FROM rag_documents
WHERE collection_id = 'col_eval_baseline';"
# Expect: every row no_summary=t, summary_model IS NULL (or 'disabled')
```

---

## Step 3 — Ingest the same corpus into the **contextual** collection

```bash
# Stop API, flip env, restart.
export RAG_CONTEXTUALIZER_ENABLED=true
pnpm dev:api  # or restart docker-compose api service

# Re-upload:
for f in evals/corpus-fixtures/*.md; do
  curl -sS -X POST \
    -H "Authorization: Bearer $EVAL_AUTH_BEARER" \
    -F "file=@$f" \
    "http://localhost:3001/api/admin/rag/collections/col_eval_contextual/documents" \
    | jq -r '"contextual ← " + .data.id + " " + .data.originalFilename'
done
```

Verify the contextualizer ran:

```bash
psql $DATABASE_URL -c "
SELECT d.id, length(d.summary) AS summary_chars, d.summary_model,
       count(c.id) AS chunks, count(c.context_prefix) AS prefixed
FROM rag_documents d
LEFT JOIN rag_chunks c ON c.document_id = d.id
WHERE d.collection_id = 'col_eval_contextual'
GROUP BY d.id, d.summary, d.summary_model;"
# Expect: summary_chars ≈ 600-1200 (≈100-200 words), summary_model='claude-haiku-...',
# chunks = prefixed (every chunk has a context_prefix).
```

---

## Step 4 — Normalize doc/chunk ids (one-time)

The `corpus-questions.json` citation keys reference doc/chunk ids by
convention (`doc_eng`, `chk_eng_1`, …). The ingest pipeline assigned
random cuids. Rewrite the freshly-inserted rows' ids:

```bash
psql $DATABASE_URL <<'EOF'
-- Rename docs and their chunks for BOTH collections so citation keys
-- in corpus-questions.json line up. The mapping is by
-- original_filename — keep this in sync if fixture filenames change.

DO $$
DECLARE
  arm TEXT;
  mapping JSONB := jsonb_build_object(
    'alpha-engineering-handbook.md', jsonb_build_object('doc', 'doc_eng', 'chunk', 'chk_eng'),
    'alpha-hr-policies.md',          jsonb_build_object('doc', 'doc_hr',  'chunk', 'chk_hr'),
    'alpha-security-standards.md',   jsonb_build_object('doc', 'doc_sec', 'chunk', 'chk_sec'),
    'alpha-finance-policies.md',     jsonb_build_object('doc', 'doc_fin', 'chunk', 'chk_fin')
  );
  fname TEXT;
  m JSONB;
  doc_row RECORD;
  chunk_row RECORD;
  new_doc_id TEXT;
  new_chunk_id TEXT;
  idx INT;
BEGIN
  FOR arm IN SELECT unnest(ARRAY['col_eval_baseline', 'col_eval_contextual'])
  LOOP
    FOR fname IN SELECT jsonb_object_keys(mapping)
    LOOP
      m := mapping -> fname;
      -- Find the doc in this arm with this filename.
      SELECT id INTO doc_row FROM rag_documents
      WHERE collection_id = arm AND original_filename = fname
      LIMIT 1;
      IF NOT FOUND THEN CONTINUE; END IF;

      -- arm-prefixed final ids so the two arms don't collide on PK.
      new_doc_id := (m->>'doc') || '_' || replace(arm, 'col_eval_', '');

      -- Update children first to avoid FK headaches.
      idx := 1;
      FOR chunk_row IN
        SELECT id FROM rag_chunks
        WHERE document_id = doc_row.id
        ORDER BY chunk_index ASC
      LOOP
        new_chunk_id := (m->>'chunk') || '_' || idx || '_' || replace(arm, 'col_eval_', '');
        UPDATE rag_chunks SET id = new_chunk_id WHERE id = chunk_row.id;
        idx := idx + 1;
      END LOOP;

      UPDATE rag_documents SET id = new_doc_id WHERE id = doc_row.id;
    END LOOP;
  END LOOP;
END$$;
EOF
```

> **Note:** The corpus-questions.json citation keys use the un-suffixed
> form (`doc_eng:chk_eng_1`). The arkon-client normalizes by stripping
> `[[ ]]` only — it does NOT understand arm suffixes. If you ran the
> arm-suffixed rename above, update the citation keys in
> `corpus-questions.json` to match, OR rerun the normalization with
> matching ids per arm and rely on the A/B driver's
> `armCollections()` mapping. See the open issue at the bottom of this
> file.

---

## Step 5 — Run the A/B driver

```bash
pnpm tsx evals/scripts/contextual-retrieval-eval.ts \
  --label pilot-001 \
  --k 5
```

Expected console output:

```
→ run_id: contextual-AB-pilot-001
  questions:   27 (grounded)
  endpoint:    http://localhost:3001/api/graph/solve
  k:           5
  output:      .../evals/runs/contextual-AB-pilot-001

  [corpus-CR-eng-1] ΔP=+0.20  ΔR=+0.00  ΔMRR=+0.50
  [corpus-CR-eng-2] ΔP=+0.00  ΔR=+0.00  ΔMRR=+0.00
  ...

Mean retrieved-set metrics (n=27, k=5):
              precision   recall    mrr      ndcg
  baseline    0.412       0.741    0.512    0.587
  contextual  0.567       0.852    0.681    0.722
  wilcoxon p    0.003     0.014    0.001    0.002

Manifest: .../runs/contextual-AB-pilot-001/manifest.json
Delta:    .../runs/contextual-AB-pilot-001/delta.json
```

If you see `× missing auth`, ensure `EVAL_AUTH_BEARER` is exported
(see prerequisites).

---

## Step 6 — Generate the report

```bash
pnpm tsx evals/scripts/retrieval-report.ts --run contextual-AB-pilot-001
```

Output: `evals/reports/contextual-retrieval-contextual-AB-pilot-001.md`
with the headline verdict (`SHIP` / `DO-NOT-SHIP` / `INCONCLUSIVE`),
aggregate tables, and per-question detail.

---

## Step 7 — (Optional) Answer-quality judge

The retrieval-quality numbers above don't tell you whether the
answer the planner synthesizes is better. To get that, run the
existing LLM-judge pipeline on both arms:

```bash
pnpm tsx evals/scripts/judge.ts \
  --run contextual-AB-pilot-001/baseline
pnpm tsx evals/scripts/judge.ts \
  --run contextual-AB-pilot-001/contextual

pnpm tsx evals/scripts/report.ts \
  --baseline contextual-AB-pilot-001/baseline \
  --candidate contextual-AB-pilot-001/contextual
```

This compares the two arms on the same 6-axis rubric the simple-vs-graph
eval uses (factuality, completeness, citations, structure, depth,
reasoning).

---

## Step 8 — Commit the final writeup

The decision belongs in `docs/jira/TAG-CR/contextual-retrieval-eval.md`.
Update that file with:

- Sample size + dates.
- Baseline + contextual headline numbers (copy from
  `evals/reports/contextual-retrieval-<run>.md`).
- Significance.
- Cost (USD per ingest run; pull from rag-contextualizer logs).
- Decision: ship / don't ship / inconclusive.
- Rollback steps if shipping.

---

## Rollback

If the A/B says **don't ship**:

```bash
# 1. Disable the contextualizer for new ingests.
export RAG_CONTEXTUALIZER_ENABLED=false

# 2. Restore the legacy retrieval display path.
export AGENT_USE_CONTEXTUAL_RETRIEVAL=false

# 3. (Optional) Drop the eval collections — they're additive.
psql $DATABASE_URL -c "
DELETE FROM rag_chunks    WHERE document_id IN (SELECT id FROM rag_documents WHERE collection_id LIKE 'col_eval_%');
DELETE FROM rag_documents WHERE collection_id LIKE 'col_eval_%';
DELETE FROM rag_collections WHERE id LIKE 'col_eval_%';"
```

The added columns (`summary`, `context_prefix`, `content_search`) and
the GIN index stay — they're nullable + additive, zero cost when unused.
Optionally schedule a follow-up migration to drop them.

---

## Open issues / caveats

1. **Citation-key arm suffix.** Step 4's rename produces ids like
   `doc_eng_baseline` / `doc_eng_contextual`. The driver's
   `armCollections()` maps `col_eval` → `col_eval_baseline|contextual`,
   but the question's `expected_citations` still reads
   `[[doc_eng:chk_eng_1]]`. For metrics to align, either:
     - Add an `arm_suffix_strip` step in the driver, OR
     - Use the un-suffixed final ids (drop the `_baseline` suffix in
       Step 4) and rely on collection scoping for tenant safety.
   Decide before the first real run; the current code expects the
   second option.

2. **n < 10 questions.** The retrieval-metrics module returns `NaN`
   for the Wilcoxon p-value when n<10. Don't ship on `INCONCLUSIVE`
   with `n<10` — expand `corpus-questions.json` first.

3. **Cost.** A 4-doc / 25-chunk contextualizer run costs ~100k input
   tokens (with prompt caching) on Haiku — ~$0.10 per ingest. The
   A/B run itself is ~25 × 2 SSE rounds; if the planner uses Sonnet,
   that's ~$2–5 per A/B run. Pin model versions in the writeup.

4. **Web fallback.** The driver defaults `--with-web` OFF because
   this is a RAG-only A/B. If you enable it, the retrieved set will
   include web hits that have no `doc_id:chunk_id` form, which the
   metrics module ignores. That's correct behavior but be aware.
