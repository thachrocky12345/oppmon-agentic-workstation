# ADR-0010: [AUTO] Document Ingestion Pipeline (PDF / DOCX / Multipart)

**Date:** 2026-05-07

**Status:** Accepted

## Context

RAG-Admin and skill authoring needed to ingest user-uploaded documents (PDF, DOCX, plain text) and convert them into chunks for embedding. The previous implementation only accepted plain text via JSON.

New runtime dependencies were added to `apps/api`:

- `busboy` + `@types/busboy` — streaming multipart upload parsing
- `pdf-parse` — PDF text extraction
- `mammoth` — DOCX → HTML/text conversion
- `mustache` — template rendering for skill prompts
- `tweetnacl` — symmetric crypto helpers for the secret vault path
- `cookie-parser` — cookie-based session support

A new `apps/api/src/lib/storage/` module owns local-disk persistence with a typed interface for future S3/GCS backends.

## Decision

Adopt a streaming ingestion pipeline:

1. `busboy` parses multipart uploads without buffering full files
2. Format-specific parsers (`pdf-parse`, `mammoth`) extract text
3. The storage layer writes originals to `oppmon-documents` Docker volume via `lib/storage/local-disk.ts`
4. Chunks flow into the existing embedding + pgvector pipeline

## Alternatives Considered

| Alternative | Pros | Cons | Why Not Chosen |
|-------------|------|------|----------------|
| `multer` for uploads | Popular, simple | Buffers files; less stream-friendly | Rejected — large PDFs blow memory |
| External parsing service (Unstructured.io) | High-quality extraction | Network dep, cost | Deferred — start local, evaluate later |
| Object storage (S3) only | Scales | Adds infra dep for dev | Deferred — `local-disk` interface keeps door open |

## Consequences

### Positive

- Streaming uploads cap memory pressure
- Pluggable storage backend (`storage/types.ts` + `local-disk.ts`)
- DOCX and PDF supported out of the box
- Mustache enables prompt templating for skills

### Negative

- More native-ish dependencies (`pdf-parse`) to keep current
- Local-disk path requires volume mount in Docker (`oppmon-documents`)

## Related

- `apps/api/src/lib/storage/local-disk.ts`
- `apps/api/src/routes/rag-admin.ts`
- ADR-0004 pgvector Embeddings
- ADR-0005 Hybrid Search
