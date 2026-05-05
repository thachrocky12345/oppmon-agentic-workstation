# TAG-36: Agent Memory System Architecture

## Description

**Suggested Points:** 13 (Critical — implementing 8-table memory architecture from agent-research-assistant, including episodic, semantic, procedural, and tool memory; foundational for all agent capabilities)

## Objective

Implement a comprehensive agent memory system inspired by the agent-research-assistant's 8-table architecture, providing episodic (conversational), semantic (knowledge base), procedural (workflow), and tool memory capabilities with unified memory management API.

## Requirements

### Memory Architecture (8 Tables)

| Table | Type | Storage | Purpose |
|-------|------|---------|---------|
| `conversational_memory` | Episodic | SQL | Recent dialogue history per thread |
| `semantic_memory` | Knowledge Base | pgvector | Research documents, team knowledge |
| `workflow_memory` | Procedural | pgvector | Tool execution patterns, best practices |
| `toolbox_memory` | Tool Registry | pgvector | Augmented tool descriptions |
| `entity_memory` | Semantic | pgvector | Named entities (projects, people, concepts) |
| `summary_memory` | Compressed | pgvector | JIT-expandable conversation summaries |
| `persona_memory` | Identity | pgvector | Agent/team preferences, traits |
| `tool_log_memory` | Audit | SQL | Tool call history with timing |

### Schema Design (PostgreSQL + pgvector)

```sql
-- Schema isolation pattern
CREATE SCHEMA IF NOT EXISTS agent_memory;

-- Conversational Memory (SQL - recent history)
CREATE TABLE agent_memory.conversational_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  thread_id UUID NOT NULL,
  role VARCHAR(20) NOT NULL, -- 'user', 'assistant', 'system'
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),

  INDEX idx_conv_thread (tenant_id, thread_id, created_at DESC)
);

-- Semantic Memory (Vector - knowledge base)
CREATE TABLE agent_memory.semantic_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  team_id UUID,
  content TEXT NOT NULL,
  embedding vector(1024) NOT NULL, -- bge-m3 dimensions
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_semantic_vec ON agent_memory.semantic_memory
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Similar structure for other vector tables...
```

### Memory Manager API

```typescript
interface MemoryManager {
  // Lifecycle
  prefetchAll(threadId: string): Promise<PrefetchResult>
  syncAll(threadId: string, messages: Message[]): Promise<void>

  // Conversational (deterministic)
  readConversationalMemory(threadId: string, limit?: number): Promise<Message[]>
  writeConversationalMemory(threadId: string, message: Message): Promise<void>

  // Knowledge Base (agent-triggered)
  readKnowledgeBase(query: string, nResults?: number): Promise<Document[]>
  writeKnowledgeBase(text: string, metadata?: object): Promise<string>

  // Entities
  readEntity(query: string, nResults?: number): Promise<Entity[]>
  writeEntity(text: string, metadata?: object): Promise<string>

  // Workflow
  readWorkflow(query: string, nResults?: number): Promise<Workflow[]>
  writeWorkflow(text: string, metadata?: object): Promise<string>

  // Summaries
  readSummary(summaryId: string): Promise<Summary>
  writeSummary(threadId: string, content: string): Promise<string>
  expandSummary(summaryId: string): Promise<string>

  // Tool Logs
  writeToolLog(log: ToolLogEntry): Promise<void>

  // Context Management
  calculateContextUsage(threadId: string): Promise<number>
  summarizeAndStore(threadId: string): Promise<void>
}
```

### Semantic Caching

```typescript
// Pattern from agent-research-assistant
class SemanticCache {
  private cache = new LRUCache<string, Document[]>({ max: 128 })

  private getCacheKey(query: string, nResults: number): string {
    const normalized = query.toLowerCase().trim()
    return crypto.createHash('md5')
      .update(`${normalized}:${nResults}`)
      .digest('hex')
  }

  async query(query: string, nResults: number): Promise<Document[]> {
    const key = this.getCacheKey(query, nResults)

    if (this.cache.has(key)) {
      return this.cache.get(key)!
    }

    const results = await this.vectorSearch(query, nResults)
    this.cache.set(key, results)
    return results
  }
}
```

### Context Usage Monitoring

```typescript
// Auto-summarize when context > 80%
async function monitorContextUsage(threadId: string): Promise<void> {
  const usage = await memory.calculateContextUsage(threadId)

  if (usage > 0.8) {
    await memory.summarizeAndStore(threadId)
    logger.info('Context compressed via summarization', { threadId, usage })
  }
}
```

## Implementation Notes
- Backend: New `packages/agent-memory/` package
- Frontend: N/A
- CLI: Memory inspection commands (debug)
- Database: pgvector extension, 8 new tables in agent_memory schema

## Unit Tests

### Required Unit Tests
| Test File | Test Case | Assertion |
|-----------|-----------|-----------|
| `packages/agent-memory/src/__tests__/manager.test.ts` | `prefetchAll returns all memory types` | All 6 stores queried |
| `packages/agent-memory/src/__tests__/manager.test.ts` | `syncAll writes conversational and workflow` | Both tables updated |
| `packages/agent-memory/src/__tests__/conversational.test.ts` | `respects thread isolation` | Thread A data not in B |
| `packages/agent-memory/src/__tests__/semantic.test.ts` | `vector search returns relevant docs` | Cosine similarity ordering |
| `packages/agent-memory/src/__tests__/cache.test.ts` | `semantic cache prevents redundant queries` | DB called once for same query |
| `packages/agent-memory/src/__tests__/cache.test.ts` | `cache bounded to 128 entries` | Oldest evicted |
| `packages/agent-memory/src/__tests__/context.test.ts` | `triggers summarization at 80%` | Summary created |
| `packages/agent-memory/src/__tests__/tool-log.test.ts` | `logs tool execution with timing` | All fields captured |

### Test Coverage Requirements
- 100% coverage on MemoryManager API
- All memory types tested for CRUD operations
- Tenant isolation verified for all tables

## Integration Tests

### Required Integration Tests
| Test Scenario | Setup | Steps | Expected Result |
|---------------|-------|-------|-----------------|
| `multi-memory prefetch` | Data in all stores | 1. prefetchAll() | All 6 types returned |
| `conversation persistence` | New thread | 1. Write 2. Read | Messages preserved |
| `KB vector search` | Documents ingested | 1. Query similar | Relevant docs returned |
| `cross-tenant isolation` | Two tenants with data | 1. Query as tenant A | Only tenant A data |
| `context overflow` | Long conversation | 1. Add messages until 80% | Auto-summarization triggers |
| `tool log audit` | Tool execution | 1. Run tool 2. Query logs | Execution recorded |

### End-to-End Flows
- Agent conversation → Memory written → Context grows → Summarization → Future queries use summary
- Tool execution → Log written → Workflow pattern learned → Similar query retrieves pattern

## Memory Manager Implementation

```typescript
// packages/agent-memory/src/memory-manager.ts

import { Pool } from 'pg'
import { AdvancedRag } from './advanced-rag'

export class MemoryManager {
  private pool: Pool
  private stores: {
    semantic: AdvancedRag
    workflow: AdvancedRag
    toolbox: AdvancedRag
    entity: AdvancedRag
    summary: AdvancedRag
    persona: AdvancedRag
  }
  private kbCache: SemanticCache

  constructor(config: MemoryConfig) {
    this.pool = new Pool({ connectionString: config.databaseUrl })

    // Initialize 6 vector stores
    this.stores = {
      semantic: new AdvancedRag(this.pool, 'semantic_memory', config.embeddingClient),
      workflow: new AdvancedRag(this.pool, 'workflow_memory', config.embeddingClient),
      toolbox: new AdvancedRag(this.pool, 'toolbox_memory', config.embeddingClient),
      entity: new AdvancedRag(this.pool, 'entity_memory', config.embeddingClient),
      summary: new AdvancedRag(this.pool, 'summary_memory', config.embeddingClient),
      persona: new AdvancedRag(this.pool, 'persona_memory', config.embeddingClient),
    }

    this.kbCache = new SemanticCache({ maxSize: 128 })
  }

  async prefetchAll(tenantId: string, threadId: string): Promise<PrefetchResult> {
    const [conversational, semantic, workflow, entity, summary] = await Promise.all([
      this.readConversationalMemory(tenantId, threadId, 20),
      this.stores.semantic.query('', 10, { tenantId }), // Recent KB
      this.stores.workflow.query('', 5, { tenantId }),
      this.stores.entity.query('', 10, { tenantId }),
      this.stores.summary.query('', 5, { tenantId, threadId }),
    ])

    return { conversational, semantic, workflow, entity, summary }
  }

  async readKnowledgeBase(
    tenantId: string,
    query: string,
    nResults = 5
  ): Promise<Document[]> {
    // Check cache first
    const cached = this.kbCache.get(tenantId, query, nResults)
    if (cached) return cached

    const results = await this.stores.semantic.query(query, nResults, { tenantId })
    this.kbCache.set(tenantId, query, nResults, results)

    return results
  }

  async calculateContextUsage(tenantId: string, threadId: string): Promise<number> {
    const messages = await this.readConversationalMemory(tenantId, threadId)
    const totalTokens = messages.reduce((sum, m) => sum + estimateTokens(m.content), 0)
    const maxTokens = 128000 // Model context window

    return totalTokens / maxTokens
  }

  async summarizeAndStore(
    tenantId: string,
    threadId: string,
    llmClient: LLMClient
  ): Promise<string> {
    const messages = await this.readConversationalMemory(tenantId, threadId, 50)

    const summaryPrompt = `Summarize the following conversation, preserving key decisions, facts, and context:\n\n${messages.map(m => `${m.role}: ${m.content}`).join('\n')}`

    const summary = await llmClient.complete(summaryPrompt)

    // Store summary
    const summaryId = await this.stores.summary.insert({
      tenantId,
      threadId,
      content: summary,
      metadata: { originalMessageCount: messages.length },
    })

    // Archive old messages (keep last 10)
    await this.archiveOldMessages(tenantId, threadId, 10)

    return summaryId
  }

  async writeToolLog(entry: ToolLogEntry): Promise<void> {
    await this.pool.query(`
      INSERT INTO agent_memory.tool_log_memory
      (tenant_id, thread_id, tool_name, input, output, status, duration_ms, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
    `, [
      entry.tenantId,
      entry.threadId,
      entry.toolName,
      JSON.stringify(entry.input),
      JSON.stringify(entry.output),
      entry.status,
      entry.durationMs,
    ])
  }
}
```

## Acceptance Criteria
1. 8 memory tables created with proper schema
2. MemoryManager provides unified API for all memory types
3. Vector search works with pgvector and cosine similarity
4. Semantic caching reduces redundant queries
5. Context monitoring triggers auto-summarization at 80%
6. Tool logs capture execution history with timing
7. Tenant isolation enforced on all queries
8. All memory types support CRUD operations

## Review Checklist
- [ ] Is pgvector extension installed and configured?
- [ ] Are indexes appropriate for query patterns?
- [ ] Is the embedding dimension correct (1024 for bge-m3)?
- [ ] Does semantic cache have proper eviction?
- [ ] Is context calculation accurate for token estimation?
- [ ] Are all queries tenant-scoped?

## Dependencies
- Depends on: Day 1 (Database), Day 4 (RAG patterns)
- Blocks: Day 37 (Tool system uses memory), Day 38 (Agent loop uses memory)

## Risk Factors
- **pgvector performance** — Mitigation: Proper indexing, query optimization
- **Memory growth** — Mitigation: Summarization, archival policies
- **Cache invalidation** — Mitigation: Time-based expiry, explicit invalidation
- **Embedding model changes** — Mitigation: Store model version, re-embed on change
