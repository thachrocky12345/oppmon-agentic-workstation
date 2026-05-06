/**
 * Memory Manager
 *
 * Unified API for all 8 memory types in the agent memory system.
 * Pattern from agent-research-assistant.
 */

import { prisma } from '../lib/db'
import { SemanticCache } from './semantic-cache'
import type {
  Message,
  ScoredDocument,
  Entity,
  Summary,
  ToolLogEntry,
  PrefetchResult,
  RetrievalScores,
  MemoryConfig,
  EmbeddingClient,
  ContextUsage,
  Persona,
  ToolDefinition,
  MemoryRole,
  ToolLogStatus,
} from './memory-types'

// Token estimation (rough approximation)
function estimateTokens(text: string): number {
  // Approximate 4 characters per token
  return Math.ceil(text.length / 4)
}

export class MemoryManager {
  private cache: SemanticCache
  private embeddingClient?: EmbeddingClient
  private defaultQueryLimit: number

  constructor(config: MemoryConfig) {
    this.cache = new SemanticCache({ maxSize: config.maxCacheSize ?? 128 })
    this.embeddingClient = config.embeddingClient
    this.defaultQueryLimit = config.defaultQueryLimit ?? 10
  }

  // ============================================================================
  // Lifecycle Operations
  // ============================================================================

  /**
   * Prefetch all memory types for a thread
   */
  async prefetchAll(
    tenantId: string,
    threadId: string,
    query?: string
  ): Promise<PrefetchResult> {
    const [conversational, semantic, workflow, entity, summary] =
      await Promise.all([
        this.readConversationalMemory(tenantId, threadId, 20),
        query
          ? this.readKnowledgeBase(tenantId, query, 10)
          : Promise.resolve([]),
        query ? this.readWorkflow(tenantId, query, 5) : Promise.resolve([]),
        query ? this.readEntity(tenantId, query, 10) : Promise.resolve([]),
        this.readSummary(tenantId, threadId, 5),
      ])

    // Calculate retrieval quality scores
    const scores = this.calculateRetrievalScores(semantic)

    return { conversational, semantic, workflow, entity, summary, scores }
  }

  /**
   * Sync conversation and workflow memory after a turn
   */
  async syncAll(
    tenantId: string,
    threadId: string,
    messages: Message[]
  ): Promise<void> {
    await Promise.all([
      // Write conversation messages
      ...messages.map((msg) =>
        this.writeConversationalMemory(tenantId, threadId, msg)
      ),
    ])
  }

  // ============================================================================
  // Conversational Memory (SQL)
  // ============================================================================

  async readConversationalMemory(
    tenantId: string,
    threadId: string,
    limit: number = 20
  ): Promise<Message[]> {
    const messages = await prisma.conversationalMemory.findMany({
      where: { tenantId, threadId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    })

    return messages.reverse().map((m) => ({
      id: m.id,
      role: m.role as MemoryRole,
      content: m.content,
      metadata: m.metadata as Record<string, unknown>,
      createdAt: m.createdAt,
    }))
  }

  async writeConversationalMemory(
    tenantId: string,
    threadId: string,
    message: Message
  ): Promise<string> {
    const created = await prisma.conversationalMemory.create({
      data: {
        tenantId,
        threadId,
        role: message.role,
        content: message.content,
        metadata: message.metadata ?? {},
      },
    })
    return created.id
  }

  // ============================================================================
  // Knowledge Base (Vector - Semantic Memory)
  // ============================================================================

  async readKnowledgeBase(
    tenantId: string,
    query: string,
    nResults: number = 5
  ): Promise<ScoredDocument[]> {
    // Check cache first
    const cached = this.cache.get(tenantId, query, nResults)
    if (cached) return cached

    // Vector search requires embedding
    if (!this.embeddingClient) {
      return []
    }

    const embedding = await this.embeddingClient.embed(query)

    // Raw SQL for pgvector cosine similarity search
    const results = await prisma.$queryRaw<
      Array<{
        id: string
        content: string
        metadata: Record<string, unknown>
        similarity: number
      }>
    >`
      SELECT id, content, metadata,
             1 - (embedding <=> ${embedding}::vector) as similarity
      FROM semantic_memory
      WHERE "tenantId" = ${tenantId}
      ORDER BY embedding <=> ${embedding}::vector
      LIMIT ${nResults}
    `

    const docs = results.map((r) => ({
      id: r.id,
      content: r.content,
      score: r.similarity,
      relevance: r.similarity,
      metadata: r.metadata,
    }))

    // Cache results
    this.cache.set(tenantId, query, nResults, docs)

    return docs
  }

  async writeKnowledgeBase(
    tenantId: string,
    content: string,
    metadata?: Record<string, unknown>,
    teamId?: string
  ): Promise<string> {
    if (!this.embeddingClient) {
      throw new Error('Embedding client required to write to knowledge base')
    }

    const embedding = await this.embeddingClient.embed(content)

    // Insert with embedding via raw SQL
    const result = await prisma.$queryRaw<Array<{ id: string }>>`
      INSERT INTO semantic_memory ("id", "tenantId", "teamId", "content", "embedding", "metadata", "createdAt")
      VALUES (gen_random_uuid()::text, ${tenantId}, ${teamId}, ${content}, ${embedding}::vector, ${JSON.stringify(metadata ?? {})}::jsonb, NOW())
      RETURNING id
    `

    // Invalidate cache
    this.cache.invalidate(tenantId)

    return result[0].id
  }

  // ============================================================================
  // Entity Memory (Vector)
  // ============================================================================

  async readEntity(
    tenantId: string,
    query: string,
    nResults: number = 10
  ): Promise<ScoredDocument[]> {
    if (!this.embeddingClient) {
      return []
    }

    const embedding = await this.embeddingClient.embed(query)

    const results = await prisma.$queryRaw<
      Array<{
        id: string
        entityType: string
        entityName: string
        description: string
        metadata: Record<string, unknown>
        similarity: number
      }>
    >`
      SELECT id, "entityType", "entityName", description, metadata,
             1 - (embedding <=> ${embedding}::vector) as similarity
      FROM entity_memory
      WHERE "tenantId" = ${tenantId}
      ORDER BY embedding <=> ${embedding}::vector
      LIMIT ${nResults}
    `

    return results.map((r) => ({
      id: r.id,
      content: `${r.entityName}: ${r.description}`,
      score: r.similarity,
      relevance: r.similarity,
      metadata: { ...r.metadata, entityType: r.entityType, entityName: r.entityName },
    }))
  }

  async writeEntity(
    tenantId: string,
    entity: Entity
  ): Promise<string> {
    if (!this.embeddingClient) {
      throw new Error('Embedding client required to write entity')
    }

    const text = `${entity.name}: ${entity.description}`
    const embedding = await this.embeddingClient.embed(text)

    const result = await prisma.$queryRaw<Array<{ id: string }>>`
      INSERT INTO entity_memory ("id", "tenantId", "entityType", "entityName", "description", "embedding", "metadata", "createdAt", "updatedAt")
      VALUES (gen_random_uuid()::text, ${tenantId}, ${entity.type}, ${entity.name}, ${entity.description}, ${embedding}::vector, ${JSON.stringify(entity.metadata ?? {})}::jsonb, NOW(), NOW())
      ON CONFLICT ("tenantId", "entityName") DO UPDATE SET
        description = EXCLUDED.description,
        embedding = EXCLUDED.embedding,
        metadata = EXCLUDED.metadata,
        "updatedAt" = NOW()
      RETURNING id
    `

    return result[0].id
  }

  // ============================================================================
  // Workflow Memory (Vector)
  // ============================================================================

  async readWorkflow(
    tenantId: string,
    query: string,
    nResults: number = 5
  ): Promise<ScoredDocument[]> {
    if (!this.embeddingClient) {
      return []
    }

    const embedding = await this.embeddingClient.embed(query)

    const results = await prisma.$queryRaw<
      Array<{
        id: string
        content: string
        metadata: Record<string, unknown>
        similarity: number
      }>
    >`
      SELECT id, content, metadata,
             1 - (embedding <=> ${embedding}::vector) as similarity
      FROM workflow_memory
      WHERE "tenantId" = ${tenantId}
      ORDER BY embedding <=> ${embedding}::vector
      LIMIT ${nResults}
    `

    return results.map((r) => ({
      id: r.id,
      content: r.content,
      score: r.similarity,
      relevance: r.similarity,
      metadata: r.metadata,
    }))
  }

  async writeWorkflow(
    tenantId: string,
    content: string,
    metadata?: Record<string, unknown>
  ): Promise<string> {
    if (!this.embeddingClient) {
      throw new Error('Embedding client required to write workflow')
    }

    const embedding = await this.embeddingClient.embed(content)

    const result = await prisma.$queryRaw<Array<{ id: string }>>`
      INSERT INTO workflow_memory ("id", "tenantId", "content", "embedding", "metadata", "createdAt")
      VALUES (gen_random_uuid()::text, ${tenantId}, ${content}, ${embedding}::vector, ${JSON.stringify(metadata ?? {})}::jsonb, NOW())
      RETURNING id
    `

    return result[0].id
  }

  // ============================================================================
  // Summary Memory (Vector)
  // ============================================================================

  async readSummary(
    tenantId: string,
    threadId: string,
    nResults: number = 5
  ): Promise<ScoredDocument[]> {
    const summaries = await prisma.summaryMemory.findMany({
      where: { tenantId, threadId },
      orderBy: { createdAt: 'desc' },
      take: nResults,
    })

    return summaries.map((s) => ({
      id: s.id,
      content: s.content,
      score: 1.0, // Summaries are always relevant to their thread
      relevance: 1.0,
      metadata: {
        originalMessageCount: s.originalMessageCount,
        ...(s.metadata as Record<string, unknown>),
      },
    }))
  }

  async writeSummary(
    tenantId: string,
    threadId: string,
    content: string,
    originalMessageCount: number,
    metadata?: Record<string, unknown>
  ): Promise<string> {
    // Store summary with embedding if client available
    if (this.embeddingClient) {
      const embedding = await this.embeddingClient.embed(content)

      const result = await prisma.$queryRaw<Array<{ id: string }>>`
        INSERT INTO summary_memory ("id", "tenantId", "threadId", "content", "embedding", "originalMessageCount", "metadata", "createdAt")
        VALUES (gen_random_uuid()::text, ${tenantId}, ${threadId}, ${content}, ${embedding}::vector, ${originalMessageCount}, ${JSON.stringify(metadata ?? {})}::jsonb, NOW())
        RETURNING id
      `
      return result[0].id
    }

    // Fallback without embedding
    const created = await prisma.summaryMemory.create({
      data: {
        tenantId,
        threadId,
        content,
        originalMessageCount,
        metadata: metadata ?? {},
      },
    })
    return created.id
  }

  /**
   * JIT expand a summary by retrieving original messages
   */
  async expandSummary(summaryId: string): Promise<string> {
    const summary = await prisma.summaryMemory.findUnique({
      where: { id: summaryId },
    })

    if (!summary) {
      throw new Error(`Summary not found: ${summaryId}`)
    }

    // Return the summary content (in a full implementation, this would
    // retrieve archived messages or a more detailed expansion)
    return summary.content
  }

  // ============================================================================
  // Tool Log Memory (SQL)
  // ============================================================================

  async writeToolLog(entry: ToolLogEntry): Promise<void> {
    await prisma.toolLogMemory.create({
      data: {
        tenantId: entry.tenantId,
        threadId: entry.threadId,
        toolName: entry.toolName,
        input: entry.input,
        output: entry.output,
        status: entry.status,
        durationMs: entry.durationMs,
      },
    })
  }

  async readToolLogs(
    tenantId: string,
    threadId: string,
    limit: number = 20
  ): Promise<ToolLogEntry[]> {
    const logs = await prisma.toolLogMemory.findMany({
      where: { tenantId, threadId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    })

    return logs.map((l) => ({
      tenantId: l.tenantId,
      threadId: l.threadId,
      toolName: l.toolName,
      input: l.input as Record<string, unknown>,
      output: l.output as Record<string, unknown>,
      status: l.status as ToolLogStatus,
      durationMs: l.durationMs,
    }))
  }

  // ============================================================================
  // Toolbox Memory (Vector)
  // ============================================================================

  async writeToolbox(
    tenantId: string,
    tool: ToolDefinition
  ): Promise<string> {
    if (!this.embeddingClient) {
      throw new Error('Embedding client required to write toolbox')
    }

    const textToEmbed = tool.augmentedDescription ?? tool.originalDescription
    const embedding = await this.embeddingClient.embed(textToEmbed)

    const result = await prisma.$queryRaw<Array<{ id: string }>>`
      INSERT INTO toolbox_memory ("id", "tenantId", "toolName", "originalDescription", "augmentedDescription", "embedding", "category", "metadata", "createdAt", "updatedAt")
      VALUES (gen_random_uuid()::text, ${tenantId}, ${tool.toolName}, ${tool.originalDescription}, ${tool.augmentedDescription ?? tool.originalDescription}, ${embedding}::vector, ${tool.category}, ${JSON.stringify(tool.metadata ?? {})}::jsonb, NOW(), NOW())
      ON CONFLICT ("tenantId", "toolName") DO UPDATE SET
        "originalDescription" = EXCLUDED."originalDescription",
        "augmentedDescription" = EXCLUDED."augmentedDescription",
        embedding = EXCLUDED.embedding,
        category = EXCLUDED.category,
        metadata = EXCLUDED.metadata,
        "updatedAt" = NOW()
      RETURNING id
    `

    return result[0].id
  }

  async searchToolbox(
    tenantId: string,
    query: string,
    nResults: number = 5
  ): Promise<ScoredDocument[]> {
    if (!this.embeddingClient) {
      return []
    }

    const embedding = await this.embeddingClient.embed(query)

    const results = await prisma.$queryRaw<
      Array<{
        id: string
        toolName: string
        augmentedDescription: string
        category: string
        metadata: Record<string, unknown>
        similarity: number
      }>
    >`
      SELECT id, "toolName", "augmentedDescription", category, metadata,
             1 - (embedding <=> ${embedding}::vector) as similarity
      FROM toolbox_memory
      WHERE "tenantId" = ${tenantId}
      ORDER BY embedding <=> ${embedding}::vector
      LIMIT ${nResults}
    `

    return results.map((r) => ({
      id: r.id,
      content: r.augmentedDescription,
      score: r.similarity,
      relevance: r.similarity,
      metadata: { toolName: r.toolName, category: r.category, ...r.metadata },
    }))
  }

  // ============================================================================
  // Persona Memory (Vector)
  // ============================================================================

  async writePersona(
    tenantId: string,
    persona: Persona,
    teamId?: string
  ): Promise<string> {
    if (!this.embeddingClient) {
      throw new Error('Embedding client required to write persona')
    }

    const embedding = await this.embeddingClient.embed(persona.content)

    const result = await prisma.$queryRaw<Array<{ id: string }>>`
      INSERT INTO persona_memory ("id", "tenantId", "teamId", "name", "content", "embedding", "traits", "metadata", "createdAt", "updatedAt")
      VALUES (gen_random_uuid()::text, ${tenantId}, ${teamId}, ${persona.name}, ${persona.content}, ${embedding}::vector, ${JSON.stringify(persona.traits)}::jsonb, ${JSON.stringify(persona.metadata ?? {})}::jsonb, NOW(), NOW())
      ON CONFLICT ("tenantId", "name") DO UPDATE SET
        content = EXCLUDED.content,
        embedding = EXCLUDED.embedding,
        traits = EXCLUDED.traits,
        metadata = EXCLUDED.metadata,
        "updatedAt" = NOW()
      RETURNING id
    `

    return result[0].id
  }

  async readPersona(
    tenantId: string,
    name: string
  ): Promise<Persona | null> {
    const persona = await prisma.personaMemory.findUnique({
      where: { tenantId_name: { tenantId, name } },
    })

    if (!persona) return null

    return {
      id: persona.id,
      name: persona.name,
      content: persona.content,
      traits: persona.traits as string[],
      metadata: persona.metadata as Record<string, unknown>,
    }
  }

  // ============================================================================
  // Context Management
  // ============================================================================

  async calculateContextUsage(
    tenantId: string,
    threadId: string,
    maxTokens: number = 128000
  ): Promise<ContextUsage> {
    const messages = await this.readConversationalMemory(tenantId, threadId)
    const totalTokens = messages.reduce(
      (sum, m) => sum + estimateTokens(m.content),
      0
    )
    const usagePercent = totalTokens / maxTokens

    return {
      totalTokens,
      maxTokens,
      usagePercent,
      shouldSummarize: usagePercent > 0.8,
    }
  }

  async summarizeAndStore(
    tenantId: string,
    threadId: string,
    summarizeFn: (messages: Message[]) => Promise<string>
  ): Promise<string> {
    const messages = await this.readConversationalMemory(tenantId, threadId, 50)

    if (messages.length < 10) {
      throw new Error('Not enough messages to summarize')
    }

    // Generate summary using provided function
    const summary = await summarizeFn(messages)

    // Store summary
    const summaryId = await this.writeSummary(
      tenantId,
      threadId,
      summary,
      messages.length,
      { summarizedAt: new Date().toISOString() }
    )

    // Archive old messages (keep last 10)
    await this.archiveOldMessages(tenantId, threadId, 10)

    return summaryId
  }

  private async archiveOldMessages(
    tenantId: string,
    threadId: string,
    keepLast: number
  ): Promise<void> {
    // Get messages to keep
    const toKeep = await prisma.conversationalMemory.findMany({
      where: { tenantId, threadId },
      orderBy: { createdAt: 'desc' },
      take: keepLast,
      select: { id: true },
    })

    const keepIds = toKeep.map((m) => m.id)

    // Delete older messages
    await prisma.conversationalMemory.deleteMany({
      where: {
        tenantId,
        threadId,
        id: { notIn: keepIds },
      },
    })
  }

  // ============================================================================
  // Helper Functions
  // ============================================================================

  /**
   * Calculate NDCG and MRR for retrieval quality
   */
  private calculateRetrievalScores(docs: ScoredDocument[]): RetrievalScores {
    if (docs.length === 0) {
      return { ndcg: 0, mrr: 0 }
    }

    const relevanceScores = docs.map((d) => d.relevance)
    const idealScores = [...relevanceScores].sort((a, b) => b - a)

    // NDCG calculation
    const dcg = relevanceScores.reduce(
      (sum, rel, i) => sum + rel / Math.log2(i + 2),
      0
    )
    const idcg = idealScores.reduce(
      (sum, rel, i) => sum + rel / Math.log2(i + 2),
      0
    )
    const ndcg = idcg > 0 ? dcg / idcg : 0

    // MRR: first relevant result position
    const firstRelevantIdx = docs.findIndex((d) => d.relevance > 0.5)
    const mrr = firstRelevantIdx >= 0 ? 1 / (firstRelevantIdx + 1) : 0

    return { ndcg, mrr }
  }

  /**
   * Invalidate all caches for a tenant
   */
  invalidateCache(tenantId: string): void {
    this.cache.invalidate(tenantId)
  }
}

// Singleton instance
let memoryManager: MemoryManager | null = null

export function getMemoryManager(config?: MemoryConfig): MemoryManager {
  if (!memoryManager) {
    if (!config) {
      throw new Error('MemoryManager not initialized. Provide config on first call.')
    }
    memoryManager = new MemoryManager(config)
  }
  return memoryManager
}
