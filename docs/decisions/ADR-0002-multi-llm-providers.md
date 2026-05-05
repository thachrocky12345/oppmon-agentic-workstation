# ADR-0002: [AUTO] Multi-Provider LLM Architecture

**Date:** 2026-05-05

**Status:** Accepted

## Context

The Arkon AI Gateway platform needs to support multiple LLM providers to:
- Offer flexibility in model selection
- Enable cost optimization by choosing appropriate models
- Provide fallback options if one provider is unavailable
- Support local development with Ollama
- Track usage and costs across providers

## Decision

Implement a **multi-provider LLM service** with support for:
- **Anthropic Claude** (via `@anthropic-ai/sdk`) - Primary production provider
- **Cerebras** (via OpenAI-compatible API) - Fast inference option
- **Ollama** (via local HTTP) - Local development and privacy-sensitive use cases

Key implementation:
- Provider-agnostic interface in `apps/api/src/lib/llm/types.ts`
- Provider-specific clients in `apps/api/src/lib/llm/{anthropic,cerebras,ollama}.ts`
- Service layer in `apps/api/src/services/llm.ts` handles routing
- LLM sessions and messages stored in database for history and billing
- Token usage tracked per message for cost accounting

## Alternatives Considered

| Alternative | Pros | Cons | Why Not Chosen |
|-------------|------|------|----------------|
| Single provider (Anthropic only) | Simpler implementation | No fallback, vendor lock-in | Flexibility critical for enterprise customers |
| LangChain abstraction | Rich ecosystem, many integrations | Heavy dependency, complex | Overkill for current needs |
| LiteLLM proxy | Unified API for all providers | External dependency, less control | Need fine-grained control over each provider |
| Custom unified SDK | Full control | Significant development effort | Provider SDKs already well-maintained |

## Consequences

### Positive

- Users can select optimal model for each use case
- Cost optimization by routing to cheaper models when appropriate
- Local development with Ollama (no API costs)
- Fallback capability if one provider has issues
- Consistent interface for frontend regardless of provider
- Full usage tracking in database

### Negative

- Maintaining multiple provider integrations
- Different capabilities/context windows per provider require handling
- Rate limit handling varies by provider
- Streaming responses have different formats

## Related

- [Data Flow Diagram](../flows/data-flow.md) - LLM chat flow
- `apps/api/src/lib/llm/` - LLM provider implementations
- `apps/api/src/services/llm.ts` - LLM service
- `packages/database/prisma/schema.prisma` - LlmSession, LlmMessage models
