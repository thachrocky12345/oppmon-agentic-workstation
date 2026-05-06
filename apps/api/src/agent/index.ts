/**
 * Agent Module Exports
 *
 * Central export point for agent memory and tool systems.
 */

// Types
export * from './memory-types'

// Memory Manager
export { MemoryManager, getMemoryManager } from './memory-manager'

// Semantic Cache
export { SemanticCache } from './semantic-cache'

// Toolbox
export {
  Toolbox,
  getToolbox,
  extractToolCalls,
  buildSynthesisPrompt,
  type ToolDefinition,
  type ToolCall,
  type ToolResult,
  type ExecutionContext,
  type ParameterSchema,
} from './toolbox'

// Built-in Tools
export { registerBuiltinTools, registerRetrievalTools } from './tools'

// Oracle Loop
export {
  oracleLoop,
  preprocessRequest,
  buildPartitionedContext,
  formatSSE,
  streamToResponse,
  type StreamEvent,
  type AgentConfig,
  type OracleContext,
  type LLMClient,
} from './oracle-loop'

// Advanced RAG (REFRAG + MMR)
export {
  mmrSelect,
  reciprocalRankFusion,
  hydeExpand,
  chunkDocument,
  compressDocument,
  cosineSimilarity,
  HybridRAG,
  createREFRAGPipeline,
  defaultAdvancedRAGConfig,
  type CompressionConfig,
  type MMRConfig,
  type HyDEConfig,
  type AdvancedRAGConfig,
  type HybridRetriever,
} from './advanced-rag'

// Domain Pipelines
export {
  DomainDetector,
  softwareDevelopmentPipeline,
  securityResearchPipeline,
  createDefaultDetector,
  processDomainContext,
  type DomainPipeline,
  type ExtractedEntity,
  type EnrichedEntity,
  type EnrichedData,
  type DetectionResult,
} from './domain-pipelines'
