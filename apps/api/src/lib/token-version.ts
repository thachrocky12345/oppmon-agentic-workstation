// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

/**
 * Token Version — event-driven session revocation
 *
 * Each user has a single counter (`token_versions.version`). JWTs embed the
 * version they were issued with as the `tv` claim. On every authenticated
 * request, we compare the JWT's `tv` to the current value; mismatches force
 * re-login.
 *
 * Bump the counter on:
 *   - role change                (admin routes)
 *   - team membership change     (admin routes)
 *   - password change            (auth routes)
 *   - explicit "revoke sessions" (admin action)
 *
 * Scope: simple, fast, easy to maintain. No refresh-token families, no
 * blacklist, no Redis. The 60-second LRU smooths the hot path; cache is
 * invalidated synchronously by the bumper, so role changes take effect on
 * the next request.
 */

import { prisma } from '@oppmon/database';
import { pino } from 'pino';

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

const CACHE_TTL_MS = 60_000;
const CACHE_MAX_ENTRIES = 5_000;

interface CacheEntry {
  version: number;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

function evictIfNeeded(): void {
  if (cache.size <= CACHE_MAX_ENTRIES) return;
  // Drop the oldest 10% (Map iteration order is insertion order).
  const drop = Math.ceil(CACHE_MAX_ENTRIES * 0.1);
  let i = 0;
  for (const key of cache.keys()) {
    cache.delete(key);
    if (++i >= drop) break;
  }
}

/**
 * Read the current token version for a user, with a small LRU cache.
 * Returns 1 if the user has no row yet (treats absence as initial version).
 */
export async function getTokenVersion(userId: string): Promise<number> {
  const now = Date.now();
  const cached = cache.get(userId);
  if (cached && cached.expiresAt > now) {
    return cached.version;
  }

  const row = await prisma.tokenVersion.findUnique({
    where: { userId },
    select: { version: true },
  });
  const version = row?.version ?? 1;

  cache.set(userId, { version, expiresAt: now + CACHE_TTL_MS });
  evictIfNeeded();
  return version;
}

/**
 * Bump the user's token version. Atomic upsert + cache invalidation. All
 * outstanding JWTs for this user will be rejected by the request-auth
 * middleware on their next request.
 */
export async function bumpTokenVersion(userId: string): Promise<number> {
  const updated = await prisma.tokenVersion.upsert({
    where: { userId },
    update: { version: { increment: 1 } },
    create: { userId, version: 2 }, // 2 because the first JWT was issued at v1
    select: { version: true },
  });
  cache.delete(userId);
  logger.info({ userId, version: updated.version }, 'Token version bumped');
  return updated.version;
}

/**
 * Invalidate the in-memory cache entry for a user without bumping the DB.
 * Useful when an external process (e.g. another API instance) bumped the
 * version and we want to force a re-read on the next request.
 */
export function invalidateTokenVersion(userId: string): void {
  cache.delete(userId);
}

/** Test-only helper — drop the entire cache. */
export function _resetTokenVersionCacheForTests(): void {
  cache.clear();
}
