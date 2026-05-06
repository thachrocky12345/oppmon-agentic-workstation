/**
 * Semantic Cache
 *
 * LRU cache for semantic search results to prevent redundant queries.
 * Pattern from agent-research-assistant.
 */

import crypto from 'crypto'
import type { ScoredDocument, CacheEntry } from './memory-types'

export class SemanticCache {
  private cache: Map<string, CacheEntry<ScoredDocument[]>>
  private maxSize: number
  private ttlMs: number

  constructor(options: { maxSize?: number; ttlMs?: number } = {}) {
    this.cache = new Map()
    this.maxSize = options.maxSize ?? 128
    this.ttlMs = options.ttlMs ?? 5 * 60 * 1000 // 5 minutes default
  }

  /**
   * Generate cache key from query and parameters
   */
  private getCacheKey(
    tenantId: string,
    query: string,
    nResults: number
  ): string {
    const normalized = query.toLowerCase().trim()
    return crypto
      .createHash('md5')
      .update(`${tenantId}:${normalized}:${nResults}`)
      .digest('hex')
  }

  /**
   * Get cached results if available and not expired
   */
  get(
    tenantId: string,
    query: string,
    nResults: number
  ): ScoredDocument[] | null {
    const key = this.getCacheKey(tenantId, query, nResults)
    const entry = this.cache.get(key)

    if (!entry) {
      return null
    }

    // Check TTL
    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.cache.delete(key)
      return null
    }

    // Move to end (LRU)
    this.cache.delete(key)
    this.cache.set(key, entry)

    return entry.value
  }

  /**
   * Store results in cache
   */
  set(
    tenantId: string,
    query: string,
    nResults: number,
    results: ScoredDocument[]
  ): void {
    const key = this.getCacheKey(tenantId, query, nResults)

    // Evict oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value
      if (oldestKey) {
        this.cache.delete(oldestKey)
      }
    }

    this.cache.set(key, {
      value: results,
      timestamp: Date.now(),
    })
  }

  /**
   * Invalidate cache for a tenant
   */
  invalidate(tenantId: string): void {
    for (const key of this.cache.keys()) {
      // Keys start with tenantId hash
      if (key.startsWith(tenantId.slice(0, 8))) {
        this.cache.delete(key)
      }
    }
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear()
  }

  /**
   * Get cache statistics
   */
  stats(): { size: number; maxSize: number; hitRate?: number } {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
    }
  }
}
