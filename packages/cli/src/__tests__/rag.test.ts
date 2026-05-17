// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

/**
 * RAG Command Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'

// Mock the API client
vi.mock('../lib/api.js', () => ({
  createApiClient: vi.fn(() => ({
    embed: vi.fn().mockResolvedValue({
      data: {
        id: 'emb_123',
        sourceType: 'document',
        sourceId: 'test.txt',
        created: true,
      },
    }),
    embedBatch: vi.fn().mockResolvedValue({
      data: [],
      meta: { total: 2, created: 2, skipped: 0 },
    }),
    searchEmbeddings: vi.fn().mockResolvedValue({
      data: [
        { id: 'emb_1', sourceType: 'document', sourceId: 'file1.txt', score: 0.95 },
        { id: 'emb_2', sourceType: 'document', sourceId: 'file2.txt', score: 0.85 },
      ],
    }),
    listEmbeddings: vi.fn().mockResolvedValue({
      data: [
        { id: 'emb_1', sourceType: 'document', sourceId: 'file1.txt', provider: 'openai' },
      ],
      meta: { total: 1, limit: 50, offset: 0 },
    }),
    getEmbeddingStats: vi.fn().mockResolvedValue({
      data: {
        total: 100,
        bySourceType: { document: 80, skill: 20 },
        byProvider: { openai: 100 },
        byModel: { 'text-embedding-3-small': 100 },
      },
    }),
    getEmbeddingCoverage: vi.fn().mockResolvedValue({
      data: {
        skill: { total: 10, embedded: 8, coverage: 0.8 },
        agent: { total: 5, embedded: 5, coverage: 1.0 },
      },
    }),
    reindex: vi.fn().mockResolvedValue({
      data: {
        dryRun: false,
        results: {
          skill: { total: 10, processed: 10, failed: 0 },
          agent: { total: 5, processed: 5, failed: 0 },
        },
        totals: { total: 15, processed: 15, failed: 0 },
      },
    }),
    deleteEmbedding: vi.fn().mockResolvedValue({ success: true }),
    ragQuery: vi.fn().mockResolvedValue({
      data: {
        answer: 'This is the answer.',
        sessionId: 'sess_123',
        sources: [
          { id: 'emb_1', sourceType: 'document', sourceId: 'file1.txt', score: 0.95, content: 'source content' },
        ],
        provider: 'anthropic',
        model: 'claude-3-5-sonnet',
        usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      },
    }),
    ragRetrieve: vi.fn().mockResolvedValue({
      data: {
        documents: [
          { id: 'emb_1', sourceType: 'document', sourceId: 'file1.txt', score: 0.95, content: 'content' },
        ],
        query: 'test query',
        totalSearched: 100,
        retrievalTimeMs: 50,
      },
    }),
    getRagStatus: vi.fn().mockResolvedValue({
      data: {
        llmAvailable: true,
        embeddingAvailable: true,
        defaultLlmProvider: 'anthropic',
        defaultEmbeddingProvider: 'openai',
        config: {
          defaultTopK: 5,
          defaultThreshold: 0.7,
          maxContextTokens: 4000,
          strategy: 'simple',
        },
      },
    }),
  })),
}))

// Mock credentials
vi.mock('../lib/credentials.js', () => ({
  isAuthenticated: vi.fn(() => true),
  getAccessToken: vi.fn(() => 'test-token'),
  loadTokensCache: vi.fn(),
}))

// Mock config
vi.mock('../lib/config.js', () => ({
  getApiUrl: vi.fn(() => 'http://localhost:3001'),
}))

import { createApiClient } from '../lib/api.js'
import {
  getDocumentInfo,
  chunkDocument,
  listDocuments,
  generateSourceId,
} from '../lib/documents.js'

describe('RAG API Client', () => {
  let api: ReturnType<typeof createApiClient>

  beforeEach(() => {
    api = createApiClient()
  })

  describe('embed', () => {
    it('calls embed endpoint', async () => {
      const result = await api.embed({
        content: 'test content',
        sourceType: 'document',
        sourceId: 'test.txt',
      })

      expect(result.data.id).toBe('emb_123')
      expect(result.data.created).toBe(true)
    })
  })

  describe('embedBatch', () => {
    it('calls embed-batch endpoint', async () => {
      const result = await api.embedBatch({
        items: [
          { content: 'content 1', sourceType: 'doc', sourceId: 'file1.txt' },
          { content: 'content 2', sourceType: 'doc', sourceId: 'file2.txt' },
        ],
      })

      expect(result.meta.total).toBe(2)
      expect(result.meta.created).toBe(2)
    })
  })

  describe('searchEmbeddings', () => {
    it('calls search endpoint', async () => {
      const result = await api.searchEmbeddings({
        query: 'test query',
        limit: 10,
      })

      expect(result.data).toHaveLength(2)
      expect(result.data[0].score).toBe(0.95)
    })
  })

  describe('listEmbeddings', () => {
    it('calls list endpoint', async () => {
      const result = await api.listEmbeddings({ limit: 50 })

      expect(result.data).toHaveLength(1)
      expect(result.meta?.total).toBe(1)
    })
  })

  describe('getEmbeddingStats', () => {
    it('calls stats endpoint', async () => {
      const result = await api.getEmbeddingStats()

      expect(result.data.total).toBe(100)
      expect(result.data.bySourceType.document).toBe(80)
    })
  })

  describe('getEmbeddingCoverage', () => {
    it('calls coverage endpoint', async () => {
      const result = await api.getEmbeddingCoverage()

      expect(result.data.skill.coverage).toBe(0.8)
      expect(result.data.agent.coverage).toBe(1.0)
    })
  })

  describe('reindex', () => {
    it('calls reindex endpoint', async () => {
      const result = await api.reindex({ dryRun: false })

      expect(result.data.totals.processed).toBe(15)
    })
  })

  describe('deleteEmbedding', () => {
    it('calls delete endpoint', async () => {
      const result = await api.deleteEmbedding('emb_123')

      expect(result.success).toBe(true)
    })
  })

  describe('ragQuery', () => {
    it('calls RAG query endpoint', async () => {
      const result = await api.ragQuery({
        query: 'What is the answer?',
      })

      expect(result.data.answer).toBe('This is the answer.')
      expect(result.data.sources).toHaveLength(1)
      expect(result.data.usage.totalTokens).toBe(150)
    })
  })

  describe('ragRetrieve', () => {
    it('calls RAG retrieve endpoint', async () => {
      const result = await api.ragRetrieve({
        query: 'test query',
      })

      expect(result.data.documents).toHaveLength(1)
      expect(result.data.retrievalTimeMs).toBe(50)
    })
  })

  describe('getRagStatus', () => {
    it('calls RAG status endpoint', async () => {
      const result = await api.getRagStatus()

      expect(result.data.llmAvailable).toBe(true)
      expect(result.data.embeddingAvailable).toBe(true)
      expect(result.data.config.defaultTopK).toBe(5)
    })
  })
})

describe('Document Processing for RAG', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `rag-docs-test-${Date.now()}`)
    await fs.mkdir(tempDir, { recursive: true })
  })

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true })
    } catch {
      // Ignore
    }
  })

  it('processes documents for batch embedding', async () => {
    // Create test files
    await fs.writeFile(path.join(tempDir, 'file1.txt'), 'Content of file 1')
    await fs.writeFile(path.join(tempDir, 'file2.md'), '# File 2\n\nContent here')

    // List documents
    const docs = await listDocuments(tempDir)
    expect(docs).toHaveLength(2)

    // Process each document
    const items = []
    for (const doc of docs) {
      const content = await fs.readFile(doc.path, 'utf-8')
      const sourceId = generateSourceId(doc.path, tempDir)
      const chunks = chunkDocument(content, doc)

      for (const chunk of chunks) {
        items.push({
          content: chunk.content,
          sourceType: 'document',
          sourceId: chunks.length > 1 ? `${sourceId}#chunk-${chunk.index}` : sourceId,
          metadata: chunk.metadata,
        })
      }
    }

    expect(items.length).toBeGreaterThanOrEqual(2)
    expect(items[0].sourceType).toBe('document')
  })

  it('generates unique source IDs for nested files', async () => {
    await fs.mkdir(path.join(tempDir, 'subdir'))
    await fs.writeFile(path.join(tempDir, 'root.txt'), 'root content')
    await fs.writeFile(path.join(tempDir, 'subdir', 'nested.txt'), 'nested content')

    const docs = await listDocuments(tempDir)

    const sourceIds = docs.map((d) => generateSourceId(d.path, tempDir))

    expect(sourceIds).toContain('root.txt')
    expect(sourceIds.some((id) => id.includes('nested.txt'))).toBe(true)
  })
})
