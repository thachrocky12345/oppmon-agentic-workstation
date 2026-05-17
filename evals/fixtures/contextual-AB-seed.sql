-- TAG-CR — Contextual Retrieval A/B eval seed.
--
-- Creates the two empty collections the A/B harness writes to. Documents and
-- chunks are NOT seeded here — they're ingested at runtime via the rag-admin
-- upload API so that the contextualizer pipeline runs (or doesn't) per arm.
--
-- Layout (extends seed_two_tenants.sql):
--
--   Tenant A (tnt_alpha)            already seeded:
--     User alice (usr_alice)            +
--     Team tm_alpha                     +
--     Collection col_alpha              +
--     ...                               +
--                                       +
--   NEW (this file):                    +
--     Collection col_eval_baseline      empty — baseline arm
--     Collection col_eval_contextual    empty — contextual arm
--
-- Prerequisite: seed_two_tenants.sql must have run first (we depend on
-- tnt_alpha / tm_alpha / usr_alice existing).
--
-- RUNBOOK flow after this file lands:
--
--   1. psql $DATABASE_URL -f evals/fixtures/contextual-AB-seed.sql
--   2. With RAG_CONTEXTUALIZER_ENABLED=false, POST every file in
--      evals/corpus-fixtures/ to /api/admin/rag/collections/col_eval_baseline/documents
--      so the baseline arm has un-augmented embeddings.
--   3. With RAG_CONTEXTUALIZER_ENABLED=true, repeat against
--      col_eval_contextual so that arm gets summary + per-chunk
--      context_prefix + embeddings over (prefix + content).
--   4. Run the A/B driver: `pnpm tsx evals/scripts/contextual-retrieval-eval.ts --label pilot-001`
--      The driver appends `_baseline` / `_contextual` to each question's
--      collection_ids template ([\"col_eval\"]) per arm.
--   5. Generate the retrieval-quality report:
--      `pnpm tsx evals/scripts/retrieval-report.ts --run contextual-AB-pilot-001`
--
-- Doc / chunk id convention used by corpus-questions.json (citation keys
-- [[doc:chunk]]):
--
--   alpha-engineering-handbook.md  -> doc_eng  / chk_eng_1..5
--   alpha-hr-policies.md           -> doc_hr   / chk_hr_1..5
--   alpha-security-standards.md    -> doc_sec  / chk_sec_1..5
--   alpha-finance-policies.md      -> doc_fin  / chk_fin_1..5
--
-- The ingest pipeline assigns its own document/chunk ids, so the RUNBOOK
-- includes a normalization step that rewrites the freshly-inserted rows'
-- ids to match this convention. (See evals/scripts/RUNBOOK.md §3.)

BEGIN;

-- ---------------------------------------------------------------------
-- Sanity: bail out loudly if the prerequisite tenants/teams/users are
-- missing. Without this, the INSERTs below would silently no-op via
-- the ON CONFLICT clause if someone forgot to run seed_two_tenants.sql.
-- ---------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM tenants     WHERE id = 'tnt_alpha') THEN
    RAISE EXCEPTION 'tnt_alpha missing — run seed_two_tenants.sql first';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM teams       WHERE id = 'tm_alpha')  THEN
    RAISE EXCEPTION 'tm_alpha missing — run seed_two_tenants.sql first';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth_users  WHERE id = 'usr_alice') THEN
    RAISE EXCEPTION 'usr_alice missing — run seed_two_tenants.sql first';
  END IF;
END$$;

-- ---------------------------------------------------------------------
-- RAG collections — two empty siblings under Alpha's team. The A/B
-- driver swaps a question's ["col_eval"] template to ["col_eval_baseline"]
-- or ["col_eval_contextual"] per arm.
-- ---------------------------------------------------------------------

INSERT INTO rag_collections (
  id, tenant_id, team_id, name, scope, created_by_id, created_at, updated_at
)
VALUES
  ('col_eval_baseline',   'tnt_alpha', 'tm_alpha',
   'TAG-CR Eval — Baseline (no contextualization)', 'TEAM',
   'usr_alice', NOW(), NOW()),
  ('col_eval_contextual', 'tnt_alpha', 'tm_alpha',
   'TAG-CR Eval — Contextual (Anthropic Sept-2024 pattern)', 'TEAM',
   'usr_alice', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

COMMIT;
