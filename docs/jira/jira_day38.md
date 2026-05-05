# TAG-38: Oracle Agent Loop Implementation

## Description

**Suggested Points:** 13 (Critical — implementing the 6-step Oracle Agent Loop from agent-research-assistant, including preprocessing, memory prefetch, partitioned context, iterative tool calling, and response synthesis)

## Objective

Implement the Oracle Agent Loop, a 6-step agentic pipeline inspired by agent-research-assistant, featuring domain preprocessing, memory prefetch with NDCG scoring, partitioned context building, iterative tool execution (up to 5 iterations), and intelligent response synthesis.

## Requirements

### Oracle Agent Loop (6 Steps)

```
Request → POST /api/chat
  │
  ├─ Step 1: Domain Preprocessing
  │           └─ Detect domain-specific patterns → enrich system prompt
  │
  ├─ Step 2: Memory Prefetch
  │           └─ Query all 6 vector stores + SQL history
  │           └─ Calculate NDCG/MRR retrieval scores
  │
  ├─ Step 3: Observability Start
  │           └─ Initialize trace (Langfuse/OpenTelemetry)
  │
  ├─ Step 4: Partitioned Context Building
  │           └─ Assemble: Question / Conversation / KB / Workflow / Entity / Summary
  │
  ├─ ORACLE LOOP (max 5 iterations):
  │  │
  │  ├─ LLM Chat with think=True, tools=AGENT_TOOLS
  │  │
  │  ├─ If tool_calls:
  │  │   ├─ Parallel execution (8 workers)
  │  │   ├─ Write to tool_log_memory
  │  │   ├─ Add Langfuse tool spans
  │  │   ├─ Append results to messages
  │  │   └─ Continue loop
  │  │
  │  └─ If no tool_calls:
  │      └─ Emit final response → break
  │
  ├─ Step 5: Memory Sync
  │           └─ Write conversational + workflow memory
  │
  └─ Step 6: Observability Close
              └─ Record scores, flush trace
```

### Step 1: Domain Preprocessing

```typescript
interface PreprocessingResult {
  detectedDomain: string | null
  enrichedSystemPrompt: string
  extractedEntities: Entity[]
}

async function preprocessRequest(
  message: string,
  config: AgentConfig
): Promise<PreprocessingResult> {
  // Detect domain-specific patterns
  const domains = config.domains || []

  for (const domain of domains) {
    const matches = domain.patterns.some(p => p.test(message))
    if (matches) {
      // Enrich with domain context
      const entities = await domain.extractor(message)
      const enriched = await domain.enricher(entities)

      return {
        detectedDomain: domain.name,
        enrichedSystemPrompt: `${config.baseSystemPrompt}\n\n${enriched}`,
        extractedEntities: entities,
      }
    }
  }

  return {
    detectedDomain: null,
    enrichedSystemPrompt: config.baseSystemPrompt,
    extractedEntities: [],
  }
}
```

### Step 2: Memory Prefetch with Scoring

```typescript
interface PrefetchResult {
  conversational: Message[]
  knowledgeBase: ScoredDocument[]
  workflow: ScoredDocument[]
  entity: ScoredDocument[]
  summary: ScoredDocument[]
  scores: {
    ndcg: number  // Normalized Discounted Cumulative Gain
    mrr: number   // Mean Reciprocal Rank
  }
}

async function prefetchWithScoring(
  tenantId: string,
  threadId: string,
  query: string
): Promise<PrefetchResult> {
  const [conv, kb, wf, ent, sum] = await Promise.all([
    memory.readConversationalMemory(tenantId, threadId, 20),
    memory.readKnowledgeBase(tenantId, query, 10),
    memory.readWorkflow(tenantId, query, 5),
    memory.readEntity(tenantId, query, 10),
    memory.readSummary(tenantId, threadId, 5),
  ])

  // Calculate retrieval quality scores
  const scores = calculateRetrievalScores(kb, query)

  return {
    conversational: conv,
    knowledgeBase: kb,
    workflow: wf,
    entity: ent,
    summary: sum,
    scores,
  }
}

function calculateRetrievalScores(docs: ScoredDocument[], query: string): Scores {
  // NDCG: measures ranking quality
  const relevanceScores = docs.map(d => d.relevance)
  const idealScores = [...relevanceScores].sort((a, b) => b - a)

  const dcg = relevanceScores.reduce((sum, rel, i) =>
    sum + (rel / Math.log2(i + 2)), 0)
  const idcg = idealScores.reduce((sum, rel, i) =>
    sum + (rel / Math.log2(i + 2)), 0)

  const ndcg = idcg > 0 ? dcg / idcg : 0

  // MRR: first relevant result position
  const firstRelevantIdx = docs.findIndex(d => d.relevance > 0.5)
  const mrr = firstRelevantIdx >= 0 ? 1 / (firstRelevantIdx + 1) : 0

  return { ndcg, mrr }
}
```

### Step 4: Partitioned Context Building

```typescript
function buildPartitionedContext(
  userMessage: string,
  prefetch: PrefetchResult,
  preprocessing: PreprocessingResult
): string {
  const parts: string[] = []

  // Question section
  parts.push(`# Question\n${userMessage}`)

  // Conversation history (last 10 messages)
  if (prefetch.conversational.length > 0) {
    const conv = prefetch.conversational
      .slice(-10)
      .map(m => `${m.role}: ${m.content}`)
      .join('\n')
    parts.push(`## Conversation Memory\n${conv}`)
  }

  // Knowledge base (truncate to 400 chars each)
  if (prefetch.knowledgeBase.length > 0) {
    const kb = prefetch.knowledgeBase
      .map(d => d.content.slice(0, 400))
      .join('\n\n')
    parts.push(`## Knowledge Base\n${kb}`)
  }

  // Workflow patterns
  if (prefetch.workflow.length > 0) {
    const wf = prefetch.workflow
      .map(d => d.content.slice(0, 300))
      .join('\n\n')
    parts.push(`## Relevant Workflows\n${wf}`)
  }

  // Entities
  if (prefetch.entity.length > 0 || preprocessing.extractedEntities.length > 0) {
    const entities = [
      ...prefetch.entity.map(e => e.content),
      ...preprocessing.extractedEntities.map(e => e.description),
    ].slice(0, 10).join('\n')
    parts.push(`## Entities\n${entities}`)
  }

  // Summaries (JIT expandable)
  if (prefetch.summary.length > 0) {
    const sum = prefetch.summary
      .map(s => `[Summary ${s.id}]: ${s.content.slice(0, 200)}...`)
      .join('\n')
    parts.push(`## Previous Context Summaries\n${sum}`)
  }

  return parts.join('\n\n')
}
```

### Oracle Loop (Iterative Tool Calling)

```typescript
async function* oracleLoop(
  messages: Message[],
  context: AgentContext,
  maxIterations: number = 5
): AsyncGenerator<StreamEvent> {
  let iteration = 0
  let bufferedContent = ''

  while (iteration < maxIterations) {
    iteration++

    // Call LLM with tools
    const response = await llmClient.chat({
      messages,
      tools: AGENT_TOOLS,
      think: true,
      stream: true,
    })

    // Stream tokens
    for await (const chunk of response) {
      if (chunk.content) {
        bufferedContent += chunk.content
        yield { type: 'token', content: chunk.content }
      }

      if (chunk.thinking) {
        yield { type: 'thinking', content: chunk.thinking }
      }
    }

    // Check for tool calls
    const toolCalls = extractToolCalls(response)

    if (toolCalls.length === 0) {
      // No tools called, we're done
      yield { type: 'done', content: bufferedContent }
      break
    }

    // Execute tools in parallel
    yield { type: 'action', iteration, tools: toolCalls.map(tc => tc.function.name) }

    const results = await executeToolsParallel(toolCalls, context)

    for (const result of results) {
      yield { type: 'tool_result', ...result }
    }

    // Build synthesis prompt
    const synthesisPrompt = buildSynthesisPrompt(bufferedContent, results)

    // Add tool results to message history
    messages.push({
      role: 'assistant',
      content: bufferedContent,
      tool_calls: toolCalls,
    })

    for (const result of results) {
      messages.push({
        role: 'tool',
        tool_call_id: result.id,
        content: JSON.stringify(result.result),
      })
    }

    messages.push({
      role: 'user',
      content: synthesisPrompt,
    })

    // Reset for next iteration
    bufferedContent = ''
  }

  if (iteration >= maxIterations) {
    yield { type: 'warning', message: 'Max iterations reached' }
  }
}
```

### SSE Event Protocol

```typescript
type StreamEvent =
  | { type: 'preprocessing', domain: string | null }
  | { type: 'context', scores: { ndcg: number; mrr: number } }
  | { type: 'thinking', content: string }
  | { type: 'token', content: string }
  | { type: 'action', iteration: number, tools: string[] }
  | { type: 'tool_result', name: string, status: string, ms: number }
  | { type: 'done', content: string }
  | { type: 'trace', steps: StepTiming[] }
  | { type: 'warning', message: string }
  | { type: 'error', message: string }
```

## Implementation Notes
- Backend: Main loop in `apps/api/src/agent/oracle-loop.ts`
- Frontend: SSE client for streaming events
- CLI: Agent chat command for testing
- Database: Uses memory system from Day 36

## Unit Tests

### Required Unit Tests
| Test File | Test Case | Assertion |
|-----------|-----------|-----------|
| `apps/api/src/agent/__tests__/preprocessing.test.ts` | `detects domain patterns` | Domain identified |
| `apps/api/src/agent/__tests__/preprocessing.test.ts` | `enriches system prompt` | Prompt augmented |
| `apps/api/src/agent/__tests__/prefetch.test.ts` | `queries all memory stores` | All 6 types fetched |
| `apps/api/src/agent/__tests__/prefetch.test.ts` | `calculates NDCG correctly` | Score accurate |
| `apps/api/src/agent/__tests__/context.test.ts` | `builds partitioned context` | All sections present |
| `apps/api/src/agent/__tests__/context.test.ts` | `truncates long content` | Within limits |
| `apps/api/src/agent/__tests__/loop.test.ts` | `executes tools when called` | Tools run |
| `apps/api/src/agent/__tests__/loop.test.ts` | `stops when no tools` | Loop exits |
| `apps/api/src/agent/__tests__/loop.test.ts` | `respects max iterations` | Stops at 5 |
| `apps/api/src/agent/__tests__/synthesis.test.ts` | `continues from buffered` | Case A prompt |
| `apps/api/src/agent/__tests__/synthesis.test.ts` | `fresh start without buffer` | Case B prompt |

### Test Coverage Requirements
- 100% coverage on oracle loop logic
- All SSE event types tested
- Edge cases (max iterations, errors) covered

## Integration Tests

### Required Integration Tests
| Test Scenario | Setup | Steps | Expected Result |
|---------------|-------|-------|-----------------|
| `simple question (no tools)` | Agent ready | 1. Ask simple question | Direct response |
| `tool-using question` | Agent + tools | 1. Ask question needing tool | Tool called, response synthesized |
| `multi-tool iteration` | Complex query | 1. Ask complex question | Multiple tools, iterations |
| `max iteration limit` | Infinite loop scenario | 1. Trigger many tool calls | Stops at 5 |
| `SSE streaming` | Client connected | 1. Send query | All event types received |
| `memory sync` | Conversation | 1. Chat 2. Check memory | Messages persisted |

### End-to-End Flows
- User asks → Preprocessing → Prefetch → Context → Loop → Tools → Synthesis → Response → Memory Sync
- Domain detected → Enriched prompt → Better context → More relevant response

## Acceptance Criteria
1. 6-step pipeline implemented completely
2. Domain preprocessing with pattern detection
3. Memory prefetch with NDCG/MRR scoring
4. Partitioned context with all memory types
5. Iterative tool calling (up to 5 iterations)
6. Synthesis adapts to buffered content
7. SSE streaming of all event types
8. Memory sync after completion

## Review Checklist
- [ ] Does preprocessing handle unknown domains gracefully?
- [ ] Are NDCG/MRR scores calculated correctly?
- [ ] Is context within model token limits?
- [ ] Does the loop exit cleanly in all cases?
- [ ] Are all SSE events properly formatted?
- [ ] Is memory sync atomic?

## Dependencies
- Depends on: Day 36 (Memory system), Day 37 (Tool system)
- Blocks: Day 39 (RAG enhancement), Day 40 (Domain pipelines)

## Risk Factors
- **Infinite loop** — Mitigation: Hard limit of 5 iterations
- **Context overflow** — Mitigation: Truncation, prioritization
- **Slow tool execution** — Mitigation: Timeouts, parallel execution
- **SSE connection drops** — Mitigation: Reconnection, event replay
