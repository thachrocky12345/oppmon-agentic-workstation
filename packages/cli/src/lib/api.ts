/**
 * API Client
 *
 * HTTP client for communicating with the Arkon API
 */

import { getApiUrl } from './config.js'
import { getAccessToken } from './credentials.js'

export interface ApiResponse<T> {
  data: T
  meta?: {
    total: number
    limit: number
    offset: number
  }
}

export interface ApiError {
  error: string
  code?: string
  details?: Record<string, unknown>
}

export interface Skill {
  id: string
  name: string
  description?: string
  content: string
  version: number
  sha256: string
  scope: 'TENANT' | 'TEAM'
  teamId?: string
  createdAt: string
  updatedAt: string
}

export interface CreateSkillInput {
  name: string
  description?: string
  content: string
  scope: 'TENANT' | 'TEAM'
  teamId?: string
}

export interface UpdateSkillInput {
  description?: string
  content?: string
  scope?: 'TENANT' | 'TEAM'
  teamId?: string
}

// MCP Server types

export interface McpServer {
  id: string
  name: string
  description?: string
  command: string
  args: string[]
  env: Record<string, string>
  version: string
  sha256: string
  scope: 'TENANT' | 'TEAM'
  teamId?: string
  enabled: boolean
  createdAt: string
  updatedAt: string
}

export interface CreateMcpServerInput {
  name: string
  description?: string
  command: string
  args?: string[]
  env?: Record<string, string>
  version?: string
  scope: 'TENANT' | 'TEAM'
  teamId?: string
  enabled?: boolean
}

export interface UpdateMcpServerInput {
  description?: string
  command?: string
  args?: string[]
  env?: Record<string, string>
  version?: string
  scope?: 'TENANT' | 'TEAM'
  teamId?: string
  enabled?: boolean
}

// Embedding types

export interface Embedding {
  id: string
  sourceType: string
  sourceId: string
  content: string
  contentHash: string
  provider: string
  model: string
  dimensions: number
  metadata?: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface EmbedInput {
  content: string
  sourceType: string
  sourceId: string
  provider?: 'openai' | 'gemini' | 'voyage' | 'cohere'
  model?: string
  metadata?: Record<string, unknown>
  skipIfExists?: boolean
}

export interface EmbedBatchInput {
  items: Array<{
    content: string
    sourceType: string
    sourceId: string
    metadata?: Record<string, unknown>
  }>
  provider?: 'openai' | 'gemini' | 'voyage' | 'cohere'
  model?: string
  skipIfExists?: boolean
}

export interface EmbedResult extends Embedding {
  created: boolean
}

export interface SearchInput {
  query: string
  sourceType?: string
  sourceIds?: string[]
  limit?: number
  threshold?: number
  includeContent?: boolean
  includeMetadata?: boolean
}

export interface SearchResult {
  id: string
  sourceType: string
  sourceId: string
  content?: string
  score: number
  metadata?: Record<string, unknown>
}

export interface EmbeddingStats {
  total: number
  bySourceType: Record<string, number>
  byProvider: Record<string, number>
  byModel: Record<string, number>
}

export interface ReindexInput {
  types?: Array<'skill' | 'agent'>
  batchSize?: number
  dryRun?: boolean
}

export interface ReindexResult {
  dryRun: boolean
  results: Record<string, { total: number; processed: number; failed: number }>
  totals: { total: number; processed: number; failed: number }
}

export interface CoverageResult {
  skill: { total: number; embedded: number; coverage: number }
  agent: { total: number; embedded: number; coverage: number }
}

// RAG types

export interface RAGQueryInput {
  query: string
  sessionId?: string
  sourceTypes?: string[]
  sourceIds?: string[]
  topK?: number
  threshold?: number
  llmProvider?: 'ollama' | 'cerebras' | 'anthropic'
  llmModel?: string
  embeddingProvider?: 'openai' | 'gemini' | 'voyage' | 'cohere'
  systemPrompt?: string
  temperature?: number
  maxTokens?: number
  includeSources?: boolean
  includeMetadata?: boolean
}

export interface RAGSource {
  id: string
  sourceType: string
  sourceId: string
  content: string
  score: number
  metadata?: Record<string, unknown>
}

export interface RAGResponse {
  answer: string
  sessionId: string
  sources: RAGSource[]
  provider: string
  model: string
  usage: {
    inputTokens: number
    outputTokens: number
    totalTokens: number
  }
}

export interface RAGRetrieveInput {
  query: string
  sourceTypes?: string[]
  sourceIds?: string[]
  topK?: number
  threshold?: number
  embeddingProvider?: 'openai' | 'gemini' | 'voyage' | 'cohere'
}

export interface RAGRetrieveResult {
  documents: Array<{
    id: string
    sourceType: string
    sourceId: string
    content: string
    score: number
    metadata?: Record<string, unknown>
  }>
  query: string
  totalSearched: number
  retrievalTimeMs: number
}

export interface RAGStatus {
  llmAvailable: boolean
  embeddingAvailable: boolean
  defaultLlmProvider: string
  defaultEmbeddingProvider: string
  config: {
    defaultTopK: number
    defaultThreshold: number
    maxContextTokens: number
    strategy: string
  }
}

export interface RAGSession {
  id: string
  title?: string
  messageCount: number
  createdAt: string
  updatedAt: string
}

export interface RAGUsageStats {
  totalQueries: number
  totalSessions: number
  totalInputTokens: number
  totalOutputTokens: number
  averageSourcesPerQuery: number
}

// Usage Events types

export interface UsageEventInput {
  resource_type: 'skill' | 'mcp_server' | 'rag_query'
  resource_id: string
  action: string
  timestamp?: string
  metadata?: Record<string, unknown>
}

export interface UsageStats {
  period: string
  totalEvents: number
  timeSeries: Array<{
    timestamp: string
    count: number
  }>
  byResourceType: Array<{
    resourceType: string
    count: number
  }>
  byAction: Array<{
    action: string
    count: number
  }>
}

export class ApiClient {
  private baseUrl: string
  private token: string | null

  constructor() {
    this.baseUrl = getApiUrl()
    this.token = getAccessToken()
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    if (!this.token) {
      throw new Error('Not authenticated. Run "tag login" first.')
    }

    const url = `${this.baseUrl}${path}`
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.token}`,
    }

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    })

    if (!response.ok) {
      const error = (await response.json().catch(() => ({
        error: `HTTP ${response.status}: ${response.statusText}`,
      }))) as ApiError
      throw new Error(error.error || `API error: ${response.status}`)
    }

    return response.json() as Promise<T>
  }

  // Skills API

  async listSkills(options?: {
    scope?: 'TENANT' | 'TEAM'
    search?: string
    limit?: number
    offset?: number
  }): Promise<ApiResponse<Skill[]>> {
    const params = new URLSearchParams()
    if (options?.scope) params.set('scope', options.scope)
    if (options?.search) params.set('search', options.search)
    if (options?.limit) params.set('limit', options.limit.toString())
    if (options?.offset) params.set('offset', options.offset.toString())

    const query = params.toString()
    return this.request('GET', `/api/skills${query ? `?${query}` : ''}`)
  }

  async getSkill(id: string): Promise<ApiResponse<Skill>> {
    return this.request('GET', `/api/skills/${id}`)
  }

  async getSkillByName(name: string): Promise<Skill | null> {
    const response = await this.listSkills({ search: name, limit: 100 })
    return response.data.find((s) => s.name === name) || null
  }

  async createSkill(input: CreateSkillInput): Promise<ApiResponse<Skill>> {
    return this.request('POST', '/api/skills', input)
  }

  async updateSkill(
    id: string,
    input: UpdateSkillInput
  ): Promise<ApiResponse<Skill>> {
    return this.request('PUT', `/api/skills/${id}`, input)
  }

  async deleteSkill(id: string): Promise<{ success: boolean }> {
    return this.request('DELETE', `/api/skills/${id}`)
  }

  // MCP API

  async listMcpServers(options?: {
    scope?: 'TENANT' | 'TEAM'
    search?: string
    enabled?: boolean
    limit?: number
    offset?: number
  }): Promise<ApiResponse<McpServer[]>> {
    const params = new URLSearchParams()
    if (options?.scope) params.set('scope', options.scope)
    if (options?.search) params.set('search', options.search)
    if (options?.enabled !== undefined) params.set('enabled', options.enabled.toString())
    if (options?.limit) params.set('limit', options.limit.toString())
    if (options?.offset) params.set('offset', options.offset.toString())

    const query = params.toString()
    return this.request('GET', `/api/mcp${query ? `?${query}` : ''}`)
  }

  async getMcpServer(id: string): Promise<ApiResponse<McpServer>> {
    return this.request('GET', `/api/mcp/${id}`)
  }

  async getMcpServerByName(name: string): Promise<McpServer | null> {
    const response = await this.listMcpServers({ search: name, limit: 100 })
    return response.data.find((s) => s.name === name) || null
  }

  async createMcpServer(input: CreateMcpServerInput): Promise<ApiResponse<McpServer>> {
    return this.request('POST', '/api/mcp', input)
  }

  async updateMcpServer(
    id: string,
    input: UpdateMcpServerInput
  ): Promise<ApiResponse<McpServer>> {
    return this.request('PUT', `/api/mcp/${id}`, input)
  }

  async deleteMcpServer(id: string): Promise<{ success: boolean }> {
    return this.request('DELETE', `/api/mcp/${id}`)
  }

  async toggleMcpServer(id: string, enabled: boolean): Promise<ApiResponse<McpServer>> {
    return this.request('PATCH', `/api/mcp/${id}/toggle`, { enabled })
  }

  // Health check
  async healthCheck(): Promise<{ status: string }> {
    const url = `${this.baseUrl}/api/health`
    const response = await fetch(url)
    return response.json()
  }

  // Embedding API

  async embed(input: EmbedInput): Promise<ApiResponse<EmbedResult>> {
    return this.request('POST', '/api/embedding/embed', input)
  }

  async embedBatch(input: EmbedBatchInput): Promise<ApiResponse<EmbedResult[]> & { meta: { total: number; created: number; skipped: number } }> {
    return this.request('POST', '/api/embedding/embed-batch', input)
  }

  async searchEmbeddings(input: SearchInput): Promise<ApiResponse<SearchResult[]>> {
    return this.request('POST', '/api/embedding/search', input)
  }

  async listEmbeddings(options?: {
    sourceType?: string
    sourceId?: string
    limit?: number
    offset?: number
  }): Promise<ApiResponse<Embedding[]>> {
    const params = new URLSearchParams()
    if (options?.sourceType) params.set('sourceType', options.sourceType)
    if (options?.sourceId) params.set('sourceId', options.sourceId)
    if (options?.limit) params.set('limit', options.limit.toString())
    if (options?.offset) params.set('offset', options.offset.toString())

    const query = params.toString()
    return this.request('GET', `/api/embedding${query ? `?${query}` : ''}`)
  }

  async getEmbedding(id: string): Promise<ApiResponse<Embedding>> {
    return this.request('GET', `/api/embedding/${id}`)
  }

  async deleteEmbedding(id: string): Promise<{ success: boolean }> {
    return this.request('DELETE', `/api/embedding/${id}`)
  }

  async deleteSourceEmbeddings(sourceType: string, sourceId: string): Promise<{ success: boolean; data: { deleted: number } }> {
    return this.request('DELETE', `/api/embedding/source/${sourceType}/${sourceId}`)
  }

  async getEmbeddingStats(): Promise<ApiResponse<EmbeddingStats>> {
    return this.request('GET', '/api/embedding/stats')
  }

  async reindex(input?: ReindexInput): Promise<ApiResponse<ReindexResult>> {
    return this.request('POST', '/api/embedding/reindex', input || {})
  }

  async getEmbeddingCoverage(): Promise<ApiResponse<CoverageResult>> {
    return this.request('GET', '/api/embedding/coverage')
  }

  // RAG API

  async ragQuery(input: RAGQueryInput): Promise<ApiResponse<RAGResponse>> {
    return this.request('POST', '/api/rag/query', input)
  }

  async ragRetrieve(input: RAGRetrieveInput): Promise<ApiResponse<RAGRetrieveResult>> {
    return this.request('POST', '/api/rag/retrieve', input)
  }

  async getRagStatus(): Promise<ApiResponse<RAGStatus>> {
    return this.request('GET', '/api/rag/status')
  }

  async listRagSessions(options?: {
    limit?: number
    offset?: number
  }): Promise<ApiResponse<RAGSession[]>> {
    const params = new URLSearchParams()
    if (options?.limit) params.set('limit', options.limit.toString())
    if (options?.offset) params.set('offset', options.offset.toString())

    const query = params.toString()
    return this.request('GET', `/api/rag/sessions${query ? `?${query}` : ''}`)
  }

  async deleteRagSession(id: string): Promise<{ success: boolean }> {
    return this.request('DELETE', `/api/rag/sessions/${id}`)
  }

  async getRagUsage(options?: {
    startDate?: Date
    endDate?: Date
  }): Promise<ApiResponse<RAGUsageStats>> {
    const params = new URLSearchParams()
    if (options?.startDate) params.set('startDate', options.startDate.toISOString())
    if (options?.endDate) params.set('endDate', options.endDate.toISOString())

    const query = params.toString()
    return this.request('GET', `/api/rag/usage${query ? `?${query}` : ''}`)
  }

  // User API

  async getMe(): Promise<{ user: UserInfo }> {
    return this.request('GET', '/api/auth/me')
  }

  // Usage Events API

  async recordUsageEvent(event: UsageEventInput): Promise<void> {
    // Usage events return 204 with no body
    const url = `${this.baseUrl}/api/usage/events`
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.token}`,
    }

    await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(event),
    })
    // Don't throw on non-200 - usage API returns 204 for all cases
  }

  async recordUsageEvents(events: UsageEventInput[]): Promise<void> {
    // Usage events return 204 with no body
    const url = `${this.baseUrl}/api/usage/events/batch`
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.token}`,
    }

    await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ events }),
    })
    // Don't throw on non-200 - usage API returns 204 for all cases
  }

  async getUsageStats(period?: '24h' | '7d' | '30d'): Promise<ApiResponse<UsageStats>> {
    const params = new URLSearchParams()
    if (period) params.set('period', period)
    const query = params.toString()
    return this.request('GET', `/api/usage${query ? `?${query}` : ''}`)
  }

  async getUsageSettings(): Promise<ApiResponse<{ eventsEnabled: boolean }>> {
    return this.request('GET', '/api/usage/settings')
  }

  async updateUsageSettings(eventsEnabled: boolean): Promise<ApiResponse<{ eventsEnabled: boolean }>> {
    return this.request('PUT', '/api/usage/settings', { eventsEnabled })
  }

  // Routing Config API

  async getRoutingConfig(): Promise<ApiResponse<RoutingConfig>> {
    return this.request('GET', '/api/cli/routing-config')
  }
}

// Routing Config types

export interface RoutingConfig {
  gatewayUrl: string
  tenantId: string
  teamId?: string
  teamName?: string
  defaultModel?: {
    displayName: string
    modelIdentifier: string
    providerTemplateId: string | null
  }
  availableModels: Array<{
    displayName: string
    modelIdentifier: string
    providerTemplateId: string | null
  }>
  virtualKey?: {
    id: string
    keyPrefix: string
    label: string | null
  }
}

// User info type
export interface UserInfo {
  id: string
  email: string
  name?: string
  tenantId: string
  role: string
  teams?: Array<{ id: string; name: string; role: string }>
}

export function createApiClient(): ApiClient {
  return new ApiClient()
}
