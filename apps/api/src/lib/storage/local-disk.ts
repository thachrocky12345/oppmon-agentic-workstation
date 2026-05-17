// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

/**
 * Local Disk Storage Implementation
 *
 * Stores documents on the local filesystem with strict security:
 * - Atomic writes (temp file + rename)
 * - Path traversal prevention
 * - UUID validation for IDs
 * - Non-root user execution
 *
 * Directory structure: {root}/{tenant_id}/{doc_id}/{filename}
 */

import { createReadStream, createWriteStream } from 'fs';
import { mkdir, rm, stat, rename, unlink } from 'fs/promises';
import { join, dirname, resolve } from 'path';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { createHash, randomBytes } from 'crypto';
import { DocumentStorage, StorageResult, StorageConfig } from './types.js';

// UUID/CUID pattern: alphanumeric with optional dashes (24-36 chars)
const ID_PATTERN = /^[a-zA-Z0-9_-]{20,40}$/;

/**
 * Validate that an ID matches expected format
 * Prevents path traversal by rejecting suspicious patterns
 */
function validateId(id: string, fieldName: string): void {
  if (!id || !ID_PATTERN.test(id)) {
    throw new Error(`Invalid ${fieldName}: must be 20-40 alphanumeric characters`);
  }
  // Additional check for traversal patterns
  if (id.includes('..') || id.includes('/') || id.includes('\\')) {
    throw new Error(`Invalid ${fieldName}: contains illegal characters`);
  }
}

/**
 * Sanitize filename while preserving extension
 */
function sanitizeFilename(filename: string): string {
  // Remove path components and null bytes
  const base = filename.replace(/[\x00-\x1f\/\\]/g, '').split(/[\/\\]/).pop() || 'file';
  // Replace other unsafe chars
  return base.replace(/[^a-zA-Z0-9._-]/g, '_').substring(0, 255);
}

export class LocalDiskStorage implements DocumentStorage {
  private readonly rootPath: string;
  private readonly resolvedRoot: string;

  constructor(config: StorageConfig) {
    this.rootPath = config.rootPath;
    this.resolvedRoot = resolve(config.rootPath);
  }

  /**
   * Build the full path for a document with security validation
   * Validates IDs and ensures path stays within root
   */
  getPath(tenantId: string, docId: string, filename: string): string {
    // Validate IDs
    validateId(tenantId, 'tenantId');
    validateId(docId, 'docId');

    // Sanitize filename
    const safeFilename = sanitizeFilename(filename);

    // Build path
    const targetPath = join(this.resolvedRoot, tenantId, docId, safeFilename);

    // Verify path stays within root (defense in depth)
    const resolvedTarget = resolve(targetPath);
    if (!resolvedTarget.startsWith(this.resolvedRoot + '/') &&
        !resolvedTarget.startsWith(this.resolvedRoot + '\\') &&
        resolvedTarget !== this.resolvedRoot) {
      throw new Error('Path traversal detected');
    }

    return resolvedTarget;
  }

  /**
   * Build the directory path for a document
   */
  private getDocDir(tenantId: string, docId: string): string {
    validateId(tenantId, 'tenantId');
    validateId(docId, 'docId');

    const docDir = join(this.resolvedRoot, tenantId, docId);
    const resolvedDir = resolve(docDir);

    // Verify path stays within root
    if (!resolvedDir.startsWith(this.resolvedRoot + '/') &&
        !resolvedDir.startsWith(this.resolvedRoot + '\\') &&
        resolvedDir !== this.resolvedRoot) {
      throw new Error('Path traversal detected');
    }

    return resolvedDir;
  }

  /**
   * Store a document atomically
   * Writes to a temp file first, then renames to prevent partial uploads
   */
  async put(
    tenantId: string,
    docId: string,
    filename: string,
    stream: Readable
  ): Promise<StorageResult> {
    const targetPath = this.getPath(tenantId, docId, filename);
    const targetDir = dirname(targetPath);

    // Create directory structure
    await mkdir(targetDir, { recursive: true, mode: 0o750 });

    // Generate temp file name
    const tempPath = `${targetPath}.tmp${randomBytes(4).toString('hex')}`;

    // Create hash for content integrity
    const hash = createHash('sha256');
    let size = 0;

    try {
      // Create write stream
      const writeStream = createWriteStream(tempPath, { mode: 0o640 });

      // Pipe stream through hash computation
      const transformedStream = new Readable({
        read() {}
      });

      stream.on('data', (chunk: Buffer) => {
        hash.update(chunk);
        size += chunk.length;
        transformedStream.push(chunk);
      });

      stream.on('end', () => {
        transformedStream.push(null);
      });

      stream.on('error', (err) => {
        transformedStream.destroy(err);
      });

      // Write to temp file
      await pipeline(transformedStream, writeStream);

      // Atomic rename
      await rename(tempPath, targetPath);

      // Build relative path for storage
      const relativePath = `${tenantId}/${docId}/${sanitizeFilename(filename)}`;

      return {
        path: relativePath,
        size,
        sha256: hash.digest('hex'),
      };
    } catch (error) {
      // Clean up temp file on error
      try {
        await unlink(tempPath);
      } catch {
        // Ignore cleanup errors
      }
      throw error;
    }
  }

  /**
   * Retrieve a document as a stream
   */
  async get(tenantId: string, docId: string, filename: string): Promise<Readable> {
    const filePath = this.getPath(tenantId, docId, filename);

    // Verify file exists
    try {
      await stat(filePath);
    } catch (error) {
      throw new Error(`Document not found: ${tenantId}/${docId}/${filename}`);
    }

    return createReadStream(filePath);
  }

  /**
   * Delete a document directory and all contents
   */
  async delete(tenantId: string, docId: string): Promise<void> {
    const docDir = this.getDocDir(tenantId, docId);

    try {
      await rm(docDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore if directory doesn't exist
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  /**
   * Check if a document exists
   */
  async exists(tenantId: string, docId: string): Promise<boolean> {
    const docDir = this.getDocDir(tenantId, docId);

    try {
      await stat(docDir);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Create a local disk storage instance from environment configuration
 */
export function createLocalDiskStorage(): LocalDiskStorage {
  const rootPath = process.env.TAG_DOCUMENT_ROOT || './data/documents';
  return new LocalDiskStorage({ rootPath });
}
