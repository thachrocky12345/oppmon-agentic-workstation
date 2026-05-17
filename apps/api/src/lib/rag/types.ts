// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

/**
 * RAG (Retrieval Augmented Generation) Types
 *
 * Types and interfaces for the RAG pipeline that combines
 * semantic search with LLM generation for grounded responses.
 */

import { LLMProvider, LLMMessage } from '../llm/types.js';
import { EmbeddingProvider } from '../embedding/types.js';

// ============================================================================
// Core Types
// ============================================================================

/**
 * RAG retrieval strategy
 */
export type RetrievalStrategy = 'simple' | 'hybrid' | 'rerank';

/**
 * A single retrieved document/chunk
 */
export interface RetrievedDocument {
  /** Unique identifier */
  id: string;
  /** Source type (skill, agent, document, etc.) */
  sourceType: string;
  /** Source record ID */
  sourceId: string;
  /** Document content */
  content: string;
  /** Relevance score (0-1) */
  score: number;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Result of the retrieval phase
 */
export interface RetrievalResult {
  /** Retrieved documents ranked by relevance */
  documents: RetrievedDocument[];
  /** Query used for retrieval */
  query: string;
  /** Total documents searched */
  totalSearched: number;
  /** Time taken for retrieval (ms) */
  retrievalTimeMs: number;
}

// ============================================================================
// Request/Response Types
// ============================================================================

/**
 * RAG query request
 */
export interface RAGRequest {
  /** User's question or query */
  query: string;
  /** Optional conversation history for context */
  history?: LLMMessage[];
  /** Optional session ID to maintain conversation state */
  sessionId?: string;
  /** Filter retrieval by source types */
  sourceTypes?: string[];
  /** Filter retrieval by source IDs */
  sourceIds?: string[];
  /** Maximum number of documents to retrieve */
  topK?: number;
  /** Minimum relevance threshold (0-1) */
  threshold?: number;
  /** LLM provider to use */
  llmProvider?: LLMProvider;
  /** LLM model to use */
  llmModel?: string;
  /** Embedding provider to use */
  embeddingProvider?: EmbeddingProvider;
  /** Custom system prompt (optional) */
  systemPrompt?: string;
  /** Temperature for LLM generation */
  temperature?: number;
  /** Maximum tokens for response */
  maxTokens?: number;
  /** Include sources in response */
  includeSources?: boolean;
  /** Include retrieval metadata */
  includeMetadata?: boolean;
}

/**
 * Source citation for grounding
 */
export interface SourceCitation {
  /** Source ID */
  id: string;
  /** Source type */
  sourceType: string;
  /** Source record ID */
  sourceId: string;
  /** Relevance score */
  score: number;
  /** Excerpt used */
  excerpt?: string;
}

/**
 * RAG query response
 */
export interface RAGResponse {
  /** Generated answer */
  answer: string;
  /** Sources used for grounding */
  sources: SourceCitation[];
  /** Session ID for follow-up queries */
  sessionId: string;
  /** LLM model used */
  model: string;
  /** LLM provider used */
  provider: LLMProvider;
  /** Token usage */
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  /** Retrieval metadata (if requested) */
  retrieval?: {
    documentsRetrieved: number;
    retrievalTimeMs: number;
    query: string;
  };
}

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * RAG pipeline configuration
 */
export interface RAGConfig {
  /** Default number of documents to retrieve */
  defaultTopK: number;
  /** Default relevance threshold */
  defaultThreshold: number;
  /** Maximum context length (tokens) */
  maxContextTokens: number;
  /** Retrieval strategy */
  strategy: RetrievalStrategy;
  /** Default LLM provider */
  llmProvider: LLMProvider;
  /** Default embedding provider */
  embeddingProvider: EmbeddingProvider;
  /** Include sources by default */
  includeSources: boolean;
  /** System prompt template */
  systemPromptTemplate: string;
  /** Context formatting template */
  contextTemplate: string;
}

/**
 * Context window configuration
 */
export interface ContextWindowConfig {
  /** Maximum tokens for context */
  maxTokens: number;
  /** Reserve tokens for system prompt */
  systemPromptReserve: number;
  /** Reserve tokens for response */
  responseReserve: number;
  /** Truncation strategy */
  truncationStrategy: 'first' | 'last' | 'middle';
}

// ============================================================================
// Prompt Templates
// ============================================================================

/**
 * Default system prompt for RAG
 */
export const DEFAULT_RAG_SYSTEM_PROMPT = `You are a helpful AI assistant with access to a knowledge base. Answer the user's question based on the provided context.

Guidelines:
- Use the context to ground your answers in factual information
- If the context doesn't contain relevant information, say so
- Be concise but thorough
- Cite sources when making specific claims
- If you're unsure, acknowledge uncertainty`;

/**
 * Default context template
 */
export const DEFAULT_CONTEXT_TEMPLATE = `## Relevant Context

{{#each documents}}
### Source: {{sourceType}}/{{sourceId}} (Relevance: {{score}})
{{content}}

{{/each}}`;

/**
 * Default query template
 */
export const DEFAULT_QUERY_TEMPLATE = `Based on the context above, please answer the following question:

{{query}}`;

// ============================================================================
// Error Types
// ============================================================================

/**
 * RAG-specific error
 */
export class RAGError extends Error {
  constructor(
    message: string,
    public code: string,
    public phase: 'retrieval' | 'generation' | 'formatting',
    public details?: unknown
  ) {
    super(message);
    this.name = 'RAGError';
  }

  static retrievalFailed(message: string, details?: unknown): RAGError {
    return new RAGError(message, 'RETRIEVAL_FAILED', 'retrieval', details);
  }

  static noDocumentsFound(): RAGError {
    return new RAGError(
      'No relevant documents found for the query',
      'NO_DOCUMENTS',
      'retrieval'
    );
  }

  static contextTooLong(tokenCount: number, maxTokens: number): RAGError {
    return new RAGError(
      `Context exceeds maximum tokens: ${tokenCount} > ${maxTokens}`,
      'CONTEXT_TOO_LONG',
      'formatting',
      { tokenCount, maxTokens }
    );
  }

  static generationFailed(message: string, details?: unknown): RAGError {
    return new RAGError(message, 'GENERATION_FAILED', 'generation', details);
  }
}
