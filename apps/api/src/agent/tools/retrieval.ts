/**
 * Retrieval Tools
 *
 * Built-in tools for searching and retrieving information.
 */

import type { Toolbox } from '../toolbox'
import type { ExecutionContext } from '../toolbox'
import { prisma } from '../../lib/db'

/**
 * Register retrieval tools with the toolbox
 */
export function registerRetrievalTools(toolbox: Toolbox): void {
  // Search Skills
  toolbox.register(
    'search_skills',
    'Search team skills by semantic similarity. Returns skills matching the query, ranked by relevance.',
    {
      query: {
        type: 'string',
        description: 'Search query for finding relevant skills',
        required: true,
      },
      maxResults: {
        type: 'number',
        description: 'Maximum number of results to return',
        default: 5,
      },
    },
    async (args, context: ExecutionContext) => {
      const { query, maxResults = 5 } = args as {
        query: string
        maxResults?: number
      }

      const skills = await prisma.skill.findMany({
        where: {
          tenantId: context.tenantId,
          enabled: true,
          deletedAt: null,
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { description: { contains: query, mode: 'insensitive' } },
          ],
        },
        take: maxResults,
        select: {
          id: true,
          name: true,
          description: true,
          content: true,
        },
      })

      return skills.map((s) => ({
        name: s.name,
        description: s.description,
        snippet: s.content.slice(0, 500),
      }))
    },
    { augment: true, category: 'retrieval' }
  )

  // Search MCP Servers
  toolbox.register(
    'search_mcp_servers',
    'Find MCP servers by capability or name. Returns available MCP servers that match the search criteria.',
    {
      query: {
        type: 'string',
        description: 'Search query for finding MCP servers',
        required: true,
      },
      maxResults: {
        type: 'number',
        description: 'Maximum number of results to return',
        default: 5,
      },
    },
    async (args, context: ExecutionContext) => {
      const { query, maxResults = 5 } = args as {
        query: string
        maxResults?: number
      }

      const servers = await prisma.mcpServer.findMany({
        where: {
          tenantId: context.tenantId,
          enabled: true,
          deletedAt: null,
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { description: { contains: query, mode: 'insensitive' } },
          ],
        },
        take: maxResults,
        select: {
          id: true,
          name: true,
          description: true,
          command: true,
        },
      })

      return servers.map((s) => ({
        name: s.name,
        description: s.description,
        command: s.command,
      }))
    },
    { augment: true, category: 'retrieval' }
  )

  // Search Knowledge Base
  toolbox.register(
    'search_knowledge_base',
    'Query the team knowledge base for relevant documents. Uses semantic search to find the most relevant information.',
    {
      query: {
        type: 'string',
        description: 'Search query for knowledge base',
        required: true,
      },
      maxResults: {
        type: 'number',
        description: 'Maximum number of results to return',
        default: 5,
      },
      filters: {
        type: 'object',
        description: 'Optional filters for the search',
        properties: {
          category: { type: 'string' },
          dateRange: { type: 'string' },
        },
      },
    },
    async (args, context: ExecutionContext) => {
      const { query, maxResults = 5 } = args as {
        query: string
        maxResults?: number
        filters?: { category?: string; dateRange?: string }
      }

      // Use memory manager if available
      if (context.memoryManager) {
        const results = await context.memoryManager.readKnowledgeBase(
          context.tenantId,
          query,
          maxResults
        )
        return results.map((r) => ({
          content: r.content,
          relevance: r.relevance,
          metadata: r.metadata,
        }))
      }

      // Fallback to basic embedding search
      return []
    },
    { augment: true, category: 'retrieval' }
  )

  // Write Knowledge Base
  toolbox.register(
    'write_knowledge_base',
    'Persist important findings or information to the team knowledge base. Returns the document ID for future reference.',
    {
      text: {
        type: 'string',
        description: 'The text content to store in the knowledge base',
        required: true,
      },
      metadata: {
        type: 'object',
        description: 'Optional metadata for the document',
        properties: {
          source: { type: 'string' },
          category: { type: 'string' },
        },
      },
    },
    async (args, context: ExecutionContext) => {
      const { text, metadata } = args as {
        text: string
        metadata?: { source?: string; category?: string }
      }

      if (!context.memoryManager) {
        return { error: 'Memory manager not available' }
      }

      const docId = await context.memoryManager.writeKnowledgeBase(
        context.tenantId,
        text,
        metadata
      )

      return { docId, success: true }
    },
    { augment: true, category: 'memory' }
  )

  // Expand Summary
  toolbox.register(
    'expand_summary',
    'JIT retrieval of compressed conversation summaries. Use when you need more detail from a previous conversation that was summarized.',
    {
      summaryId: {
        type: 'string',
        description: 'The ID of the summary to expand',
        required: true,
      },
    },
    async (args, context: ExecutionContext) => {
      const { summaryId } = args as { summaryId: string }

      if (!context.memoryManager) {
        return { error: 'Memory manager not available' }
      }

      const expanded = await context.memoryManager.expandSummary(summaryId)
      return { content: expanded }
    },
    { augment: true, category: 'memory' }
  )
}
