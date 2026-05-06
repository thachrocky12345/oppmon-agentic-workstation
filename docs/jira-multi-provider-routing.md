# Jira Epic — Multi-Provider Model Routing (Full Scope)

**Epic ID**: TAG-100
**Epic Name**: Multi-Provider Model Routing with Per-Tenant Isolation, Encrypted Secrets, and Provider Templates
**Sprint Length**: ~3 weeks (15 working days)
**Owner**: Solo founder
**Priority**: P0 — required for partner/investor demo

---

## Decisions committed (from user input)

1. **Routing infrastructure**: LiteLLM per-tenant (one container per active tenant)
2. **Key storage**: Server-side encrypted (libsodium envelope encryption with master key in env)
3. **UI complexity**: Hybrid — preset-driven UI for known providers + YAML override for power users
4. **Model selection**: Per-team default + per-project override
5. **Connection testing**: High priority — `validateConnection()` per provider, real test before save

These choices mean: enterprise-grade isolation, secure-by-default secrets, extensible to any new provider via a template, and a UX that catches credential errors before they bite. Total realistic time: 15 working days.

---

## Architectural overview — provider templates

The single most important design decision in this epic: **providers are not hardcoded**. Each provider (Anthropic, Bedrock, Azure, Cerebras, OpenAI, Ollama, OpenAI-compatible-generic) is declared as a **template**. The UI, the LiteLLM config generator, and the connection validator all read from the template.

A template looks like this conceptually:

```typescript
{
  id: "bedrock",
  display_name: "AWS Bedrock",
  category: "cloud",
  
  // Fields the user must fill in
  fields: [
    { key: "aws_region", label: "AWS Region", type: "select", 
      options: ["us-east-1", "us-west-2", "eu-west-1", ...], required: true },
    { key: "aws_access_key_id", label: "Access Key ID", type: "text", 
      secret: false, required: true },
    { key: "aws_secret_access_key", label: "Secret Access Key", type: "password", 
      secret: true, required: true },
    { key: "aws_session_token", label: "Session Token (optional)", type: "password", 
      secret: true, required: false },
    { key: "model_identifier", label: "Bedrock Model ID", type: "text",
      placeholder: "anthropic.claude-3-5-sonnet-20241022-v2:0", required: true,
      help: "Find at AWS Console → Bedrock → Model access" }
  ],
  
  // How LiteLLM should call this provider
  litellm_template: {
    model: "bedrock/{{model_identifier}}",
    aws_access_key_id: "{{aws_access_key_id}}",
    aws_secret_access_key: "{{aws_secret_access_key}}",
    aws_session_token: "{{aws_session_token}}",  // optional, omitted if blank
    aws_region_name: "{{aws_region}}"
  },
  
  // Connection test
  validate: {
    method: "litellm_completion",
    test_message: "say hi",
    expected: "any_200_response"
  },
  
  // Documentation
  docs_url: "https://docs.tag.example/providers/bedrock",
  setup_steps: ["Enable model in Bedrock console", "Create IAM user with bedrock:InvokeModel", "..."]
}
```

Adding "Together AI" or "Mistral La Plateforme" or any new provider becomes: write a template file, ship it. No UI code changes, no LiteLLM generator changes, no validator changes.

For YAML override: power users can paste raw LiteLLM YAML for a model. Stored verbatim, used directly. Bypasses the template system entirely. Documented as "advanced — you're on your own."

---

## High-level data flow

```
1. ADMIN CONFIGURES A MODEL
   Browser → /admin/models/new
     ↓ (selects provider from template list, e.g., Bedrock)
   UI renders form from template.fields
     ↓ (admin fills + clicks "Test connection")
   POST /api/models/test (in-memory only, no DB write)
     ↓ (server: temp LiteLLM call using provided creds)
   Response: { ok: true, latency_ms: 350 } OR { ok: false, error: "..." }
     ↓ (admin clicks "Save")
   POST /api/models
     ↓ (server: split secrets, encrypt, INSERT models + model_secrets)
   Event "model.upserted" → orchestrator queue

2. ORCHESTRATOR REACTS
   Worker processes "model.upserted"
     ↓
   Decrypts secrets, renders LiteLLM YAML for tenant T
     ↓
   Ensures container "litellm-tag-{T}" exists, healthy
     ↓
   Hot-reloads config OR restarts container
     ↓
   Updates tenant_routing_state.last_synced_at

3. ADMIN ASSIGNS MODEL TO TEAM
   /admin/teams/[id] → select default_model
     ↓
   PATCH /api/teams/[id] { default_model_id }
     ↓
   Audit logged

4. DEVELOPER SYNCS
   Developer runs `tag sync` in project
     ↓
   Reads project .tag/config.yaml for team + project_model_override
     ↓
   GET /api/cli/routing-config (returns gateway URL + virtual key + model name)
     ↓
   CLI writes .envrc with ANTHROPIC_BASE_URL + ANTHROPIC_AUTH_TOKEN

5. CLAUDE CODE MAKES A CALL
   `claude` reads .envrc → POST {gateway}/v1/messages
     ↓
   Front router parses Bearer token prefix → finds tenant T
     ↓
   Proxies to litellm-tag-{T}:4000/v1/messages
     ↓
   LiteLLM-T validates virtual key → routes to correct provider
     ↓
   Response flows back
```

---

## Stories — broken into estimable chunks

Stories are sized in Fibonacci points (1/2/3/5/8/13). Solo dev ratio: ~3 points = 1 day, ±50%.

---

### TAG-101 — Provider template registry

**Type**: Story
**Points**: 5
**Days**: 1.5
**Dependencies**: None — first ticket

**Description**:
Define the template system and ship initial templates for: Anthropic, Bedrock, Azure OpenAI, OpenAI, Ollama, Cerebras, OpenAI-compatible-generic.

**Acceptance criteria**:
- [ ] Type `ProviderTemplate` defined in `packages/shared/src/providers/template.ts` with: id, display_name, category, fields[], litellm_template, validate config, docs_url, setup_steps
- [ ] Template fields support: text, password, select, textarea, json. Each field has: key, label, type, secret (bool), required (bool), options? (for select), placeholder?, help?, default?
- [ ] 7 templates shipped at `packages/shared/src/providers/templates/`:
  - `anthropic.ts` (api_key, optional base_url, model_identifier)
  - `bedrock.ts` (region, access_key_id, secret_access_key, optional session_token, model_identifier)
  - `azure-openai.ts` (endpoint, api_key, deployment_name, api_version, model_identifier)
  - `openai.ts` (api_key, optional base_url, model_identifier)
  - `ollama.ts` (base_url with default `http://host.docker.internal:11434`, model_identifier)
  - `cerebras.ts` (api_key, model_identifier — uses OpenAI-compatible base_url)
  - `openai-compatible.ts` (generic: name, base_url, api_key, model_identifier — for Together, Groq, DeepSeek, Mistral, etc.)
- [ ] Function `getTemplate(id: string): ProviderTemplate | null`
- [ ] Function `listTemplates(): ProviderTemplate[]`
- [ ] Each template has a snapshot test that validates its shape against the type
- [ ] Templates exported as JSON for the frontend (tree-shaken so the API doesn't ship the whole catalog)

**Technical notes**:
- Templates are CODE, not database rows. Faster, type-checked, code-reviewed.
- Do NOT make templates user-editable in v1. That's TAG-114 (deferred).
- Cerebras uses OpenAI-compatible API — base_url defaults to `https://api.cerebras.ai/v1`. Document.
- Setup_steps is shown in the UI as a numbered list above the form. Critical for Bedrock and Azure where setup is non-obvious.

---

### TAG-102 — Database schema

**Type**: Task
**Points**: 3
**Days**: 1
**Dependencies**: TAG-101

**Description**:
Tables for models, encrypted secrets, virtual keys, per-tenant routing state, plus the project-override mechanism.

**Acceptance criteria**:
- [ ] `models` table: id, tenant_id, scope (tenant|team), team_id (nullable), display_name, provider_template_id (nullable — null means YAML-override mode), model_identifier, public_config (jsonb — non-secret field values from template), secret_ref (UUID FK to model_secrets, nullable), yaml_override (text, nullable — raw LiteLLM YAML if power-user mode), enabled, created_by, created_at, updated_at, last_synced_at, deleted_at
- [ ] `model_secrets` table: id, tenant_id, encrypted_payload (bytea), nonce (bytea), version (int — encryption algo version), created_at
- [ ] `virtual_keys` table: id, tenant_id, user_id, key_prefix (text, 8 chars), key_hash (text, bcrypt), enabled, expires_at (nullable), last_used_at (nullable), created_at, revoked_at (nullable)
- [ ] `tenant_routing_state` table: tenant_id (PK), litellm_container_name, litellm_master_key_secret_ref (FK to model_secrets), status (enum: provisioning|running|degraded|failed|stopped), last_health_check_at, last_error (text), restart_count, created_at, updated_at
- [ ] `teams` table gets: `default_model_id` (FK to models, nullable, ON DELETE SET NULL)
- [ ] `tenants` table gets: `fallback_default_model_id` (FK to models, nullable — used when team has no default)
- [ ] Indexes: `models(tenant_id, enabled, deleted_at)`, `virtual_keys(key_prefix)`, `virtual_keys(user_id, enabled)`, `tenant_routing_state(status)`, `model_secrets(tenant_id)`
- [ ] Constraint: `models` row must have either `provider_template_id` set OR `yaml_override` set, never both, never neither (CHECK constraint)
- [ ] Migrations are reversible. Down migration tested.

**Technical notes**:
- `secret_ref` indirection separates secrets from regular model data. Lets you grant a worker DB read access to `models` but not `model_secrets`.
- `yaml_override` is text not jsonb because it's raw YAML — preserve user's formatting/comments.
- Project-level overrides do NOT get a DB column — they live in the project's `tag.config.yaml` file (TAG-110).

---

### TAG-103 — Encryption service

**Type**: Task
**Points**: 5
**Days**: 1
**Dependencies**: TAG-102

**Description**:
Envelope encryption for secrets using libsodium. Master key from env var, with rotation support.

**Acceptance criteria**:
- [ ] Module `apps/api/src/crypto/secret-vault.ts` exposes: `encrypt(plaintext: string, tenantId: string): {encrypted, nonce, version}`, `decrypt(secretRef: string): string`, `rotateMasterKey(): Promise<{rotated: number}>`
- [ ] Uses `tweetnacl` or `@noble/ciphers` for XChaCha20-Poly1305
- [ ] Master key loaded from `TAG_ENCRYPTION_MASTER_KEY` env (32 bytes base64)
- [ ] CLI script `scripts/gen-master-key.ts` generates a fresh key, prints to stdout (never writes a file — user is responsible for storing it)
- [ ] Decryption fails closed: `DecryptionError` thrown for corrupt ciphertext, wrong nonce, wrong version
- [ ] Encryption never logs plaintext. Add a CI check: grep `console.log` and `console.error` for variable names matching `secret|key|password|token|credential` — fail build if found.
- [ ] Performance: 1000 encrypt+decrypt under 500ms (libsodium is fast; if slower, bug somewhere)
- [ ] Tests: roundtrip, tamper detection, wrong-key failure, version field handles future migration
- [ ] Master key rotation: supports `TAG_ENCRYPTION_MASTER_KEY` (current) + `TAG_ENCRYPTION_LEGACY_KEYS` (comma-separated, base64). Decrypt tries each. Rotation re-encrypts with current.

**Technical notes**:
- Loss of master key = irrecoverable secrets. Document this loudly. Recommend backing up master key to 1Password / cloud secret manager.
- Don't use Node's `crypto` module — its AEAD APIs are less ergonomic than tweetnacl for this.
- ⚠️ Don't roll your own. Use the library exactly as intended.

---

### TAG-104 — Connection validator (per-template)

**Type**: Story
**Points**: 8
**Days**: 1.5
**Dependencies**: TAG-101, TAG-103

**Description**:
Bulletproof connection testing — the user-prioritized feature. Each provider template declares how to validate. Server runs the test in-memory without persisting anything.

**Acceptance criteria**:
- [ ] Endpoint `POST /api/models/test` accepts `{provider_template_id, public_config, secret_config}` OR `{yaml_override}`
- [ ] Returns: `{ok: bool, latency_ms: number, model_response_sample?: string, error?: {code, message, hint?}}`
- [ ] For each preset template, validation works as follows:
  - **Anthropic**: POST to `api.anthropic.com/v1/messages` with provided key, message "say hi", expect 200
  - **Bedrock**: Use AWS SDK to POST to `bedrock-runtime.{region}.amazonaws.com/model/{modelId}/invoke`, expect 200
  - **Azure**: POST to `{endpoint}/openai/deployments/{deployment}/chat/completions?api-version={version}`, expect 200
  - **OpenAI**: POST to `api.openai.com/v1/chat/completions` (or `base_url`), expect 200
  - **Ollama**: GET `{base_url}/api/tags` (lists models — proves connectivity even if no message goes through), then POST to `{base_url}/api/chat`
  - **Cerebras**: POST to `api.cerebras.ai/v1/chat/completions`, expect 200
  - **OpenAI-compatible**: POST to `{base_url}/chat/completions`, expect 200
- [ ] For YAML override mode: spin up an ephemeral LiteLLM in a worker process with the YAML, route a "say hi" through it, kill the process
- [ ] Errors are TRANSLATED to actionable hints:
  - 401 → "Authentication failed. Check API key."
  - 403 + bedrock → "AWS credentials valid but no permission for this model. Check IAM policy includes bedrock:InvokeModel."
  - 404 + azure → "Deployment '{deployment}' not found. Check deployment name in Azure portal."
  - ECONNREFUSED + ollama → "Cannot reach Ollama at {base_url}. Is Ollama running? Try `ollama serve`."
  - Generic timeout → "Provider didn't respond within 10s. Check network connectivity."
- [ ] Timeout: 15s hard limit. If exceeded, return error.
- [ ] No data persisted. The test endpoint NEVER writes to DB. Doesn't even enter the encryption layer — secrets are decrypted only in memory.
- [ ] Rate limit: 10 tests per minute per user (anti-credential-stuffing).
- [ ] Audit log: log the *fact* that a test was attempted (with provider, success/fail), but NOT the credentials. Logging "alice@acme tested bedrock — ok" is fine; logging the access key is not.
- [ ] Unit tests with mocked HTTP for each provider's validator. Integration tests gated behind env vars (so CI doesn't need real Bedrock creds).

**Technical notes**:
- This is the highest-leverage UX feature in the epic. A green "Connected ✓" badge after typing creds is the moment of confidence.
- For YAML-override testing, ephemeral LiteLLM is heavy. Alternative: parse the YAML and dispatch to the corresponding provider validator from the preset list. Faster, but less faithful. Start with the dispatcher approach; add real ephemeral-LiteLLM testing only if users hit cases where the dispatcher misses something.
- Document the 15s timeout in the UI: "Connection test timed out. This could mean the provider is slow or unreachable."

---

### TAG-105 — Model registry CRUD API

**Type**: Story
**Points**: 5
**Days**: 1
**Dependencies**: TAG-102, TAG-103, TAG-104

**Description**:
REST endpoints for the models lifecycle, with RBAC, audit, and the YAML-override mode.

**Acceptance criteria**:
- [ ] `POST /api/models`: accepts either preset mode `{provider_template_id, public_config, secret_config, ...}` or YAML mode `{yaml_override, ...}`. Validates the active mode strictly. Splits secrets, encrypts, inserts both rows in a transaction. Triggers `model.upserted` event.
- [ ] `GET /api/models`: RBAC-scoped list. Each row includes `has_secret: bool`, `secret_set_at`, NEVER the secret values. For YAML mode rows, returns the YAML (it's not "secret" per se but mark `contains_secrets: true` so the UI shows masked).
- [ ] `GET /api/models/:id`: same — no secrets in response.
- [ ] `PATCH /api/models/:id`: updates fields. If new secrets provided, encrypts and updates `secret_ref` (the old `model_secrets` row is soft-deleted, not hard — for audit). Triggers `model.upserted`.
- [ ] `DELETE /api/models/:id`: soft delete. Sets `enabled=false` and `deleted_at`. Triggers `model.deleted` event. Cascade behavior: any team's `default_model_id` → NULL with admin notification.
- [ ] `POST /api/models/:id/rotate-secret`: dedicated endpoint for rotation. Accepts new secret values, re-encrypts, updates `secret_ref`. Audit logged separately from general updates.
- [ ] All mutations write `audit_log` rows. Action types: `model.create | model.update | model.delete | model.rotate_secret | model.toggle_enabled`. Before/after JSON excludes secret values.
- [ ] RBAC: tenant_admin → all models in tenant; team_admin → CRUD on `scope=team` models for teams they admin; member → read-only.
- [ ] Zod schemas in `packages/shared` validate per-template. Submit `{provider: 'bedrock', public_config: {aws_region: ''}}` → fails with "aws_region is required".
- [ ] Cross-tenant test: try to GET a model from a different tenant → returns 404 (don't leak existence). Test exists.

**Technical notes**:
- The `model.upserted` event uses Postgres LISTEN/NOTIFY for now. If you need durability later, swap to a real queue. Don't over-engineer.
- For YAML mode: parse the YAML server-side to confirm it's valid YAML and matches LiteLLM's basic shape (has `model_list`). Don't try to validate every field — that's what the connection test is for.
- ⚠️ The `secret_config` field name in the API contract should be explicit: never call it `config` alone, never let secrets bleed into `public_config`.

---

### TAG-106 — Per-tenant LiteLLM container orchestration

**Type**: Story
**Points**: 13
**Days**: 2.5
**Dependencies**: TAG-102, TAG-103
**⚠️ Riskiest ticket in the epic**

**Description**:
The container lifecycle service. Listens to `model.upserted` / `model.deleted`, manages per-tenant containers, handles config regeneration, health checks, restarts.

**Acceptance criteria**:
- [ ] Service `apps/api/src/services/litellm-orchestrator.ts` exposes: `ensureRunning(tenantId)`, `stop(tenantId)`, `reloadConfig(tenantId)`, `healthCheck(tenantId)`, `removeContainer(tenantId)`
- [ ] Container provisioning logic:
  - Image: `ghcr.io/berriai/litellm:main-latest` (pinned to a specific tag in production)
  - Name: `litellm-tag-{tenantId}` (deterministic — survives orchestrator restart)
  - Network: internal-only, no published ports
  - Volume: `/var/lib/tag/litellm-configs/{tenantId}.yaml` mounted as `/app/config.yaml`
  - Resource limits: `--memory=512m --cpus=1` (configurable per tenant for paid tiers)
  - Restart policy: `unless-stopped`
  - Master key: per-tenant, generated on first provision, stored encrypted in `tenant_routing_state`, decrypted to env var at container start
- [ ] State machine:
  ```
  provisioning → running → degraded → running (recovered)
                       ↘ failed (after 3 failed restarts)
              ↘ stopped (manual or no enabled models)
  ```
- [ ] `ensureRunning(tenantId)`:
  - Acquires Postgres advisory lock keyed on tenantId
  - Checks state. If `running` and healthy → no-op
  - If `provisioning` (race) → wait up to 30s
  - If no container → create
  - Releases lock
- [ ] `reloadConfig(tenantId)`:
  - Regenerates YAML (TAG-107)
  - Tries hot-reload via `POST {container}:4000/model/info?reload=true` with master key auth
  - On reload failure: `docker restart` the container (3-5s downtime)
  - On restart failure 3 times → mark `failed`, alert (log for now, email v2)
  - Updates `last_synced_at`
- [ ] `healthCheck(tenantId)`:
  - GET `{container}:4000/health`, 5s timeout
  - Updates `last_health_check_at` and `last_error`
  - Returns `{healthy, version, lastError}`
- [ ] Background job: every 60s, calls `healthCheck` on every `running` tenant. Auto-restart unhealthy ones (max 3 attempts with exponential backoff, then `failed`).
- [ ] Race-safe: 5 concurrent `ensureRunning(T)` calls → 1 container created. Test exists.
- [ ] Cleanup: when last enabled model is deleted for a tenant, `removeContainer` called. Container stopped + removed, config file deleted, state set to `stopped`.

**Technical notes**:
- Use `dockerode` (Node Docker SDK), NOT shelling out to `docker` CLI.
- The internal network is critical. Check: from outside Docker, port 4000 of the LiteLLM container should be unreachable.
- Master key per tenant: don't cross-contaminate. If tenant A's key leaked, tenant B's traffic must remain safe.
- Hot reload reliability is the main risk. Test exhaustively. The `docker restart` fallback is your insurance — make sure it's wired in before anything depends on hot reload.
- Production caveat: at 20 active tenants, this is 20 containers using 5+ GB RAM. Update the deployment sizing doc. Consider a "warm pool" of started containers for tenants with no model activity for >7 days (defer to v2).

---

### TAG-107 — LiteLLM config YAML generator

**Type**: Task
**Points**: 5
**Days**: 1
**Dependencies**: TAG-101, TAG-106

**Description**:
Pure function: list of models (preset or YAML-override) → valid LiteLLM config YAML.

**Acceptance criteria**:
- [ ] Function `generateLitellmConfig(models, masterKey, tenantId): string`
- [ ] For preset-mode models: instantiate the template's `litellm_template` with the model's `public_config + decrypted secrets`. Mustache-style substitution.
- [ ] For YAML-override-mode models: parse the user's YAML, extract the `model_list` entries, merge with preset entries.
- [ ] Output is valid LiteLLM v1.81+ config syntax. Verify against their schema.
- [ ] `general_settings.master_key` set to the per-tenant master key.
- [ ] `litellm_settings.drop_params: true` and `set_verbose: false` always (prevent secret logging).
- [ ] `general_settings.virtual_keys` populated from the tenant's `virtual_keys` rows — each key declares which models it can access (initially: all enabled models for the team).
- [ ] No secret values in YAML log output. Function does not call `console.log` on the result. Caller writes to disk with mode 0600.
- [ ] If a required template field is missing → throws `InvalidModelConfig` with field name. Don't write partial YAML.
- [ ] Unit tests: snapshot test per template, edge cases (empty models, mixed preset+YAML, single YAML-only).

**Technical notes**:
- LiteLLM config schema: https://docs.litellm.ai/docs/proxy/config_settings (verify your version)
- For Ollama on Linux: ensure container has `extra_hosts: ["host.docker.internal:host-gateway"]` in docker-compose. Document this. On Mac/Windows it's automatic.
- Mustache substitution: use a real lib (`mustache.js`) — handle missing values, escaping, etc.

---

### TAG-108 — Front router (custom Node proxy)

**Type**: Story
**Points**: 8
**Days**: 1.5
**Dependencies**: TAG-106

**Description**:
The reverse proxy sitting in front of LiteLLM containers. Routes incoming requests to the right tenant's container based on virtual key prefix.

**Acceptance criteria**:
- [ ] New service `apps/router` — small Express + `http-proxy-middleware` server
- [ ] Listens on `:8080` internally (Caddy/Nginx in front handles HTTPS in production)
- [ ] Incoming `POST /v1/messages` (or any `/v1/*` path):
  - Parse `Authorization: Bearer sk-tag-<prefix>-<rest>`
  - Look up `(prefix, hash) → (tenant_id, enabled, expired)` from `virtual_keys` table
  - In-memory cache: `prefix → tenant_id` for 60s, invalidated on virtual_keys change via PG NOTIFY
  - If valid: proxy to `litellm-tag-{tenantId}:4000{path}` preserving headers + body
  - If invalid prefix: 401 `{"error": "invalid_api_key"}`
  - If revoked/expired: 401 `{"error": "key_revoked_or_expired"}`
  - If tenant container unhealthy: 503 `{"error": "service_unavailable", "retry_after": 30}` (don't leak tenant id)
- [ ] Per-virtual-key rate limit: 100 req/min default, configurable per tenant. Use `express-rate-limit` with Redis backend (or in-memory for v1).
- [ ] Update `virtual_keys.last_used_at` on successful proxy (debounced — once per 60s per key).
- [ ] Access log: timestamp, virtual_key_prefix (NEVER full key), tenant_id, path, status, latency. NO request body, NO response body.
- [ ] Health endpoint `GET /health`: 200 if router is up. Doesn't check downstream containers (separate `/ready` endpoint does that).
- [ ] Graceful shutdown: stop accepting new, finish in-flight, exit.

**Technical notes**:
- Don't use Caddy modules unless you already know them. Custom Node is ~200 LOC and you'll fully understand it.
- bcrypt verify on every request would be slow. Strategy: prefix lookup is indexed and fast. Then cache the `prefix → tenant_id` mapping for 60s. Verify the bcrypt hash on cache miss only. If you need higher throughput, switch hashing to argon2id with low cost factor (don't use SHA — these aren't passwords, they're API keys).
- Actually — re-evaluate: an API key can use HMAC instead of bcrypt. HMAC is fast, doesn't need cache, still secure as long as the HMAC key is protected. Consider this if request rate is high.
- For demo: in-memory rate limiting is fine. Move to Redis when you have multi-instance.

---

### TAG-109 — Virtual key management

**Type**: Story
**Points**: 5
**Days**: 1
**Dependencies**: TAG-102, TAG-108

**Description**:
Generate, list, revoke virtual keys. Self-serve in user settings. CLI auto-mints on first sync.

**Acceptance criteria**:
- [ ] `POST /api/virtual-keys`: creates a key. Format: `sk-tag-{8charPrefix}-{32charSecret}`. Returns plaintext ONCE in response, then never again. Stores prefix + bcrypt hash (or HMAC — see TAG-108 notes).
- [ ] `GET /api/virtual-keys`: returns user's own keys. Shows: prefix, label, created_at, last_used_at, enabled, expires_at. Never the full key.
- [ ] `DELETE /api/virtual-keys/:id`: revokes (sets `enabled=false`, `revoked_at=now()`). Doesn't delete row — needed for audit.
- [ ] `POST /api/virtual-keys/:id/rotate`: revokes old, creates new in single transaction, returns plaintext of new key.
- [ ] UI page `/settings/api-keys`: table of user's keys with "Revoke" and "Rotate" actions. "Create new key" dialog with optional label and expiry.
- [ ] After creation, modal shows the plaintext key with "copy and save now — you won't see it again" warning. Includes a "I've saved it" confirmation button before closing.
- [ ] CLI `tag login` auto-mints a key on first run, stores in OS keychain via `keytar`.
- [ ] CLI `tag rotate-key` rotates the local key.
- [ ] Audit logged for every create, revoke, rotate.

**Technical notes**:
- 8-char prefix from base32 alphabet (no ambiguous chars like 0/O/1/l): 32^8 = ~1 trillion combinations. Collisions vanishingly unlikely. Add unique constraint anyway.
- The "show plaintext once" pattern is industry standard (GitHub PATs, Stripe keys). Users are familiar.
- `last_used_at` debouncing: don't update on every request — once per minute is fine and reduces DB load.

---

### TAG-110 — Project-level model override

**Type**: Story
**Points**: 3
**Days**: 0.75
**Dependencies**: TAG-105

**Description**:
Per-user-asked feature: a project can override the team's default model.

**Acceptance criteria**:
- [ ] `tag.config.yaml` (project-scoped, checked into repo) supports new optional field:
  ```yaml
  team: engineering
  model: bedrock-claude-sonnet  # optional override; refers to a model display_name in the tenant
  ```
- [ ] On `tag sync`: CLI reads tag.config.yaml; if `model` is specified, sends to `GET /api/cli/routing-config?model=<name>`; if user has access to that model (via team or tenant scope), use it; if not, error with clear message.
- [ ] If `model` is not specified, fall back to team default.
- [ ] If team has no default, fall back to tenant fallback default.
- [ ] If no defaults exist anywhere, error: "No model configured. Ask your admin to set a default for your team."
- [ ] CLI prints which model is being used in a one-line summary on every sync: "Routing → Bedrock Claude Sonnet (project override)".
- [ ] Test: project A overrides to model X (allowed), project B inherits team default Y, project C tries to override to model Z (not allowed by RBAC) → fails with clear error.

**Technical notes**:
- The override is by `display_name`, not by ID. Display names are stable across tenants; IDs change. Names within a tenant are unique (add unique constraint on `(tenant_id, display_name)` in TAG-102 if not already there).
- Don't allow override to a *team* the user isn't in — even if the model display name matches. Always re-validate access on the server side.

---

### TAG-111 — Admin UI: Model list + add/edit (preset mode)

**Type**: Story
**Points**: 8
**Days**: 1.5
**Dependencies**: TAG-101, TAG-104, TAG-105

**Description**:
The flagship admin UI. Template-driven dynamic form for adding models. Test-connection button is the centerpiece.

**Acceptance criteria**:
- [ ] `/admin/models` page: paginated table of models. Columns: display_name, provider (icon + name), scope, team, enabled toggle, last_synced_at, actions.
- [ ] "Add Model" button → step 1 dialog: choose provider from a grid of cards (icon + name + category). Each card has a "Setup help" link to docs. Last card: "Custom OpenAI-compatible". Last+1 option (small link below grid): "Use raw YAML (advanced)" → switches to TAG-112 mode.
- [ ] Step 2: form rendered DYNAMICALLY from `template.fields`:
  - Each field renders as the appropriate input type
  - Required fields marked with asterisk
  - Help text appears below each field
  - Secret fields have password masking + show/hide toggle
  - Select fields populated from template options
  - Setup steps show as a collapsible section above the form
- [ ] "Test Connection" button at bottom (always visible):
  - Disabled until all required fields filled
  - On click: POST `/api/models/test`, show spinner
  - Result: green check + latency ("Connected ✓ — 320ms") OR red X + error message + hint
  - Re-clickable as user adjusts fields
- [ ] "Save" button: disabled until connection test passed at least once OR user explicitly clicks "Save without testing" (small link below button — anti-pattern that the user asked for, with a confirmation)
- [ ] Edit dialog: same form, secret fields show "[set on Apr 12]" with "Replace" button that opens a separate field for new value
- [ ] Delete: confirmation requires typing the model name (anti-fat-finger)
- [ ] Toggle enabled: instant, with audit log; UI shows toast "Disabled — propagating to clients within 60s"
- [ ] Scope picker: tenant or team radio. If team, dropdown of teams the admin can assign to.

**Technical notes**:
- Use react-hook-form + zod resolver. Build the zod schema dynamically from `template.fields`.
- Use shadcn/ui components throughout: Dialog, Form, Input, Select, Switch, Button, Toast.
- The provider grid in step 1: 7 cards (anthropic, bedrock, azure, openai, ollama, cerebras, openai-compatible) + advanced YAML link. Use brand-appropriate icons (you can find SVGs of provider logos; verify usage rights).
- Test-connection latency display is a small UX delight that reads as "this thing is real."
- "Save without testing" is intentionally annoying — confirmation modal asks "Are you sure? Untested credentials may break Claude Code for your team." This nudges the right behavior without blocking power users.

---

### TAG-112 — Admin UI: YAML override mode

**Type**: Story
**Points**: 5
**Days**: 1
**Dependencies**: TAG-105, TAG-111

**Description**:
Power-user mode — paste raw LiteLLM YAML. The "hybrid" requirement from the user.

**Acceptance criteria**:
- [ ] When user clicks "Use raw YAML (advanced)" in step 1 of TAG-111, opens a different dialog
- [ ] Single field: large Monaco editor for YAML, ~30 rows tall, syntax-highlighted, with line numbers
- [ ] Placeholder content: a working example with a comment explaining what to do
- [ ] Server-side validation on save:
  - Valid YAML syntax (parse error → inline message)
  - Has required top-level keys: `model_list`
  - Each `model_list` entry has `model_name` and `litellm_params.model`
  - Don't validate provider-specific shape — that's the user's problem in this mode
- [ ] "Test Connection" button still present, but with a warning banner: "Testing YAML mode spins up a temporary LiteLLM in a worker process. Slower than preset testing."
- [ ] Connection test for YAML: launches an ephemeral LiteLLM worker, applies the YAML, sends a test message, kills the worker. 30s timeout (longer than preset 15s).
- [ ] Documentation link prominently placed: link to LiteLLM's config docs.
- [ ] Display in model list: YAML-mode rows show "Custom YAML" as the provider badge, with a "View YAML" action that opens read-only viewer.
- [ ] Edit YAML mode: full editor again. Diff view ("what changed") shown at save time.

**Technical notes**:
- Monaco is heavy. Lazy-load it (`React.lazy + Suspense`). Don't include in the main bundle.
- Don't try to make the YAML editor too smart. Users who choose this mode want raw control. Just check syntax + minimum required structure.
- Worker process for YAML testing: use `node:worker_threads` or spawn a child process. Kill on timeout. Don't let it leak beyond the test.

---

### TAG-113 — Admin UI: Team default + tenant fallback

**Type**: Task
**Points**: 3
**Days**: 0.5
**Dependencies**: TAG-111

**Description**:
Wire up the team default and tenant-wide fallback model selection.

**Acceptance criteria**:
- [ ] `/admin/teams/:id` page: new "Default model" section
  - Dropdown of models the team can use (tenant-scoped + team-scoped to this team)
  - "None — use tenant fallback" as first option
  - Save triggers PATCH /api/teams/:id with audit log
- [ ] `/admin/settings` (tenant-wide): new "Fallback default model" dropdown
  - Used when team has no default
  - Models scoped to tenant only
- [ ] If a team's default is deleted, show a yellow banner on the team page: "Default model was deleted — using tenant fallback". Same for tenant fallback.
- [ ] Show current effective default in the team page: "Effective default: Bedrock Claude Sonnet (set on this team)" or "(via tenant fallback)".

---

### TAG-114 — CLI: routing config endpoint + sync integration

**Type**: Story
**Points**: 5
**Days**: 1
**Dependencies**: TAG-105, TAG-108, TAG-109, TAG-110

**Description**:
The CLI side. `tag sync` writes the right `.envrc`, handles project overrides, surfaces errors clearly.

**Acceptance criteria**:
- [ ] `GET /api/cli/routing-config?project_team={team}&model_override={model_name?}` returns: `{gateway_url, virtual_key_or_use_existing, model_name, provider, expires_at}`
- [ ] If user has no virtual key yet → server returns `{action: "needs_key"}` and CLI prompts to create one
- [ ] If override model not allowed → returns 403 with clear message including which model and why
- [ ] CLI writes to `.envrc`:
  ```
  # --- tag managed (do not edit) ---
  export ANTHROPIC_BASE_URL="https://gateway.tag.example"
  export ANTHROPIC_AUTH_TOKEN="sk-tag-..."
  # Routing: Bedrock Claude Sonnet (team default for engineering)
  # --- end tag managed ---
  ```
- [ ] Preserves user-added env vars outside markers
- [ ] Detects direnv. If installed: prints "Run `direnv allow` to activate". If not: prints "Run `source .envrc` (or install direnv: https://...)".
- [ ] Auto-adds `.envrc` to `.gitignore` (with confirmation prompt — "This file contains your API token. Add to .gitignore? [Y/n]")
- [ ] One-line summary printed: `Routing → Bedrock Claude Sonnet (team: engineering, project override)` if override; `Routing → Anthropic Claude (team default)` otherwise.
- [ ] Handles failure modes:
  - No team configured in tag.config.yaml → prompts to run `tag init`
  - User not in any team → "Ask your admin to add you to a team"
  - No model configured anywhere → "Ask your admin to configure a model"
  - Override model not accessible → "Project requests model 'X' but you don't have access. Falling back to team default? [Y/n]"

**Technical notes**:
- The "action: needs_key" response avoids forcing users into a separate `tag init-keys` step. Sync just does the right thing.
- The .gitignore prompt is critical — committing the AUTH_TOKEN is the single worst credential leak vector for this system.
- If user runs `tag sync` on a machine where `direnv` isn't installed and they don't `source .envrc`, Claude Code will use Anthropic-direct (or whatever ANTHROPIC_AUTH_TOKEN is set elsewhere). Document this gotcha clearly.

---

### TAG-115 — End-to-end smoke test

**Type**: Task
**Points**: 3
**Days**: 0.5
**Dependencies**: TAG-101 through TAG-114

**Description**:
The single test that proves the whole system works.

**Acceptance criteria**:
- [ ] `scripts/smoke-multi-provider.sh` does:
  1. Reset DB, restart all services
  2. Sign up alice@demo (auto-tenant)
  3. As alice: create model "Anthropic Direct" via API (preset mode, real Anthropic key from env)
  4. Test connection → expect success
  5. Create model "Local Ollama" (preset mode, assumes Ollama running locally with llama3 pulled)
  6. Test connection → expect success
  7. Wait for tenant LiteLLM container to provision (poll `tenant_routing_state.status` until `running`, max 60s)
  8. Create teams: Engineering (default: Anthropic), Marketing (default: Ollama)
  9. Add bob@demo to Engineering, carol@demo to Marketing
  10. As bob: tag init in `/tmp/eng-project`, tag sync → verify `.envrc` written with Anthropic routing
  11. Make actual call: `source .envrc && curl -X POST $ANTHROPIC_BASE_URL/v1/messages ...` → expect 200, valid JSON, content from Anthropic
  12. As carol: same in `/tmp/mkt-project`, expect Ollama routing
  13. Make actual call → expect 200, content from Ollama
  14. Bob attempts to use carol's virtual key → 401
  15. Bob tries to override project to Ollama (not in his team) → 403 with clear error
  16. Alice rotates Anthropic model's API key → next bob `tag sync` still works (config regenerated, virtual key unchanged)
  17. Alice disables Anthropic model → bob next call returns 503 OR falls back gracefully (define which is desired)
  18. Cleanup: remove all containers, models, tenants
- [ ] Script exits 0 on full success, 1 with diagnostic on first failure
- [ ] Total runtime under 5 minutes
- [ ] Run in CI on every PR touching the routing modules

**Technical notes**:
- Steps 11 and 13 are load-bearing. Without real LLM responses, the test is theatre.
- For CI: gate the real-LLM-call steps behind an env var (so PRs don't burn money on every push). Run the full version on a manual trigger or nightly.
- Step 16 (key rotation while in flight) is a real-world test that catches all sorts of subtle bugs. Worth its weight.

---

### TAG-116 — Documentation

**Type**: Task
**Points**: 3
**Days**: 0.5
**Dependencies**: All previous tickets

**Description**:
User-facing docs. The system is only as good as its docs in self-serve mode.

**Acceptance criteria**:
- [ ] `docs/providers/` has one page per preset provider: setup steps, common errors, example config
  - `anthropic.md`, `bedrock.md`, `azure.md`, `openai.md`, `ollama.md`, `cerebras.md`, `openai-compatible.md`
- [ ] `docs/yaml-mode.md`: when to use, examples, limitations
- [ ] `docs/routing-architecture.md`: high-level explanation for technical evaluators (link to from pitch deck)
- [ ] `docs/troubleshooting.md`:
  - "Connection test fails for Bedrock with 403" → IAM steps
  - "Ollama unreachable from Tag" → Linux host networking
  - "tag sync says no models configured" → admin steps
  - "claude command says ANTHROPIC_AUTH_TOKEN not set" → direnv steps
- [ ] Each provider page has a "Test your config" curl snippet so users can verify outside the UI
- [ ] In-app: every error message in the UI links to the relevant doc page

---

### TAG-117 — Operational dashboards (DEFERRED)

**Type**: Story
**Points**: 8
**Days**: 1.5
**Status**: Deferred to v2

**Description**:
Per-tenant model usage, error rates, container health visualization, costs by provider.

**Why deferred**: Not on critical path to first 5 design partners. Build when a paying customer asks.

---

## Sprint plan — full scope

15 working days, mapping into your 33-day plan:

| Day | Tickets | Critical Notes |
|---|---|---|
| 1 | TAG-101 (templates) | Foundation — everything depends on this |
| 2 | TAG-102 (DB schema) | Migrations applied + reversible |
| 3 | TAG-103 (encryption) | Day for crypto correctness |
| 4 | TAG-104 (validators) part 1 | Build framework + 3 validators |
| 5 | TAG-104 part 2 | Remaining validators + error translation |
| 6 | TAG-105 (CRUD API) | Endpoints + RBAC tests |
| 7 | TAG-106 (orchestrator) part 1 | ⚠️ The hard day |
| 8 | TAG-106 part 2 | Health checks, restart logic |
| 9 | TAG-106 part 3 | Race-safety, advisory locks |
| 10 | TAG-107 (YAML gen) + TAG-108 (router) part 1 | |
| 11 | TAG-108 part 2 | Rate limit, caching, audit logs |
| 12 | TAG-109 (virtual keys) | Backend + UI |
| 13 | TAG-111 (admin UI preset) | The flagship UI |
| 14 | TAG-112 (YAML mode UI) + TAG-113 (team default) | |
| 15 | TAG-110 + TAG-114 (CLI) + TAG-115 (smoke) + TAG-116 (docs) | The "make it work end-to-end" day |

**Note on day 15**: that's a packed day. Realistically expect to slip into days 16-17 for buffer. Plan accordingly.

---

## Inserting into the 33-day plan

The original plan had 3 days for routing (Days 24-26). This epic is 15 days. Three options:

**Option A — Honor the full scope.** Plan grows from 33 days to 45 days. Partner demo moves from Day 30 to Day ~42. Honest with yourself.

**Option B — Compress to 8 days.** Drop YAML mode (TAG-112), drop Cerebras + OpenAI-compatible from initial templates (just ship Anthropic + Bedrock + Ollama), use shared LiteLLM instead of per-tenant, defer key rotation, defer per-project override. You hit the demo on Day 30 but the product is meaningfully less.

**Option C — Compress to 12 days.** Keep YAML mode, drop per-tenant LiteLLM (use shared with virtual key isolation), keep all preset templates, defer per-project override. Plan grows from 33 to 38 days. Reasonable middle path.

My recommendation given the demo is the priority: **Option C**. You keep the differentiating features (templates + YAML override + connection testing + 6 providers) and lose the operational complexity of per-tenant containers (which can be a v2 enterprise upsell). 5 extra days, dramatically less risk.

---

## Risk register

Three risks worth pre-mitigating:

1. **TAG-106 (orchestrator) takes longer than 2.5 days.** Mitigation: have the `docker restart` fallback ready from day one — never depend solely on hot-reload working. Keep an Option-C fallback (shared LiteLLM) ready to swap in if Day 8 isn't done.
2. **Connection validators flake on real provider APIs.** Mitigation: build with mocked HTTP first. Real-API tests gated behind env vars. CI runs mocks; nightly runs real.
3. **Per-tenant container memory pressure.** Mitigation: monitor host memory in CI/staging from day 1. Add the host-memory alarm before adding the 5th tenant.

---

## What success looks like

When this epic is done:

- An admin can sign up, click "Add Model", pick Bedrock, fill in 4 fields, click "Test", see green ✓, click Save — and within 60 seconds, their team's Claude Code routes through Bedrock.
- A power user can paste a 50-line LiteLLM YAML, test it, save it, and it works.
- A new provider (e.g., Mistral) takes ~50 lines of TypeScript to ship as a preset.
- The whole system survives a tenant's API key rotation, a container crash, and 10 concurrent admin actions on the same model.

That's the bar.
