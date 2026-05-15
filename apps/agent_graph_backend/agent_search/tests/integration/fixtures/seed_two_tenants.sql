-- TAG-64 — integration test seed (two tenants, two users, two corpora).
--
-- Run against a fresh Prisma-migrated database. Idempotent: every row
-- uses a deterministic id and ``ON CONFLICT DO NOTHING`` so re-running
-- in CI is safe.
--
-- Schema reality:
--   * Column names follow ``snake_case with @map`` from CLAUDE.md.
--   * Foreign keys to ``auth_users.id`` / ``tenants.id`` / ``teams.id``
--     reflect the Prisma schema at the time of TAG-64.
--   * ``model_secrets`` rows hold actual XSalsa20-Poly1305 ciphertext
--     produced by ``apps/api/src/crypto/secret-vault.ts`` — see the
--     companion ``seed_models_with_ts_encryption.json`` for the exact
--     bytes (committed once, regenerated only when the master key
--     rotates).
--
-- Layout:
--
--   Tenant A (tnt_alpha)            Tenant B (tnt_beta)
--   ├── User alice (usr_alice)       ├── User bob (usr_bob)
--   │   ├── Team tm_alpha             │   └── Team tm_beta
--   │   ├── Model fake-alpha          │   └── Model fake-beta
--   │   └── Collection col_alpha      │       └── Collection col_beta
--   │       └── Document doc_alpha    │           └── Document doc_beta
--   │           └── Chunk c1          │               └── Chunk c1
--   └── ...
--
-- The cross-tenant test (case 4 in the ticket) asserts that bob asking
-- for ``model=fake-alpha`` (which is Tenant A's row) gets a 403 with
-- the generic message, NOT a 404 — confirming no model-existence
-- side-channel.

BEGIN;

-- ---------------------------------------------------------------------
-- Tenants
-- ---------------------------------------------------------------------

INSERT INTO tenants (id, name, slug, created_at, updated_at)
VALUES
  ('tnt_alpha', 'Alpha Co', 'alpha', NOW(), NOW()),
  ('tnt_beta',  'Beta LLC', 'beta',  NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------
-- Auth users (password_hash is a fixed dummy bcrypt hash of "test"
-- — the integration suite never logs them in over HTTP, but the column
-- is NOT NULL on most deployments.)
-- ---------------------------------------------------------------------

INSERT INTO auth_users (
  id, tenant_id, email, password_hash, role, created_at, updated_at
)
VALUES
  ('usr_alice', 'tnt_alpha', 'alice@example.test',
   '$2a$10$abcdefghijklmnopqrstuvwxyz0123456789ABCDEF01234567890ABCDEFG',
   'MEMBER', NOW(), NOW()),
  ('usr_bob',   'tnt_beta',  'bob@example.test',
   '$2a$10$abcdefghijklmnopqrstuvwxyz0123456789ABCDEF01234567890ABCDEFG',
   'MEMBER', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------
-- Teams + memberships
-- ---------------------------------------------------------------------

INSERT INTO teams (id, tenant_id, name, created_at, updated_at)
VALUES
  ('tm_alpha', 'tnt_alpha', 'Alpha Team', NOW(), NOW()),
  ('tm_beta',  'tnt_beta',  'Beta Team',  NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO team_members (id, team_id, user_id, role, created_at)
VALUES
  ('tmem_alpha_alice', 'tm_alpha', 'usr_alice', 'MEMBER', NOW()),
  ('tmem_beta_bob',    'tm_beta',  'usr_bob',   'MEMBER', NOW())
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------
-- Model secrets — ciphertext + nonce produced by the TS vault. The
-- bytea values must come from ``seed_models_with_ts_encryption.json``;
-- this script uses placeholders so the migration plan is visible. The
-- companion fixture-load script in conftest.py reads the JSON, base64-
-- decodes the bytes, and rewrites these rows via the asyncpg pool.
-- (We do NOT inline the bytes here because pg_dump-style hex literals
-- become unreadable in a code review.)
-- ---------------------------------------------------------------------

INSERT INTO model_secrets (
  id, encrypted_payload, nonce, version, created_at, updated_at
)
VALUES
  ('msec_alpha', E'\\x00', E'\\x00', 1, NOW(), NOW()),
  ('msec_beta',  E'\\x00', E'\\x00', 1, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------
-- Models — both use provider_template_id='fake' so the integration
-- suite stays keyless and deterministic. The cross-tenant case in
-- TAG-64 asserts that a Tenant-B caller asking for ``fake-alpha``
-- (Tenant A's row) gets a 403, regardless of the secret.
-- ---------------------------------------------------------------------

INSERT INTO models (
  id, tenant_id, scope, team_id, created_by_id,
  display_name, provider_template_id, model_identifier,
  public_config, enabled, secret_ref, created_at, updated_at
)
VALUES
  (
    'mdl_alpha', 'tnt_alpha', 'TENANT', NULL, 'usr_alice',
    'Alpha Fake', 'fake', 'fake-alpha',
    '{}'::jsonb, TRUE, 'msec_alpha', NOW(), NOW()
  ),
  (
    'mdl_beta', 'tnt_beta', 'TENANT', NULL, 'usr_bob',
    'Beta Fake', 'fake', 'fake-beta',
    '{}'::jsonb, TRUE, 'msec_beta', NOW(), NOW()
  )
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------
-- RAG collections — one per tenant, scoped to the team.
-- ---------------------------------------------------------------------

INSERT INTO rag_collections (
  id, tenant_id, team_id, name, scope, created_by_id, created_at, updated_at
)
VALUES
  ('col_alpha', 'tnt_alpha', 'tm_alpha', 'Alpha Corpus', 'TEAM',
   'usr_alice', NOW(), NOW()),
  ('col_beta',  'tnt_beta',  'tm_beta',  'Beta Corpus',  'TEAM',
   'usr_bob',   NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------
-- Documents — one per collection.
-- ---------------------------------------------------------------------

INSERT INTO rag_documents (
  id, tenant_id, collection_id, original_filename, mime_type,
  size_bytes, uploaded_by_id, created_at, updated_at, deleted_at
)
VALUES
  ('doc_alpha', 'tnt_alpha', 'col_alpha', 'alpha-handbook.pdf',
   'application/pdf', 1024, 'usr_alice', NOW(), NOW(), NULL),
  ('doc_beta',  'tnt_beta',  'col_beta',  'beta-handbook.pdf',
   'application/pdf', 1024, 'usr_bob',   NOW(), NOW(), NULL)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------
-- Chunks — one per document. The ``embedding`` column is left NULL
-- here; the load script rewrites it with a deterministic 1536-dim
-- vector ("hash-as-vector") so the cosine-similarity query produces
-- stable rankings without a real embedder.
--
-- Tenant A's chunk carries a synthetic "secret" string the cross-tenant
-- test will assert never appears in Tenant B's response (defence-in-
-- depth for SQL isolation).
-- ---------------------------------------------------------------------

INSERT INTO rag_chunks (
  id, tenant_id, document_id, ordinal, content, metadata,
  embedding, created_at, updated_at
)
VALUES
  ('chk_alpha_1', 'tnt_alpha', 'doc_alpha', 0,
   'ALPHA_TENANT_SECRET: policy X grants 30-day extensions on production.',
   '{}'::jsonb, NULL, NOW(), NOW()),
  ('chk_beta_1',  'tnt_beta',  'doc_beta',  0,
   'BETA_TENANT_FACT: customer onboarding requires KYC documentation.',
   '{}'::jsonb, NULL, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

COMMIT;
