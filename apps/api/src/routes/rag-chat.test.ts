// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

/**
 * RAG Chat Routes Tests
 *
 * Integration tests for RAG chat API endpoints:
 * - POST /api/rag/chat - Non-streaming chat
 * - POST /api/rag/chat/stream - Streaming chat (SSE)
 * - GET /api/rag/collections/accessible - List accessible collections
 * - GET /api/rag/tools - List available tools
 * - POST /api/rag/tools/execute - Execute a tool
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { ragChatRouter } from './rag-chat.js';

// Mock middleware
vi.mock('../middleware/request-auth.js', () => ({
  requestAuth: vi.fn((req, res, next) => {
    req.tenantId = 'tenant-123';
    req.userId = 'user-456';
    next();
  }),
}));

// Mock services
vi.mock('../services/rag-chat.js', () => ({
  ragChat: vi.fn(),
  streamRagChat: vi.fn(),
  createRagChat: vi.fn(),
}));

vi.mock('../services/rag-retriever.js', () => ({
  getAccessibleCollections: vi.fn(),
}));

vi.mock('../services/toolbox.js', () => ({
  createToolbox: vi.fn(() => ({
    getAllTools: vi.fn(() => []),
    executeTool: vi.fn(),
    findRelevantTools: vi.fn(),
    getExecutionHistory: vi.fn(),
    generateFunctionSchemas: vi.fn(() => []),
  })),
}));

vi.mock('../lib/db.js', () => ({
  query: vi.fn(() => Promise.resolve({ rows: [] })),
}));

import { ragChat, createRagChat } from '../services/rag-chat.js';
import { getAccessibleCollections } from '../services/rag-retriever.js';
import { createToolbox } from '../services/toolbox.js';

describe('RAG Chat Routes', () => {
  let app: express.Application;

  beforeEach(() => {
    vi.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use('/api/rag', ragChatRouter);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('POST /api/rag/chat', () => {
    it('returns 400 for missing messages', async () => {
      const response = await request(app)
        .post('/api/rag/chat')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid request');
    });

    it('returns 400 for empty messages array', async () => {
      const response = await request(app)
        .post('/api/rag/chat')
        .send({ messages: [] });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid request');
    });

    it('returns 400 for invalid message format', async () => {
      const response = await request(app)
        .post('/api/rag/chat')
        .send({
          messages: [
            { role: 'invalid', content: 'test' },
          ],
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid request');
    });

    it('returns 400 for empty message content', async () => {
      const response = await request(app)
        .post('/api/rag/chat')
        .send({
          messages: [
            { role: 'user', content: '' },
          ],
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid request');
    });

    it('returns chat response for valid request', async () => {
      const mockResponse = {
        message: {
          role: 'assistant',
          content: 'Paris is the capital of France.',
        },
        citations: [
          {
            index: 1,
            documentTitle: 'Geography',
            documentId: 'doc-1',
            chunkText: 'Paris is the capital...',
            score: 0.95,
            source: 'rag',
          },
        ],
        toolCalls: [],
        source: 'rag',
        usage: { inputTokens: 100, outputTokens: 20, totalTokens: 120 },
      };

      vi.mocked(ragChat).mockResolvedValue(mockResponse);

      const response = await request(app)
        .post('/api/rag/chat')
        .send({
          messages: [
            { role: 'user', content: 'What is the capital of France?' },
          ],
        });

      expect(response.status).toBe(200);
      expect(response.body.data.message.content).toBe('Paris is the capital of France.');
      expect(response.body.data.citations).toHaveLength(1);
      expect(response.body.data.source).toBe('rag');
    });

    it('accepts optional parameters', async () => {
      vi.mocked(ragChat).mockResolvedValue({
        message: { role: 'assistant', content: 'Response' },
        citations: [],
        toolCalls: [],
        source: 'none',
      });

      const response = await request(app)
        .post('/api/rag/chat')
        .send({
          messages: [{ role: 'user', content: 'Hello' }],
          collectionIds: ['col-1', 'col-2'],
          model: 'gpt-4',
          provider: 'openai',
          webFallback: true,
          enableTools: true,
          maxTokens: 1000,
          temperature: 0.5,
          systemPrompt: 'You are a helpful assistant.',
        });

      expect(response.status).toBe(200);
      expect(ragChat).toHaveBeenCalledWith(
        expect.objectContaining({
          collectionIds: ['col-1', 'col-2'],
          model: 'gpt-4',
          provider: 'openai',
          maxTokens: 1000,
          temperature: 0.5,
        })
      );
    });

    it('returns 500 on service error', async () => {
      vi.mocked(ragChat).mockRejectedValue(new Error('Service error'));

      const response = await request(app)
        .post('/api/rag/chat')
        .send({
          messages: [{ role: 'user', content: 'Test' }],
        });

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Service error');
    });
  });

  describe('POST /api/rag/chat/stream', () => {
    it('returns 400 for invalid request', async () => {
      const response = await request(app)
        .post('/api/rag/chat/stream')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid request');
    });

    it('streams SSE response for valid request', async () => {
      const mockStreamGenerator = async function* () {
        yield { type: 'citation', data: { documentTitle: 'Doc 1' } };
        yield { type: 'content', data: { content: 'Hello' } };
        yield { type: 'content', data: { content: ' World' } };
        yield { type: 'done', data: { source: 'rag' } };
      };

      const mockService = {
        streamChat: mockStreamGenerator,
      };

      vi.mocked(createRagChat).mockReturnValue(mockService as any);

      const response = await request(app)
        .post('/api/rag/chat/stream')
        .send({
          messages: [{ role: 'user', content: 'Hello' }],
        });

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toBe('text/event-stream');

      // Parse SSE data
      const lines = response.text.split('\n').filter(line => line.startsWith('data:'));
      expect(lines.length).toBeGreaterThan(0);

      // Should end with [DONE]
      const lastDataLine = lines[lines.length - 1];
      expect(lastDataLine).toContain('[DONE]');
    });
  });

  describe('GET /api/rag/collections/accessible', () => {
    it('returns accessible collections', async () => {
      const mockCollections = [
        { id: 'col-1', name: 'Collection 1', scope: 'TENANT' },
        { id: 'col-2', name: 'Collection 2', scope: 'TEAM' },
      ];

      vi.mocked(getAccessibleCollections).mockResolvedValue(mockCollections);

      const response = await request(app)
        .get('/api/rag/collections/accessible');

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.data[0].name).toBe('Collection 1');
    });

    it('returns empty array when no collections', async () => {
      vi.mocked(getAccessibleCollections).mockResolvedValue([]);

      const response = await request(app)
        .get('/api/rag/collections/accessible');

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(0);
    });

    it('returns 500 on error', async () => {
      vi.mocked(getAccessibleCollections).mockRejectedValue(new Error('DB error'));

      const response = await request(app)
        .get('/api/rag/collections/accessible');

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('DB error');
    });
  });

  describe('GET /api/rag/tools', () => {
    it('returns available tools', async () => {
      const mockTools = [
        {
          name: 'search',
          description: 'Search the web',
          category: 'search',
          parameters: { query: { type: 'string' } },
        },
      ];

      const mockToolbox = {
        getAllTools: vi.fn(() => mockTools),
      };
      vi.mocked(createToolbox).mockReturnValue(mockToolbox as any);

      const response = await request(app)
        .get('/api/rag/tools');

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].name).toBe('search');
    });
  });

  describe('POST /api/rag/tools/execute', () => {
    it('returns 400 for missing tool name', async () => {
      const response = await request(app)
        .post('/api/rag/tools/execute')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid request');
    });

    it('executes tool and returns result', async () => {
      const mockResult = {
        toolName: 'search',
        output: { data: { results: ['result1', 'result2'] } },
        status: 'success',
        durationMs: 150,
      };

      const mockToolbox = {
        executeTool: vi.fn().mockResolvedValue(mockResult),
      };
      vi.mocked(createToolbox).mockReturnValue(mockToolbox as any);

      const response = await request(app)
        .post('/api/rag/tools/execute')
        .send({
          toolName: 'search',
          params: { query: 'test' },
        });

      expect(response.status).toBe(200);
      expect(response.body.data.toolName).toBe('search');
      expect(response.body.data.status).toBe('success');
    });

    it('returns 500 on tool execution error', async () => {
      const mockToolbox = {
        executeTool: vi.fn().mockRejectedValue(new Error('Tool failed')),
      };
      vi.mocked(createToolbox).mockReturnValue(mockToolbox as any);

      const response = await request(app)
        .post('/api/rag/tools/execute')
        .send({
          toolName: 'failing-tool',
        });

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Tool failed');
    });
  });

  describe('POST /api/rag/tools/discover', () => {
    it('returns 400 for missing query', async () => {
      const response = await request(app)
        .post('/api/rag/tools/discover')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Query is required');
    });

    it('returns relevant tools for query', async () => {
      const mockMatches = [
        { name: 'web_search', score: 0.9 },
        { name: 'file_search', score: 0.7 },
      ];

      const mockToolbox = {
        findRelevantTools: vi.fn().mockResolvedValue(mockMatches),
      };
      vi.mocked(createToolbox).mockReturnValue(mockToolbox as any);

      const response = await request(app)
        .post('/api/rag/tools/discover')
        .send({
          query: 'search for documents',
          topK: 5,
        });

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(2);
      expect(mockToolbox.findRelevantTools).toHaveBeenCalledWith('search for documents', 5);
    });
  });

  describe('GET /api/rag/tools/history', () => {
    it('returns tool execution history', async () => {
      const mockHistory = [
        { toolName: 'search', executedAt: '2024-01-01', status: 'success' },
        { toolName: 'analyze', executedAt: '2024-01-02', status: 'success' },
      ];

      const mockToolbox = {
        getExecutionHistory: vi.fn().mockResolvedValue(mockHistory),
      };
      vi.mocked(createToolbox).mockReturnValue(mockToolbox as any);

      const response = await request(app)
        .get('/api/rag/tools/history');

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(2);
    });

    it('respects limit parameter', async () => {
      const mockToolbox = {
        getExecutionHistory: vi.fn().mockResolvedValue([]),
      };
      vi.mocked(createToolbox).mockReturnValue(mockToolbox as any);

      await request(app)
        .get('/api/rag/tools/history?limit=50');

      expect(mockToolbox.getExecutionHistory).toHaveBeenCalledWith(50);
    });

    it('caps limit at 100', async () => {
      const mockToolbox = {
        getExecutionHistory: vi.fn().mockResolvedValue([]),
      };
      vi.mocked(createToolbox).mockReturnValue(mockToolbox as any);

      await request(app)
        .get('/api/rag/tools/history?limit=500');

      expect(mockToolbox.getExecutionHistory).toHaveBeenCalledWith(100);
    });
  });
});
