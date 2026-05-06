-- Migration: Add embedding vector column to rag_chunks table
-- The rag_chunks table stores document chunks with their embeddings for vector search

-- Ensure pgvector extension exists
CREATE EXTENSION IF NOT EXISTS vector;

-- Add embedding column (1536 dimensions for OpenAI text-embedding-3-small)
ALTER TABLE rag_chunks ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- Add HNSW index for fast cosine similarity searches
-- HNSW is better for smaller datasets and provides better recall
CREATE INDEX IF NOT EXISTS rag_chunks_embedding_idx
ON rag_chunks USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- Add a partial index for tenant-specific searches
CREATE INDEX IF NOT EXISTS rag_chunks_tenant_embedding_idx
ON rag_chunks ("tenantId", (embedding IS NOT NULL))
WHERE embedding IS NOT NULL;
