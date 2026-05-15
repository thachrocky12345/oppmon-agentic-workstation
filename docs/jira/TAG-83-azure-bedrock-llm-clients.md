# TAG-83: Azure OpenAI + AWS Bedrock LLM Clients (TS + Python)

## Description

**Suggested Points:** 5
**Type:** Story
**Epic:** [TAG-78](./TAG-78-residency-governance-hardening-epic.md)
**Status:** Open

The current LLM factory supports Anthropic, OpenAI, Cerebras, and Ollama
(TS) plus Anthropic, OpenAI, and fake (Python via TAG-56). Regulated-sector
buyers running on AWS or Azure cannot use those — they need:

- **Azure OpenAI** with managed identity / endpoint URL
- **AWS Bedrock** with IAM role + region

This unlocks both BYO-VPC topologies (TAG-85) and a chunk of the
single-tenant managed market that is contractually required to keep all
LLM traffic inside their cloud.

## Objective

Add Azure OpenAI and AWS Bedrock LLM clients on both the TS and Python
sides, wired through the existing factories, with mocked-SDK unit tests
and corresponding provider-validator entries.

```python
# Python: apps/agent_graph_backend/agent_search/agent_v2/llm/
class AzureOpenAIClient(LLMClient): ...
class BedrockClient(LLMClient): ...
```

```ts
// TS: apps/api/src/lib/llm/
export class AzureOpenAIClient implements LLMClient { ... }
export class BedrockClient implements LLMClient { ... }
```

## Requirements

### Python side (agent_graph_backend)

Files to add:

- `apps/agent_graph_backend/agent_search/agent_v2/llm/azure_openai.py`
- `apps/agent_graph_backend/agent_search/agent_v2/llm/bedrock.py`

Wire both into the existing factory at
`apps/agent_graph_backend/agent_search/agent_v2/llm/factory.py`. The
factory dispatches on `LLMSpec.provider`.

`LLMSpec` (TAG-56) currently has `provider: Literal["anthropic", "openai",
"fake"]`. Extend to:

```python
provider: Literal["anthropic", "openai", "azure-openai", "bedrock", "fake"]
```

Add the corresponding fields to LLMSpec for Azure (endpoint URL, api
version, deployment name) and Bedrock (region, model ID).

### TS side (apps/api)

Files to add:

- `apps/api/src/lib/llm/azure-openai.ts`
- `apps/api/src/lib/llm/bedrock.ts`

Both implement the existing `LLMClient` type from `apps/api/src/lib/llm/types.ts`.
Wire into wherever `apps/api/src/services/llm.ts` dispatches by provider.

### Validators

Touch `apps/api/src/validators/providers/`:

- Add `azure.ts` (if missing) and `bedrock.ts`. These validate the
  provider connection at registration time (test call against the
  configured endpoint).

### Credentials

| Provider | Credentials |
|---|---|
| Azure OpenAI | endpoint URL + api version + deployment name + API key OR managed identity |
| Bedrock | AWS region + model ID + IAM credentials (env / role / assumed role) |

All credentials MUST stay encrypted in `secret_vault`. The per-request
client instantiates from `LLMSpec`, never from a process global. (Same
invariant as TAG-50 epic.)

## Implementation Notes

- Use the Anthropic / OpenAI / Bedrock SDKs already pinned where possible.
  Add `@aws-sdk/client-bedrock-runtime` for TS Bedrock.
- For Python Bedrock use `boto3` (lighter than the langchain wrappers).
- For Azure, use the same `openai` SDK with `azure_endpoint` and
  `api_version` parameters.
- Both clients must support streaming responses (the orchestrator
  expects an async iterator of tokens).
- A non-streaming fallback is fine for the first PR if streaming is
  hard for Bedrock; file a follow-up.

## Tests

| File | Test | Assertion |
|---|---|---|
| `apps/agent_graph_backend/.../tests/llm/test_azure_openai.py` | mocked completion | text matches |
| `apps/agent_graph_backend/.../tests/llm/test_azure_openai.py` | mocked streaming | tokens iter |
| `apps/agent_graph_backend/.../tests/llm/test_bedrock.py` | mocked completion | text matches |
| `apps/agent_graph_backend/.../tests/llm/test_bedrock.py` | region honored | mock sees `us-east-1` |
| `apps/agent_graph_backend/.../tests/llm/test_factory.py` | factory dispatches new providers | typeof matches |
| `apps/api/src/lib/llm/azure-openai.test.ts` | mocked completion | text matches |
| `apps/api/src/lib/llm/bedrock.test.ts` | mocked completion + region | matches |
| `apps/api/src/validators/providers/azure.test.ts` | valid creds → ok | passes |
| `apps/api/src/validators/providers/azure.test.ts` | invalid creds → error | clear message |
| `apps/api/src/validators/providers/bedrock.test.ts` | similar | similar |

## Acceptance Criteria

- [ ] Python `AzureOpenAIClient` + `BedrockClient` ship and pass mocked tests.
- [ ] TS `AzureOpenAIClient` + `BedrockClient` ship and pass mocked tests.
- [ ] `LLMSpec` extended (TAG-56 schema bump) to include new providers
      and their required fields.
- [ ] Factory dispatches new providers on both sides.
- [ ] Validators registered for Azure + Bedrock.
- [ ] No API keys appear in logs (TAG-84 lint, once available, must pass
      against this code).
- [ ] `docs/residency/architecture.md` "LLM factory (Python)" row gets
      the Azure + Bedrock notes flipped to ✅ with the merged commit SHA.

## Dependencies

**Depends on:** [TAG-56](./TAG-56-llmspec-schema.md) (done)
**Blocks:** [TAG-85](./TAG-85-byo-vpc-deployment-package.md), [TAG-86](./TAG-86-ui-residency-surface.md)

## Risk Factors

| Risk | Mitigation |
|---|---|
| Streaming API shape varies across providers | Define the orchestrator-facing async iterator in `LLMClient` and let each impl adapt; mark non-streaming Bedrock as a follow-up if needed. |
| Bedrock IAM is environment-dependent (assumed role vs env vs container role) | Use the SDK's default credential chain; document expected setup in `docs/residency/architecture.md` § Pillar 5.3. |
| LLMSpec schema bump breaks existing `/solve` callers | Make new fields optional with sensible defaults; existing Anthropic/OpenAI callers unaffected. |
| Azure deployment names are per-customer | Make them configurable per-LLMSpec, not per-process. |
