# TAG-81: TS-Side RAG Cross-Tenant Audit + Negative Test

## Description

**Suggested Points:** 3
**Type:** Story
**Epic:** [TAG-78](./TAG-78-residency-governance-hardening-epic.md)
**Status:** Open

[TAG-59](./TAG-59-corpus-search.md) added the chunk-level `tenant_id` SQL
predicate and the mandatory cross-tenant negative test on the Python side
(`apps/agent_graph_backend/agent_search/agent_v2/rag/corpus_search.py`).
The TypeScript retrieval path in `apps/api/src/services/rag.ts` does NOT
yet have a verified parity test, and the audit in `docs/residency/` flagged
it as a 🟡 row.

This story closes the parity gap and locks in the same security boundary
on the TS surface.

## Objective

After this story:

1. `apps/api/src/services/rag.ts` filters by BOTH `tenant_id` and
   `collection_id` on every retrieval query (chunk and document layer
   both).
2. A negative test, mirroring TAG-59's `test_tenant_b_cannot_retrieve_tenant_a_chunk`,
   exists in the TS test suite and the build fails if the predicate is
   dropped.
3. The PR description diffs the TS SQL against the Python SQL so future
   readers can verify they have the same shape.

## Requirements

### SQL audit

Find every retrieval SQL site in:

- `apps/api/src/services/rag.ts`
- `apps/api/src/services/rag-retriever.ts`
- `apps/api/src/services/advanced-rag.ts`
- `apps/api/src/lib/search/` (bm25.ts, vector.ts, rrf.ts)

For each, confirm BOTH predicates exist:

```sql
WHERE c.tenant_id = $tenantId
  AND c.collection_id = ANY($collectionIds::text[])
```

…and that the join target (`rag_documents`) also filters `tenant_id`:

```sql
JOIN rag_documents d ON d.id = c.doc_id AND d.tenant_id = $tenantId
```

Any site missing either predicate gets fixed in this PR.

### Mandatory negative test

Port the TAG-59 test pattern. Seed two tenants with deliberately colliding
content (one tenant's chunk contains a literal sentinel like
`alpha-secret-12345`). Issue a query from the wrong tenant scoped to the
right collection_id. Assert empty result.

```ts
// apps/api/src/services/rag.test.ts
it("tenant B cannot retrieve tenant A chunk via collection_id", async () => {
  await seedTwoTenantsWithCorpora();
  const hits = await ragService.search({
    query: "alpha-secret-12345",
    tenantId: tenantB.id,
    collectionIds: [tenantA_collection.id],
  });
  expect(hits).toEqual([]);
});
```

### Diff vs Python source

The PR description MUST link:

- `apps/agent_graph_backend/agent_search/agent_v2/rag/corpus_search.py`
- The corresponding TS file(s)

…and call out any intentional SQL divergence. Drift between the two
surfaces is exactly the risk this story is built to manage.

## Implementation Notes

- Use Prisma `$queryRaw` with proper parameter binding. NEVER concatenate
  user input into SQL strings.
- If the existing TS code uses `prisma.ragChunk.findMany`, the `tenantId`
  filter is enforced by the Prisma `where` clause; verify ALL such call
  sites include it.
- The negative test belongs in the TS test surface that already runs in
  CI (vitest). Use `prisma.$transaction` to seed and tear down inside
  the test.
- If the seed helpers don't exist, lift them from
  `apps/api/scripts/seed-corpus.ts` if present, or create a minimal
  fixture under `apps/api/test/fixtures/`.

## Tests

| File | Test | Assertion |
|---|---|---|
| `apps/api/src/services/rag.test.ts` | tenant_id + collection_id BM25 alone | predicate hit, results scoped |
| `apps/api/src/services/rag.test.ts` | tenant_id + collection_id vector alone | predicate hit, results scoped |
| `apps/api/src/services/rag.test.ts` | empty `collectionIds` → `[]` | short-circuits |
| `apps/api/src/services/rag.test.ts` | **cross-tenant** | `[]` (TAG-59 parity) |
| `apps/api/src/services/rag.test.ts` | unknown collection id | `[]` (not 500) |
| `apps/api/src/services/rag.test.ts` | document layer also filters tenant_id | join doesn't widen scope |

## Acceptance Criteria

- [ ] Cross-tenant test passes and blocks merge if predicate dropped.
- [ ] SQL diff vs `corpus_search.py` is in the PR description.
- [ ] All TS retrieval call sites filter `tenant_id` at chunk AND document
      layer.
- [ ] No SQL string built via template-literal interpolation of user
      input. (Manual grep + ESLint `no-template-curly-in-string` audit.)
- [ ] `docs/residency/architecture.md` "TS retrieval cross-tenant double
      filter" row flipped to ✅ with the merged commit SHA.
- [ ] `docs/residency/cross-tenant-isolation-flow.md` is updated to
      describe both Python AND TS surfaces (remove "Python-only"
      qualifier).

## Dependencies

**Depends on:** [TAG-59](./TAG-59-corpus-search.md) (done — Python side)
**Blocks:** [TAG-82](./TAG-82-collection-scope-enforcement.md), [TAG-86](./TAG-86-ui-residency-surface.md)

## Risk Factors

| Risk | Mitigation |
|---|---|
| TS retrieval is spread across multiple service files | Audit checklist in this ticket lists all four; PR must touch each. |
| Prisma `where` filters are easier to forget than raw SQL | The negative test catches it regardless of how the filter is expressed. |
| The Python `corpus_search.py` SQL drifts after this lands | TAG-78 epic's risk register notes this; PRs to either file must link the other. |
| Existing seed data leaks across test fixtures | Use isolated test schema or rollback transactions; do not rely on `truncate`. |
