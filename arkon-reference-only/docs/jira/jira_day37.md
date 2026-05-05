# TAG-37: Tool System Architecture

## Description

**Suggested Points:** 13 (Critical — implementing decorator-based tool registration, LLM-augmented tool descriptions, parallel tool execution, and tool result synthesis; core agent capability)

## Objective

Implement a sophisticated tool system inspired by agent-research-assistant's Toolbox pattern, featuring decorator-based registration, LLM-augmented semantic descriptions, parallel execution via ThreadPool, and intelligent result synthesis.

## Requirements

### Tool Registration Pattern (Decorator-Based)

```typescript
// Pattern from agent-research-assistant toolbox.py

interface ToolDefinition {
  name: string
  description: string  // Original docstring
  augmentedDescription?: string  // LLM-enriched (200-300 words)
  parameters: JSONSchema
  category: string
  handler: (...args: any[]) => Promise<any>
}

class Toolbox {
  private tools: Map<string, ToolDefinition> = new Map()
  private memoryManager: MemoryManager
  private llmClient: LLMClient

  registerTool(options: {
    augment?: boolean
    category?: string
  }) {
    return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
      const originalMethod = descriptor.value
      const metadata = Reflect.getMetadata('design:paramtypes', target, propertyKey)

      const tool: ToolDefinition = {
        name: propertyKey,
        description: extractDocstring(originalMethod),
        parameters: buildJSONSchema(metadata),
        category: options.category || 'general',
        handler: originalMethod,
      }

      if (options.augment) {
        this.augmentToolDescription(tool)
      }

      this.tools.set(propertyKey, tool)
    }
  }
}
```

### Tool Augmentation (LLM-Enriched Descriptions)

```typescript
// Augment tool descriptions for better semantic matching
async function augmentToolDescription(tool: ToolDefinition): Promise<void> {
  const sourceCode = tool.handler.toString()

  const prompt = `
You are documenting a tool for an AI agent. Given the tool's docstring and source code,
write a 200-300 word semantic description that captures:
1. What the tool does
2. When to use it
3. What inputs it expects
4. What output it produces
5. Common use cases

Docstring: ${tool.description}

Source code:
${sourceCode}

Write a rich, semantic description:
`

  const augmented = await llmClient.complete(prompt)
  tool.augmentedDescription = augmented

  // Store in toolbox_memory for semantic retrieval
  await memoryManager.writeToolbox(augmented, {
    toolName: tool.name,
    category: tool.category,
    originalDescription: tool.description,
  })
}
```

### Parallel Tool Execution

```typescript
// Pattern: ThreadPoolExecutor with 8 workers
async function executeToolsParallel(
  toolCalls: ToolCall[],
  context: ExecutionContext
): Promise<ToolResult[]> {
  const pool = new WorkerPool({ maxWorkers: 8 })

  const tasks = toolCalls.map(tc => ({
    name: tc.function.name,
    args: JSON.parse(tc.function.arguments),
  }))

  const results = await Promise.all(
    tasks.map(task => pool.execute(async () => {
      const startTime = Date.now()

      try {
        const tool = toolbox.get(task.name)
        const result = await tool.handler(task.args)
        const duration = Date.now() - startTime

        // Log execution
        await memoryManager.writeToolLog({
          tenantId: context.tenantId,
          threadId: context.threadId,
          toolName: task.name,
          input: task.args,
          output: result,
          status: 'success',
          durationMs: duration,
        })

        // Add observability span
        context.tracer?.addToolSpan(task.name, task.args, result, duration)

        return { name: task.name, result, status: 'success', ms: duration }

      } catch (error) {
        const duration = Date.now() - startTime

        await memoryManager.writeToolLog({
          tenantId: context.tenantId,
          threadId: context.threadId,
          toolName: task.name,
          input: task.args,
          output: error.message,
          status: 'error',
          durationMs: duration,
        })

        return { name: task.name, result: `Error: ${error.message}`, status: 'error', ms: duration }
      }
    }))
  )

  return results
}
```

### Built-in Tools (Team AI Gateway)

| Tool | Category | Purpose |
|------|----------|---------|
| `search_skills` | retrieval | Search team skills by semantic query |
| `search_mcp_servers` | retrieval | Find MCP servers by capability |
| `search_knowledge_base` | retrieval | Query team knowledge base |
| `write_knowledge_base` | memory | Persist findings to KB |
| `expand_summary` | memory | JIT retrieval of compressed summaries |
| `web_search` | external | Current web information (Tavily) |
| `read_file` | filesystem | Read file contents |
| `list_directory` | filesystem | List directory contents |
| `execute_command` | system | Run approved shell commands |
| `query_database` | data | Execute read-only SQL queries |
| `call_api` | integration | Make HTTP requests to allowed endpoints |

### Tool Call Extraction (Dual Strategy)

```typescript
// Handle both native format and text fallback
function extractToolCalls(response: LLMResponse): ToolCall[] {
  // Strategy 1: Native tool_calls from model
  if (response.toolCalls && response.toolCalls.length > 0) {
    return response.toolCalls
  }

  // Strategy 2: Parse ```tool_call {...}``` blocks from text
  const toolCallPattern = /```tool_call\s*(\{[\s\S]*?\})\s*```/g
  const matches = response.content.matchAll(toolCallPattern)

  const extracted: ToolCall[] = []
  for (const match of matches) {
    try {
      const parsed = JSON.parse(match[1])
      if (parsed.tool && parsed.args) {
        extracted.push({
          function: {
            name: parsed.tool,
            arguments: JSON.stringify(parsed.args),
          }
        })
      }
    } catch (e) {
      // Invalid JSON, skip
    }
  }

  return extracted
}
```

### Result Synthesis Prompts

```typescript
// Pattern: Case A/B synthesis based on buffered content
function buildSynthesisPrompt(
  bufferedContent: string,
  toolResults: ToolResult[]
): string {
  const resultsSummary = toolResults
    .map(r => `[${r.name}]: ${truncate(r.result, 2000)}`)
    .join('\n\n')

  if (bufferedContent.length > 0) {
    // Case A: Model already started response, continue from there
    return `
You have just called tools for more information. Here are the results:

${resultsSummary}

CONTINUE your response from where you left off, incorporating the tool results naturally.
Do not repeat what you already said.
`
  } else {
    // Case B: No content yet, ask for complete answer
    return `
You called tools to gather additional information. Here are the results:

${resultsSummary}

Now provide a complete and comprehensive answer using both the initial memory context and the new tool results.
`
  }
}
```

## Implementation Notes
- Backend: New `packages/agent-tools/` package
- Frontend: Tool execution status in chat UI
- CLI: Tool testing commands
- Database: Uses tool_log_memory from Day 36

## Unit Tests

### Required Unit Tests
| Test File | Test Case | Assertion |
|-----------|-----------|-----------|
| `packages/agent-tools/src/__tests__/toolbox.test.ts` | `registers tool with decorator` | Tool in registry |
| `packages/agent-tools/src/__tests__/toolbox.test.ts` | `extracts parameters from types` | JSON schema correct |
| `packages/agent-tools/src/__tests__/augment.test.ts` | `generates 200-300 word description` | Word count in range |
| `packages/agent-tools/src/__tests__/augment.test.ts` | `stores in toolbox_memory` | Vector stored |
| `packages/agent-tools/src/__tests__/parallel.test.ts` | `executes tools in parallel` | All complete |
| `packages/agent-tools/src/__tests__/parallel.test.ts` | `respects max 8 workers` | Concurrency limited |
| `packages/agent-tools/src/__tests__/parallel.test.ts` | `handles individual tool errors` | Other tools succeed |
| `packages/agent-tools/src/__tests__/extract.test.ts` | `extracts native tool_calls` | Correct parsing |
| `packages/agent-tools/src/__tests__/extract.test.ts` | `extracts from text fallback` | Correct parsing |
| `packages/agent-tools/src/__tests__/synthesis.test.ts` | `Case A: continues response` | Prompt correct |
| `packages/agent-tools/src/__tests__/synthesis.test.ts` | `Case B: complete answer` | Prompt correct |

### Test Coverage Requirements
- 100% coverage on tool registration
- 100% coverage on extraction strategies
- All built-in tools have tests

## Integration Tests

### Required Integration Tests
| Test Scenario | Setup | Steps | Expected Result |
|---------------|-------|-------|-----------------|
| `tool registration` | Empty registry | 1. Register tools | Tools available |
| `tool augmentation` | Tool registered | 1. Trigger augmentation | Description enriched |
| `parallel execution` | 5 tools | 1. Execute all | All complete in parallel |
| `error isolation` | 1 failing tool | 1. Execute batch | 4 succeed, 1 error |
| `tool logging` | Tool execution | 1. Run 2. Query logs | Logs present |
| `semantic matching` | Augmented tools | 1. Query "find files" | file tools ranked higher |

### End-to-End Flows
- User asks question → Agent selects tools → Parallel execution → Results synthesized → Response generated
- Tool fails → Error logged → Other tools continue → Partial results used

## Tool Definition Examples

```typescript
// packages/agent-tools/src/tools/retrieval.ts

import { Toolbox } from '../toolbox'

export function registerRetrievalTools(toolbox: Toolbox) {

  @toolbox.registerTool({ augment: true, category: 'retrieval' })
  async function searchSkills(
    query: string,
    maxResults: number = 5
  ): Promise<Skill[]> {
    /**
     * Search team skills by semantic similarity.
     * Returns skills matching the query, ranked by relevance.
     */
    const results = await skillsApi.search(query, maxResults)
    return results.map(r => ({
      name: r.name,
      description: r.description,
      relevance: r.score,
    }))
  }

  @toolbox.registerTool({ augment: true, category: 'retrieval' })
  async function searchKnowledgeBase(
    query: string,
    maxResults: number = 5,
    filters?: { category?: string; dateRange?: string }
  ): Promise<Document[]> {
    /**
     * Query the team knowledge base for relevant documents.
     * Supports filtering by category and date range.
     */
    const results = await memoryManager.readKnowledgeBase(query, maxResults)
    return results.filter(r => matchFilters(r, filters))
  }

  @toolbox.registerTool({ augment: true, category: 'memory' })
  async function writeKnowledgeBase(
    text: string,
    metadata?: { source?: string; category?: string }
  ): Promise<{ docId: string }> {
    /**
     * Persist important findings or information to the team knowledge base.
     * Returns the document ID for future reference.
     */
    const docId = await memoryManager.writeKnowledgeBase(text, metadata)
    return { docId }
  }
}
```

## Acceptance Criteria
1. Decorator-based tool registration working
2. Tool augmentation generates rich semantic descriptions
3. Parallel execution with 8 worker limit
4. Tool errors isolated (don't fail batch)
5. Both extraction strategies (native + text) working
6. Synthesis prompts adapt to buffered content
7. All tool executions logged with timing
8. Built-in tools functional

## Review Checklist
- [ ] Are tool handlers properly typed?
- [ ] Is parallel execution truly non-blocking?
- [ ] Does error handling prevent cascade failures?
- [ ] Is tool output truncated for context limits?
- [ ] Are augmented descriptions stored correctly?
- [ ] Is the worker pool properly cleaned up?

## Dependencies
- Depends on: Day 36 (Memory system for tool logging)
- Blocks: Day 38 (Agent loop uses tools)

## Risk Factors
- **Tool execution timeout** — Mitigation: Per-tool timeout, graceful cancellation
- **Parallel resource exhaustion** — Mitigation: Worker pool limit, queue overflow handling
- **Augmentation cost** — Mitigation: Cache augmented descriptions, only re-augment on change
- **Tool output size** — Mitigation: Truncation to 2K per tool, 8K total
