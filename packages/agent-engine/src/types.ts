// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

/**
 * Agent Engine Types
 * Defines wire format, messages, and execution types for Go/Rust engine
 */

import { z } from 'zod'

// ============================================================================
// Envelope - Message Wrapper
// ============================================================================

/**
 * Generic message wrapper with sequence and timestamps
 * Matches the Rust Envelope<T> struct for wire format compatibility
 */
export interface Envelope<T> {
  seq: number // Monotonic sequence number
  tsEventUs: number // Event timestamp (microseconds since epoch)
  tsRecvUs: number // Receive timestamp
  payload: T
}

export function createEnvelope<T>(seq: number, payload: T): Envelope<T> {
  const now = Date.now() * 1000 // Convert to microseconds

  return {
    seq,
    tsEventUs: now,
    tsRecvUs: now,
    payload,
  }
}

export function getLatencyUs<T>(envelope: Envelope<T>): number {
  return envelope.tsRecvUs - envelope.tsEventUs
}

// ============================================================================
// Agent Request Types
// ============================================================================

export const ChatRequestSchema = z.object({
  tenantId: z.string(),
  threadId: z.string(),
  message: z.string(),
  context: z.string().optional(),
  tools: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
      parameters: z.record(z.unknown()).optional(),
    })
  ),
  maxIterations: z.number().min(1).max(10).default(5),
})

export type ChatRequest = z.infer<typeof ChatRequestSchema>

export const ToolCallSchema = z.object({
  id: z.string(),
  name: z.string(),
  arguments: z.record(z.unknown()),
})

export type ToolCall = z.infer<typeof ToolCallSchema>

export const ToolBatchSchema = z.object({
  tools: z.array(ToolCallSchema),
  timeoutMs: z.number().default(30000),
  maxParallel: z.number().min(1).max(16).default(8),
})

export type ToolBatch = z.infer<typeof ToolBatchSchema>

export const VectorQuerySchema = z.object({
  embedding: z.array(z.number()),
  topK: z.number().min(1).max(100).default(10),
  tenantFilter: z.string(),
  minScore: z.number().min(0).max(1).default(0.7),
})

export type VectorQuery = z.infer<typeof VectorQuerySchema>

export const EmbedRequestSchema = z.object({
  texts: z.array(z.string()),
  model: z.string().optional(),
})

export type EmbedRequest = z.infer<typeof EmbedRequestSchema>

export type AgentRequest =
  | { type: 'chat'; data: ChatRequest }
  | { type: 'executeTools'; data: ToolBatch }
  | { type: 'vectorSearch'; data: VectorQuery }
  | { type: 'embed'; data: EmbedRequest }

// ============================================================================
// Agent Response Types
// ============================================================================

export const ToolStatusSchema = z.enum(['success', 'error', 'timeout', 'cancelled'])
export type ToolStatus = z.infer<typeof ToolStatusSchema>

export interface ToolResult {
  id: string
  name: string
  status: ToolStatus
  output: string
  durationMs: number
}

export interface ScoredDocument {
  id: string
  content: string
  score: number
  metadata: Record<string, unknown>
}

export interface StreamEvent {
  type: 'text' | 'tool_call' | 'tool_result' | 'done' | 'error'
  content?: string
  toolCall?: ToolCall
  toolResult?: ToolResult
  error?: string
}

export interface ErrorResponse {
  code: string
  message: string
  details?: Record<string, unknown>
}

export type AgentResponse =
  | { type: 'chatStream'; data: StreamEvent }
  | { type: 'toolResults'; data: ToolResult[] }
  | { type: 'vectorResults'; data: ScoredDocument[] }
  | { type: 'embeddings'; data: number[][] }
  | { type: 'error'; data: ErrorResponse }

// ============================================================================
// Risk Gate Types
// ============================================================================

export type Decision =
  | { type: 'allow' }
  | { type: 'deny'; reason: string }
  | { type: 'modify'; response: AgentResponse }

export interface Interceptor {
  name: string
  check(request: AgentRequest, response: AgentResponse): Decision
}

// ============================================================================
// Replay Types
// ============================================================================

export interface ReplayLogEntry<T> {
  timestamp: number
  envelope: Envelope<T>
}

export interface ReplayLogMetadata {
  seed: number
  startTime: number
  endTime?: number
  entryCount: number
}

// ============================================================================
// Engine Configuration
// ============================================================================

export interface EngineConfig {
  port: number
  maxWorkers: number
  timeoutMs: number
  enableReplay: boolean
  replayPath?: string
  interceptors: string[]
}

export const DEFAULT_ENGINE_CONFIG: EngineConfig = {
  port: 9999,
  maxWorkers: 8,
  timeoutMs: 30000,
  enableReplay: false,
  interceptors: [],
}
