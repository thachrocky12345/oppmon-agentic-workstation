# ADR-0008: [AUTO] Agent Engine Subsystem with Oracle Loop and Semantic Cache

**Date:** 2026-05-07

**Status:** Accepted

## Context

The platform graduated from simple LLM proxying to autonomous, multi-step agent execution. This required a structured execution loop, conversation memory, tool dispatch, and caching of expensive embeddings/reasoning.

A new internal subsystem under `apps/api/src/agent/` and a workspace package `@arkon/agent-engine` (in `packages/agent-engine/`) were introduced. The subsystem includes:

- `oracle-loop.ts` — iterative reasoning loop
- `memory-manager.ts` + `memory-types.ts` — short/long-term memory
- `semantic-cache.ts` — embedding-keyed cache for prompts/results
- `toolbox.ts` — tool registry and execution
- `domain-pipelines.ts` — domain-specific orchestration
- `advanced-rag.ts` — multi-stage RAG inside the agent loop

## Decision

Adopt a layered agent architecture:

1. `@arkon/agent-engine` package owns reusable, framework-agnostic execution primitives (wire format, replay, risk classification, types).
2. `apps/api/src/agent/` owns API-specific orchestration (oracle loop, memory, tools, pipelines).
3. Semantic caching is keyed on embeddings to skip redundant LLM calls.

## Alternatives Considered

| Alternative | Pros | Cons | Why Not Chosen |
|-------------|------|------|----------------|
| LangChain.js | Rich ecosystem | Heavy, opinionated, hard to audit | Rejected — too much surface area for guardrails |
| OpenAI Assistants API | Managed | Vendor lock-in, no on-prem path | Rejected — multi-provider requirement |
| Custom minimal loop without package split | Simplest | Couples reusable primitives to API runtime | Rejected — package split enables reuse + tests |

## Consequences

### Positive

- Clear separation between reusable engine primitives and API orchestration
- Replayable, testable agent runs (`replay.ts`)
- Embedding cache reduces cost and latency
- Compatible with multiple LLM providers via existing `lib/llm/` clients

### Negative

- More moving parts to document and maintain
- Semantic cache invalidation requires care
- New tests required to cover oracle loop edge cases

## Related

- `packages/agent-engine/src/`
- `apps/api/src/agent/oracle-loop.ts`
- `apps/api/src/agent/semantic-cache.ts`
- ADR-0002 Multi-LLM Providers
- ADR-0004 pgvector Embeddings
