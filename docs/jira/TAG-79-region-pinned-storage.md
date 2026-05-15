# TAG-79: Pluggable Region-Pinned Storage (S3 + AzureBlob)

## Description

**Suggested Points:** 5
**Type:** Story
**Epic:** [TAG-78](./TAG-78-residency-governance-hardening-epic.md)
**Status:** Open

The existing storage seam (`apps/api/src/lib/storage/local-disk.ts`) ships
a `LocalDiskStorage` reference impl and the `Storage` Protocol. Production
deployments need at least two cloud-native impls with a hard boot-time
region assertion, because a buyer's residency claim is only credible if
the *running process* refuses to start in the wrong region.

## Objective

Add `S3Storage` and `AzureBlobStorage` implementations of the existing
Storage Protocol with:

1. A `STORAGE_REGION` env var that the impl reads at construction time.
2. A boot-time round-trip that asks the bucket service for its region and
   compares against `STORAGE_REGION`. Mismatch = process exit, non-zero.
3. Tests that mock the region-report and assert boot fails on mismatch.
4. A runbook stub at `docs/runbooks/deployment/region-pinned-storage.md`
   produced by this story.

```ts
// expected shape in apps/api/src/lib/storage/
interface Storage {
  put(key: string, body: Buffer, meta?: Record<string, string>): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  signedUrl(key: string, ttlSec: number): Promise<string>;
}

export class S3Storage implements Storage { ... }
export class AzureBlobStorage implements Storage { ... }
```

## Requirements

### Region assertion

Both impls MUST run this check during construction (or in a `verify()` step
the app calls at boot):

```ts
const reported = await client.getBucketLocation(...);   // or AzureBlob equiv
if (reported !== process.env.STORAGE_REGION) {
  throw new Error(
    `STORAGE_REGION=${process.env.STORAGE_REGION} but bucket reports ${reported}`
  );
}
```

The error MUST be fatal at boot. `apps/api/src/index.ts` MUST `await` the
verify and exit with non-zero status on failure. We deliberately do not
log-and-continue; that defeats the contract.

### Credentials

- S3: standard AWS SDK credential chain (env, profile, IAM role).
- Azure: `AzureCliCredential` for dev, `DefaultAzureCredential` for prod
  (managed identity).
- No credentials may be logged. Verify via the TAG-84 redaction lint once
  that ships.

### Env surface

| Env var | Required | Notes |
|---|---|---|
| `STORAGE_BACKEND` | yes | `local-disk` \| `s3` \| `azure-blob` |
| `STORAGE_REGION` | yes for s3/azure | e.g. `us-east-1`, `eastus2` |
| `STORAGE_BUCKET` | yes for s3 | bucket name |
| `STORAGE_CONTAINER` | yes for azure-blob | container name |
| `STORAGE_ENDPOINT` | optional | override for S3-compatible (MinIO, R2) |

### Runbook stub

Produce `docs/runbooks/deployment/region-pinned-storage.md` covering:

- How to pick a region (contractual residency).
- How to verify after deploy (a `tag check storage` command or curl
  against `/api/health/ready`).
- What to do if the boot assertion fires (most common cause:
  `STORAGE_REGION` env mismatch with the bucket the credentials point at).
- Rollback steps.

## Implementation Notes

- Keep `LocalDiskStorage` as the dev default. The region assertion is a
  no-op for local disk.
- Use the existing AWS SDK already pinned in `apps/api/package.json` if
  present, otherwise add `@aws-sdk/client-s3` (latest v3).
- For Azure, add `@azure/storage-blob` and `@azure/identity`.
- Surface region in a startup log line at info level for operators (the
  region itself is not sensitive; the credentials are).
- The factory that returns the right Storage impl should live alongside
  `local-disk.ts` — e.g. `apps/api/src/lib/storage/index.ts`. Mirror the
  pattern used by the embedding factory under TAG-60.

## Tests

| File | Test | Assertion |
|---|---|---|
| `apps/api/src/lib/storage/s3.test.ts` | `put` → `get` round-trip with mocked S3 client | bytes match |
| `apps/api/src/lib/storage/s3.test.ts` | boot fails on region mismatch | throws + exit code non-zero |
| `apps/api/src/lib/storage/s3.test.ts` | `signedUrl` includes correct region | URL host matches `STORAGE_REGION` |
| `apps/api/src/lib/storage/azure-blob.test.ts` | `put` → `get` round-trip with mocked container client | bytes match |
| `apps/api/src/lib/storage/azure-blob.test.ts` | boot fails on region mismatch | throws |
| `apps/api/src/lib/storage/index.test.ts` | factory returns correct impl per env | typeof matches |
| `apps/api/src/lib/storage/index.test.ts` | unknown `STORAGE_BACKEND` value | throws at boot |

## Acceptance Criteria

- [ ] `S3Storage` and `AzureBlobStorage` implement the existing `Storage`
      Protocol.
- [ ] Boot fails with non-zero exit on `STORAGE_REGION` mismatch (verified
      by tests).
- [ ] No credentials appear in any log line (manual grep + TAG-84 lint
      once available).
- [ ] `docs/runbooks/deployment/region-pinned-storage.md` exists with the
      four sections above.
- [ ] `docs/residency/architecture.md` Pillar 2 row for "Storage seam"
      flipped to ✅ with the merged commit SHA.
- [ ] `LocalDiskStorage` continues to work in dev with no env changes.

## Dependencies

**Depends on:** — (foundational)
**Blocks:** [TAG-85](./TAG-85-byo-vpc-deployment-package.md), [TAG-86](./TAG-86-ui-residency-surface.md)

## Risk Factors

| Risk | Mitigation |
|---|---|
| AWS SDK v3 import paths differ from existing usage in apps/api | Audit existing AWS usage in PR description; reuse whichever client style is already there. |
| Boot assertion fires in dev because no bucket is configured | `LocalDiskStorage` is the dev default; tests cover the assertion separately with mocks. |
| Azure managed identity not available in dev | `AzureCliCredential` fallback documented in the runbook stub. |
| Region check call costs or rate limits | The check runs once at boot; the per-call cost is negligible vs. the residency guarantee. |
