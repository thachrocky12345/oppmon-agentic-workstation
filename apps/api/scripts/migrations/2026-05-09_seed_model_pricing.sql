-- Migration: 2026-05-09_seed_model_pricing
-- Description: Seed model_pricing rate cards for all supported providers.
--   Covers Anthropic, OpenAI, Cerebras, and Ollama models referenced by
--   apps/api/src/lib/llm/* and apps/api/src/validators/providers/*.
-- Author: Claude (Opus 4)
-- Date: 2026-05-09
--
-- Notes
-- -----
-- 1. `model_pricing` is GLOBAL reference data (no tenant_id). Rate cards are
--    public information published by each provider.
-- 2. Costs are stored as USD per 1,000 tokens (matches existing schema column
--    naming `cost_per_1k_input` / `cost_per_1k_output`).
-- 3. Pricing values reflect each provider's PUBLIC list price as of late
--    2025 / early 2026. Newer models may need a follow-up migration; older
--    models retire via `effective_until` rather than being deleted.
-- 4. Idempotent: ON CONFLICT (provider, model_id, effective_from) DO UPDATE
--    refreshes display_name + cost columns so re-running corrects mistakes.
-- 5. `is_free = true` for Ollama (local inference, no per-token charge).
-- 6. `cache_creation_multiplier` is set per Anthropic guidance
--    (1.5 Opus, 1.25 Sonnet/Haiku, 1.0 everyone else — same defaults as in
--    migration 022_cache_creation_multiplier).

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Schema: ensure model_pricing exists with the full column superset.
--
--    Background: the live DB is Prisma-managed (`prisma db push`); the legacy
--    raw-SQL migrations under apps/api/scripts/migrations/ that originally
--    declared this table never ran in this environment, so the table is
--    missing entirely (`relation "model_pricing" does not exist`).
--
--    This block is idempotent (CREATE TABLE IF NOT EXISTS + ADD COLUMN IF NOT
--    EXISTS) so it is safe to run on a fresh DB and on environments where the
--    table was created by an older migration with a partial column set.
--
--    Column set covers every consumer in the repo:
--      • core columns               — `/api/admin/pricing` route
--      • pricing_type / monthly_cost_usd / notes  — 015_agent_models.sql
--      • cached_input_discount_pct  — referenced by 022 cache-discount logic
--      • cache_creation_multiplier  — 022_cache_creation_multiplier.sql
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS model_pricing (
  id                          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  provider                    TEXT          NOT NULL,
  model_id                    TEXT          NOT NULL,
  display_name                TEXT,
  pricing_type                TEXT                   DEFAULT 'per_token',
  cost_per_1k_input           NUMERIC(12,6),
  cost_per_1k_output          NUMERIC(12,6),
  cached_input_discount_pct   NUMERIC(6,3)           DEFAULT 0.0,
  cache_creation_multiplier   NUMERIC(6,3) NOT NULL  DEFAULT 1.0,
  monthly_cost_usd            NUMERIC(12,4),
  is_free                     BOOLEAN      NOT NULL  DEFAULT false,
  effective_from              DATE         NOT NULL  DEFAULT CURRENT_DATE,
  effective_until             DATE,
  notes                       TEXT,
  created_at                  TIMESTAMPTZ  NOT NULL  DEFAULT NOW(),
  UNIQUE (provider, model_id, effective_from)
);

CREATE INDEX IF NOT EXISTS idx_model_pricing_provider_model
  ON model_pricing (provider, model_id);

CREATE INDEX IF NOT EXISTS idx_model_pricing_active
  ON model_pricing (provider, model_id)
  WHERE effective_until IS NULL;

-- Defensive ADD COLUMN IF NOT EXISTS: covers environments where an older
-- partial schema for `model_pricing` already exists. No-op when the column
-- is already present (e.g. on a fresh DB where CREATE TABLE above just ran).
ALTER TABLE model_pricing ADD COLUMN IF NOT EXISTS pricing_type              TEXT                  DEFAULT 'per_token';
ALTER TABLE model_pricing ADD COLUMN IF NOT EXISTS monthly_cost_usd          NUMERIC(12,4);
ALTER TABLE model_pricing ADD COLUMN IF NOT EXISTS notes                     TEXT;
ALTER TABLE model_pricing ADD COLUMN IF NOT EXISTS cached_input_discount_pct NUMERIC(6,3)          DEFAULT 0.0;
ALTER TABLE model_pricing ADD COLUMN IF NOT EXISTS cache_creation_multiplier NUMERIC(6,3) NOT NULL DEFAULT 1.0;

-- ---------------------------------------------------------------------------
-- 2. Anthropic — list price per 1M tokens, divided by 1000 for per-1k.
--    Source: https://www.anthropic.com/pricing
-- ---------------------------------------------------------------------------

INSERT INTO model_pricing (
  provider, model_id, display_name, pricing_type,
  cost_per_1k_input, cost_per_1k_output,
  cached_input_discount_pct, cache_creation_multiplier,
  is_free, notes
) VALUES
  -- Claude 4 family (current frontier)
  ('anthropic', 'claude-opus-4-5-20251101',  'Claude Opus 4.5',          'per_token', 0.015,    0.075,   90.0, 1.5,  false, 'Frontier reasoning. $15/M in, $75/M out.'),
  ('anthropic', 'claude-opus-4-7',           'Claude Opus 4 (alias)',    'per_token', 0.015,    0.075,   90.0, 1.5,  false, 'Alias for Opus 4.5 family. Same rate card.'),
  ('anthropic', 'claude-sonnet-4-5',         'Claude Sonnet 4.5',        'per_token', 0.003,    0.015,   90.0, 1.25, false, 'Balanced model. $3/M in, $15/M out.'),
  ('anthropic', 'claude-haiku-4-5',          'Claude Haiku 4.5',         'per_token', 0.0008,   0.004,   90.0, 1.25, false, 'Fast / cheap. $0.80/M in, $4/M out.'),
  -- Claude 3.7 / 3.5 family
  ('anthropic', 'claude-3-7-sonnet-20250219','Claude 3.7 Sonnet',        'per_token', 0.003,    0.015,   90.0, 1.25, false, '$3/M in, $15/M out.'),
  ('anthropic', 'claude-3-5-sonnet-20241022','Claude 3.5 Sonnet (Oct24)','per_token', 0.003,    0.015,   90.0, 1.25, false, '$3/M in, $15/M out.'),
  ('anthropic', 'claude-3-5-sonnet-20240620','Claude 3.5 Sonnet (Jun24)','per_token', 0.003,    0.015,   90.0, 1.25, false, '$3/M in, $15/M out.'),
  ('anthropic', 'claude-3-5-haiku-20241022', 'Claude 3.5 Haiku',         'per_token', 0.0008,   0.004,   90.0, 1.25, false, '$0.80/M in, $4/M out.'),
  -- Claude 3 family (legacy but still active)
  ('anthropic', 'claude-3-opus-20240229',    'Claude 3 Opus',            'per_token', 0.015,    0.075,   90.0, 1.5,  false, '$15/M in, $75/M out.'),
  ('anthropic', 'claude-3-sonnet-20240229',  'Claude 3 Sonnet',          'per_token', 0.003,    0.015,   90.0, 1.25, false, '$3/M in, $15/M out. Legacy.'),
  ('anthropic', 'claude-3-haiku-20240307',   'Claude 3 Haiku',           'per_token', 0.00025,  0.00125, 90.0, 1.25, false, '$0.25/M in, $1.25/M out.')
ON CONFLICT (provider, model_id, effective_from) DO UPDATE SET
  display_name              = EXCLUDED.display_name,
  pricing_type              = EXCLUDED.pricing_type,
  cost_per_1k_input         = EXCLUDED.cost_per_1k_input,
  cost_per_1k_output        = EXCLUDED.cost_per_1k_output,
  cached_input_discount_pct = EXCLUDED.cached_input_discount_pct,
  cache_creation_multiplier = EXCLUDED.cache_creation_multiplier,
  is_free                   = EXCLUDED.is_free,
  notes                     = EXCLUDED.notes;

-- ---------------------------------------------------------------------------
-- 3. OpenAI — list price per 1M tokens, divided by 1000 for per-1k.
--    Source: https://openai.com/api/pricing/
--    Embedding models charge input only (output cost = 0).
-- ---------------------------------------------------------------------------

INSERT INTO model_pricing (
  provider, model_id, display_name, pricing_type,
  cost_per_1k_input, cost_per_1k_output,
  cached_input_discount_pct,
  is_free, notes
) VALUES
  -- GPT-4.1 family (2025)
  ('openai', 'gpt-4.1',                'GPT-4.1',                 'per_token', 0.002,   0.008,   75.0, false, '$2/M in, $8/M out.'),
  ('openai', 'gpt-4.1-mini',           'GPT-4.1 mini',            'per_token', 0.0004,  0.0016,  75.0, false, '$0.40/M in, $1.60/M out.'),
  ('openai', 'gpt-4.1-nano',           'GPT-4.1 nano',            'per_token', 0.0001,  0.0004,  75.0, false, '$0.10/M in, $0.40/M out.'),
  -- GPT-4o family
  ('openai', 'gpt-4o',                 'GPT-4o',                  'per_token', 0.0025,  0.010,   50.0, false, 'Aug-2024 pricing. $2.50/M in, $10/M out.'),
  ('openai', 'gpt-4o-2024-08-06',      'GPT-4o (2024-08-06)',     'per_token', 0.0025,  0.010,   50.0, false, '$2.50/M in, $10/M out.'),
  ('openai', 'gpt-4o-2024-05-13',      'GPT-4o (2024-05-13)',     'per_token', 0.005,   0.015,    0.0, false, 'Original GPT-4o launch pricing.'),
  ('openai', 'gpt-4o-mini',            'GPT-4o mini',             'per_token', 0.00015, 0.0006,  50.0, false, '$0.15/M in, $0.60/M out.'),
  -- GPT-4 turbo / GPT-4
  ('openai', 'gpt-4-turbo',            'GPT-4 Turbo',             'per_token', 0.010,   0.030,    0.0, false, '$10/M in, $30/M out.'),
  ('openai', 'gpt-4-turbo-2024-04-09', 'GPT-4 Turbo (2024-04-09)','per_token', 0.010,   0.030,    0.0, false, '$10/M in, $30/M out.'),
  ('openai', 'gpt-4',                  'GPT-4',                   'per_token', 0.030,   0.060,    0.0, false, 'Legacy. $30/M in, $60/M out.'),
  ('openai', 'gpt-4-32k',              'GPT-4 32k',               'per_token', 0.060,   0.120,    0.0, false, 'Legacy. $60/M in, $120/M out.'),
  -- GPT-3.5
  ('openai', 'gpt-3.5-turbo',          'GPT-3.5 Turbo',           'per_token', 0.0005,  0.0015,   0.0, false, '$0.50/M in, $1.50/M out.'),
  ('openai', 'gpt-3.5-turbo-0125',     'GPT-3.5 Turbo (0125)',    'per_token', 0.0005,  0.0015,   0.0, false, '$0.50/M in, $1.50/M out.'),
  -- Reasoning (o-series)
  ('openai', 'o1',                     'o1',                      'per_token', 0.015,   0.060,   50.0, false, '$15/M in, $60/M out.'),
  ('openai', 'o1-preview',             'o1-preview',              'per_token', 0.015,   0.060,   50.0, false, 'Preview pricing matches o1.'),
  ('openai', 'o1-mini',                'o1-mini',                 'per_token', 0.003,   0.012,   50.0, false, '$3/M in, $12/M out.'),
  ('openai', 'o3',                     'o3',                      'per_token', 0.010,   0.040,   75.0, false, '$10/M in, $40/M out (estimated).'),
  ('openai', 'o3-mini',                'o3-mini',                 'per_token', 0.0011,  0.0044,  75.0, false, '$1.10/M in, $4.40/M out.'),
  ('openai', 'o4-mini',                'o4-mini',                 'per_token', 0.0011,  0.0044,  75.0, false, 'Estimated rate, parity with o3-mini.'),
  -- Embeddings (input-only billing)
  ('openai', 'text-embedding-3-small', 'text-embedding-3-small',  'per_token', 0.00002, 0.0,      0.0, false, '$0.02/M tokens. Input only.'),
  ('openai', 'text-embedding-3-large', 'text-embedding-3-large',  'per_token', 0.00013, 0.0,      0.0, false, '$0.13/M tokens. Input only.'),
  ('openai', 'text-embedding-ada-002', 'text-embedding-ada-002',  'per_token', 0.0001,  0.0,      0.0, false, '$0.10/M tokens. Input only. Legacy.')
ON CONFLICT (provider, model_id, effective_from) DO UPDATE SET
  display_name              = EXCLUDED.display_name,
  pricing_type              = EXCLUDED.pricing_type,
  cost_per_1k_input         = EXCLUDED.cost_per_1k_input,
  cost_per_1k_output        = EXCLUDED.cost_per_1k_output,
  cached_input_discount_pct = EXCLUDED.cached_input_discount_pct,
  is_free                   = EXCLUDED.is_free,
  notes                     = EXCLUDED.notes;

-- ---------------------------------------------------------------------------
-- 4. Cerebras — list price per 1M tokens, divided by 1000 for per-1k.
--    Source: https://www.cerebras.ai/inference (public pricing page).
--    Some less-common models use estimated rates; flagged in notes.
-- ---------------------------------------------------------------------------

INSERT INTO model_pricing (
  provider, model_id, display_name, pricing_type,
  cost_per_1k_input, cost_per_1k_output,
  is_free, notes
) VALUES
  -- Llama family
  ('cerebras', 'llama3.1-8b',                          'Llama 3.1 8B (Cerebras)',         'per_token', 0.0001,  0.0001,  false, '$0.10/M in/out.'),
  ('cerebras', 'llama3.1-70b',                         'Llama 3.1 70B (Cerebras)',        'per_token', 0.0006,  0.0006,  false, '$0.60/M in/out.'),
  ('cerebras', 'llama-3.3-70b',                        'Llama 3.3 70B (Cerebras)',        'per_token', 0.00085, 0.00120, false, '$0.85/M in, $1.20/M out.'),
  ('cerebras', 'llama-4-scout-17b-16e-instruct',       'Llama 4 Scout 17B-16E',           'per_token', 0.00065, 0.00085, false, 'Estimated. ~$0.65/M in, ~$0.85/M out.'),
  ('cerebras', 'llama-4-maverick-17b-128e-instruct',   'Llama 4 Maverick 17B-128E',       'per_token', 0.00020, 0.00060, false, 'Estimated. ~$0.20/M in, ~$0.60/M out.'),
  -- Qwen family
  ('cerebras', 'qwen-3-32b',                           'Qwen3 32B (Cerebras)',            'per_token', 0.0004,  0.0008,  false, 'Estimated rate.'),
  ('cerebras', 'qwen-3-235b-a22b-instruct-2507',       'Qwen3 235B-A22B Instruct',        'per_token', 0.0006,  0.0012,  false, 'Estimated rate.'),
  ('cerebras', 'qwen-3-coder-480b',                    'Qwen3 Coder 480B',                'per_token', 0.0020,  0.0020,  false, 'Estimated rate; large MoE model.'),
  -- Other open-weights
  ('cerebras', 'gpt-oss-120b',                         'GPT-OSS 120B (Cerebras)',         'per_token', 0.00025, 0.00069, false, 'Estimated rate.'),
  ('cerebras', 'deepseek-r1-distill-llama-70b',        'DeepSeek-R1 Distill Llama 70B',   'per_token', 0.00065, 0.00065, false, 'Estimated rate.')
ON CONFLICT (provider, model_id, effective_from) DO UPDATE SET
  display_name       = EXCLUDED.display_name,
  pricing_type       = EXCLUDED.pricing_type,
  cost_per_1k_input  = EXCLUDED.cost_per_1k_input,
  cost_per_1k_output = EXCLUDED.cost_per_1k_output,
  is_free            = EXCLUDED.is_free,
  notes              = EXCLUDED.notes;

-- ---------------------------------------------------------------------------
-- 5. Ollama — local inference, no per-token billing.
--    is_free = true so cost-tracking dashboards exclude these from spend.
--    Operators still incur hardware/electricity costs (out of scope here).
-- ---------------------------------------------------------------------------

INSERT INTO model_pricing (
  provider, model_id, display_name, pricing_type,
  cost_per_1k_input, cost_per_1k_output,
  is_free, notes
) VALUES
  -- Meta Llama
  ('ollama', 'llama3',         'Llama 3 (local)',         'per_token', 0.0, 0.0, true, 'Local inference via Ollama. No per-token charge.'),
  ('ollama', 'llama3.1',       'Llama 3.1 (local)',       'per_token', 0.0, 0.0, true, 'Local inference via Ollama.'),
  ('ollama', 'llama3.2',       'Llama 3.2 (local)',       'per_token', 0.0, 0.0, true, 'Local inference via Ollama.'),
  ('ollama', 'llama3.3',       'Llama 3.3 (local)',       'per_token', 0.0, 0.0, true, 'Local inference via Ollama.'),
  -- Mistral / Mixtral
  ('ollama', 'mistral',        'Mistral (local)',         'per_token', 0.0, 0.0, true, 'Local inference via Ollama.'),
  ('ollama', 'mistral-nemo',   'Mistral Nemo (local)',    'per_token', 0.0, 0.0, true, 'Local inference via Ollama.'),
  ('ollama', 'mixtral',        'Mixtral (local)',         'per_token', 0.0, 0.0, true, 'Local inference via Ollama.'),
  -- Qwen
  ('ollama', 'qwen2.5',        'Qwen2.5 (local)',         'per_token', 0.0, 0.0, true, 'Local inference via Ollama.'),
  ('ollama', 'qwen2.5-coder',  'Qwen2.5 Coder (local)',   'per_token', 0.0, 0.0, true, 'Local inference via Ollama.'),
  ('ollama', 'qwen3',          'Qwen3 (local)',           'per_token', 0.0, 0.0, true, 'Local inference via Ollama.'),
  -- Microsoft Phi
  ('ollama', 'phi3',           'Phi-3 (local)',           'per_token', 0.0, 0.0, true, 'Local inference via Ollama.'),
  ('ollama', 'phi3.5',         'Phi-3.5 (local)',         'per_token', 0.0, 0.0, true, 'Local inference via Ollama.'),
  ('ollama', 'phi4',           'Phi-4 (local)',           'per_token', 0.0, 0.0, true, 'Local inference via Ollama.'),
  -- Google Gemma
  ('ollama', 'gemma2',         'Gemma 2 (local)',         'per_token', 0.0, 0.0, true, 'Local inference via Ollama.'),
  ('ollama', 'gemma3',         'Gemma 3 (local)',         'per_token', 0.0, 0.0, true, 'Local inference via Ollama.'),
  -- DeepSeek
  ('ollama', 'deepseek-r1',    'DeepSeek-R1 (local)',     'per_token', 0.0, 0.0, true, 'Local inference via Ollama.'),
  ('ollama', 'deepseek-v3',    'DeepSeek-V3 (local)',     'per_token', 0.0, 0.0, true, 'Local inference via Ollama.'),
  -- Code-focused
  ('ollama', 'codellama',      'Code Llama (local)',      'per_token', 0.0, 0.0, true, 'Local inference via Ollama.'),
  -- Embeddings
  ('ollama', 'nomic-embed-text','Nomic Embed Text (local)','per_token', 0.0, 0.0, true, 'Local embedding via Ollama.'),
  ('ollama', 'mxbai-embed-large','mxbai Embed Large (local)','per_token',0.0, 0.0, true, 'Local embedding via Ollama.'),
  ('ollama', 'bge-m3',         'BGE-M3 (local)',          'per_token', 0.0, 0.0, true, 'Local embedding via Ollama.')
ON CONFLICT (provider, model_id, effective_from) DO UPDATE SET
  display_name       = EXCLUDED.display_name,
  pricing_type       = EXCLUDED.pricing_type,
  cost_per_1k_input  = EXCLUDED.cost_per_1k_input,
  cost_per_1k_output = EXCLUDED.cost_per_1k_output,
  is_free            = EXCLUDED.is_free,
  notes              = EXCLUDED.notes;

COMMIT;
