// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

/**
 * Agent Memory System Types
 *
 * Type definitions for the 8-table memory architecture.
 */

// Memory role types
export type MemoryRole = 'USER' | 'ASSISTANT' | 'SYSTEM' | 'TOOL'

// Tool execution status
export type ToolLogStatus = 'SUCCESS' | 'ERROR' | 'TIMEOUT'

// Base message structure
export interface Message {
  id?: string
  role: MemoryRole
  content: string
  metadata?: Record<string, unknown>
  createdAt?: Date
}

// Document with relevance score
export interface ScoredDocument {
  id: string
  content: string
  score: number
  relevance: number
  embedding?: number[]
  metadata?: Record<string, unknown>
}

// Entity types
export interface Entity {
  id?: string
  type: string
  name: string
  description: string
  metadata?: Record<string, unknown>
}

// Summary structure
export interface Summary {
  id: string
  threadId: string
  content: string
  originalMessageCount: number
  metadata?: Record<string, unknown>
}

// Tool log entry
export interface ToolLogEntry {
  tenantId: string
  threadId: string
  toolName: string
  input: Record<string, unknown>
  output: Record<string, unknown>
  status: ToolLogStatus
  durationMs: number
}

// Prefetch result from all memory stores
export interface PrefetchResult {
  conversational: Message[]
  semantic: ScoredDocument[]
  workflow: ScoredDocument[]
  entity: ScoredDocument[]
  summary: ScoredDocument[]
  scores: RetrievalScores
}

// Retrieval quality metrics
export interface RetrievalScores {
  ndcg: number // Normalized Discounted Cumulative Gain
  mrr: number // Mean Reciprocal Rank
}

// Memory manager configuration
export interface MemoryConfig {
  databaseUrl: string
  embeddingClient?: EmbeddingClient
  maxCacheSize?: number
  defaultQueryLimit?: number
}

// Embedding client interface
export interface EmbeddingClient {
  embed(text: string): Promise<number[]>
  embedBatch(texts: string[]): Promise<number[][]>
}

// Semantic cache entry
export interface CacheEntry<T> {
  value: T
  timestamp: number
}

// Context usage calculation
export interface ContextUsage {
  totalTokens: number
  maxTokens: number
  usagePercent: number
  shouldSummarize: boolean
}

// Persona structure
export interface Persona {
  id?: string
  name: string
  content: string
  traits: string[]
  metadata?: Record<string, unknown>
}

// Workflow pattern
export interface WorkflowPattern {
  id?: string
  content: string
  metadata?: Record<string, unknown>
}

// Tool definition for toolbox memory
export interface ToolDefinition {
  toolName: string
  originalDescription: string
  augmentedDescription?: string
  category: string
  metadata?: Record<string, unknown>
}
