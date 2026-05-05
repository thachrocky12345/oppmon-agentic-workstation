# TAG-03: MCP Servers + Bundle Storage

## Description

**Suggested Points:** 8 (High — storage abstraction layer complexity, sha256 verification pipeline, bundle management with versioning, and RBAC on downloads; similar patterns to Day 2 but with binary handling)

## Objective

Build the MCP Servers registry for managing Model Context Protocol server configurations, implement bundle storage with sha256 verification for artifact integrity, and enforce RBAC on both metadata access and binary downloads.

## Requirements

### MCP Servers Data Model
- `mcp_servers` table: id, tenant_id FK, team_id FK (nullable), name, description, version, transport (enum: 'stdio', 'http', 'sse'), command, args (jsonb), env (jsonb), scope, bundle_id FK (nullable), created_by FK, created_at, updated_at, deleted_at
- `mcp_bundles` table: id, tenant_id FK, sha256, size_bytes, storage_path, content_type, created_by FK, created_at
- Unique constraint on (tenant_id, sha256) for deduplication
- Soft delete support for mcp_servers

### Storage Abstraction Layer
- Interface: `StorageProvider { upload(key, stream): Promise<void>, download(key): ReadableStream, delete(key): Promise<void>, exists(key): Promise<boolean> }`
- Implementations: `LocalStorageProvider` (filesystem), `S3StorageProvider` (AWS S3/MinIO)
- Storage path pattern: `bundles/{tenant_id}/{sha256}`
- Environment variable to select provider: `STORAGE_PROVIDER=local|s3`

### Bundle Upload/Download
- `POST /api/mcp/bundles` — Upload bundle, compute sha256, dedupe by hash
- `GET /api/mcp/bundles/:id` — Download bundle (streaming, with RBAC)
- Bundle size limit: 50MB (configurable)
- Content-Type validation: application/gzip, application/zip, application/octet-stream
- SHA256 computed server-side, not trusted from client

### MCP Server CRUD
- `GET /api/mcp/servers` — List MCP servers (scope-filtered)
- `GET /api/mcp/servers/:id` — Get single server config
- `POST /api/mcp/servers` — Create server (team_admin+)
- `PUT /api/mcp/servers/:id` — Update server
- `DELETE /api/mcp/servers/:id` — Soft delete server
- Same RBAC rules as Skills (tenant_admin > team_admin > member)

### sha256 Verification Pipeline
- Upload: Compute sha256 during stream, store in mcp_bundles
- Download: Return sha256 in response header `X-Content-SHA256`
- CLI sync (Day 8): Verify sha256 before extraction
- Reject upload if sha256 computation fails

## Implementation Notes
- Backend: NestJS with multer for uploads, stream processing for sha256
- Frontend: N/A (API only)
- CLI: Download integration in Day 8
- Database: Prisma migrations for mcp_servers, mcp_bundles tables

## Unit Tests

### Required Unit Tests
| Test File | Test Case | Assertion |
|-----------|-----------|-----------|
| `apps/api/src/storage/__tests__/local.test.ts` | `uploads file to correct path` | File exists at `bundles/{tenant_id}/{sha256}` |
| `apps/api/src/storage/__tests__/local.test.ts` | `downloads returns readable stream` | Stream produces original content |
| `apps/api/src/storage/__tests__/local.test.ts` | `delete removes file` | File no longer exists |
| `apps/api/src/storage/__tests__/s3.test.ts` | `uploads to S3 with correct key` | S3 PutObject called with key |
| `apps/api/src/storage/__tests__/sha256.test.ts` | `computes correct sha256 for stream` | Hash matches known value |
| `apps/api/src/storage/__tests__/sha256.test.ts` | `sha256 round-trip matches` | Upload sha256 equals download header |
| `apps/api/src/mcp/__tests__/bundles.test.ts` | `deduplicates by sha256` | Second upload returns existing bundle |
| `apps/api/src/mcp/__tests__/bundles.test.ts` | `rejects oversized upload` | 413 Payload Too Large |
| `apps/api/src/mcp/__tests__/bundles.test.ts` | `rejects invalid content-type` | 415 Unsupported Media Type |
| `apps/api/src/mcp/__tests__/servers.test.ts` | `RBAC enforced on download` | Non-member gets 403 |

### Test Coverage Requirements
- 100% coverage on StorageProvider interface implementations
- 100% coverage on sha256 computation pipeline
- All RBAC scenarios from Day 2 applied to MCP resources

## Integration Tests

### Required Integration Tests
| Test Scenario | Setup | Steps | Expected Result |
|---------------|-------|-------|-----------------|
| `sha256 round-trip verification` | None | 1. Upload bundle 2. Download bundle 3. Compute sha256 locally | Local sha256 matches X-Content-SHA256 header |
| `storage abstraction local` | STORAGE_PROVIDER=local | 1. Upload 2. Check filesystem 3. Download | File exists, content matches |
| `storage abstraction S3` | STORAGE_PROVIDER=s3, MinIO | 1. Upload 2. Check S3 bucket 3. Download | Object exists, content matches |
| `RBAC on bundle download` | Team-scoped MCP server with bundle | 1. Non-member requests download | 403 Forbidden |
| `bundle deduplication` | Existing bundle with sha256 X | 1. Upload same content | Returns existing bundle_id |
| `MCP server CRUD` | Empty database | 1. Create 2. Read 3. Update 4. Delete | All operations succeed |
| `MCP server scope filtering` | Team A server, User in Team B | 1. GET /api/mcp/servers | Server not in list |

### End-to-End Flows
- Upload bundle → Create MCP server referencing bundle → Download bundle → Verify sha256
- Team admin creates MCP server → Member downloads bundle → Non-member denied
- Upload duplicate bundle → Verify deduplication → Original bundle still accessible

## Acceptance Criteria
1. Storage abstraction works with both local filesystem and S3/MinIO
2. sha256 computed server-side and returned in download response header
3. Bundle deduplication by sha256 within tenant
4. MCP server CRUD with same RBAC as Skills
5. Bundle download enforces RBAC based on MCP server scope
6. Upload rejects files exceeding size limit (50MB default)
7. All mutations logged to audit_log
8. sha256 round-trip test passes (upload hash = download hash)

## Review Checklist
- [ ] Is sha256 computed from the actual stream, not from client-provided value?
- [ ] Does the storage path include tenant_id to prevent cross-tenant access?
- [ ] Are S3 credentials loaded from environment, not hardcoded?
- [ ] Is the bundle download streaming, not loading entire file into memory?
- [ ] Does bundle deletion check for referencing MCP servers first?
- [ ] Is there a cleanup job for orphaned bundles (no MCP server references)?

## Dependencies
- Depends on: Day 1 (auth), Day 2 (RBAC patterns, audit logging)
- Blocks: Day 8 (CLI sync downloads bundles), Day 9 (MCP config sync)

## Risk Factors
- **Large file handling** — Mitigation: Stream processing, chunked uploads, memory limits
- **S3 credential exposure** — Mitigation: IAM roles in production, presigned URLs for downloads
- **sha256 collision (theoretical)** — Mitigation: Include tenant_id in uniqueness constraint
- **Storage cost growth** — Mitigation: Deduplication, retention policies, orphan cleanup
