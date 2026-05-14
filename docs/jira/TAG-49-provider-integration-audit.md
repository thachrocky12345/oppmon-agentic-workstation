# TAG-49: Provider Integration Audit — agent_search ↔ OppMon Admin

## Description

**Suggested Points:** 2 (Low — audit/report, no code)
**Type:** Spike / Research
**Status:** Done (findings captured)

Audit of the 7 LLM providers exposed in the OppMon admin "Choose a Provider" UI
versus the actual integration status in `apps/agent_graph_backend/agent_search`.
Establishes the baseline before TAG-50 (the authenticated `/solve` endpoint) and
informs which providers are usable by `agent_search` today vs. need work.

## Objective

For each provider listed in the OppMon admin UI:

1. Identify the UI template (fields, defaults, capabilities) in
   `packages/shared/src/providers/templates/`.
2. Identify the matching Python client in
   `apps/agent_graph_backend/agent_search/agent_v2/llm/` (if any).
3. Score the integration effort needed for `agent_search` to use it.
4. Document tool-calling support (mandatory — the planner agent requires it).

## Findings Summary

| OppMon UI Provider | Template | agent_search Client | Status | Tool-calling |
|---|---|---|---|---|
| Anthropic | `anthropic.ts` | `anthropic_client.py` | ✅ Done | Yes |
| OpenAI | `openai.ts` | `openai_client.py` | ✅ Done | Yes (o-series caveat) |
| Cerebras | `cerebras.ts` | `cerebras_client.py` (new) | ✅ Done | Yes |
| Azure OpenAI | `azure-openai.ts` | none | ⚠️ Small work | Yes |
| AWS Bedrock | `bedrock.ts` | none | ❌ Medium work | Yes |
| Ollama | `ollama.ts` | none | ❌ Small work | Model-dependent |
| OpenAI-Compatible | `openai-compatible.ts` | via `openai_client.py` w/ `api_base` | ✅ Done | Model-dependent |

## Verified Cerebras Models

Tested via `LLMClient.chat()` with multi-turn tool roundtrip (the actual planner
call site):

| Model | Tool-call turn 1 | finalize turn 2 | Notes |
|---|---|---|---|
| `llama3.1-8b` | ✅ | ✅ (shortcut on trivial Qs) | OK for simple workloads |
| `gpt-oss-120b` | ✅ | ⚠️ needs `tool_choice="required"` | Recommend prompt hardening |
| `qwen-3-235b-a22b-instruct-2507` | ✅ (3 sub-Qs) | ✅ | **Recommended default** for planner |
| `zai-glm-4.7` | ✅ (3 sub-Qs + reasoning) | ✅ | Strongest reasoning trace |

## Per-Provider Detail

### Anthropic — DONE

- **UI fields:** `api_key`, `model` (select: 5 Claude versions), `max_tokens`.
- **Backend:** Native Messages API + `tool_use` blocks. Lazy `anthropic` SDK import.
- **Wired via:** `create_llm_client()` + `create_llm_client_from_spec('anthropic', ...)`.
- **Gotchas:** None. UI `model` values are valid Anthropic API IDs.

### OpenAI — DONE

- **UI fields:** `api_key`, `organization_id` (optional), `model` (select), `max_tokens`.
- **Backend:** `openai_client.py` uses `AsyncOpenAI` SDK with optional `base_url`.
- **Gotchas:**
  - `organization_id` is NOT plumbed through `OpenAIClient` yet.
  - `o1-preview` / `o1-mini` / `o3-mini` do NOT reliably support tool-calling. UI must filter or warn.

### Cerebras — DONE (TAG-49 + this session)

- **UI fields:** `api_key`, `model` (free-text today; should become select), `max_tokens`.
- **Backend:** `cerebras_client.py` subclasses `OpenAIClient`, pins `base_url=https://api.cerebras.ai/v1`.
- **Follow-up:** Convert UI `model` field from `text` to `select` with the 4 verified models. **Tracked separately (small UI ticket).**

### Azure OpenAI — SMALL WORK

- **UI fields:** `api_key`, `api_base`, `deployment_name`, `api_version`, `model` (informational), `max_tokens`.
- **Backend:** No client today. The `openai` SDK already ships `AsyncAzureOpenAI` which handles SigV4-style URL shape and `api-key` auth header.
- **Effort:** ~50 LOC subclass that constructs `AsyncAzureOpenAI(api_key, api_version, azure_endpoint)` and calls `.chat.completions.create(model=deployment_name, ...)`. Reuses existing `_msg_to_openai` / `_tool_to_openai` helpers.
- **Config additions:** `azure_openai_api_key`, `azure_openai_endpoint`, `azure_openai_deployment`, `azure_openai_api_version`, `azure_openai_max_tokens`.

### AWS Bedrock — MEDIUM WORK

- **UI fields:** `auth_method` (iam_keys|iam_role|profile), `aws_access_key_id`, `aws_secret_access_key`, `aws_profile`, `aws_region_name`, `model` (select: 7 Claude versions in `anthropic.claude-*-v1:0` form), `max_tokens`.
- **Backend:** No client today. Bedrock uses SigV4 auth + Bedrock-envelope request shape.
- **Two paths:**
  - **A. Direct via `boto3` + bedrock-runtime** — ~150-200 LOC; requires `boto3` dependency.
  - **B. Route through `apps/router` LiteLLM proxy** — zero `agent_search` code; LiteLLM already speaks Bedrock natively. **Recommended.**

### Ollama — SMALL WORK

- **UI fields:** `api_base`, `model` (select: 11 popular models), `custom_model`, `num_ctx`.
- **UI flag:** `supportsFunctionCalling: false` (conservative).
- **Reality:** Modern Ollama models DO support tools via `/v1/chat/completions`:
  - ✅ `llama3.1`, `llama3.2`, `llama3.3:70b`, `qwen2.5`, `mistral-nemo`
  - ❌ `codellama`, `phi3`, `gemma2`
- **Integration:** Reuse `OpenAIClient` with `api_base = ui.api_base + '/v1'`. Works today through `create_llm_client_from_spec('openai_compatible', ...)`.
- **Gotcha:** Ollama on host is unreachable from container by default — use `host.docker.internal:11434` on Win/Mac, `--network=host` on Linux dev.

### OpenAI-Compatible — DONE

- **UI fields:** `provider_name` (preset), `api_base`, `api_key`, `model`, `max_tokens`, `extra_headers`.
- **Backend:** Covered via `create_llm_client_from_spec('openai_compatible', api_key, model, api_base)`.
- **Gotchas:**
  - `extra_headers` is NOT plumbed through `OpenAIClient` (OpenRouter/Perplexity need it).
  - Tool-calling varies wildly across endpoints:
    - ✅ Groq, Together, Fireworks
    - ❌ Perplexity (sonar)
    - Depends-on-backing-model: OpenRouter, Replicate

## Architectural Recommendations

1. **Define a typed `LLMSpec` Pydantic schema** before wiring more providers.
   Becomes the wire contract for the future `/solve` payload override.
2. **Don't have `agent_search` hold tenant API keys at rest.** Either
   (a) pass plaintext key in `/solve` payload over the swarm overlay net, or
   (b) `agent_search` calls `apps/api` to fetch a scoped credential.
   Choice deferred to TAG-50.
3. **Route Bedrock + Azure through LiteLLM (`apps/router`)** rather than writing
   direct Python clients. Maintenance cost much lower.
4. **Capability-gate model dropdowns in the UI** by `supportsFunctionCalling`
   to prevent picking incompatible models for the planner.

## Acceptance Criteria

- [x] All 7 OppMon UI providers inventoried.
- [x] Cerebras client implemented and 4 models verified end-to-end.
- [x] Integration effort scored per provider.
- [x] Architectural recommendations captured.

## Dependencies

**Blocks:** TAG-50 (authenticated `/solve` endpoint)
**Depends on:** none

## Files Touched

```
apps/agent_graph_backend/agent_search/agent_v2/config.py          (edited)
apps/agent_graph_backend/agent_search/agent_v2/llm/__init__.py    (edited)
apps/agent_graph_backend/agent_search/agent_v2/llm/factory.py     (rewritten)
apps/agent_graph_backend/agent_search/agent_v2/llm/cerebras_client.py  (new)
apps/agent_graph_backend/.env                                     (edited)
apps/agent_graph_backend/.env.example                             (edited)
```

## Risk Factors

| Risk | Mitigation |
|---|---|
| Cerebras API rate limit during evals | Cerebras free tier is generous; switch to paid for prod. |
| `o*` models picked by user → planner breaks | UI capability gate (separate ticket). |
| Ollama unreachable from swarm | Documented host-network workaround in deploy runbook. |
