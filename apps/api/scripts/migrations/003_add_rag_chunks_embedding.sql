-- Migration: Add embedding vector column to rag_chunks table
-- The rag_chunks table stores document chunks with their embeddings for vector search.
--
-- NOTE: HNSW requires pgvector >= 0.5.0. The Ubuntu 18.04 PGDG package ships
-- 0.4.2 which only supports ivfflat. We use ivfflat here so the migration
-- runs on every supported deployment; upgrade to HNSW when pgvector is bumped.

-- Ensure pgvector extension exists
CREATE EXTENSION IF NOT EXISTS vector;

-- Add embedding column (1536 dimensions for OpenAI text-embedding-3-small)
ALTER TABLE rag_chunks ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- IVF index for cosine similarity. lists=100 is reasonable up to ~1M rows.
CREATE INDEX IF NOT EXISTS rag_chunks_embedding_idx
ON rag_chunks USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Partial index for tenant-scoped non-null embeddings.
-- (Was previously written with the camelCase identifier "tenantId" which never
--  existed; the column is snake_case via Prisma @map.)
CREATE INDEX IF NOT EXISTS rag_chunks_tenant_embedding_idx
ON rag_chunks (tenant_id, (embedding IS NOT NULL))
WHERE embedding IS NOT NULL;
