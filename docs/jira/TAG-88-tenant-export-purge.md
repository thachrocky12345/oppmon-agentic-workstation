# TAG-88: Tenant Data Export + Purge (GDPR Art. 17) (STRETCH)

## Description

**Suggested Points:** 5
**Type:** Story (stretch)
**Epic:** [TAG-78](./TAG-78-residency-governance-hardening-epic.md)
**Status:** Open — stretch (filed for sizing, not committed)

GDPR Article 17 (right to erasure) and CCPA's deletion-on-request
provisions require us to give a tenant a mechanically-verifiable export
of their data and a clean purge afterwards. Today there is no
mechanism for either; ad-hoc DB queries work but are not auditable and
the procurement reviewer can't see them.

This story ships a tenant-scoped export + purge pipeline.

## Objective

Ship two operations:

```bash
tag tenant export <tenant_id> --output ./tenant-export.tar.gz
tag tenant purge  <tenant_id> --dry-run
tag tenant purge  <tenant_id> --confirm "DELETE-TENANT-<tenant_id>"
```

Both are admin-only, audit-logged, and produce a signed manifest of what
was exported / purged.

## Requirements

### Export

Output a `tar.gz` containing one folder per resource type, each with
JSONL files:

```
tenant-export/
  manifest.json                    # signed
  users.jsonl
  models.jsonl                     # api_key fields stripped — TAG-54 invariant
  collections.jsonl
  documents.jsonl
  chunks.jsonl                     # text + metadata, no embeddings (huge + low value)
  embeddings.bin                   # optional; --include-embeddings flag
  chat_messages.jsonl
  audit_log.jsonl                  # only entries scoped to this tenant
  files/                           # uploaded files from the storage seam
    <storage-key>
    ...
```

The manifest lists every file with its SHA-256 hash and is signed Ed25519
by the release key.

### Purge

Performs a hard delete in a transaction:

1. Verify `--confirm` arg matches the expected sentinel string.
2. Open a Postgres transaction.
3. DELETE FROM each tenant-scoped table in FK-safe order.
4. Delete every file from the storage seam (S3 / Azure Blob / local).
5. Write an audit_log entry BEFORE the delete that records what is about
   to happen (so the audit trail survives the purge of the tenant's
   own audit rows).
6. Commit.
7. Verify post-state: each tenant-scoped table has zero rows for
   `tenant_id = $1`.

The purge step MUST be idempotent. A second run finds nothing to delete
and exits 0 with a warning.

### Dry-run

`--dry-run` reports counts per table without modifying anything. This is
what the customer reviews before signing off on the purge.

### Audit trail survives

A copy of the pre-delete audit_log entries (just the ones being purged)
goes into a separate `audit_log_purged` table in the control plane so we
retain the *fact* of the tenant's history even though the content is
gone. This is regulator-friendly: we deleted what we said we'd delete,
and we have a record of it.

## Implementation Notes

- The export pipeline streams to disk (`tar.gz` via stdio) — do not
  materialize everything in memory. Big tenants will be GB+.
- The purge runs in one transaction so a failure mid-purge doesn't
  leave the tenant in a half-deleted state.
- Storage seam delete (TAG-79 + the existing LocalDiskStorage) must
  support a `bulkDelete(keys: string[])` operation. If it doesn't,
  iterate.
- The audit_log_purged table is a one-time migration; document in
  `packages/database/prisma/schema.prisma`.
- The CLI command is admin-only (existing JWT role check in
  `packages/cli/`).

## Tests

| File | Test | Assertion |
|---|---|---|
| `packages/cli/src/commands/tenant/export.test.ts` | seeded tenant → tar contains all tables | each JSONL non-empty |
| `packages/cli/src/commands/tenant/export.test.ts` | api_key field stripped from models.jsonl | grep returns no match |
| `packages/cli/src/commands/tenant/export.test.ts` | manifest hash matches files | sha256 verified |
| `packages/cli/src/commands/tenant/export.test.ts` | manifest signature verifies | Ed25519 valid |
| `packages/cli/src/commands/tenant/purge.test.ts` | dry-run does nothing | row counts unchanged |
| `packages/cli/src/commands/tenant/purge.test.ts` | wrong `--confirm` value → exit 1 | clear error |
| `packages/cli/src/commands/tenant/purge.test.ts` | full purge → zero rows | each table empty for tenant |
| `packages/cli/src/commands/tenant/purge.test.ts` | purge of another tenant unaffected | other tenant intact |
| `packages/cli/src/commands/tenant/purge.test.ts` | audit_log_purged contains the pre-delete records | rows match |
| `packages/cli/src/commands/tenant/purge.test.ts` | second purge idempotent | exit 0, warning |

## Acceptance Criteria

- [ ] `tag tenant export <tenant_id>` produces a signed tar.gz with all
      tenant resources.
- [ ] `tag tenant purge --dry-run` reports counts.
- [ ] `tag tenant purge --confirm DELETE-TENANT-<id>` deletes the tenant
      across DB and storage in one transaction.
- [ ] Another tenant's data is provably unaffected (test).
- [ ] `audit_log_purged` retains the fact of the purge.
- [ ] All ten tests pass.
- [ ] Runbook at `docs/runbooks/compliance/tenant-purge.md` documents the
      operator workflow.

## Dependencies

**Depends on:**
- [TAG-79](./TAG-79-region-pinned-storage.md) (storage `bulkDelete`)
- [TAG-78 epic](./TAG-78-residency-governance-hardening-epic.md) core stories

**Blocks:** — (compliance feature, not a blocker)

## Risk Factors

| Risk | Mitigation |
|---|---|
| Purge accidentally deletes another tenant | The negative test (other tenant unaffected) is mandatory; transaction-scoped. |
| Storage bulkDelete partially succeeds | Wrap in retry; on persistent failure, the transaction rolls back and the operator re-runs (idempotency requirement). |
| Export file too large for download | Stream to s3/azure blob via `--output s3://...` as a follow-up; v1 is filesystem-only. |
| GDPR Art. 17 has exceptions (legal hold) | The CLI command does not adjudicate exceptions — it executes when invoked. Legal review is a process gate before invocation, documented in the runbook. |
| Stretch — may not ship this sprint | Acknowledged stretch; epic does not block on it. |
