-- Embedding versioning — provenance + multi-version coexistence
--
-- Every vector-bearing table gets:
--   embedding_provider TEXT     -- 'openai' | 'gemini' | 'voyage' | 'cohere'
--   embedding_model    TEXT     -- 'text-embedding-3-small', 'embed-v3', ...
--   embedding_version  TEXT     -- caller-defined, e.g. 'v1', '2026-05'
--   embedding_dim      INTEGER  -- cached for sanity / shape checks
--
-- The provider+model+version triple lets us run a re-embedding migration
-- (write rows under v2 alongside v1) and have retrieval filter by version
-- so nearest-neighbor results stay consistent. Once cutover completes,
-- v1 rows get dropped.
--
-- Partial HNSW indexes scoped to (provider, model) so multi-version
-- coexistence doesn't blow up the recall of either version.
--
-- Idempotent.

-- =========================================================================
-- 1. Add version columns to every vector table
-- =========================================================================
DO $$
DECLARE
  tbl TEXT;
  default_dim INT;
  vector_tables TEXT[] := ARRAY[
    -- (table, default_dim) — encoded as alternating elements below.
    'embeddings',     '1536',
    'rag_chunks',     '1536',
    'memory_facts',   '1536',
    'summary_memory', '1024',
    'persona_memory', '1024'
  ];
  i INT;
BEGIN
  i := 1;
  WHILE i <= array_length(vector_tables, 1) LOOP
    tbl := vector_tables[i];
    default_dim := vector_tables[i + 1]::int;

    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = tbl
    ) THEN
      EXECUTE format(
        'ALTER TABLE %I
            ADD COLUMN IF NOT EXISTS embedding_provider TEXT,
            ADD COLUMN IF NOT EXISTS embedding_model    TEXT,
            ADD COLUMN IF NOT EXISTS embedding_version  TEXT NOT NULL DEFAULT ''v1'',
            ADD COLUMN IF NOT EXISTS embedding_dim      INTEGER NOT NULL DEFAULT %s',
        tbl, default_dim
      );
    END IF;

    i := i + 2;
  END LOOP;
END
$$;

-- =========================================================================
-- 2. Backfill provenance for pre-existing rows
-- =========================================================================
-- The workspace has no production data; these UPDATEs are no-ops in dev but
-- exist so the migration is honest about its intent. The defaults match the
-- env defaults: OpenAI text-embedding-3-small at 1536 dims, except for the
-- summary/persona pair which have always been BGE-M3 1024 dims.

UPDATE embeddings
   SET embedding_provider = COALESCE(embedding_provider, 'openai'),
       embedding_model    = COALESCE(embedding_model,    'text-embedding-3-small')
 WHERE embedding IS NOT NULL
   AND (embedding_provider IS NULL OR embedding_model IS NULL);

UPDATE rag_chunks
   SET embedding_provider = COALESCE(embedding_provider, 'openai'),
       embedding_model    = COALESCE(embedding_model,    'text-embedding-3-small')
 WHERE embedding IS NOT NULL
   AND (embedding_provider IS NULL OR embedding_model IS NULL);

UPDATE memory_facts
   SET embedding_provider = COALESCE(embedding_provider, 'openai'),
       embedding_model    = COALESCE(embedding_model,    'text-embedding-3-small')
 WHERE embedding IS NOT NULL
   AND (embedding_provider IS NULL OR embedding_model IS NULL);

UPDATE summary_memory
   SET embedding_provider = COALESCE(embedding_provider, 'baai'),
       embedding_model    = COALESCE(embedding_model,    'bge-m3')
 WHERE embedding IS NOT NULL
   AND (embedding_provider IS NULL OR embedding_model IS NULL);

UPDATE persona_memory
   SET embedding_provider = COALESCE(embedding_provider, 'baai'),
       embedding_model    = COALESCE(embedding_model,    'bge-m3')
 WHERE embedding IS NOT NULL
   AND (embedding_provider IS NULL OR embedding_model IS NULL);

-- =========================================================================
-- 3. Partial HNSW indexes per (provider, model)
-- =========================================================================
-- Pre-existing global HNSW indexes are kept; the partial indexes give the
-- planner a way to scan only same-version rows when retrieval filters by
-- (embedding_provider, embedding_model).

DO $$
DECLARE
  tbl TEXT;
  idx_name TEXT;
  vector_tables TEXT[] := ARRAY['embeddings','rag_chunks','memory_facts','summary_memory','persona_memory'];
BEGIN
  FOREACH tbl IN ARRAY vector_tables LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = tbl
    ) THEN
      CONTINUE;
    END IF;

    -- OpenAI text-embedding-3-small partial index (1536 dim)
    idx_name := format('idx_%s_vec_openai_v3small', tbl);
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I
          ON %I USING hnsw (embedding vector_cosine_ops)
          WHERE embedding_provider = ''openai''
            AND embedding_model    = ''text-embedding-3-small''',
      idx_name, tbl
    );

    -- BGE-M3 partial index (1024 dim) for memory tables that use it
    IF tbl IN ('summary_memory','persona_memory') THEN
      idx_name := format('idx_%s_vec_bge_m3', tbl);
      EXECUTE format(
        'CREATE INDEX IF NOT EXISTS %I
            ON %I USING hnsw (embedding vector_cosine_ops)
            WHERE embedding_provider = ''baai''
              AND embedding_model    = ''bge-m3''',
        idx_name, tbl
      );
    END IF;
  END LOOP;
END
$$;

-- =========================================================================
-- 4. Lookup index for the (provider, model, version) triple
-- =========================================================================
-- Retrieval filters by these columns; b-tree composite keeps that fast.

DO $$
DECLARE
  tbl TEXT;
  vector_tables TEXT[] := ARRAY['embeddings','rag_chunks','memory_facts','summary_memory','persona_memory'];
BEGIN
  FOREACH tbl IN ARRAY vector_tables LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = tbl
    ) THEN
      CONTINUE;
    END IF;
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS idx_%s_embedding_version
          ON %I (embedding_provider, embedding_model, embedding_version)',
      tbl, tbl
    );
  END LOOP;
END
$$;
