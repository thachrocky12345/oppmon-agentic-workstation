// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

/**
 * RAG Chat Service Tests
 *
 * Unit and integration tests for RAG chat functionality:
 * - Chat message processing
 * - Citation building
 * - Context injection
 * - Streaming responses
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  RagChatService,
  createRagChat,
  ChatMessage,
  RagChatOptions,
  Citation,
} from './rag-chat.js';

// Mock dependencies
vi.mock('./advanced-rag.js', () => ({
  advancedRetrieve: vi.fn(),
  buildContextBlock: vi.fn(),
}));

vi.mock('./toolbox.js', () => ({
  createToolbox: vi.fn(() => ({
    generateFunctionSchemas: vi.fn(() => []),
    executeTool: vi.fn(),
    getAllTools: vi.fn(() => []),
  })),
}));

vi.mock('../lib/llm/index.js', () => ({
  createLLMClient: vi.fn(() => ({
    chat: vi.fn(),
    streamChat: vi.fn(),
  })),
}));

import { advancedRetrieve, buildContextBlock } from './advanced-rag.js';
import { createLLMClient } from '../lib/llm/index.js';
import { createToolbox } from './toolbox.js';

describe('RAG Chat Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('RagChatService', () => {
    const baseOptions: RagChatOptions = {
      tenantId: 'tenant-123',
      userId: 'user-456',
      teamIds: ['team-789'],
      messages: [
        { role: 'user', content: 'What is the capital of France?' },
      ],
    };

    describe('chat()', () => {
      it('retrieves context and calls LLM', async () => {
        const mockChunks = [
          {
            chunkId: 'chunk-1',
            documentId: 'doc-1',
            documentTitle: 'Geography Facts',
            documentFilename: 'geography.pdf',
            chunkText: 'Paris is the capital of France.',
            chunkIndex: 0,
            score: 0.95,
            collectionId: 'col-1',
            collectionName: 'Knowledge Base',
            pageNumber: 1,
          },
        ];

        vi.mocked(advancedRetrieve).mockResolvedValue({
          chunks: mockChunks,
          webResults: [],
          source: 'rag' as const,
        });

        vi.mocked(buildContextBlock).mockReturnValue(
          '<context>Paris is the capital of France.</context>'
        );

        const mockLLMClient = {
          chat: vi.fn().mockResolvedValue({
            content: 'Paris is the capital of France [1].',
            toolCalls: [],
            usage: { inputTokens: 100, outputTokens: 20, totalTokens: 120 },
          }),
        };
        vi.mocked(createLLMClient).mockReturnValue(mockLLMClient as any);

        const service = createRagChat(baseOptions);
        const response = await service.chat();

        expect(advancedRetrieve).toHaveBeenCalledWith(
          expect.objectContaining({
            tenantId: 'tenant-123',
            userId: 'user-456',
            queryText: 'What is the capital of France?',
          })
        );

        expect(response.message.role).toBe('assistant');
        expect(response.message.content).toBe('Paris is the capital of France [1].');
        expect(response.citations).toHaveLength(1);
        expect(response.citations[0].documentTitle).toBe('Geography Facts');
        expect(response.source).toBe('rag');
      });

      it('handles empty messages array', async () => {
        const options: RagChatOptions = {
          ...baseOptions,
          messages: [],
        };

        const service = createRagChat(options);

        await expect(service.chat()).rejects.toThrow('No user message found');
      });

      it('handles web fallback when RAG has no results', async () => {
        vi.mocked(advancedRetrieve).mockResolvedValue({
          chunks: [],
          webResults: [
            {
              title: 'Wikipedia - France',
              url: 'https://en.wikipedia.org/wiki/France',
              snippet: 'Paris is the capital and largest city.',
            },
          ],
          source: 'web' as const,
        });

        vi.mocked(buildContextBlock).mockReturnValue(
          '<web-context>Paris is the capital and largest city.</web-context>'
        );

        const mockLLMClient = {
          chat: vi.fn().mockResolvedValue({
            content: 'According to web sources, Paris is the capital [1].',
            toolCalls: [],
          }),
        };
        vi.mocked(createLLMClient).mockReturnValue(mockLLMClient as any);

        const service = createRagChat(baseOptions);
        const response = await service.chat();

        expect(response.source).toBe('web');
        expect(response.citations).toHaveLength(1);
        expect(response.citations[0].source).toBe('web');
        expect(response.citations[0].url).toBe('https://en.wikipedia.org/wiki/France');
      });

      it('handles tool calls in response', async () => {
        vi.mocked(advancedRetrieve).mockResolvedValue({
          chunks: [],
          webResults: [],
          source: 'none' as const,
        });

        vi.mocked(buildContextBlock).mockReturnValue('');

        // Mock toolbox
        const mockToolbox = {
          generateFunctionSchemas: vi.fn(() => []),
          executeTool: vi.fn().mockResolvedValue({
            toolName: 'web_search',
            output: { data: { results: [] } },
            status: 'success',
            durationMs: 100,
          }),
        };
        vi.mocked(createToolbox).mockReturnValue(mockToolbox as any);

        const mockLLMClient = {
          chat: vi.fn().mockResolvedValue({
            content: 'Let me search for that.',
            toolCalls: [
              {
                id: 'tool-1',
                name: 'web_search',
                arguments: { query: 'capital of France' },
              },
            ],
          }),
        };
        vi.mocked(createLLMClient).mockReturnValue(mockLLMClient as any);

        const service = createRagChat({ ...baseOptions, enableTools: true });
        const response = await service.chat();

        expect(response.toolCalls).toHaveLength(1);
        expect(response.toolCalls[0].toolName).toBe('web_search');
      });
    });

    describe('streamChat()', () => {
      it('yields citation chunks first', async () => {
        const mockChunks = [
          {
            chunkId: 'chunk-1',
            documentId: 'doc-1',
            documentTitle: 'Test Doc',
            documentFilename: 'test.pdf',
            chunkText: 'Test content',
            chunkIndex: 0,
            score: 0.9,
            collectionId: 'col-1',
            collectionName: 'Test Collection',
            pageNumber: 1,
          },
        ];

        vi.mocked(advancedRetrieve).mockResolvedValue({
          chunks: mockChunks,
          webResults: [],
          source: 'rag' as const,
        });

        vi.mocked(buildContextBlock).mockReturnValue('<context>Test content</context>');

        const mockStreamGenerator = async function* () {
          yield { type: 'content', text: 'Hello' };
          yield { type: 'content', text: ' World' };
          yield { type: 'done', usage: { inputTokens: 10, outputTokens: 5 } };
        };

        const mockLLMClient = {
          streamChat: mockStreamGenerator,
        };
        vi.mocked(createLLMClient).mockReturnValue(mockLLMClient as any);

        const service = createRagChat(baseOptions);
        const chunks: any[] = [];

        for await (const chunk of service.streamChat()) {
          chunks.push(chunk);
        }

        // First should be citation
        expect(chunks[0].type).toBe('citation');
        expect(chunks[0].data.documentTitle).toBe('Test Doc');

        // Then content chunks
        const contentChunks = chunks.filter(c => c.type === 'content');
        expect(contentChunks).toHaveLength(2);
        expect(contentChunks[0].data.content).toBe('Hello');
        expect(contentChunks[1].data.content).toBe(' World');

        // Finally done
        const doneChunk = chunks.find(c => c.type === 'done');
        expect(doneChunk).toBeDefined();
      });

      it('falls back to non-streaming when streamChat not available', async () => {
        vi.mocked(advancedRetrieve).mockResolvedValue({
          chunks: [],
          webResults: [],
          source: 'none' as const,
        });

        vi.mocked(buildContextBlock).mockReturnValue('');

        const mockLLMClient = {
          chat: vi.fn().mockResolvedValue({
            content: 'Fallback response',
            usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
          }),
          // No streamChat method
        };
        vi.mocked(createLLMClient).mockReturnValue(mockLLMClient as any);

        const service = createRagChat(baseOptions);
        const chunks: any[] = [];

        for await (const chunk of service.streamChat()) {
          chunks.push(chunk);
        }

        const contentChunk = chunks.find(c => c.type === 'content');
        expect(contentChunk).toBeDefined();
        expect(contentChunk.data.content).toBe('Fallback response');
      });

      it('yields error chunk on failure', async () => {
        vi.mocked(advancedRetrieve).mockResolvedValue({
          chunks: [],
          webResults: [],
          source: 'none' as const,
        });

        vi.mocked(buildContextBlock).mockReturnValue('');

        const mockLLMClient = {
          chat: vi.fn().mockRejectedValue(new Error('LLM API error')),
        };
        vi.mocked(createLLMClient).mockReturnValue(mockLLMClient as any);

        const service = createRagChat(baseOptions);
        const chunks: any[] = [];

        for await (const chunk of service.streamChat()) {
          chunks.push(chunk);
        }

        const errorChunk = chunks.find(c => c.type === 'error');
        expect(errorChunk).toBeDefined();
        expect(errorChunk.data.message).toBe('LLM API error');
      });
    });

    describe('buildCitations()', () => {
      it('builds citations from RAG chunks', () => {
        const mockChunks = [
          {
            chunkId: 'chunk-1',
            documentId: 'doc-1',
            documentTitle: 'Document 1',
            documentFilename: 'doc1.pdf',
            chunkText: 'First chunk text that is quite long and should be truncated in citations...',
            chunkIndex: 0,
            score: 0.95,
            collectionId: 'col-1',
            collectionName: 'Collection 1',
            pageNumber: 5,
          },
          {
            chunkId: 'chunk-2',
            documentId: 'doc-2',
            documentTitle: 'Document 2',
            documentFilename: 'doc2.pdf',
            chunkText: 'Second chunk text',
            chunkIndex: 0,
            score: 0.85,
            collectionId: 'col-1',
            collectionName: 'Collection 1',
            pageNumber: null,
          },
        ];

        const service = createRagChat(baseOptions);
        // Access private method via type casting
        const citations = (service as any).buildCitations(mockChunks, []);

        expect(citations).toHaveLength(2);
        expect(citations[0].index).toBe(1);
        expect(citations[0].documentTitle).toBe('Document 1');
        expect(citations[0].pageNumber).toBe(5);
        expect(citations[0].source).toBe('rag');
        expect(citations[1].index).toBe(2);
        expect(citations[1].pageNumber).toBeUndefined();
      });

      it('includes web results in citations', () => {
        const webResults = [
          {
            title: 'Web Result 1',
            url: 'https://example.com/page1',
            snippet: 'Web snippet 1',
          },
          {
            title: 'Web Result 2',
            url: 'https://example.com/page2',
            snippet: 'Web snippet 2',
          },
        ];

        const service = createRagChat(baseOptions);
        const citations = (service as any).buildCitations([], webResults);

        expect(citations).toHaveLength(2);
        expect(citations[0].source).toBe('web');
        expect(citations[0].url).toBe('https://example.com/page1');
        expect(citations[0].score).toBe(0.5); // Default web score
        expect(citations[1].index).toBe(2);
      });
    });

    describe('getContextInstructions()', () => {
      it('returns RAG instructions for rag source', () => {
        const service = createRagChat(baseOptions);
        const instructions = (service as any).getContextInstructions('rag');

        expect(instructions).toContain('knowledge base');
        expect(instructions).toContain('cite');
      });

      it('returns web instructions for web source', () => {
        const service = createRagChat(baseOptions);
        const instructions = (service as any).getContextInstructions('web');

        expect(instructions).toContain('web search');
        expect(instructions).toContain('URL');
      });

      it('returns combined instructions for both source', () => {
        const service = createRagChat(baseOptions);
        const instructions = (service as any).getContextInstructions('both');

        expect(instructions).toContain('knowledge base');
        expect(instructions).toContain('web search');
      });

      it('returns no-context instructions for none source', () => {
        const service = createRagChat(baseOptions);
        const instructions = (service as any).getContextInstructions('none');

        expect(instructions).toContain('No relevant context');
        expect(instructions).toContain('general knowledge');
      });
    });

    describe('injectContext()', () => {
      it('injects context before last user message', () => {
        const messages: ChatMessage[] = [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi there!' },
          { role: 'user', content: 'What is Python?' },
        ];

        const service = createRagChat({ ...baseOptions, messages });
        const contextBlock = '<context>Python is a programming language.</context>';
        const result = (service as any).injectContext(messages, contextBlock);

        expect(result).toHaveLength(3);
        expect(result[2].content).toContain(contextBlock);
        expect(result[2].content).toContain('What is Python?');
      });

      it('returns messages unchanged when no context', () => {
        const messages: ChatMessage[] = [
          { role: 'user', content: 'Hello' },
        ];

        const service = createRagChat({ ...baseOptions, messages });
        const result = (service as any).injectContext(messages, '');

        expect(result).toHaveLength(1);
        expect(result[0].content).toBe('Hello');
      });
    });
  });

  describe('createRagChat factory', () => {
    it('creates RagChatService instance', () => {
      const options: RagChatOptions = {
        tenantId: 'tenant-1',
        userId: 'user-1',
        teamIds: [],
        messages: [{ role: 'user', content: 'Test' }],
      };

      const service = createRagChat(options);

      expect(service).toBeInstanceOf(RagChatService);
    });
  });
});
