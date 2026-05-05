-- =============================================================================
-- Arkon Database Initialization Script
-- =============================================================================
-- This script runs when the PostgreSQL container is first created.
-- It enables required extensions for TimescaleDB and pgvector.

-- Enable TimescaleDB extension
CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;

-- Enable pgvector extension (for semantic search)
CREATE EXTENSION IF NOT EXISTS vector;

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enable pg_trgm for text search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Note: After Prisma creates the embeddings table, run this to add the vector column:
-- ALTER TABLE embeddings ADD COLUMN IF NOT EXISTS embedding vector(1536);
-- CREATE INDEX IF NOT EXISTS embeddings_embedding_idx ON embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Log successful initialization
DO $$
BEGIN
    RAISE NOTICE 'Arkon database initialized successfully with extensions: timescaledb, vector, uuid-ossp, pg_trgm';
END $$;
