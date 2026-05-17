// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

/**
 * Toolbox Service
 *
 * Tool registry for agent tool calling:
 * - Register tools with descriptions and schemas
 * - Semantic tool discovery via vector search
 * - Tool execution with logging
 * - Built-in tools for web search, research, etc.
 *
 * Based on patterns from agent-research-assistant/backend/toolbox.py
 */

import { query } from '../lib/db.js';
import { createEmbeddingClient, toPgVector } from '../lib/embedding/index.js';
import { arxivSearch, webSearch } from './advanced-rag.js';

// ============================================================================
// Types
// ============================================================================

export interface ToolParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  required?: boolean;
  default?: unknown;
  enum?: string[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  category: string;
  parameters: ToolParameter[];
  /** If true, augments context rather than returning direct output */
  augment?: boolean;
  /** The actual function to execute */
  handler: ToolHandler;
}

export type ToolHandler = (params: Record<string, unknown>) => Promise<ToolResult>;

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
  /** Additional context to inject into prompt */
  context?: string;
}

export interface ToolExecutionLog {
  toolName: string;
  input: Record<string, unknown>;
  output: ToolResult;
  status: 'success' | 'error';
  durationMs: number;
  timestamp: Date;
}

export interface ToolMatch {
  name: string;
  description: string;
  category: string;
  score: number;
}

// ============================================================================
// Toolbox Class
// ============================================================================

export class Toolbox {
  private tools: Map<string, ToolDefinition> = new Map();
  private embeddings: Map<string, number[]> = new Map();
  private tenantId: string;
  private userId: string;

  constructor(tenantId: string, userId: string) {
    this.tenantId = tenantId;
    this.userId = userId;

    // Register built-in tools
    this.registerBuiltInTools();
  }

  /**
   * Register a tool with the toolbox
   */
  registerTool(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool);
    console.log(`[Toolbox] Registered tool: ${tool.name} (${tool.category})`);
  }

  /**
   * Get a tool by name
   */
  getTool(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  /**
   * Get all registered tools
   */
  getAllTools(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get tools by category
   */
  getToolsByCategory(category: string): ToolDefinition[] {
    return this.getAllTools().filter(t => t.category === category);
  }

  /**
   * Semantic tool discovery - find tools relevant to a query
   */
  async findRelevantTools(queryText: string, topK: number = 5): Promise<ToolMatch[]> {
    if (!queryText.trim()) return [];

    try {
      // Generate query embedding
      const embeddingClient = createEmbeddingClient('openai');
      const embeddingResponse = await embeddingClient.embed({ input: queryText });
      const queryEmbedding = embeddingResponse.embeddings[0].embedding;

      // Generate embeddings for tools if not cached
      for (const tool of this.tools.values()) {
        if (!this.embeddings.has(tool.name)) {
          const toolText = `${tool.name}: ${tool.description}. Parameters: ${tool.parameters.map(p => p.name).join(', ')}`;
          const toolEmbResponse = await embeddingClient.embed({ input: toolText });
          this.embeddings.set(tool.name, toolEmbResponse.embeddings[0].embedding);
        }
      }

      // Calculate similarities
      const matches: ToolMatch[] = [];
      for (const tool of this.tools.values()) {
        const toolEmb = this.embeddings.get(tool.name);
        if (!toolEmb) continue;

        const similarity = this.cosineSimilarity(queryEmbedding, toolEmb);
        matches.push({
          name: tool.name,
          description: tool.description,
          category: tool.category,
          score: similarity,
        });
      }

      // Sort by similarity and return top-k
      matches.sort((a, b) => b.score - a.score);
      return matches.slice(0, topK);
    } catch (error) {
      console.error('Tool discovery error:', error);
      return [];
    }
  }

  /**
   * Execute a tool by name
   */
  async executeTool(
    toolName: string,
    params: Record<string, unknown>
  ): Promise<ToolExecutionLog> {
    const startTime = Date.now();
    const tool = this.tools.get(toolName);

    if (!tool) {
      return {
        toolName,
        input: params,
        output: { success: false, error: `Tool not found: ${toolName}` },
        status: 'error',
        durationMs: Date.now() - startTime,
        timestamp: new Date(),
      };
    }

    try {
      // Validate required parameters
      for (const param of tool.parameters) {
        if (param.required && !(param.name in params)) {
          throw new Error(`Missing required parameter: ${param.name}`);
        }
      }

      // Execute the tool
      const result = await tool.handler(params);

      const log: ToolExecutionLog = {
        toolName,
        input: params,
        output: result,
        status: result.success ? 'success' : 'error',
        durationMs: Date.now() - startTime,
        timestamp: new Date(),
      };

      // Optionally persist the log
      await this.logToolExecution(log);

      return log;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const log: ToolExecutionLog = {
        toolName,
        input: params,
        output: { success: false, error: errorMessage },
        status: 'error',
        durationMs: Date.now() - startTime,
        timestamp: new Date(),
      };

      await this.logToolExecution(log);
      return log;
    }
  }

  /**
   * Log tool execution to database
   */
  private async logToolExecution(log: ToolExecutionLog): Promise<void> {
    try {
      await query(
        `INSERT INTO tool_executions (
          tenant_id, user_id, tool_name, input, output,
          status, duration_ms, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          this.tenantId,
          this.userId,
          log.toolName,
          JSON.stringify(log.input),
          JSON.stringify(log.output),
          log.status,
          log.durationMs,
          log.timestamp,
        ]
      );
    } catch (error) {
      // Log table may not exist yet - silently fail
      console.debug('Tool execution logging skipped:', error);
    }
  }

  /**
   * Get tool execution history
   */
  async getExecutionHistory(limit: number = 20): Promise<ToolExecutionLog[]> {
    try {
      const result = await query(
        `SELECT tool_name AS "toolName", input, output, status, duration_ms AS "durationMs", created_at AS "createdAt"
         FROM tool_executions
         WHERE tenant_id = $1 AND user_id = $2
         ORDER BY created_at DESC
         LIMIT $3`,
        [this.tenantId, this.userId, limit]
      );

      return result.rows.map((row: any) => ({
        toolName: row.toolName,
        input: row.input,
        output: row.output,
        status: row.status,
        durationMs: row.durationMs,
        timestamp: row.createdAt,
      }));
    } catch {
      return [];
    }
  }

  /**
   * Generate OpenAI-compatible function schemas for all tools
   */
  generateFunctionSchemas(): Array<{
    type: 'function';
    function: {
      name: string;
      description: string;
      parameters: {
        type: 'object';
        properties: Record<string, unknown>;
        required: string[];
      };
    };
  }> {
    return this.getAllTools().map(tool => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: {
          type: 'object' as const,
          properties: Object.fromEntries(
            tool.parameters.map(p => [
              p.name,
              {
                type: p.type,
                description: p.description,
                ...(p.enum ? { enum: p.enum } : {}),
                ...(p.default !== undefined ? { default: p.default } : {}),
              },
            ])
          ),
          required: tool.parameters.filter(p => p.required).map(p => p.name),
        },
      },
    }));
  }

  /**
   * Format tools for prompt injection
   */
  formatToolsForPrompt(): string {
    const tools = this.getAllTools();
    if (!tools.length) return '';

    const toolDescriptions = tools.map(tool => {
      const params = tool.parameters
        .map(p => `${p.name}${p.required ? '*' : ''}: ${p.type} - ${p.description}`)
        .join('\n    ');

      return `- **${tool.name}** [${tool.category}]\n  ${tool.description}\n  Parameters:\n    ${params}`;
    });

    return `## Available Tools\n\n${toolDescriptions.join('\n\n')}`;
  }

  // ============================================================================
  // Built-in Tools
  // ============================================================================

  private registerBuiltInTools(): void {
    // Web Search Tool
    this.registerTool({
      name: 'web_search',
      description: 'Search the web for information. Use when RAG has no relevant results.',
      category: 'research',
      augment: true,
      parameters: [
        {
          name: 'query',
          type: 'string',
          description: 'The search query',
          required: true,
        },
        {
          name: 'maxResults',
          type: 'number',
          description: 'Maximum number of results to return',
          default: 5,
        },
      ],
      handler: async (params) => {
        const queryText = params.query as string;
        const maxResults = (params.maxResults as number) || 5;

        const results = await webSearch(queryText);
        const limitedResults = results.slice(0, maxResults);

        return {
          success: true,
          data: limitedResults,
          context: limitedResults.length > 0
            ? `Web search results for "${queryText}":\n${limitedResults.map((r, i) => `${i + 1}. ${r.title}: ${r.snippet}`).join('\n')}`
            : `No web results found for "${queryText}"`,
        };
      },
    });

    // arXiv Search Tool
    this.registerTool({
      name: 'arxiv_search',
      description: 'Search arXiv for academic papers. Use for research and scientific queries.',
      category: 'research',
      augment: true,
      parameters: [
        {
          name: 'query',
          type: 'string',
          description: 'The search query for arXiv papers',
          required: true,
        },
        {
          name: 'maxResults',
          type: 'number',
          description: 'Maximum number of papers to return',
          default: 5,
        },
      ],
      handler: async (params) => {
        const queryText = params.query as string;
        const maxResults = (params.maxResults as number) || 5;

        const results = await arxivSearch(queryText, maxResults);

        return {
          success: true,
          data: results,
          context: results.length > 0
            ? `arXiv papers for "${queryText}":\n${results.map((r, i) => `${i + 1}. ${r.title}\n   ${r.snippet.slice(0, 200)}...\n   URL: ${r.url}`).join('\n\n')}`
            : `No arXiv papers found for "${queryText}"`,
        };
      },
    });

    // Get Current Time Tool
    this.registerTool({
      name: 'get_current_time',
      description: 'Get the current date and time.',
      category: 'utility',
      augment: false,
      parameters: [
        {
          name: 'detailed',
          type: 'boolean',
          description: 'Include milliseconds if true',
          default: false,
        },
      ],
      handler: async (params) => {
        const detailed = params.detailed as boolean;
        const now = new Date();

        const timeStr = detailed
          ? now.toISOString()
          : now.toLocaleString('en-US', {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            });

        return {
          success: true,
          data: { timestamp: now.toISOString(), formatted: timeStr },
        };
      },
    });

    // RAG Collection Stats Tool
    this.registerTool({
      name: 'get_rag_stats',
      description: 'Get statistics about RAG collections and documents.',
      category: 'knowledge',
      augment: false,
      parameters: [
        {
          name: 'collectionId',
          type: 'string',
          description: 'Optional collection ID to filter stats',
        },
      ],
      handler: async (params) => {
        const collectionId = params.collectionId as string | undefined;

        let sql = `
          SELECT
            COUNT(DISTINCT c.id) as collection_count,
            COUNT(DISTINCT d.id) as document_count,
            COUNT(ch.id) as chunk_count,
            COALESCE(SUM(d.size_bytes), 0) as total_bytes
          FROM rag_collections c
          LEFT JOIN rag_documents d ON d.collection_id = c.id AND d.deleted_at IS NULL
          LEFT JOIN rag_chunks ch ON ch.document_id = d.id
          WHERE c.tenant_id = $1 AND c.deleted_at IS NULL
        `;
        const sqlParams: unknown[] = [this.tenantId];

        if (collectionId) {
          sql += ` AND c.id = $2`;
          sqlParams.push(collectionId);
        }

        const result = await query(sql, sqlParams);
        const stats = result.rows[0];

        return {
          success: true,
          data: {
            collections: parseInt(stats.collection_count),
            documents: parseInt(stats.document_count),
            chunks: parseInt(stats.chunk_count),
            totalSizeBytes: parseInt(stats.total_bytes),
            totalSizeMB: Math.round(parseInt(stats.total_bytes) / 1024 / 1024 * 100) / 100,
          },
        };
      },
    });

    // Calculator Tool
    this.registerTool({
      name: 'calculate',
      description: 'Perform basic mathematical calculations.',
      category: 'utility',
      augment: false,
      parameters: [
        {
          name: 'expression',
          type: 'string',
          description: 'Mathematical expression to evaluate (e.g., "2 + 2", "sqrt(16)")',
          required: true,
        },
      ],
      handler: async (params) => {
        const expression = params.expression as string;

        // Safe math evaluation using Function constructor
        // Only allow numbers, operators, parentheses, and basic math functions
        const sanitized = expression.replace(/[^0-9+\-*/().sqrt,pow\s]/gi, '');

        if (sanitized !== expression.replace(/\s/g, '')) {
          return {
            success: false,
            error: 'Invalid characters in expression. Only numbers and basic operators allowed.',
          };
        }

        try {
          // Replace math function names with Math. prefix
          const withMathPrefix = sanitized
            .replace(/sqrt/gi, 'Math.sqrt')
            .replace(/pow/gi, 'Math.pow');

          // Use Function constructor for safer eval
          const result = new Function(`return ${withMathPrefix}`)();

          if (typeof result !== 'number' || !isFinite(result)) {
            return {
              success: false,
              error: 'Calculation resulted in invalid number',
            };
          }

          return {
            success: true,
            data: { expression, result },
          };
        } catch (error) {
          return {
            success: false,
            error: `Calculation error: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      },
    });
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
    return magnitude === 0 ? 0 : dotProduct / magnitude;
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a toolbox instance for a user
 */
export function createToolbox(tenantId: string, userId: string): Toolbox {
  return new Toolbox(tenantId, userId);
}
