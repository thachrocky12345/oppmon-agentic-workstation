# Residency Architecture

**Last Updated:** 2026-05-14
**Status owner:** TAG-78 epic

This document is the audit-credible long-form residency story. Every claim
resolves to either:

- ✅ a real file:line in the repo today, or
- 🟡 an in-flight ticket (TAG-79..TAG-88), or
- 🔴 an acknowledged gap with a tracked ticket.

If a section's claim drifts, that section MUST be updated in the same PR
that closes the corresponding TAG-XX story. The story's Acceptance Criteria
enforce this.

---

## 1. Current status at a glance

| Pillar | Status | Anchor |
|--------|--------|--------|
| Tenant-denormalized chunk schema | ✅ Implemented | `packages/database/prisma/schema.prisma:860-906` |
| Python cross-tenant filter at retrieval | ✅ Implemented (TAG-59) | `apps/agent_graph_backend/agent_search/agent_v2/rag/corpus_search.py` |
| Cross-tenant negative test (Python) | ✅ Implemented (TAG-59) | tests file referenced from corpus_search.py |
| Embedding seam (Python) | ✅ Implemented (TAG-60) | `apps/agent_graph_backend/agent_search/agent_v2/rag/embedding.py` |
| Embedding seam (TypeScript) | 🟡 Parity needed | [TAG-80](../jira/TAG-80-ts-embedding-baseurl-parity.md) |
| TS retrieval cross-tenant double filter | 🟡 Audit + add test | [TAG-81](../jira/TAG-81-ts-rag-cross-tenant-audit.md) |
| Storage seam | ✅ Protocol; 🟡 region-pinned impls pending | `apps/api/src/lib/storage/local-disk.ts`; [TAG-79](../jira/TAG-79-region-pinned-storage.md) |
| LLM factory (Python) | ✅ + 🟡 Azure/Bedrock pending | `apps/agent_graph_backend/agent_search/agent_v2/llm/factory.py`; [TAG-83](../jira/TAG-83-azure-bedrock-llm-clients.md) |
| Collection scope (API + UI) | 🔴 No 403 enforcement, no scope picker UI | [TAG-82](../jira/TAG-82-collection-scope-enforcement.md) |
| Telemetry redaction | 🔴 No allowlist, no CI lint | [TAG-84](../jira/TAG-84-telemetry-redaction-layer.md) |
| BYO-VPC deployment package | 🔴 No `tag deploy byo-vpc` command | [TAG-85](../jira/TAG-85-byo-vpc-deployment-package.md) |
| UI residency surface | 🔴 No badge, no in-product docs | [TAG-86](../jira/TAG-86-ui-residency-surface.md) |
| SOC2/HIPAA evidence pack | 🔴 Stretch | [TAG-87](../jira/TAG-87-soc2-hipaa-evidence-pack.md) |
| Tenant export + purge | 🔴 Stretch | [TAG-88](../jira/TAG-88-tenant-export-purge.md) |

When a story merges, change its row from 🟡/🔴 to ✅ and append the commit
SHA. This is part of every story's Acceptance Criteria.

---

## 2. The model: "centralize metadata, isolate content"

[ADR-0012](../decisions/ADR-0012-residency-model.md) locks in the principle:

- **Control-plane metadata** (tenants, users, models, audit, billing) lives
  centrally. Support tooling, dashboards, and observability work against it.
- **Customer content** (RAG chunks, embeddings, uploaded files, chat
  messages) is partitioned by `tenant_id` and physically pinned where the
  buyer's residency story requires.
- **Compute** is the same code in every topology. It picks up its tenant
  context from JWT claims and refuses to widen the scope.

The phrase to remember:

> *Control plane: metadata only. Data plane: tenant-scoped content,
> region-pinned, behind a SQL predicate that has a CI-enforced negative
> test.*

---

## 3. Pillar 1 — Tenant denormalization in the schema

The `rag_chunks` table carries `tenant_id` directly, not only via its parent
`rag_documents.tenant_id`. The exact lines:

- **File:** `packages/database/prisma/schema.prisma`
- **Range:** lines `860-906` (the `RagChunk` model and its index definitions)

The denormalization is deliberate. Two practical consequences:

1. A retrieval query can — and MUST — filter `tenant_id` on the chunk row
   without joining `rag_documents` first. Faster plans, smaller blast
   radius.
2. A migration that adds chunks without setting `tenant_id` will fail at
   insert. Whatever code path forgot to set it dies loudly instead of
   silently leaking.

The schema change that introduced this is recorded in ADR-0012's "Pillar 1"
section.

---

## 4. Pillar 2 — Cross-tenant filter at retrieval

### Python (`/solve`, the new authenticated endpoint)

- **File:** `apps/agent_graph_backend/agent_search/agent_v2/rag/corpus_search.py`
- **Status:** ✅ Implemented under TAG-59 on branch `feature/TAG-59-corpus-search`.

The implementation enforces BOTH `tenant_id` and `collection_id IN ($2)`
predicates on every BM25 and vector query. The mandatory negative test
(referenced in TAG-59's Tests table) seeds two tenants with deliberately
colliding content, queries from Tenant B targeting Tenant A's collection,
and asserts `hits == []`.

This test is the security boundary. The build fails if a future PR drops
the predicate.

### TypeScript (`apps/api`, the older surface)

- **File:** `apps/api/src/services/rag.ts`
- **Status:** 🟡 Audit and add parity test under
  [TAG-81](../jira/TAG-81-ts-rag-cross-tenant-audit.md).

TAG-81 is explicitly framed as a parity story: same SQL shape, same double
filter, same negative test pattern as TAG-59. Diff against
`corpus_search.py` is required in the PR description.

---

## 5. Pillar 3 — The three provider seams

### 5.1 Storage seam

- **Protocol:** `apps/api/src/lib/storage/local-disk.ts` (LocalDiskStorage is
  the reference impl).
- **Status:** ✅ Protocol shipped. 🟡 Region-pinned S3 + AzureBlob impls
  pending under [TAG-79](../jira/TAG-79-region-pinned-storage.md).

TAG-79 adds:

- `S3Storage` with `STORAGE_REGION` boot assertion.
- `AzureBlobStorage` with the same boot assertion.
- A boot-time check that fails fast if the configured region doesn't
  match what the bucket reports.
- A runbook stub at `docs/runbooks/deployment/region-pinned-storage.md`.

### 5.2 Embedding seam

- **Python protocol:** `apps/agent_graph_backend/agent_search/agent_v2/rag/embedding.py`.
- **Status (Python):** ✅ Implemented under TAG-60 with `OpenAIEmbeddingProvider`,
  `FakeEmbeddingProvider`, `base_url`-overridable, empty-key boot failure,
  per-call dim assertion, 13 tests.
- **Status (TypeScript):** 🟡 Backport pending under
  [TAG-80](../jira/TAG-80-ts-embedding-baseurl-parity.md). Same shape, same
  invariants, same test surface.

The seam shape matters: a BYO-VPC customer running their own embedding
endpoint passes `OPENAI_EMBED_API_BASE=https://their-host`, the dim guard
catches any model swap, and no traffic leaves their VPC.

### 5.3 LLM seam

- **File:** `apps/agent_graph_backend/agent_search/agent_v2/llm/factory.py`
- **Status:** ✅ Anthropic + OpenAI + fake. 🟡 Azure OpenAI + AWS Bedrock
  clients pending under [TAG-83](../jira/TAG-83-azure-bedrock-llm-clients.md).

The factory takes an `LLMSpec` (TAG-56) and returns a per-request client.
No process-global state. No cross-request key leak. TAG-83 adds Azure +
Bedrock so BYO-VPC customers in those clouds don't have to route through
public OpenAI/Anthropic.

---

## 6. Pillar 4 — Collection scope enforcement

🔴 **Not yet implemented.** Tracked in [TAG-82](../jira/TAG-82-collection-scope-enforcement.md).

The gap: today a user holding a valid JWT can request *any* collection ID
if they guess it. The retrieval will return `[]` (because the chunks are
tenant-filtered) but the API does not return 403, so an attacker can
distinguish "I don't have access" from "doesn't exist."

TAG-82 closes the gap by:

- Adding ownership check before retrieval in
  `apps/api/src/routes/rag-admin.ts` and `apps/api/src/routes/rag.ts`.
- Returning 403 (not empty 200) when scope is wrong.
- Adding a scope picker + ownership column + audit trail in a new
  collections page at `apps/web/src/app/(dashboard)/collections/page.tsx`.

---

## 7. Pillar 5 — Telemetry redaction

🔴 **Not yet implemented.** Tracked in [TAG-84](../jira/TAG-84-telemetry-redaction-layer.md).

Today there is no allowlist on what fields leave the boundary in logs,
metrics, or outbound events. The risk: a debug log line accidentally emits
`chunk.content` or `tool_args.raw_payload` and we've shipped customer
content to our hosted log store.

TAG-84 closes the gap by:

- Adding `packages/observability/src/redaction.ts` with an allowlist-based
  field filter.
- Wrapping every Pino logger and every outbound event/metric path.
- An ESLint rule + ripgrep CI step that fails the build on calls like
  `logger.info({ chunk })`, `metric.record(document.filePath)`, raw tool
  args in log statements.
- A policy runbook at `docs/residency/redaction-policy.md` (produced as
  part of TAG-84).

---

## 8. Pillar 6 — BYO-VPC deployment package

🔴 **Not yet implemented.** Tracked in [TAG-85](../jira/TAG-85-byo-vpc-deployment-package.md).

ADR-0013 locks in the upgrade channel shape. TAG-85 ships the customer-facing
mechanism: `tag deploy byo-vpc <bundle.yaml>` renders the customer's stack
from a config bundle (DB DSN, storage creds, embedding endpoint, JWT
secret) and emits a runbook at `docs/runbooks/deployment/byo-vpc.md`.

The bundle shape is defined in ADR-0013. The CLI command lives in
`packages/cli/`.

Air-gap mode (no outbound except the customer-pinned LLM endpoint) is a
flag on the bundle.

---

## 9. Pillar 7 — UI residency surface

🔴 **Not yet implemented.** Tracked in [TAG-86](../jira/TAG-86-ui-residency-surface.md).

The UI today does not tell the user where their data lives. TAG-86 ships:

- `apps/web/src/components/ResidencyBadge.tsx`: shown in chat header + admin
  pages with deployment mode, endpoint regions, and a "raw content leaves
  boundary: no" indicator.
- Click-through to the live config (read-only).
- In-product docs at `apps/web/src/app/docs/features/residency/page.tsx`.

This is the part of the story end users see. It maps the architecture to
the UI without requiring the user to read this document.

---

## 10. What is explicitly out of scope

- Per-tenant rate limiting (separate epic).
- Cost attribution per tenant (separate epic).
- Cross-region replication of customer content (separate epic, requires
  regulatory review).
- Multi-region active-active for BYO-VPC (single region per deployment is
  the supported shape).
- Customer-managed encryption keys (CMEK / BYOK) — tracked separately;
  ADR-0012 leaves the seam open for it but does not commit a timeline.

---

## 11. How to verify a claim in this document

Every ✅ row in the status table at the top should be verifiable by:

```bash
# Schema
grep -n "tenantId" packages/database/prisma/schema.prisma | head

# Python retrieval
grep -n "tenant_id" apps/agent_graph_backend/agent_search/agent_v2/rag/corpus_search.py

# Embedding seam (Python)
ls apps/agent_graph_backend/agent_search/agent_v2/rag/embedding.py

# Storage protocol
ls apps/api/src/lib/storage/local-disk.ts

# LLM factory
ls apps/agent_graph_backend/agent_search/agent_v2/llm/factory.py
```

If a command above returns nothing for an ✅ row, the row is lying — file a
ticket and demote it back to 🟡.

---

## 12. Related

- [ADR-0012 — Residency Model](../decisions/ADR-0012-residency-model.md)
- [ADR-0013 — BYO-VPC Upgrade Channel](../decisions/ADR-0013-byo-vpc-upgrade-channel.md)
- [control-plane-vs-data-plane.md](./control-plane-vs-data-plane.md)
- [topology.md](./topology.md)
- [cross-tenant-isolation-flow.md](./cross-tenant-isolation-flow.md)
- [TAG-78 epic](../jira/TAG-78-residency-governance-hardening-epic.md)
