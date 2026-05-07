/**
 * RAG Retriever Service Tests
 *
 * Unit tests for RAG document retrieval:
 * - Query embedding generation
 * - Cosine similarity search
 * - Tenant isolation
 * - Team scope filtering
 * - Context formatting
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  retrieve,
  formatChunksAsContext,
  getAccessibleCollections,
  RetrievedChunk,
  RetrieveOptions,
} from './rag-retriever.js';

// Mock the database module
vi.mock('../lib/db.js', () => ({
  query: vi.fn(),
}));

// Mock the embedding module
vi.mock('../lib/embedding/index.js', () => ({
  createEmbeddingClient: vi.fn(() => ({
    embed: vi.fn().mockResolvedValue({
      embeddings: [{ embedding: new Array(1536).fill(0.1) }],
    }),
  })),
  toPgVector: vi.fn((arr: number[]) => `[${arr.slice(0, 3).join(',')}...]`),
}));

import { query } from '../lib/db.js';
import { createEmbeddingClient } from '../lib/embedding/index.js';

describe('RAG Retriever Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('retrieve', () => {
    it('returns empty array for empty query', async () => {
      const options: RetrieveOptions = {
        tenantId: 'tenant-1',
        userId: 'user-1',
        teamIds: ['team-1'],
        queryText: '',
      };

      const result = await retrieve(options);

      expect(result).toEqual([]);
      expect(query).not.toHaveBeenCalled();
    });

    it('returns empty array for whitespace-only query', async () => {
      const options: RetrieveOptions = {
        tenantId: 'tenant-1',
        userId: 'user-1',
        teamIds: ['team-1'],
        queryText: '   ',
      };

      const result = await retrieve(options);

      expect(result).toEqual([]);
    });

    it('calls embedding client with query text', async () => {
      const mockEmbedFn = vi.fn().mockResolvedValue({
        embeddings: [{ embedding: new Array(1536).fill(0.1) }],
      });
      vi.mocked(createEmbeddingClient).mockReturnValue({
        embed: mockEmbedFn,
      });
      vi.mocked(query).mockResolvedValue({ rows: [] });

      const options: RetrieveOptions = {
        tenantId: 'tenant-1',
        userId: 'user-1',
        teamIds: ['team-1'],
        queryText: 'What is machine learning?',
      };

      await retrieve(options);

      expect(mockEmbedFn).toHaveBeenCalledWith({ input: 'What is machine learning?' });
    });

    it('returns retrieved chunks with correct fields', async () => {
      vi.mocked(query).mockResolvedValue({
        rows: [
          {
            chunkId: 'chunk-1',
            documentId: 'doc-1',
            documentTitle: 'ML Guide',
            documentFilename: 'ml-guide.pdf',
            chunkText: 'Machine learning is...',
            chunkIndex: 0,
            pageNumber: 1,
            collectionId: 'col-1',
            collectionName: 'Engineering Docs',
            score: '0.85',
          },
          {
            chunkId: 'chunk-2',
            documentId: 'doc-1',
            documentTitle: 'ML Guide',
            documentFilename: 'ml-guide.pdf',
            chunkText: 'Deep learning is a subset...',
            chunkIndex: 1,
            pageNumber: 2,
            collectionId: 'col-1',
            collectionName: 'Engineering Docs',
            score: '0.78',
          },
        ],
      });

      const options: RetrieveOptions = {
        tenantId: 'tenant-1',
        userId: 'user-1',
        teamIds: ['team-1'],
        queryText: 'What is machine learning?',
      };

      const result = await retrieve(options);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        chunkId: 'chunk-1',
        documentId: 'doc-1',
        documentTitle: 'ML Guide',
        documentFilename: 'ml-guide.pdf',
        chunkText: 'Machine learning is...',
        chunkIndex: 0,
        pageNumber: 1,
        collectionId: 'col-1',
        collectionName: 'Engineering Docs',
        score: 0.85,
      });
      expect(result[1].score).toBe(0.78);
    });

    it('uses default topK and threshold values', async () => {
      let capturedParams: unknown[];
      vi.mocked(query).mockImplementation(async (sql, params) => {
        capturedParams = params as unknown[];
        return { rows: [] };
      });

      const options: RetrieveOptions = {
        tenantId: 'tenant-1',
        userId: 'user-1',
        teamIds: ['team-1'],
        queryText: 'test query',
      };

      await retrieve(options);

      // params: [embedding, tenantId, threshold, topK, teamIds]
      expect(capturedParams![2]).toBe(0.3); // default threshold
      expect(capturedParams![3]).toBe(5);   // default topK
    });

    it('uses custom topK and threshold values', async () => {
      let capturedParams: unknown[];
      vi.mocked(query).mockImplementation(async (sql, params) => {
        capturedParams = params as unknown[];
        return { rows: [] };
      });

      const options: RetrieveOptions = {
        tenantId: 'tenant-1',
        userId: 'user-1',
        teamIds: ['team-1'],
        queryText: 'test query',
        topK: 10,
        threshold: 0.5,
      };

      await retrieve(options);

      expect(capturedParams![2]).toBe(0.5);
      expect(capturedParams![3]).toBe(10);
    });

    it('includes tenant ID in query for isolation', async () => {
      let capturedSql: string;
      let capturedParams: unknown[];
      vi.mocked(query).mockImplementation(async (sql, params) => {
        capturedSql = sql as string;
        capturedParams = params as unknown[];
        return { rows: [] };
      });

      const options: RetrieveOptions = {
        tenantId: 'tenant-123',
        userId: 'user-1',
        teamIds: ['team-1'],
        queryText: 'test query',
      };

      await retrieve(options);

      expect(capturedSql!).toContain('ch.tenant_id = $2');
      expect(capturedParams![1]).toBe('tenant-123');
    });

    it('filters by team membership when teamIds provided', async () => {
      let capturedSql: string;
      let capturedParams: unknown[];
      vi.mocked(query).mockImplementation(async (sql, params) => {
        capturedSql = sql as string;
        capturedParams = params as unknown[];
        return { rows: [] };
      });

      const options: RetrieveOptions = {
        tenantId: 'tenant-1',
        userId: 'user-1',
        teamIds: ['team-1', 'team-2'],
        queryText: 'test query',
      };

      await retrieve(options);

      expect(capturedSql!).toContain("c.scope = 'TENANT'");
      expect(capturedSql!).toContain("c.scope = 'TEAM'");
      expect(capturedSql!).toContain('c.team_id = ANY($5)');
      expect(capturedParams![4]).toEqual(['team-1', 'team-2']);
    });

    it('only returns TENANT scope when no teamIds', async () => {
      let capturedSql: string;
      vi.mocked(query).mockImplementation(async (sql) => {
        capturedSql = sql as string;
        return { rows: [] };
      });

      const options: RetrieveOptions = {
        tenantId: 'tenant-1',
        userId: 'user-1',
        teamIds: [],
        queryText: 'test query',
      };

      await retrieve(options);

      expect(capturedSql!).toContain("c.scope = 'TENANT'");
      expect(capturedSql!).not.toContain('teamId = ANY');
    });

    it('filters by specific collection IDs when provided', async () => {
      let capturedSql: string;
      let capturedParams: unknown[];
      vi.mocked(query).mockImplementation(async (sql, params) => {
        capturedSql = sql as string;
        capturedParams = params as unknown[];
        return { rows: [] };
      });

      const options: RetrieveOptions = {
        tenantId: 'tenant-1',
        userId: 'user-1',
        teamIds: ['team-1'],
        queryText: 'test query',
        collectionIds: ['col-1', 'col-2'],
      };

      await retrieve(options);

      expect(capturedSql!).toContain('c.id = ANY');
      expect(capturedParams!).toContainEqual(['col-1', 'col-2']);
    });

    it('excludes deleted documents', async () => {
      let capturedSql: string;
      vi.mocked(query).mockImplementation(async (sql) => {
        capturedSql = sql as string;
        return { rows: [] };
      });

      const options: RetrieveOptions = {
        tenantId: 'tenant-1',
        userId: 'user-1',
        teamIds: [],
        queryText: 'test query',
      };

      await retrieve(options);

      expect(capturedSql!).toContain('d.deleted_at IS NULL');
      expect(capturedSql!).toContain('c.deleted_at IS NULL');
    });

    it('only includes EXTRACTED documents', async () => {
      let capturedSql: string;
      vi.mocked(query).mockImplementation(async (sql) => {
        capturedSql = sql as string;
        return { rows: [] };
      });

      const options: RetrieveOptions = {
        tenantId: 'tenant-1',
        userId: 'user-1',
        teamIds: [],
        queryText: 'test query',
      };

      await retrieve(options);

      expect(capturedSql!).toContain("d.\"extractionStatus\" = 'EXTRACTED'");
    });

    it('handles database errors gracefully', async () => {
      vi.mocked(query).mockRejectedValue(new Error('Database connection failed'));

      const options: RetrieveOptions = {
        tenantId: 'tenant-1',
        userId: 'user-1',
        teamIds: [],
        queryText: 'test query',
      };

      await expect(retrieve(options)).rejects.toThrow('Database connection failed');
    });

    it('handles null pageNumber correctly', async () => {
      vi.mocked(query).mockResolvedValue({
        rows: [
          {
            chunkId: 'chunk-1',
            documentId: 'doc-1',
            documentTitle: 'Text File',
            documentFilename: 'notes.txt',
            chunkText: 'Some content',
            chunkIndex: 0,
            pageNumber: null,
            collectionId: 'col-1',
            collectionName: 'Notes',
            score: '0.9',
          },
        ],
      });

      const options: RetrieveOptions = {
        tenantId: 'tenant-1',
        userId: 'user-1',
        teamIds: [],
        queryText: 'test query',
      };

      const result = await retrieve(options);

      expect(result[0].pageNumber).toBeNull();
    });
  });

  describe('formatChunksAsContext', () => {
    it('returns empty string for empty chunks array', () => {
      const result = formatChunksAsContext([]);
      expect(result).toBe('');
    });

    it('formats single chunk with page number', () => {
      const chunks: RetrievedChunk[] = [
        {
          chunkId: 'chunk-1',
          documentId: 'doc-1',
          documentTitle: 'ML Guide',
          documentFilename: 'ml-guide.pdf',
          chunkText: 'Machine learning is a field of AI.',
          chunkIndex: 0,
          pageNumber: 5,
          collectionId: 'col-1',
          collectionName: 'Docs',
          score: 0.9,
        },
      ];

      const result = formatChunksAsContext(chunks);

      expect(result).toContain('<context>');
      expect(result).toContain('</context>');
      expect(result).toContain('[1] From "ML Guide (page 5)":');
      expect(result).toContain('Machine learning is a field of AI.');
    });

    it('formats chunk without page number', () => {
      const chunks: RetrievedChunk[] = [
        {
          chunkId: 'chunk-1',
          documentId: 'doc-1',
          documentTitle: 'Notes',
          documentFilename: 'notes.txt',
          chunkText: 'Some notes here.',
          chunkIndex: 0,
          pageNumber: null,
          collectionId: 'col-1',
          collectionName: 'Docs',
          score: 0.9,
        },
      ];

      const result = formatChunksAsContext(chunks);

      expect(result).toContain('[1] From "Notes":');
      expect(result).not.toContain('(page');
    });

    it('formats multiple chunks with numbering', () => {
      const chunks: RetrievedChunk[] = [
        {
          chunkId: 'chunk-1',
          documentId: 'doc-1',
          documentTitle: 'Doc 1',
          documentFilename: 'doc1.pdf',
          chunkText: 'First chunk content.',
          chunkIndex: 0,
          pageNumber: 1,
          collectionId: 'col-1',
          collectionName: 'Docs',
          score: 0.95,
        },
        {
          chunkId: 'chunk-2',
          documentId: 'doc-2',
          documentTitle: 'Doc 2',
          documentFilename: 'doc2.pdf',
          chunkText: 'Second chunk content.',
          chunkIndex: 0,
          pageNumber: 3,
          collectionId: 'col-1',
          collectionName: 'Docs',
          score: 0.85,
        },
        {
          chunkId: 'chunk-3',
          documentId: 'doc-1',
          documentTitle: 'Doc 1',
          documentFilename: 'doc1.pdf',
          chunkText: 'Third chunk content.',
          chunkIndex: 1,
          pageNumber: 2,
          collectionId: 'col-1',
          collectionName: 'Docs',
          score: 0.75,
        },
      ];

      const result = formatChunksAsContext(chunks);

      expect(result).toContain('[1] From "Doc 1 (page 1)":');
      expect(result).toContain('[2] From "Doc 2 (page 3)":');
      expect(result).toContain('[3] From "Doc 1 (page 2)":');
      expect(result).toContain('First chunk content.');
      expect(result).toContain('Second chunk content.');
      expect(result).toContain('Third chunk content.');
    });

    it('preserves chunk text formatting', () => {
      const chunks: RetrievedChunk[] = [
        {
          chunkId: 'chunk-1',
          documentId: 'doc-1',
          documentTitle: 'Code Doc',
          documentFilename: 'code.md',
          chunkText: 'Here is code:\n```python\ndef hello():\n    print("Hello")\n```',
          chunkIndex: 0,
          pageNumber: null,
          collectionId: 'col-1',
          collectionName: 'Docs',
          score: 0.9,
        },
      ];

      const result = formatChunksAsContext(chunks);

      expect(result).toContain('```python');
      expect(result).toContain('def hello():');
      expect(result).toContain('print("Hello")');
    });
  });

  describe('getAccessibleCollections', () => {
    it('returns collections accessible to user', async () => {
      vi.mocked(query).mockResolvedValue({
        rows: [
          { id: 'col-1', name: 'Company Wiki', scope: 'TENANT' },
          { id: 'col-2', name: 'Engineering', scope: 'TEAM' },
        ],
      });

      const result = await getAccessibleCollections('tenant-1', ['team-1']);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ id: 'col-1', name: 'Company Wiki', scope: 'TENANT' });
      expect(result[1]).toEqual({ id: 'col-2', name: 'Engineering', scope: 'TEAM' });
    });

    it('only returns TENANT collections when no teamIds', async () => {
      let capturedSql: string;
      vi.mocked(query).mockImplementation(async (sql) => {
        capturedSql = sql as string;
        return { rows: [] };
      });

      await getAccessibleCollections('tenant-1', []);

      expect(capturedSql!).toContain("scope = 'TENANT'");
      expect(capturedSql!).not.toContain('teamId = ANY');
    });

    it('includes team collections when teamIds provided', async () => {
      let capturedSql: string;
      let capturedParams: unknown[];
      vi.mocked(query).mockImplementation(async (sql, params) => {
        capturedSql = sql as string;
        capturedParams = params as unknown[];
        return { rows: [] };
      });

      await getAccessibleCollections('tenant-1', ['team-1', 'team-2']);

      expect(capturedSql!).toContain("scope = 'TENANT'");
      expect(capturedSql!).toContain("scope = 'TEAM'");
      expect(capturedSql!).toContain('team_id = ANY($2)');
      expect(capturedParams![1]).toEqual(['team-1', 'team-2']);
    });

    it('excludes deleted collections', async () => {
      let capturedSql: string;
      vi.mocked(query).mockImplementation(async (sql) => {
        capturedSql = sql as string;
        return { rows: [] };
      });

      await getAccessibleCollections('tenant-1', []);

      expect(capturedSql!).toContain('deleted_at IS NULL');
    });

    it('filters by tenant ID', async () => {
      let capturedSql: string;
      let capturedParams: unknown[];
      vi.mocked(query).mockImplementation(async (sql, params) => {
        capturedSql = sql as string;
        capturedParams = params as unknown[];
        return { rows: [] };
      });

      await getAccessibleCollections('tenant-123', []);

      expect(capturedSql!).toContain('tenant_id = $1');
      expect(capturedParams![0]).toBe('tenant-123');
    });

    it('orders results by name', async () => {
      let capturedSql: string;
      vi.mocked(query).mockImplementation(async (sql) => {
        capturedSql = sql as string;
        return { rows: [] };
      });

      await getAccessibleCollections('tenant-1', []);

      expect(capturedSql!).toContain('ORDER BY name');
    });
  });
});
