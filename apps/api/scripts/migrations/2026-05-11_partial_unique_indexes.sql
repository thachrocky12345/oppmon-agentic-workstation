-- Partial unique indexes for soft-deleted tables
--
-- Bug: 2026-05-10_soft_delete_and_archival added `deleted_at` to many tables
-- but didn't rebuild their unique constraints to filter on `deleted_at IS NULL`.
-- Effect: deleting a row (soft-delete) and re-creating one with the same
-- "natural key" fails with 409 Conflict — the soft-deleted row still occupies
-- the unique slot. Discovered 2026-05-08 when admin tried to delete and
-- re-create a model under the same display name.
--
-- This migration rebuilds those unique indexes as PARTIAL UNIQUE INDEXes that
-- exclude soft-deleted rows. After this migration, delete-then-recreate works.
-- Existing soft-deleted rows are NOT touched.
--
-- Scope: user-facing "named entity" tables only. Tables intentionally excluded:
--   - daily_stats, usage_events  (append-only time series, never deleted)
--   - embeddings, rag_chunks, rag_documents  (content-hash dedup; restore is safe)
--   - virtual_keys.key_prefix    (security-sensitive — keep prefix uniqueness global)
--   - tenant_settings.tenant_id  (1 row per tenant; no recreate pattern)
--   - resource_shares            (composite sharing key; no name conflict)
--
-- Idempotent: each block only runs if the non-partial index still exists.

DO $$
DECLARE
  fix RECORD;
  fixes CONSTANT TEXT[][] := ARRAY[
    ['agents',          'agents_tenant_id_name_key',          '(tenant_id, name)'],
    ['mcp_servers',     'mcp_servers_tenant_id_name_key',     '(tenant_id, name)'],
    ['skills',          'skills_tenant_id_name_version_key',  '(tenant_id, name, version)'],
    ['rag_collections', 'rag_collections_tenant_id_name_key', '(tenant_id, name)'],
    ['teams',           'teams_tenant_id_name_key',           '(tenant_id, name)'],
    ['persona_memory',  'persona_memory_tenant_id_name_key',  '(tenant_id, name)']
    -- models_tenant_id_display_name_key was fixed manually 2026-05-08; included
    -- here as a no-op (DROP IF EXISTS, recreate partial) for repeatability.
  ];
  models_fix CONSTANT TEXT[] := ARRAY[
    'models', 'models_tenant_id_display_name_key', '(tenant_id, display_name)'
  ];
  arr TEXT[];
  is_partial BOOLEAN;
  has_constraint BOOLEAN;
BEGIN
  -- Process the user-named entity tables.
  FOR i IN 1 .. array_length(fixes, 1) LOOP
    arr := ARRAY[fixes[i][1], fixes[i][2], fixes[i][3]];
    -- Skip if index doesn't exist (table missing or already renamed).
    IF NOT EXISTS (
      SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname=arr[2]
    ) THEN
      RAISE NOTICE 'Skipping %: index not present', arr[2];
      CONTINUE;
    END IF;
    -- Skip if already partial.
    SELECT (indexdef ~* 'WHERE') INTO is_partial
      FROM pg_indexes WHERE indexname=arr[2];
    IF is_partial THEN
      RAISE NOTICE 'Skipping %: already partial', arr[2];
      CONTINUE;
    END IF;
    -- If the index is backed by a UNIQUE CONSTRAINT (created via UNIQUE in
    -- CREATE TABLE), Postgres refuses DROP INDEX and demands DROP CONSTRAINT.
    SELECT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = arr[2] AND conrelid = format('public.%I', arr[1])::regclass
    ) INTO has_constraint;
    IF has_constraint THEN
      EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I', arr[1], arr[2]);
    ELSE
      EXECUTE format('DROP INDEX IF EXISTS %I', arr[2]);
    END IF;
    EXECUTE format(
      'CREATE UNIQUE INDEX %I ON %I %s WHERE deleted_at IS NULL',
      arr[2], arr[1], arr[3]
    );
    RAISE NOTICE 'Rebuilt % as partial unique index', arr[2];
  END LOOP;

  -- Models (already done manually but make migration repeatable).
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname=models_fix[2]) THEN
    SELECT (indexdef ~* 'WHERE') INTO is_partial
      FROM pg_indexes WHERE indexname=models_fix[2];
    IF NOT is_partial THEN
      SELECT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = models_fix[2] AND conrelid = format('public.%I', models_fix[1])::regclass
      ) INTO has_constraint;
      IF has_constraint THEN
        EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I', models_fix[1], models_fix[2]);
      ELSE
        EXECUTE format('DROP INDEX IF EXISTS %I', models_fix[2]);
      END IF;
      EXECUTE format(
        'CREATE UNIQUE INDEX %I ON %I %s WHERE deleted_at IS NULL',
        models_fix[2], models_fix[1], models_fix[3]
      );
      RAISE NOTICE 'Rebuilt % as partial unique index', models_fix[2];
    END IF;
  END IF;
END $$;
