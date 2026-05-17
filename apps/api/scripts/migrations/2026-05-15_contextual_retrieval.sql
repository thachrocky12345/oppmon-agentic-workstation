-- Migration: Contextual Retrieval columns (Anthropic Sept 2024 pattern)
-- https://www.anthropic.com/news/contextual-retrieval
--
-- Adds:
--   rag_documents.summary             — LLM-generated ~150-word document summary
--   rag_documents.summary_model       — model id that produced the summary
--   rag_documents.summary_updated_at  — when the summary was last (re)generated
--   rag_chunks.context_prefix         — chunk-specific situating prefix (~50-100 tokens)
--   rag_chunks.section_path           — optional section breadcrumb (e.g. "Ch.2 > Pricing")
--   rag_chunks.content_search         — generated stored column = (prefix + "\n\n" + content),
--                                       used as the BM25 source so to_tsvector reflects context.
--
-- All columns are nullable / NULL-tolerant — pre-existing rows continue to work
-- with the baseline BM25 + vector path; the contextualizer fills these in on
-- new ingests and via the backfill CLI (apps/api/scripts/backfill-rag-context.ts).
--
-- ⚠️ NOTE: CREATE INDEX CONCURRENTLY must run OUTSIDE a transaction. If your
-- migration runner wraps every file in BEGIN/COMMIT, either split this file
-- so the CREATE INDEX statement runs standalone, OR add a parser directive
-- the runner recognises. The default psql-driven path in this repo runs each
-- file with `psql -f` which does NOT wrap in a transaction by default, so this
-- is safe under the current tooling.

-- ---------------------------------------------------------------------------
-- 1. rag_documents: document-level summary metadata
-- ---------------------------------------------------------------------------
ALTER TABLE rag_documents
  ADD COLUMN IF NOT EXISTS summary             TEXT,
  ADD COLUMN IF NOT EXISTS summary_model       TEXT,
  ADD COLUMN IF NOT EXISTS summary_updated_at  TIMESTAMPTZ;

-- ---------------------------------------------------------------------------
-- 2. rag_chunks: chunk-level situating context + section path
-- ---------------------------------------------------------------------------
ALTER TABLE rag_chunks
  ADD COLUMN IF NOT EXISTS context_prefix      TEXT,
  ADD COLUMN IF NOT EXISTS section_path        TEXT;

-- ---------------------------------------------------------------------------
-- 3. rag_chunks.content_search — generated stored column for BM25
--
-- Postgres 12+ generated columns are immutable, auto-maintained on UPDATE,
-- and visible in `\d`. We index the tsvector of this column so the BM25
-- path sees `prefix + content`, not just `content`. COALESCE keeps it
-- graceful when context_prefix IS NULL (pre-contextualization rows).
-- ---------------------------------------------------------------------------
ALTER TABLE rag_chunks
  ADD COLUMN IF NOT EXISTS content_search TEXT
    GENERATED ALWAYS AS (COALESCE(context_prefix || E'\n\n', '') || content) STORED;

-- ---------------------------------------------------------------------------
-- 4. GIN index on the new BM25 source. CONCURRENTLY = no table lock,
--    safe to run against a live table. IF NOT EXISTS lets the migration
--    be re-run idempotently.
-- ---------------------------------------------------------------------------
CREATE INDEX CONCURRENTLY IF NOT EXISTS rag_chunks_content_search_idx
  ON rag_chunks USING GIN (to_tsvector('english', content_search));
