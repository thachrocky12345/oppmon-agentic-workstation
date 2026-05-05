/**
 * Document Processing Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'
import {
  getDocumentInfo,
  isSupported,
  readDocument,
  generateSourceId,
  hashContent,
  chunkText,
  chunkDocument,
  listDocuments,
  prepareDocument,
  formatSize,
} from '../lib/documents.js'

describe('Document Processing', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `tag-docs-test-${Date.now()}`)
    await fs.mkdir(tempDir, { recursive: true })
  })

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true })
    } catch {
      // Ignore cleanup errors
    }
  })

  describe('getDocumentInfo', () => {
    it('returns correct info for a text file', async () => {
      const filePath = path.join(tempDir, 'test.txt')
      await fs.writeFile(filePath, 'Hello, World!')

      const info = await getDocumentInfo(filePath)

      expect(info.name).toBe('test.txt')
      expect(info.extension).toBe('.txt')
      expect(info.size).toBe(13)
      expect(info.mimeType).toBe('text/plain')
    })

    it('returns correct info for a markdown file', async () => {
      const filePath = path.join(tempDir, 'README.md')
      await fs.writeFile(filePath, '# Title\n\nContent here')

      const info = await getDocumentInfo(filePath)

      expect(info.name).toBe('README.md')
      expect(info.extension).toBe('.md')
      expect(info.mimeType).toBe('text/markdown')
    })

    it('returns correct info for a TypeScript file', async () => {
      const filePath = path.join(tempDir, 'index.ts')
      await fs.writeFile(filePath, 'const x = 1;')

      const info = await getDocumentInfo(filePath)

      expect(info.extension).toBe('.ts')
      expect(info.mimeType).toBe('text/typescript')
    })
  })

  describe('isSupported', () => {
    it('returns true for supported text files', () => {
      expect(isSupported('file.txt')).toBe(true)
      expect(isSupported('file.md')).toBe(true)
      expect(isSupported('file.ts')).toBe(true)
      expect(isSupported('file.js')).toBe(true)
      expect(isSupported('file.py')).toBe(true)
      expect(isSupported('file.json')).toBe(true)
    })

    it('returns false for binary/unsupported files', () => {
      expect(isSupported('file.exe')).toBe(false)
      expect(isSupported('file.png')).toBe(false)
      expect(isSupported('file.jpg')).toBe(false)
      expect(isSupported('file.zip')).toBe(false)
      expect(isSupported('file.pdf')).toBe(false)
      expect(isSupported('package-lock.json')).toBe(true) // JSON is supported
    })
  })

  describe('readDocument', () => {
    it('reads file content', async () => {
      const filePath = path.join(tempDir, 'test.txt')
      await fs.writeFile(filePath, 'Hello, World!')

      const content = await readDocument(filePath)

      expect(content).toBe('Hello, World!')
    })
  })

  describe('generateSourceId', () => {
    it('generates relative path as source ID', () => {
      const projectRoot = '/project'
      const filePath = '/project/src/index.ts'

      const sourceId = generateSourceId(filePath, projectRoot)

      expect(sourceId).toBe('src/index.ts')
    })

    it('normalizes backslashes to forward slashes', () => {
      const projectRoot = 'C:\\project'
      const filePath = 'C:\\project\\src\\index.ts'

      const sourceId = generateSourceId(filePath, projectRoot)

      expect(sourceId).toBe('src/index.ts')
    })

    it('uses basename when no project root', () => {
      const sourceId = generateSourceId('/some/path/file.txt')

      expect(sourceId).toBe('file.txt')
    })
  })

  describe('hashContent', () => {
    it('returns consistent SHA256 hash', () => {
      const content = 'Hello, World!'

      const hash1 = hashContent(content)
      const hash2 = hashContent(content)

      expect(hash1).toBe(hash2)
      expect(hash1).toHaveLength(64)
    })

    it('returns different hashes for different content', () => {
      const hash1 = hashContent('Hello')
      const hash2 = hashContent('World')

      expect(hash1).not.toBe(hash2)
    })
  })

  describe('chunkText', () => {
    it('returns single chunk for short text', () => {
      const text = 'Short text'
      const chunks = chunkText(text, { maxChunkSize: 100 })

      expect(chunks).toHaveLength(1)
      expect(chunks[0].content).toBe('Short text')
      expect(chunks[0].index).toBe(0)
    })

    it('splits long text into multiple chunks', () => {
      const text = 'A'.repeat(500) + '\n\n' + 'B'.repeat(500)
      const chunks = chunkText(text, { maxChunkSize: 600 })

      expect(chunks.length).toBeGreaterThan(1)
    })

    it('respects chunk overlap', () => {
      const text = 'A'.repeat(300) + '\n\n' + 'B'.repeat(300)
      const chunks = chunkText(text, { maxChunkSize: 400, chunkOverlap: 50 })

      expect(chunks.length).toBeGreaterThanOrEqual(1)
    })

    it('preserves metadata in chunks', () => {
      const text = 'First paragraph\n\nSecond paragraph'
      const chunks = chunkText(text)

      expect(chunks[0].metadata).toBeDefined()
      expect(chunks[0].metadata.chunkIndex).toBe(0)
      expect(chunks[0].metadata.totalChunks).toBe(chunks.length)
    })
  })

  describe('chunkDocument', () => {
    it('includes file info in chunk metadata', async () => {
      const filePath = path.join(tempDir, 'test.md')
      await fs.writeFile(filePath, '# Title\n\nContent')

      const info = await getDocumentInfo(filePath)
      const content = await readDocument(filePath)
      const chunks = chunkDocument(content, info)

      expect(chunks[0].metadata.filename).toBe('test.md')
      expect(chunks[0].metadata.extension).toBe('.md')
    })
  })

  describe('listDocuments', () => {
    it('lists all supported files', async () => {
      await fs.writeFile(path.join(tempDir, 'file1.txt'), 'content')
      await fs.writeFile(path.join(tempDir, 'file2.md'), 'content')
      await fs.writeFile(path.join(tempDir, 'file3.ts'), 'content')

      const docs = await listDocuments(tempDir)

      expect(docs).toHaveLength(3)
      expect(docs.map((d) => d.name).sort()).toEqual(['file1.txt', 'file2.md', 'file3.ts'])
    })

    it('skips unsupported files', async () => {
      await fs.writeFile(path.join(tempDir, 'file.txt'), 'content')
      await fs.writeFile(path.join(tempDir, 'file.exe'), 'binary')

      const docs = await listDocuments(tempDir)

      expect(docs).toHaveLength(1)
      expect(docs[0].name).toBe('file.txt')
    })

    it('recursively scans subdirectories', async () => {
      await fs.mkdir(path.join(tempDir, 'subdir'))
      await fs.writeFile(path.join(tempDir, 'root.txt'), 'content')
      await fs.writeFile(path.join(tempDir, 'subdir', 'nested.txt'), 'content')

      const docs = await listDocuments(tempDir, true)

      expect(docs).toHaveLength(2)
    })

    it('skips node_modules directories', async () => {
      await fs.mkdir(path.join(tempDir, 'node_modules'))
      await fs.writeFile(path.join(tempDir, 'index.ts'), 'content')
      await fs.writeFile(path.join(tempDir, 'node_modules', 'dep.js'), 'content')

      const docs = await listDocuments(tempDir, true)

      expect(docs).toHaveLength(1)
      expect(docs[0].name).toBe('index.ts')
    })
  })

  describe('prepareDocument', () => {
    it('prepares document with all info', async () => {
      const filePath = path.join(tempDir, 'test.md')
      await fs.writeFile(filePath, '# Title\n\nSome content here')

      const prepared = await prepareDocument(filePath, tempDir)

      expect(prepared.sourceId).toBe('test.md')
      expect(prepared.content).toBe('# Title\n\nSome content here')
      expect(prepared.contentHash).toHaveLength(64)
      expect(prepared.metadata.filename).toBe('test.md')
      expect(prepared.metadata.extension).toBe('.md')
      expect(prepared.chunks.length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('formatSize', () => {
    it('formats bytes', () => {
      expect(formatSize(100)).toBe('100 B')
      expect(formatSize(1023)).toBe('1023 B')
    })

    it('formats kilobytes', () => {
      expect(formatSize(1024)).toBe('1.0 KB')
      expect(formatSize(2048)).toBe('2.0 KB')
      expect(formatSize(1536)).toBe('1.5 KB')
    })

    it('formats megabytes', () => {
      expect(formatSize(1024 * 1024)).toBe('1.0 MB')
      expect(formatSize(1.5 * 1024 * 1024)).toBe('1.5 MB')
    })
  })
})
