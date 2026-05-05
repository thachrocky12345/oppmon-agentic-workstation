# TAG-04: RAG MCP Server + Ingestion

## Description

**Suggested Points:** 13 (Critical — security boundary for cross-tenant data isolation; embedding pipeline complexity; vector database integration; MUST have isolation tests written before any implementation)

## Objective

Build the RAG (Retrieval-Augmented Generation) MCP server with document ingestion pipeline, embedding generation, and vector search. **CRITICAL: This is the primary security boundary for cross-tenant data isolation. Tests must be written FIRST, before any implementation code.**

## Requirements

### CRITICAL: Security-First Development Order
1. **Write isolation tests FIRST** (before any implementation)
2. Run tests, verify they fail (red phase)
3. Implement with isolation as primary constraint
4. Tests must pass before PR merge

### RAG MCP Server
- MCP server implementing `search_docs` tool
- Transport: stdio (runs as subprocess)
- Input: query string, optional filters (file_type, date_range)
- Output: array of {content, metadata, score}
- **tenant_id extracted from JWT, NEVER from query params or user input**

### Document Ingestion Pipeline
- `POST /api/rag/ingest` — Ingest document(s) for tenant
- Supported formats: .txt, .md, .pdf, .docx (via parsing libraries)
- Chunking: ~800 tokens with 100 token overlap
- Each chunk stamped with: tenant_id, source_file, chunk_index, created_at
- Content hash for idempotency (skip re-ingestion of unchanged content)

### Embedding Generation
- Interface: `EmbeddingProvider { embed(text): Promise<number[]> }`
- Implementation: OpenAI text-embedding-3-small (or configurable)
- Batch processing for efficiency (up to 100 chunks per API call)
- Retry with exponential backoff on rate limits

### Vector Storage
- PostgreSQL with pgvector extension (or dedicated vector DB)
- `rag_chunks` table: id, tenant_id, source_id, chunk_index, content, embedding (vector), content_hash, metadata (jsonb), created_at
- Index: `CREATE INDEX ON rag_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)`
- **WHERE tenant_id = $1 REQUIRED on every query**

### Search Implementation
- Cosine similarity search within tenant boundary
- Top-k results (default 5, max 20)
- Minimum similarity threshold (0.7 default)
- Response includes content, metadata, similarity score

## Implementation Notes
- Backend: Separate `packages/rag-mcp` package for MCP server
- Frontend: N/A
- CLI: Integration in Day 10
- Database: pgvector extension, migrations for rag_chunks

## Unit Tests

### Required Unit Tests
| Test File | Test Case | Assertion |
|-----------|-----------|-----------|
| `packages/rag-mcp/src/__tests__/search.test.ts` | `extracts tenant_id from JWT, not query params` | tenant_id comes from decoded JWT only |
| `packages/rag-mcp/src/__tests__/search.test.ts` | `returns 401 if JWT missing` | 401 status code |
| `packages/rag-mcp/src/__tests__/search.test.ts` | `returns 401 if JWT expired` | 401 status code |
| `packages/rag-mcp/src/__tests__/search.test.ts` | `returns 401 if JWT malformed` | 401 status code |
| `packages/rag-mcp/src/__tests__/search.test.ts` | `returns empty array if tenant_id is null in JWT` | Empty results, no error |
| `packages/rag-mcp/src/__tests__/search.test.ts` | `never includes tenant_id in user-controllable input` | tenant_id not in query construction |
| `packages/rag-mcp/src/__tests__/embedding.test.ts` | `chunks at ~800 tokens with 100 overlap` | Chunk sizes within bounds |
| `packages/rag-mcp/src/__tests__/embedding.test.ts` | `stamps tenant_id on every chunk` | All chunks have tenant_id |
| `packages/rag-mcp/src/__tests__/embedding.test.ts` | `hashes content for idempotency` | Same content produces same hash |
| `packages/rag-mcp/src/__tests__/embedding.test.ts` | `skips re-embedding unchanged content` | No API call for existing hash |

### Test Coverage Requirements
- **100% coverage on tenant_id extraction and validation**
- 100% coverage on search query construction (verify WHERE clause)
- All JWT error cases tested

## Integration Tests

### Required Integration Tests (WRITE THESE FIRST)
| Test Scenario | Setup | Steps | Expected Result |
|---------------|-------|-------|-----------------|
| **CROSS-TENANT ISOLATION** | Ingest 3 docs to Tenant A with "alpha-secret", 3 docs to Tenant B with "beta-secret" | 1. Search "alpha-secret" with Tenant B JWT | **0 results** |
| **Tenant sees own data** | Same as above | 1. Search "alpha-secret" with Tenant A JWT | **3 results** |
| **WHERE clause regression** | Same as above | 1. Modify search to drop WHERE 2. Run isolation test | Test fails, catching the bug |
| `JWT required for search` | Valid documents | 1. Search without Authorization header | 401 Unauthorized |
| `expired JWT rejected` | Valid documents, expired JWT | 1. Search with expired token | 401 Unauthorized |
| `ingestion idempotency` | Document already ingested | 1. Re-ingest same document | No new chunks created |
| `chunk metadata preserved` | Document with metadata | 1. Ingest 2. Search 3. Check result | Metadata in response |

### End-to-End Flows
- Ingest document → Generate embeddings → Search → Return relevant chunks
- Multi-tenant: Tenant A ingests → Tenant B searches → Zero results from A's data
- Idempotency: Ingest same document twice → Only one set of chunks exists

## Cross-Tenant Isolation Test (CRITICAL)

```typescript
// packages/rag-mcp/src/__tests__/isolation.integration.test.ts
// THIS FILE MUST BE WRITTEN BEFORE ANY IMPLEMENTATION

describe('CROSS-TENANT ISOLATION', () => {
  let tenantAJwt: string
  let tenantBJwt: string

  beforeAll(async () => {
    // Create two tenants
    const tenantA = await createTenant('tenant-a')
    const tenantB = await createTenant('tenant-b')

    tenantAJwt = await issueJwt({ tenant_id: tenantA.id })
    tenantBJwt = await issueJwt({ tenant_id: tenantB.id })

    // Ingest documents with unique phrases
    await ingestDocument(tenantAJwt, 'Doc 1 contains alpha-secret phrase')
    await ingestDocument(tenantAJwt, 'Doc 2 contains alpha-secret phrase')
    await ingestDocument(tenantAJwt, 'Doc 3 contains alpha-secret phrase')

    await ingestDocument(tenantBJwt, 'Doc 1 contains beta-secret phrase')
    await ingestDocument(tenantBJwt, 'Doc 2 contains beta-secret phrase')
    await ingestDocument(tenantBJwt, 'Doc 3 contains beta-secret phrase')
  })

  it('tenant B JWT searching "alpha-secret" returns 0 results', async () => {
    const results = await searchDocs(tenantBJwt, 'alpha-secret')
    expect(results).toHaveLength(0)
  })

  it('tenant A JWT searching "alpha-secret" returns 3 results', async () => {
    const results = await searchDocs(tenantAJwt, 'alpha-secret')
    expect(results).toHaveLength(3)
  })

  it('tenant A JWT searching "beta-secret" returns 0 results', async () => {
    const results = await searchDocs(tenantAJwt, 'beta-secret')
    expect(results).toHaveLength(0)
  })

  it('tenant B JWT searching "beta-secret" returns 3 results', async () => {
    const results = await searchDocs(tenantBJwt, 'beta-secret')
    expect(results).toHaveLength(3)
  })
})
```

## Acceptance Criteria
1. **Cross-tenant isolation tests written and failing before implementation**
2. **Cross-tenant isolation tests pass after implementation**
3. tenant_id extracted only from JWT, never from user input
4. Document ingestion with chunking at ~800 tokens
5. Embeddings generated and stored in vector database
6. Search returns relevant results within tenant boundary
7. Idempotency: re-ingestion of unchanged content is no-op
8. All unit tests pass with 100% coverage on tenant_id handling

## Review Checklist
- [ ] **Are the isolation tests written BEFORE the implementation?**
- [ ] Is tenant_id extracted from JWT using a trusted library, not manual parsing?
- [ ] Does EVERY database query include WHERE tenant_id = ?
- [ ] Is there any code path where tenant_id could come from user input?
- [ ] Are embeddings stored with tenant_id, not just referenced by foreign key?
- [ ] Is the search function parameterized, not using string concatenation?
- [ ] Would a DROP of the WHERE clause be caught by existing tests?

## Dependencies
- Depends on: Day 1 (auth, JWT), Day 2 (audit logging)
- Blocks: Day 10 (CLI RAG ingestion)

## Risk Factors
- **Cross-tenant data leakage** — Mitigation: Tests first, WHERE clause in all queries, code review focus
- **Embedding API costs** — Mitigation: Idempotency, batch processing, caching
- **Vector index performance** — Mitigation: Proper index tuning, tenant partitioning if needed
- **Large document handling** — Mitigation: Chunking, streaming, size limits
