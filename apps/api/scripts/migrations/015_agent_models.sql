-- Phase 6: Agent → Model linkage + agent-facing subscription seeds

ALTER TABLE agents ADD COLUMN IF NOT EXISTS default_provider varchar(100);
ALTER TABLE agents ADD COLUMN IF NOT EXISTS default_model_id varchar(255);

CREATE INDEX IF NOT EXISTS idx_agents_default_model
  ON agents(default_provider, default_model_id);

-- Defensive: `model_pricing` is created by 000_base_schema with the minimal
-- per-token rate-card columns. The subscription columns referenced below
-- (`pricing_type`, `monthly_cost_usd`, `notes`) are added by later
-- migrations, but we need them here. Add them up front so this INSERT
-- works regardless of run order, and so the migration is idempotent
-- against partial earlier runs.
ALTER TABLE model_pricing ADD COLUMN IF NOT EXISTS pricing_type     TEXT NOT NULL DEFAULT 'per_token';
ALTER TABLE model_pricing ADD COLUMN IF NOT EXISTS monthly_cost_usd NUMERIC;
ALTER TABLE model_pricing ADD COLUMN IF NOT EXISTS notes            TEXT;

-- Seed new agent-runtime subscriptions (distinct from the Codex build-tool sub)
INSERT INTO model_pricing (provider, model_id, display_name, pricing_type, monthly_cost_usd, is_free, notes)
VALUES
  ('openai', 'chatgpt-teams', 'ChatGPT Teams', 'subscription', 55.00, false,
   'Agent runtime subscription for Lumina (Brynn). OpenAI ChatGPT Teams plan.'),
  ('openai', 'chatgpt-plus',  'ChatGPT Plus',  'subscription', 20.00, false,
   'Agent runtime subscription for Apollo (Matt). OpenAI ChatGPT first-tier plan.')
ON CONFLICT (provider, model_id, effective_from) DO UPDATE
  SET display_name     = EXCLUDED.display_name,
      pricing_type     = EXCLUDED.pricing_type,
      monthly_cost_usd = EXCLUDED.monthly_cost_usd,
      notes            = EXCLUDED.notes;

-- Link existing agents to their default models
UPDATE agents SET default_provider = 'openai', default_model_id = 'chatgpt-teams' WHERE id = 'brynn';
UPDATE agents SET default_provider = 'openai', default_model_id = 'chatgpt-plus'  WHERE id = 'apollo';
