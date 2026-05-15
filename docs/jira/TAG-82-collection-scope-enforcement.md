# TAG-82: Collection Scope Enforcement (API 403 + UI Scope Picker)

## Description

**Suggested Points:** 5
**Type:** Story
**Epic:** [TAG-78](./TAG-78-residency-governance-hardening-epic.md)
**Status:** Open

Today a user holding a valid JWT can request *any* `collection_id`. The
retrieval will correctly return `[]` because the chunks are filtered by
`tenant_id` (TAG-59 / TAG-81), but the API responds 200 OK, which lets an
attacker distinguish "I don't have access" from "doesn't exist." That is
an enumeration leak.

This story closes the leak at the route layer (403 not 200), adds an
ownership column + scope picker in the UI, and writes the access decision
to the audit log so a security reviewer can prove the enforcement is
actually happening.

## Objective

After this story:

1. A team-B user querying a team-A private collection returns **403**, not
   200 with empty hits.
2. A new `apps/web/src/app/(dashboard)/collections/page.tsx` lets users
   see and pick collections within their scope, with an explicit
   "ownership" column.
3. Every scope-denial decision is recorded in the audit log with
   `actor_id`, `requested_collection_id`, and `reason`.

## Requirements

### API: route-layer scope check

Touch `apps/api/src/routes/rag-admin.ts` and `apps/api/src/routes/rag.ts`.
Add a helper:

```ts
async function assertCollectionScope(
  userId: string,
  tenantId: string,
  teamId: string | null,
  collectionId: string,
): Promise<void> {
  const col = await prisma.ragCollection.findUnique({
    where: { id: collectionId },
    select: { tenantId: true, teamId: true, visibility: true, ownerId: true },
  });
  if (!col || col.tenantId !== tenantId) throw new ForbiddenError("scope");
  if (col.visibility === "private" && col.ownerId !== userId) throw new ForbiddenError("private");
  if (col.visibility === "team" && col.teamId !== teamId) throw new ForbiddenError("team");
}
```

Call it before every retrieval-bearing endpoint that accepts a
`collectionIds[]` body parameter. The 403 response body MUST NOT echo the
requested collection_id (to prevent enumeration via error messages).

### Integration test

```ts
it("team B user querying team A private collection returns 403 not empty 200", async () => {
  const { teamA, teamB, privateColA } = await seedTwoTeams();
  const tokenB = signJwt(teamB.user);

  const res = await request(app)
    .post("/api/rag/query")
    .set("Authorization", `Bearer ${tokenB}`)
    .send({ query: "anything", collectionIds: [privateColA.id] });

  expect(res.status).toBe(403);
  expect(res.body).not.toContain(privateColA.id);   // no enumeration leak
});
```

### Audit logging

On every scope-denial, write to `audit_log` via the existing audit
service (`apps/api/src/services/audit.ts`). Fields:

- `actor_id` = user
- `action` = `collection.scope.denied`
- `resource_type` = `rag_collection`
- `resource_id` = requested collection_id (this is fine inside the audit
  store — that is a control-plane table)
- `metadata` = `{ reason: "private" | "team" | "scope" }`

### UI: collections page

Build `apps/web/src/app/(dashboard)/collections/page.tsx` with:

- Table of collections in the user's scope.
- Columns: name, ownership (you / team / public), document count, last
  updated, created at.
- A scope picker (private / team / public) on the new-collection form.
- A "recent denials" panel pulling from the audit log (admin-only view).

Use existing Radix UI table primitives — match the style of
`apps/web/src/app/(dashboard)/agents/page.tsx`.

## Implementation Notes

- The Prisma `RagCollection` model likely already has `tenantId` and
  `teamId`. Confirm `visibility` and `ownerId` fields exist before
  starting; if not, file a follow-up migration ticket and proceed with
  whatever defaults are available.
- The audit table follows the existing `audit_log` schema; reuse
  `services/audit.ts` rather than writing raw SQL.
- The UI page should be behind the existing auth middleware (the
  `(dashboard)` route group already enforces this).
- The 403 response shape MUST match other 403 responses in
  `apps/api/src/middleware/error-handler.ts`. Don't invent a new shape.

## Tests

| File | Test | Assertion |
|---|---|---|
| `apps/api/src/routes/rag.test.ts` | team-B → team-A private collection | 403 (not 200, not 404) |
| `apps/api/src/routes/rag.test.ts` | team-B → team-A team collection | 403 |
| `apps/api/src/routes/rag.test.ts` | team-A → team-A private | 200 |
| `apps/api/src/routes/rag.test.ts` | team-B → public collection | 200 |
| `apps/api/src/routes/rag.test.ts` | 403 body does not echo collection_id | grep assertion |
| `apps/api/src/routes/rag.test.ts` | scope denial recorded in audit_log | row exists |
| `apps/web/e2e/collections.spec.ts` (Playwright) | scope picker shows on new-collection form | element present |
| `apps/web/e2e/collections.spec.ts` | ownership column renders correctly | text matches |

## Acceptance Criteria

- [ ] All six API integration tests pass.
- [ ] All two Playwright tests pass.
- [ ] 403 body never echoes the requested collection_id (enumeration
      defense).
- [ ] Every scope denial is in `audit_log` (verified by a test query).
- [ ] `apps/web/src/app/(dashboard)/collections/page.tsx` ships with
      scope picker + ownership column + admin recent-denials panel.
- [ ] `docs/residency/architecture.md` "Collection scope (API + UI)" row
      flipped to ✅ with the merged commit SHA.

## Dependencies

**Depends on:** [TAG-81](./TAG-81-ts-rag-cross-tenant-audit.md)
**Blocks:** [TAG-86](./TAG-86-ui-residency-surface.md)

## Risk Factors

| Risk | Mitigation |
|---|---|
| Existing rag-admin routes already do partial scope checks inconsistently | Audit before starting; PR description lists every changed route. |
| 403 vs 404 confusion (some prefer 404 for non-existent or out-of-scope) | We pick 403 explicitly because returning 404 also enumerates: a 404 vs 403 distinguishes "exists but no access" from "doesn't exist." 403 for both is the safer choice. |
| RagCollection schema missing visibility/ownerId fields | Pre-audit Prisma schema in PR description; file follow-up migration if missing. |
| Playwright tests slow CI | Mark `@slow` and run on PR only, not on every push. |
