/**
 * Document Storage Types
 *
 * Interfaces for document storage abstraction.
 * Supports local disk and future S3 implementations.
 */

import { Readable } from 'stream';

export interface StorageResult {
  path: string;
  size: number;
  sha256: string;
}

export interface DocumentStorage {
  /**
   * Store a document
   * @param tenantId - Tenant identifier
   * @param docId - Document identifier
   * @param filename - Original filename
   * @param stream - File data stream
   * @returns Storage result with path, size, and hash
   */
  put(
    tenantId: string,
    docId: string,
    filename: string,
    stream: Readable
  ): Promise<StorageResult>;

  /**
   * Retrieve a document
   * @param tenantId - Tenant identifier
   * @param docId - Document identifier
   * @param filename - Original filename
   * @returns Readable stream of file contents
   */
  get(tenantId: string, docId: string, filename: string): Promise<Readable>;

  /**
   * Delete a document directory
   * @param tenantId - Tenant identifier
   * @param docId - Document identifier
   */
  delete(tenantId: string, docId: string): Promise<void>;

  /**
   * Check if a document exists
   * @param tenantId - Tenant identifier
   * @param docId - Document identifier
   * @returns True if document directory exists
   */
  exists(tenantId: string, docId: string): Promise<boolean>;

  /**
   * Get the full path to a document
   * @param tenantId - Tenant identifier
   * @param docId - Document identifier
   * @param filename - Original filename
   * @returns Full filesystem path
   */
  getPath(tenantId: string, docId: string, filename: string): string;
}

export interface StorageConfig {
  rootPath: string;
}
