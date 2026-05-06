/**
 * Local Disk Storage Tests
 *
 * Unit tests for the local disk document storage implementation:
 * - Path sanitization
 * - Atomic file writes
 * - SHA-256 hash computation
 * - File retrieval
 * - File deletion
 * - Existence checks
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Readable } from 'stream';
import { join } from 'path';
import { mkdir, rm, writeFile, readFile, stat } from 'fs/promises';
import { LocalDiskStorage } from './local-disk.js';

// Test root directory
const TEST_ROOT = join(process.cwd(), 'tmp', 'test-storage');

// Valid test IDs (20-40 alphanumeric chars) - CUID style
const TENANT_1 = 'clx1234567890abcdefgh';
const TENANT_2 = 'clx2345678901bcdefghi';
const DOC_1 = 'doc1234567890abcdefgh';
const DOC_2 = 'doc2345678901bcdefghi';
const DOC_EMPTY = 'docempty123456abcdefg';
const NEW_TENANT = 'clxnew12345678abcdefg';
const NEW_DOC = 'docnew12345678abcdefg';

describe('LocalDiskStorage', () => {
  let storage: LocalDiskStorage;

  beforeEach(async () => {
    // Create test directory
    await mkdir(TEST_ROOT, { recursive: true });
    storage = new LocalDiskStorage({ rootPath: TEST_ROOT });
  });

  afterEach(async () => {
    // Clean up test directory
    await rm(TEST_ROOT, { recursive: true, force: true });
  });

  describe('getPath', () => {
    it('builds correct path from tenant, doc, and filename', () => {
      const path = storage.getPath(TENANT_1, DOC_1, 'file.pdf');
      expect(path).toContain(TEST_ROOT);
      expect(path).toContain(TENANT_1);
      expect(path).toContain(DOC_1);
      expect(path).toContain('file.pdf');
    });

    it('rejects path traversal attempts in tenant ID', () => {
      expect(() => storage.getPath('../../../etc', DOC_1, 'file.txt'))
        .toThrow('Invalid tenantId');
    });

    it('rejects path traversal attempts in doc ID', () => {
      expect(() => storage.getPath(TENANT_1, '../../secret', 'file.txt'))
        .toThrow('Invalid docId');
    });

    it('sanitizes filename to prevent path traversal', () => {
      const path = storage.getPath(TENANT_1, DOC_1, '../../../etc/passwd');
      // Filename is sanitized but doesn't throw
      expect(path).not.toContain('../');
      expect(path).toContain(TENANT_1);
      expect(path).toContain(DOC_1);
    });

    it('replaces special characters in filename with underscores', () => {
      const path = storage.getPath(TENANT_1, DOC_1, 'file name (1).pdf');
      expect(path).toContain('file_name__1_.pdf');
    });

    it('preserves valid characters in filenames', () => {
      const path = storage.getPath(TENANT_1, DOC_1, 'report-2024.01.15_final.pdf');
      expect(path).toContain('report-2024.01.15_final.pdf');
    });

    it('handles alphanumeric tenant and doc IDs correctly', () => {
      const path = storage.getPath('abcdefghijklmnopqrstu', 'vwxyz123456789012345', 'test.txt');
      expect(path).toContain('abcdefghijklmnopqrstu');
      expect(path).toContain('vwxyz123456789012345');
    });

    it('handles IDs with underscores and hyphens', () => {
      const path = storage.getPath('tenant_1-test123456789', 'doc_1-test12345678901', 'file.txt');
      expect(path).toContain('tenant_1-test123456789');
      expect(path).toContain('doc_1-test12345678901');
    });

    it('rejects IDs that are too short', () => {
      expect(() => storage.getPath('short', DOC_1, 'file.txt'))
        .toThrow('Invalid tenantId');
    });

    it('rejects IDs that are too long', () => {
      const longId = 'a'.repeat(50);
      expect(() => storage.getPath(longId, DOC_1, 'file.txt'))
        .toThrow('Invalid tenantId');
    });
  });

  describe('put', () => {
    it('stores file content and returns storage result', async () => {
      const content = 'Hello, World!';
      const stream = Readable.from([Buffer.from(content)]);

      const result = await storage.put(TENANT_1, DOC_1, 'test.txt', stream);

      expect(result.path).toBe(`${TENANT_1}/${DOC_1}/test.txt`);
      expect(result.size).toBe(content.length);
      expect(result.sha256).toBe('dffd6021bb2bd5b0af676290809ec3a53191dd81c7f70a4b28688a362182986f');
    });

    it('creates directory structure if it does not exist', async () => {
      const stream = Readable.from([Buffer.from('test')]);
      await storage.put(NEW_TENANT, NEW_DOC, 'file.txt', stream);

      const dirStat = await stat(join(TEST_ROOT, NEW_TENANT, NEW_DOC));
      expect(dirStat.isDirectory()).toBe(true);
    });

    it('writes file content correctly', async () => {
      const content = 'File content for testing';
      const stream = Readable.from([Buffer.from(content)]);

      await storage.put(TENANT_1, DOC_1, 'content.txt', stream);

      const filePath = storage.getPath(TENANT_1, DOC_1, 'content.txt');
      const readContent = await readFile(filePath, 'utf-8');
      expect(readContent).toBe(content);
    });

    it('handles large files in chunks', async () => {
      // Create a 1MB file in chunks
      const chunks: Buffer[] = [];
      for (let i = 0; i < 1024; i++) {
        chunks.push(Buffer.alloc(1024, i % 256));
      }
      const stream = Readable.from(chunks);

      const result = await storage.put(TENANT_1, DOC_1, 'large.bin', stream);

      expect(result.size).toBe(1024 * 1024);
      expect(result.sha256).toHaveLength(64);
    });

    it('handles binary content', async () => {
      const binaryData = Buffer.from([0x00, 0x01, 0xFF, 0xFE, 0x89, 0x50, 0x4E, 0x47]);
      const stream = Readable.from([binaryData]);

      const result = await storage.put(TENANT_1, DOC_1, 'binary.bin', stream);

      expect(result.size).toBe(8);

      const filePath = storage.getPath(TENANT_1, DOC_1, 'binary.bin');
      const readContent = await readFile(filePath);
      expect(readContent).toEqual(binaryData);
    });

    it('handles empty files', async () => {
      const stream = Readable.from([Buffer.from('')]);

      const result = await storage.put(TENANT_1, DOC_1, 'empty.txt', stream);

      expect(result.size).toBe(0);
      expect(result.sha256).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    });

    it('overwrites existing file', async () => {
      const stream1 = Readable.from([Buffer.from('original content')]);
      await storage.put(TENANT_1, DOC_1, 'file.txt', stream1);

      const stream2 = Readable.from([Buffer.from('new content')]);
      const result = await storage.put(TENANT_1, DOC_1, 'file.txt', stream2);

      expect(result.size).toBe('new content'.length);

      const filePath = storage.getPath(TENANT_1, DOC_1, 'file.txt');
      const content = await readFile(filePath, 'utf-8');
      expect(content).toBe('new content');
    });

    it('computes correct SHA-256 for known content', async () => {
      const content = 'test content';
      const stream = Readable.from([Buffer.from(content)]);

      const result = await storage.put(TENANT_1, DOC_1, 'hash-test.txt', stream);

      // Pre-computed SHA-256 of 'test content'
      expect(result.sha256).toBe('6ae8a75555209fd6c44157c0aed8016e763ff435a19cf186f76863140143ff72');
    });
  });

  describe('get', () => {
    it('retrieves file content as stream', async () => {
      // First store a file
      const content = 'Content to retrieve';
      const putStream = Readable.from([Buffer.from(content)]);
      await storage.put(TENANT_1, DOC_1, 'retrieve.txt', putStream);

      // Then retrieve it
      const getStream = await storage.get(TENANT_1, DOC_1, 'retrieve.txt');

      const chunks: Buffer[] = [];
      for await (const chunk of getStream) {
        chunks.push(chunk);
      }
      const retrievedContent = Buffer.concat(chunks).toString('utf-8');
      expect(retrievedContent).toBe(content);
    });

    it('throws error for non-existent file', async () => {
      await expect(
        storage.get(TENANT_1, DOC_1, 'nonexistent.txt')
      ).rejects.toThrow('Document not found');
    });

    it('throws error for invalid tenant ID format', async () => {
      await expect(
        storage.get('short', DOC_1, 'file.txt')
      ).rejects.toThrow('Invalid tenantId');
    });

    it('retrieves binary content correctly', async () => {
      const binaryData = Buffer.from([0x00, 0x01, 0xFF, 0xFE]);
      const putStream = Readable.from([binaryData]);
      await storage.put(TENANT_1, DOC_1, 'binary.bin', putStream);

      const getStream = await storage.get(TENANT_1, DOC_1, 'binary.bin');

      const chunks: Buffer[] = [];
      for await (const chunk of getStream) {
        chunks.push(chunk);
      }
      expect(Buffer.concat(chunks)).toEqual(binaryData);
    });
  });

  describe('delete', () => {
    it('deletes document directory and all contents', async () => {
      // Create multiple files in a document
      const stream1 = Readable.from([Buffer.from('file 1')]);
      const stream2 = Readable.from([Buffer.from('file 2')]);
      await storage.put(TENANT_1, DOC_1, 'file1.txt', stream1);
      await storage.put(TENANT_1, DOC_1, 'file2.txt', stream2);

      // Delete the document
      await storage.delete(TENANT_1, DOC_1);

      // Verify it's gone
      const exists = await storage.exists(TENANT_1, DOC_1);
      expect(exists).toBe(false);
    });

    it('does not throw for non-existent document', async () => {
      const nonExistentDoc = 'docnonexistent12345678';
      // Should not throw
      await expect(
        storage.delete(TENANT_1, nonExistentDoc)
      ).resolves.toBeUndefined();
    });

    it('does not affect other documents in same tenant', async () => {
      const stream1 = Readable.from([Buffer.from('doc 1')]);
      const stream2 = Readable.from([Buffer.from('doc 2')]);
      await storage.put(TENANT_1, DOC_1, 'file.txt', stream1);
      await storage.put(TENANT_1, DOC_2, 'file.txt', stream2);

      await storage.delete(TENANT_1, DOC_1);

      const doc1Exists = await storage.exists(TENANT_1, DOC_1);
      const doc2Exists = await storage.exists(TENANT_1, DOC_2);
      expect(doc1Exists).toBe(false);
      expect(doc2Exists).toBe(true);
    });

    it('does not affect other tenants', async () => {
      const stream1 = Readable.from([Buffer.from('tenant 1')]);
      const stream2 = Readable.from([Buffer.from('tenant 2')]);
      await storage.put(TENANT_1, DOC_1, 'file.txt', stream1);
      await storage.put(TENANT_2, DOC_1, 'file.txt', stream2);

      await storage.delete(TENANT_1, DOC_1);

      const tenant1Exists = await storage.exists(TENANT_1, DOC_1);
      const tenant2Exists = await storage.exists(TENANT_2, DOC_1);
      expect(tenant1Exists).toBe(false);
      expect(tenant2Exists).toBe(true);
    });
  });

  describe('exists', () => {
    it('returns true for existing document', async () => {
      const stream = Readable.from([Buffer.from('test')]);
      await storage.put(TENANT_1, DOC_1, 'file.txt', stream);

      const exists = await storage.exists(TENANT_1, DOC_1);
      expect(exists).toBe(true);
    });

    it('returns false for non-existent document', async () => {
      const nonExistentDoc = 'docnonexistent12345678';
      const exists = await storage.exists(TENANT_1, nonExistentDoc);
      expect(exists).toBe(false);
    });

    it('returns false for non-existent tenant', async () => {
      const nonExistentTenant = 'clxnonexistent1234567';
      const exists = await storage.exists(nonExistentTenant, DOC_1);
      expect(exists).toBe(false);
    });

    it('returns true even if document directory is empty', async () => {
      // Create directory without files
      await mkdir(join(TEST_ROOT, TENANT_1, DOC_EMPTY), { recursive: true });

      const exists = await storage.exists(TENANT_1, DOC_EMPTY);
      expect(exists).toBe(true);
    });
  });

  describe('tenant isolation', () => {
    it('isolates files between tenants with same doc ID', async () => {
      const stream1 = Readable.from([Buffer.from('tenant 1 content')]);
      const stream2 = Readable.from([Buffer.from('tenant 2 content')]);

      await storage.put(TENANT_1, DOC_1, 'file.txt', stream1);
      await storage.put(TENANT_2, DOC_1, 'file.txt', stream2);

      const getStream1 = await storage.get(TENANT_1, DOC_1, 'file.txt');
      const getStream2 = await storage.get(TENANT_2, DOC_1, 'file.txt');

      const chunks1: Buffer[] = [];
      const chunks2: Buffer[] = [];
      for await (const chunk of getStream1) chunks1.push(chunk);
      for await (const chunk of getStream2) chunks2.push(chunk);

      expect(Buffer.concat(chunks1).toString()).toBe('tenant 1 content');
      expect(Buffer.concat(chunks2).toString()).toBe('tenant 2 content');
    });
  });

  describe('security', () => {
    it('rejects IDs with path traversal patterns', () => {
      // The pattern check catches this first (dots aren't alphanumeric)
      expect(() => storage.getPath(TENANT_1, '..doc123456789012345', 'file.txt'))
        .toThrow('Invalid docId');
    });

    it('rejects IDs with forward slashes', () => {
      expect(() => storage.getPath('tenant/evil/123456789', DOC_1, 'file.txt'))
        .toThrow('Invalid tenantId');
    });

    it('rejects IDs with backslashes', () => {
      expect(() => storage.getPath('tenant\\evil\\12345678', DOC_1, 'file.txt'))
        .toThrow('Invalid tenantId');
    });

    it('sanitizes null bytes in filename', () => {
      const path = storage.getPath(TENANT_1, DOC_1, 'file\x00.txt');
      expect(path).not.toContain('\x00');
    });
  });
});
