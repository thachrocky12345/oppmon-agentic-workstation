/**
 * Agent Engine
 *
 * High-performance agent execution engine with Go orchestration and Rust compute.
 * This TypeScript package provides:
 * - Wire format encoding/decoding (compatible with Rust Postcard)
 * - Parallel tool execution
 * - Risk gate with interceptor chain
 * - Deterministic replay for debugging
 *
 * @example
 * ```typescript
 * import { ToolExecutor, RiskGate, createEnvelope } from '@arkon/agent-engine'
 *
 * // Create tool executor
 * const executor = new ToolExecutor({ maxWorkers: 8 })
 * executor.register('search', async (call) => ({
 *   output: `Results for: ${call.arguments.query}`,
 *   status: 'success'
 * }))
 *
 * // Execute tools in parallel
 * const results = await executor.executeBatch({
 *   tools: [{ id: '1', name: 'search', arguments: { query: 'test' } }],
 *   timeoutMs: 30000,
 *   maxParallel: 4
 * })
 * ```
 *
 * @packageDocumentation
 */

// Types
export type {
  Envelope,
  ChatRequest,
  ToolCall,
  ToolBatch,
  VectorQuery,
  EmbedRequest,
  AgentRequest,
  ToolStatus,
  ToolResult,
  ScoredDocument,
  StreamEvent,
  ErrorResponse,
  AgentResponse,
  Decision,
  Interceptor,
  ReplayLogEntry,
  ReplayLogMetadata,
  EngineConfig,
} from './types.js'

export {
  ChatRequestSchema,
  ToolCallSchema,
  ToolBatchSchema,
  VectorQuerySchema,
  EmbedRequestSchema,
  ToolStatusSchema,
  DEFAULT_ENGINE_CONFIG,
  createEnvelope,
  getLatencyUs,
} from './types.js'

// Wire Format
export {
  encode,
  encodeToArray,
  decode,
  decodeFromArray,
  readFrameLength,
  hasCompleteFrame,
  extractFrame,
  WireFormatError,
} from './wire.js'

// Tools
export {
  ToolExecutor,
  DEFAULT_EXECUTOR_CONFIG,
  createMockHandler,
  createUnreliableHandler,
  calculateBatchMetrics,
} from './tools.js'

export type {
  ToolHandler,
  ToolExecutorConfig,
  BatchMetrics,
} from './tools.js'

// Risk Gate
export {
  RiskGate,
  KillSwitch,
  RateLimiter,
  ConfidenceThreshold,
  ContentFilter,
  TenantIsolation,
  createDefaultRiskGate,
} from './risk.js'

// Replay
export {
  SeededRng,
  ReplayLog,
  DeterministicContext,
  createDeterministicContext,
} from './replay.js'
