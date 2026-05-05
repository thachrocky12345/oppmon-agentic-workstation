/**
 * RAG Context Formatting Utilities
 *
 * Functions to format retrieved documents into prompts for LLM generation.
 * Handles token counting, truncation, and template rendering.
 */

import {
  RetrievedDocument,
  ContextWindowConfig,
  DEFAULT_RAG_SYSTEM_PROMPT,
  DEFAULT_CONTEXT_TEMPLATE,
  DEFAULT_QUERY_TEMPLATE,
} from './types.js';
import { LLMMessage } from '../llm/types.js';

// ============================================================================
// Token Estimation
// ============================================================================

/**
 * Estimate token count for text
 * Uses a simple heuristic: ~4 characters per token for English
 * For more accuracy, use tiktoken or similar
 */
export function estimateTokens(text: string): number {
  // Average of 4 characters per token for English text
  // This is a rough estimate - production should use proper tokenizer
  return Math.ceil(text.length / 4);
}

/**
 * Estimate total tokens for messages
 */
export function estimateMessagesTokens(messages: LLMMessage[]): number {
  let tokens = 0;
  for (const msg of messages) {
    // Role overhead (~4 tokens)
    tokens += 4;
    // Content tokens
    tokens += estimateTokens(msg.content);
  }
  return tokens;
}

// ============================================================================
// Context Formatting
// ============================================================================

/**
 * Format retrieved documents into context string
 */
export function formatDocumentsAsContext(
  documents: RetrievedDocument[],
  options: {
    maxTokens?: number;
    includeMetadata?: boolean;
    separator?: string;
  } = {}
): string {
  const { maxTokens = 4000, includeMetadata = false, separator = '\n\n---\n\n' } = options;

  const parts: string[] = [];
  let totalTokens = 0;

  for (const doc of documents) {
    const docText = formatSingleDocument(doc, includeMetadata);
    const docTokens = estimateTokens(docText);

    // Check if adding this document would exceed limit
    if (totalTokens + docTokens > maxTokens) {
      // Try to add a truncated version
      const remainingTokens = maxTokens - totalTokens - 50; // Buffer for truncation notice
      if (remainingTokens > 100) {
        const truncatedContent = truncateText(doc.content, remainingTokens * 4);
        parts.push(formatSingleDocument({ ...doc, content: truncatedContent + '...' }, includeMetadata));
      }
      break;
    }

    parts.push(docText);
    totalTokens += docTokens;
  }

  return parts.join(separator);
}

/**
 * Format a single document
 */
function formatSingleDocument(doc: RetrievedDocument, includeMetadata: boolean): string {
  const header = `[Source: ${doc.sourceType}/${doc.sourceId}] (Score: ${doc.score.toFixed(2)})`;

  let text = `${header}\n${doc.content}`;

  if (includeMetadata && doc.metadata) {
    const metaStr = Object.entries(doc.metadata)
      .filter(([_, v]) => v !== undefined && v !== null)
      .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
      .join(', ');
    if (metaStr) {
      text += `\nMetadata: {${metaStr}}`;
    }
  }

  return text;
}

/**
 * Truncate text to approximate character limit
 */
function truncateText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;

  // Try to truncate at sentence boundary
  const truncated = text.substring(0, maxChars);
  const lastPeriod = truncated.lastIndexOf('.');
  const lastNewline = truncated.lastIndexOf('\n');

  const breakPoint = Math.max(lastPeriod, lastNewline);
  if (breakPoint > maxChars * 0.7) {
    return truncated.substring(0, breakPoint + 1);
  }

  // Fall back to word boundary
  const lastSpace = truncated.lastIndexOf(' ');
  if (lastSpace > maxChars * 0.8) {
    return truncated.substring(0, lastSpace);
  }

  return truncated;
}

// ============================================================================
// Prompt Building
// ============================================================================

/**
 * Build the complete RAG prompt
 */
export function buildRAGPrompt(
  query: string,
  documents: RetrievedDocument[],
  options: {
    systemPrompt?: string;
    history?: LLMMessage[];
    maxContextTokens?: number;
    includeMetadata?: boolean;
  } = {}
): LLMMessage[] {
  const {
    systemPrompt = DEFAULT_RAG_SYSTEM_PROMPT,
    history = [],
    maxContextTokens = 4000,
    includeMetadata = false,
  } = options;

  const messages: LLMMessage[] = [];

  // System message with RAG instructions
  messages.push({
    role: 'system',
    content: systemPrompt,
  });

  // Add conversation history
  if (history.length > 0) {
    // Filter out system messages from history
    const historyMessages = history.filter((m) => m.role !== 'system');
    messages.push(...historyMessages);
  }

  // Build context from retrieved documents
  const context = formatDocumentsAsContext(documents, {
    maxTokens: maxContextTokens,
    includeMetadata,
  });

  // Build the user message with context and query
  const userMessage = buildUserMessageWithContext(query, context, documents.length);
  messages.push({
    role: 'user',
    content: userMessage,
  });

  return messages;
}

/**
 * Build user message with injected context
 */
function buildUserMessageWithContext(
  query: string,
  context: string,
  documentCount: number
): string {
  if (documentCount === 0) {
    return `Question: ${query}\n\nNote: No relevant documents were found in the knowledge base. Please answer based on your general knowledge, or indicate if you cannot answer without specific context.`;
  }

  return `I found ${documentCount} relevant document(s) in the knowledge base:

${context}

---

Based on the context above, please answer the following question:

${query}

Please cite the sources when making specific claims.`;
}

// ============================================================================
// Context Window Management
// ============================================================================

/**
 * Fit content within context window constraints
 */
export function fitContextWindow(
  systemPrompt: string,
  history: LLMMessage[],
  documents: RetrievedDocument[],
  query: string,
  config: ContextWindowConfig
): {
  fittedDocuments: RetrievedDocument[];
  fittedHistory: LLMMessage[];
  truncated: boolean;
} {
  const { maxTokens, systemPromptReserve, responseReserve } = config;

  // Calculate fixed costs
  const systemTokens = estimateTokens(systemPrompt);
  const queryTokens = estimateTokens(query) + 100; // Buffer for formatting

  // Available tokens for context and history
  let availableTokens = maxTokens - systemPromptReserve - responseReserve - systemTokens - queryTokens;

  // Allocate tokens: 70% for documents, 30% for history
  const docBudget = Math.floor(availableTokens * 0.7);
  const historyBudget = Math.floor(availableTokens * 0.3);

  // Fit documents
  const fittedDocuments: RetrievedDocument[] = [];
  let docTokens = 0;
  let truncated = false;

  for (const doc of documents) {
    const docText = formatSingleDocument(doc, false);
    const tokens = estimateTokens(docText);

    if (docTokens + tokens <= docBudget) {
      fittedDocuments.push(doc);
      docTokens += tokens;
    } else {
      truncated = true;
      break;
    }
  }

  // Fit history (keep most recent)
  const fittedHistory: LLMMessage[] = [];
  let historyTokens = 0;

  for (let i = history.length - 1; i >= 0; i--) {
    const msg = history[i];
    if (msg.role === 'system') continue;

    const tokens = estimateTokens(msg.content) + 4;

    if (historyTokens + tokens <= historyBudget) {
      fittedHistory.unshift(msg);
      historyTokens += tokens;
    } else {
      truncated = true;
      break;
    }
  }

  return { fittedDocuments, fittedHistory, truncated };
}

// ============================================================================
// Source Extraction
// ============================================================================

/**
 * Extract source citations from documents
 */
export function extractSourceCitations(
  documents: RetrievedDocument[],
  options: { includeExcerpt?: boolean; excerptLength?: number } = {}
): Array<{
  id: string;
  sourceType: string;
  sourceId: string;
  score: number;
  excerpt?: string;
}> {
  const { includeExcerpt = true, excerptLength = 200 } = options;

  return documents.map((doc) => ({
    id: doc.id,
    sourceType: doc.sourceType,
    sourceId: doc.sourceId,
    score: doc.score,
    excerpt: includeExcerpt
      ? truncateText(doc.content, excerptLength)
      : undefined,
  }));
}

// ============================================================================
// Query Preprocessing
// ============================================================================

/**
 * Preprocess query for better retrieval
 */
export function preprocessQuery(query: string): string {
  // Remove excessive whitespace
  let processed = query.trim().replace(/\s+/g, ' ');

  // Remove common filler words that don't add semantic meaning
  const fillers = ['please', 'can you', 'could you', 'i want to', 'i need to', 'help me'];
  for (const filler of fillers) {
    const regex = new RegExp(`^${filler}\\s+`, 'i');
    processed = processed.replace(regex, '');
  }

  // Remove trailing question marks (embedding handles this)
  processed = processed.replace(/\?+$/, '');

  return processed.trim();
}

/**
 * Expand query with synonyms/related terms
 * (Basic implementation - could be enhanced with LLM)
 */
export function expandQuery(query: string): string[] {
  const expansions = [query];

  // Add lowercase version if different
  const lower = query.toLowerCase();
  if (lower !== query) {
    expansions.push(lower);
  }

  // Could add synonym expansion, acronym expansion, etc.

  return expansions;
}
