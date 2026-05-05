# TAG-10: RAG Ingestion CLI

## Description

**Suggested Points:** 5 (Medium — idempotent ingestion logic, auto MCP registration, and cross-tenant verification; builds on existing RAG infrastructure from Day 4)

## Objective

Build the CLI commands for RAG document ingestion, implementing idempotent operations that skip unchanged documents, automatic MCP server registration for ingested sources, and cross-tenant verification to ensure data isolation is maintained.

## Requirements

### Ingest Command
- `tag ingest <path>` — Ingest file or directory
- `tag ingest <path> --recursive` — Ingest directory recursively
- `tag ingest <url>` — Ingest from URL
- `tag ingest --source <name>` — Group ingested content by source name
- Supported formats: .txt, .md, .pdf, .docx (same as Day 4 API)

### Idempotent Ingestion
- Compute content hash before upload
- Check if hash already exists in tenant's RAG store
- Skip upload for unchanged content
- Report: "Skipped: 5 unchanged, Ingested: 2 new, Updated: 1"
- Force re-ingest with `--force` flag

### Progress and Feedback
- Progress bar for directory ingestion
- File count and size summary
- Chunk count after processing
- Estimated token usage (for cost awareness)

### Auto MCP Registration
- First ingest creates RAG MCP server entry if not exists
- MCP server config added to .mcp.json automatically
- Server name: `tag-rag-{source-name}` or `tag-rag-default`
- User notified of new MCP server availability

### Cross-Tenant Verification
- Verify ingested documents only visible to own tenant
- Include tenant_id verification in integration tests
- Log tenant context for each ingestion operation

### List and Remove Commands
- `tag rag list` — List ingested sources and document counts
- `tag rag list <source>` — List documents in source
- `tag rag remove <source>` — Remove all documents from source
- `tag rag remove <source> <path>` — Remove specific document

## Implementation Notes
- Backend: Uses Day 4 RAG API
- Frontend: N/A
- CLI: New commands in packages/cli/src/commands/rag.ts
- Database: N/A (uses API)

## Unit Tests

### Required Unit Tests
| Test File | Test Case | Assertion |
|-----------|-----------|-----------|
| `packages/cli/src/__tests__/ingest.test.ts` | `computes content hash correctly` | Hash matches expected for test file |
| `packages/cli/src/__tests__/ingest.test.ts` | `skips unchanged content` | No API call for existing hash |
| `packages/cli/src/__tests__/ingest.test.ts` | `reports skip/new/updated counts` | Correct counts in output |
| `packages/cli/src/__tests__/ingest.test.ts` | `--force re-ingests everything` | API called regardless of hash |
| `packages/cli/src/__tests__/ingest.test.ts` | `--recursive processes subdirectories` | All nested files included |
| `packages/cli/src/__tests__/ingest.test.ts` | `ignores unsupported file types` | .exe, .bin etc. skipped with warning |
| `packages/cli/src/__tests__/ingest.test.ts` | `handles URL ingestion` | URL fetched and content ingested |
| `packages/cli/src/__tests__/mcp-register.test.ts` | `auto-registers MCP server on first ingest` | Server created in registry |
| `packages/cli/src/__tests__/mcp-register.test.ts` | `updates .mcp.json with new server` | Entry added with _managed |
| `packages/cli/src/__tests__/rag-list.test.ts` | `lists sources with counts` | Output includes source names and doc counts |
| `packages/cli/src/__tests__/rag-remove.test.ts` | `removes source completely` | Source no longer in list |

### Test Coverage Requirements
- 100% coverage on idempotency logic (hash comparison)
- 100% coverage on file type filtering
- All error paths tested (missing file, invalid URL, API failure)

## Integration Tests

### Required Integration Tests
| Test Scenario | Setup | Steps | Expected Result |
|---------------|-------|-------|-----------------|
| `idempotent ingestion` | Document already ingested | 1. tag ingest same-doc.md | "Skipped: 1 unchanged" |
| `new document ingestion` | Empty RAG store | 1. tag ingest new-doc.md | "Ingested: 1 new" |
| `directory ingestion` | Directory with 10 files | 1. tag ingest ./docs --recursive | 10 files processed |
| `auto MCP registration` | No RAG MCP server | 1. tag ingest doc.md 2. Check .mcp.json | MCP server entry created |
| `cross-tenant isolation` | Two tenants with documents | 1. Tenant A ingests 2. Tenant B lists | Tenant B sees only own docs |
| `source grouping` | Multiple ingests | 1. ingest with --source blog 2. ingest with --source wiki | Separate sources in list |
| `remove source` | Ingested source "test" | 1. tag rag remove test 2. tag rag list | Source not in list |
| `URL ingestion` | Valid URL | 1. tag ingest https://example.com/doc.md | Content ingested |

### End-to-End Flows
- Fresh setup → Ingest directory → MCP server auto-created → Claude Code can use RAG
- Multi-source management: Ingest blog → Ingest wiki → List shows both → Remove blog → Only wiki remains
- Idempotency: Ingest docs → Modify one → Re-ingest → Only modified processed

## Cross-Tenant Test (CRITICAL)

```typescript
// packages/cli/src/__tests__/ingest.integration.test.ts

describe('cross-tenant isolation on ingestion', () => {
  it('tenant B cannot see tenant A ingested documents', async () => {
    // Tenant A ingests
    const tenantAToken = await getTestToken('tenant-a')
    await runCommand(['ingest', './test-docs'], { token: tenantAToken })

    // Tenant B lists
    const tenantBToken = await getTestToken('tenant-b')
    const result = await runCommand(['rag', 'list'], { token: tenantBToken })

    // Tenant B should see empty or only their own
    expect(result.stdout).not.toContain('test-docs')
  })

  it('ingestion stamps correct tenant_id', async () => {
    const tenantAToken = await getTestToken('tenant-a')
    await runCommand(['ingest', './test-docs'], { token: tenantAToken })

    // Verify in database (test helper)
    const chunks = await getChunksForTenant('tenant-a')
    expect(chunks.length).toBeGreaterThan(0)

    // No chunks for other tenant
    const otherChunks = await getChunksForTenant('tenant-b')
    const ourContent = chunks.map(c => c.content_hash)
    const leakedChunks = otherChunks.filter(c => ourContent.includes(c.content_hash))
    expect(leakedChunks).toHaveLength(0)
  })
})
```

## Acceptance Criteria
1. `tag ingest <path>` successfully ingests documents
2. Unchanged documents skipped (idempotency working)
3. Progress and summary displayed during ingestion
4. MCP server auto-registered on first ingest
5. .mcp.json updated with RAG server entry
6. `tag rag list` shows sources and document counts
7. `tag rag remove` successfully removes documents
8. Cross-tenant isolation verified in tests

## Review Checklist
- [ ] Is the content hash computed before upload, not after?
- [ ] Does idempotency check use content hash, not filename?
- [ ] Is the MCP server only created once (not duplicated)?
- [ ] Does URL ingestion validate the URL before fetching?
- [ ] Are large files handled appropriately (size limits)?
- [ ] Is progress feedback accurate and non-blocking?

## Dependencies
- Depends on: Day 4 (RAG API), Day 5 (CLI auth), Day 9 (.mcp.json patterns)
- Blocks: Day 11 (init may include sample RAG setup)

## Risk Factors
- **Large file handling** — Mitigation: Streaming upload, size limits, progress feedback
- **URL ingestion security** — Mitigation: URL validation, timeout, size limits
- **MCP registration race condition** — Mitigation: Idempotent server creation
- **Cross-tenant leakage** — Mitigation: Test-first for isolation, code review focus
