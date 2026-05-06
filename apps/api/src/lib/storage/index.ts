/**
 * Document Storage Module
 *
 * Provides a unified interface for document storage.
 * Currently supports local disk; S3 can be added later.
 */

export * from './types.js';
export * from './local-disk.js';

import { DocumentStorage } from './types.js';
import { LocalDiskStorage, createLocalDiskStorage } from './local-disk.js';

// Singleton instance
let storageInstance: DocumentStorage | null = null;

/**
 * Get the document storage instance
 * Creates one if it doesn't exist
 */
export function getDocumentStorage(): DocumentStorage {
  if (!storageInstance) {
    // In the future, this could check env vars to use S3 instead
    storageInstance = createLocalDiskStorage();
  }
  return storageInstance;
}

/**
 * Set a custom storage instance (for testing)
 */
export function setDocumentStorage(storage: DocumentStorage): void {
  storageInstance = storage;
}

/**
 * Reset storage instance (for testing)
 */
export function resetDocumentStorage(): void {
  storageInstance = null;
}
