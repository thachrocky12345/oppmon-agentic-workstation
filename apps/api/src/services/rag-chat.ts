/**
 * RAG Chat Service
 *
 * Integrates advanced RAG retrieval with LLM chat:
 * - Multi-vector search with query fusion
 * - MMR diversity selection
 * - Web research fallback when RAG has no results
 * - Tool calling support
 * - Streaming SSE responses with citations
 *
 * Architecture:
 * 1. User sends query
 * 2. Retrieve relevant context from RAG
 * 3. If no context, optionally fall back to web search
 * 4. Build prompt with context injection
 * 5. Stream response with citations
 */

import { Readable } from 'stream';
import {
  advancedRetrieve,
  buildContextBlock,
  RetrievedChunk,
  WebSearchResult,
  AdvancedRetrieveOptions,
} from './advanced-rag.js';
import { createToolbox, Toolbox, ToolExecutionLog } from './toolbox.js';
import { createLLMClient, LLMProvider, LLMMessage, ToolFunction } from '../lib/llm/index.js';

// ============================================================================
// Types
// ============================================================================

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  citations?: Citation[];
  toolCalls?: ToolCallInfo[];
}

export interface Citation {
  index: number;
  documentTitle: string;
  documentId: string;
  chunkText: string;
  pageNumber?: number;
  score: number;
  source: 'rag' | 'web';
  url?: string;
}

export interface ToolCallInfo {
  toolName: string;
  input: Record<string, unknown>;
  output: unknown;
  status: 'success' | 'error';
}

export interface ModelCredentials {
  apiKey?: string;
  baseUrl?: string;
  timeout?: number;
}

export interface RagChatOptions {
  tenantId: string;
  userId: string;
  teamIds: string[];
  messages: ChatMessage[];
  /** Optional collection IDs to search */
  collectionIds?: string[];
  /** LLM model to use */
  model?: string;
  /** LLM provider (anthropic, openai, etc.) */
  provider?: string;
  /** Model credentials (API keys, etc.) */
  modelCredentials?: ModelCredentials;
  /** Enable web fallback when RAG has no results */
  webFallback?: boolean;
  /** Enable tool calling */
  enableTools?: boolean;
  /** Maximum tokens in response */
  maxTokens?: number;
  /** Temperature for response generation */
  temperature?: number;
  /** System prompt override */
  systemPrompt?: string;
}

export interface RagChatResponse {
  message: ChatMessage;
  citations: Citation[];
  toolCalls: ToolCallInfo[];
  source: 'rag' | 'web' | 'both' | 'none';
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
}

export interface StreamChunk {
  type: 'content' | 'citation' | 'tool_call' | 'done' | 'error';
  data: unknown;
}

// ============================================================================
// System Prompts
// ============================================================================

const DEFAULT_SYSTEM_PROMPT = `You are a knowledgeable assistant with access to a document knowledge base.

When answering questions:
1. Use the provided context to ground your responses
2. Cite sources using [N] notation where N is the citation number
3. If the context doesn't contain relevant information, say so clearly
4. If you need more information, you can use the available tools

Be concise but thorough. Prioritize accuracy over speculation.`;

const RAG_CONTEXT_INSTRUCTIONS = `
The following context was retrieved from the knowledge base. Use it to answer the user's question.
If multiple sources provide conflicting information, acknowledge the discrepancy.
Always cite your sources using [N] notation.
`;

const WEB_CONTEXT_INSTRUCTIONS = `
The following context was retrieved from web search because the knowledge base didn't have relevant information.
Web sources may be less authoritative than the knowledge base - use appropriate caveats.
Cite sources using [N] notation and include the URL when relevant.
`;

const NO_CONTEXT_INSTRUCTIONS = `
No relevant context was found in the knowledge base or web search.
Answer based on your general knowledge, but clearly indicate this limitation.
Consider suggesting the user add relevant documents to the knowledge base.
`;

// ============================================================================
// RAG Chat Service
// ============================================================================

export class RagChatService {
  private toolbox: Toolbox;
  private options: RagChatOptions;

  constructor(options: RagChatOptions) {
    this.options = options;
    this.toolbox = createToolbox(options.tenantId, options.userId);
  }

  /**
   * Process a chat request with RAG context
   */
  async chat(): Promise<RagChatResponse> {
    const {
      tenantId,
      userId,
      teamIds,
      messages,
      collectionIds,
      model = 'claude-sonnet-4-20250514',
      provider = 'anthropic',
      modelCredentials,
      webFallback = false,
      enableTools = false,
      maxTokens = 4096,
      temperature = 0.7,
      systemPrompt = DEFAULT_SYSTEM_PROMPT,
    } = this.options;

    // Get the last user message for RAG retrieval
    const lastUserMessage = messages.filter(m => m.role === 'user').pop();
    if (!lastUserMessage) {
      throw new Error('No user message found');
    }

    // Step 1: Retrieve relevant context
    const retrieveOptions: AdvancedRetrieveOptions = {
      tenantId,
      userId,
      teamIds,
      queryText: lastUserMessage.content,
      collectionIds,
      topK: 5,
      useMultiVector: true,
      webFallback,
    };

    const { chunks, webResults, source } = await advancedRetrieve(retrieveOptions);

    // Step 2: Build citations
    const citations = this.buildCitations(chunks, webResults);

    // Step 3: Build context block
    const contextBlock = buildContextBlock(chunks, webResults);

    // Step 4: Build the full prompt
    const contextInstructions = this.getContextInstructions(source);
    const fullSystemPrompt = `${systemPrompt}\n\n${contextInstructions}`;

    // Step 5: Prepare messages with context
    const messagesWithContext = this.injectContext(messages, contextBlock);

    // Step 6: Get tool schemas if enabled
    const tools = enableTools ? this.toolbox.generateFunctionSchemas() as ToolFunction[] : undefined;

    // Step 7: Prepare messages for LLM
    const llmMessages: LLMMessage[] = [
      { role: 'system', content: fullSystemPrompt },
      ...messagesWithContext.map(m => ({ role: m.role, content: m.content })),
    ];

    // Step 8: Call LLM
    const registryConfig = modelCredentials?.apiKey ? {
      apiKey: modelCredentials.apiKey,
      model,
      baseUrl: modelCredentials.baseUrl,
      timeout: modelCredentials.timeout,
    } : undefined;
    const llmClient = createLLMClient(provider as LLMProvider, registryConfig);
    const response = await llmClient.chat({
      model,
      messages: llmMessages,
      maxTokens,
      temperature,
      tools,
    });

    // Step 9: Process tool calls if any
    const toolCalls: ToolCallInfo[] = [];
    if (response.toolCalls && response.toolCalls.length > 0) {
      for (const toolCall of response.toolCalls) {
        const result = await this.toolbox.executeTool(
          toolCall.name,
          toolCall.arguments
        );

        toolCalls.push({
          toolName: toolCall.name,
          input: toolCall.arguments,
          output: result.output.data,
          status: result.status,
        });

        // If tool augments context, we may need another LLM call
        // For simplicity, we include tool results in the response
      }
    }

    return {
      message: {
        role: 'assistant',
        content: response.content,
        citations: citations.length > 0 ? citations : undefined,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      },
      citations,
      toolCalls,
      source,
      usage: response.usage,
    };
  }

  /**
   * Stream a chat response
   */
  async *streamChat(): AsyncGenerator<StreamChunk> {
    const {
      tenantId,
      userId,
      teamIds,
      messages,
      collectionIds,
      model = 'claude-sonnet-4-20250514',
      provider = 'anthropic',
      modelCredentials,
      webFallback = false,
      maxTokens = 4096,
      temperature = 0.7,
      systemPrompt = DEFAULT_SYSTEM_PROMPT,
    } = this.options;

    // Get the last user message for RAG retrieval
    const lastUserMessage = messages.filter(m => m.role === 'user').pop();
    if (!lastUserMessage) {
      yield { type: 'error', data: { message: 'No user message found' } };
      return;
    }

    // Step 1: Retrieve relevant context
    const retrieveOptions: AdvancedRetrieveOptions = {
      tenantId,
      userId,
      teamIds,
      queryText: lastUserMessage.content,
      collectionIds,
      topK: 5,
      useMultiVector: true,
      webFallback,
    };

    const { chunks, webResults, source } = await advancedRetrieve(retrieveOptions);

    // Step 2: Build and yield citations
    const citations = this.buildCitations(chunks, webResults);
    for (const citation of citations) {
      yield { type: 'citation', data: citation };
    }

    // Step 3: Build context block
    const contextBlock = buildContextBlock(chunks, webResults);

    // Step 4: Build the full prompt
    const contextInstructions = this.getContextInstructions(source);
    const fullSystemPrompt = `${systemPrompt}\n\n${contextInstructions}`;

    // Step 5: Prepare messages with context
    const messagesWithContext = this.injectContext(messages, contextBlock);

    // Step 6: Prepare messages for LLM
    const llmMessages: LLMMessage[] = [
      { role: 'system', content: fullSystemPrompt },
      ...messagesWithContext.map(m => ({ role: m.role, content: m.content })),
    ];

    // Step 7: Call LLM with streaming (or fall back to non-streaming)
    const registryConfig = modelCredentials?.apiKey ? {
      apiKey: modelCredentials.apiKey,
      model,
      baseUrl: modelCredentials.baseUrl,
      timeout: modelCredentials.timeout,
    } : undefined;
    const llmClient = createLLMClient(provider as LLMProvider, registryConfig);

    try {
      // Check if streaming is supported
      if (llmClient.streamChat) {
        const stream = llmClient.streamChat({
          model,
          messages: llmMessages,
          maxTokens,
          temperature,
        });

        for await (const chunk of stream) {
          if (chunk.type === 'content') {
            yield { type: 'content', data: { content: chunk.text } };
          } else if (chunk.type === 'done') {
            yield {
              type: 'done',
              data: {
                source,
                citationCount: citations.length,
                usage: chunk.usage,
              },
            };
          }
        }
      } else {
        // Fall back to non-streaming
        const response = await llmClient.chat({
          model,
          messages: llmMessages,
          maxTokens,
          temperature,
        });

        // Emit full content at once
        yield { type: 'content', data: { content: response.content } };
        yield {
          type: 'done',
          data: {
            source,
            citationCount: citations.length,
            usage: response.usage,
          },
        };
      }
    } catch (error) {
      yield {
        type: 'error',
        data: {
          message: error instanceof Error ? error.message : 'Stream error',
        },
      };
    }
  }

  /**
   * Build citations from RAG chunks and web results
   */
  private buildCitations(
    chunks: RetrievedChunk[],
    webResults?: WebSearchResult[]
  ): Citation[] {
    const citations: Citation[] = [];
    let index = 1;

    // Add RAG citations
    for (const chunk of chunks) {
      citations.push({
        index,
        documentTitle: chunk.documentTitle,
        documentId: chunk.documentId,
        chunkText: chunk.chunkText.slice(0, 500),
        pageNumber: chunk.pageNumber ?? undefined,
        score: chunk.score,
        source: 'rag',
      });
      index++;
    }

    // Add web citations
    if (webResults) {
      for (const result of webResults) {
        citations.push({
          index,
          documentTitle: result.title,
          documentId: result.url,
          chunkText: result.snippet,
          score: 0.5, // Web results don't have similarity scores
          source: 'web',
          url: result.url,
        });
        index++;
      }
    }

    return citations;
  }

  /**
   * Get context instructions based on source
   */
  private getContextInstructions(source: 'rag' | 'web' | 'both' | 'none'): string {
    switch (source) {
      case 'rag':
        return RAG_CONTEXT_INSTRUCTIONS;
      case 'web':
        return WEB_CONTEXT_INSTRUCTIONS;
      case 'both':
        return `${RAG_CONTEXT_INSTRUCTIONS}\n\n${WEB_CONTEXT_INSTRUCTIONS}`;
      case 'none':
        return NO_CONTEXT_INSTRUCTIONS;
    }
  }

  /**
   * Inject context into messages
   */
  private injectContext(
    messages: ChatMessage[],
    contextBlock: string
  ): Array<{ role: 'user' | 'assistant' | 'system'; content: string }> {
    if (!contextBlock) {
      return messages.map(m => ({ role: m.role, content: m.content }));
    }

    // Find the last user message and inject context before it
    const result: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = [];

    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];

      if (i === messages.length - 1 && message.role === 'user') {
        // Inject context before the last user message
        result.push({
          role: 'user',
          content: `${contextBlock}\n\n${message.content}`,
        });
      } else {
        result.push({ role: message.role, content: message.content });
      }
    }

    return result;
  }

  /**
   * Get the toolbox for this chat session
   */
  getToolbox(): Toolbox {
    return this.toolbox;
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a RAG chat service instance
 */
export function createRagChat(options: RagChatOptions): RagChatService {
  return new RagChatService(options);
}

/**
 * Simple function to get a RAG-grounded response
 */
export async function ragChat(options: RagChatOptions): Promise<RagChatResponse> {
  const service = createRagChat(options);
  return service.chat();
}

/**
 * Get a streaming RAG-grounded response
 */
export async function* streamRagChat(
  options: RagChatOptions
): AsyncGenerator<StreamChunk> {
  const service = createRagChat(options);
  yield* service.streamChat();
}
