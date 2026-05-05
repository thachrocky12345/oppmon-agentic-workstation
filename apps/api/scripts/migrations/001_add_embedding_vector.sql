-- Migration: Add embedding vector column to embeddings table
-- Prisma doesn't support pgvector natively, so we add the column via raw SQL

-- Ensure pgvector extension exists
CREATE EXTENSION IF NOT EXISTS vector;

-- Add embedding column (1536 dimensions for OpenAI text-embedding-3-small)
ALTER TABLE embeddings ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- Add IVF index for fast cosine similarity searches
-- Note: ivfflat works best with >1000 records; for fewer records HNSW might be better
CREATE INDEX IF NOT EXISTS embeddings_embedding_idx
ON embeddings USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);
