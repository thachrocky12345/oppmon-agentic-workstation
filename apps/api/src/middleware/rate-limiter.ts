// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

import { Request, Response, NextFunction } from 'express';
import { query } from '../lib/db.js';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

// In-memory store for rate limiting (use Redis in production)
const rateLimitStore = new Map<string, RateLimitEntry>();

const WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS = parseInt(process.env.RATE_LIMIT_MAX || '100', 10);

/**
 * Simple rate limiter middleware
 * In production, use a Redis-based solution for distributed rate limiting
 */
export function rateLimiter(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  // Skip rate limiting for health checks
  if (req.path === '/api/health') {
    next();
    return;
  }

  // Use IP address as key (or tenant ID if authenticated)
  const key = req.ip || 'unknown';
  const now = Date.now();

  let entry = rateLimitStore.get(key);

  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + WINDOW_MS };
    rateLimitStore.set(key, entry);
  }

  entry.count++;

  // Set rate limit headers
  res.setHeader('X-RateLimit-Limit', MAX_REQUESTS);
  res.setHeader('X-RateLimit-Remaining', Math.max(0, MAX_REQUESTS - entry.count));
  res.setHeader('X-RateLimit-Reset', Math.ceil(entry.resetAt / 1000));

  if (entry.count > MAX_REQUESTS) {
    res.status(429).json({
      error: 'Too many requests',
      code: 'RATE_LIMIT_EXCEEDED',
      retryAfter: Math.ceil((entry.resetAt - now) / 1000),
    });
    return;
  }

  next();
}

/**
 * Database-backed rate limiter for production use
 * Supports distributed rate limiting across multiple instances
 */
export async function databaseRateLimiter(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (req.path === '/api/health') {
    next();
    return;
  }

  const key = req.ip || 'unknown';
  const windowStart = new Date(Date.now() - WINDOW_MS);

  try {
    // Upsert rate limit record
    const result = await query<{ request_count: number; window_start: Date }>(
      `INSERT INTO rate_limit (key, request_count, window_start)
       VALUES ($1, 1, NOW())
       ON CONFLICT (key) DO UPDATE SET
         request_count = CASE
           WHEN rate_limit.window_start < $2 THEN 1
           ELSE rate_limit.request_count + 1
         END,
         window_start = CASE
           WHEN rate_limit.window_start < $2 THEN NOW()
           ELSE rate_limit.window_start
         END
       RETURNING request_count, window_start`,
      [key, windowStart],
    );

    const { request_count } = result.rows[0];

    res.setHeader('X-RateLimit-Limit', MAX_REQUESTS);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, MAX_REQUESTS - request_count));

    if (request_count > MAX_REQUESTS) {
      res.status(429).json({
        error: 'Too many requests',
        code: 'RATE_LIMIT_EXCEEDED',
      });
      return;
    }

    next();
  } catch {
    // If rate limiting fails, allow the request
    next();
  }
}

// Cleanup old entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (now > entry.resetAt) {
      rateLimitStore.delete(key);
    }
  }
}, WINDOW_MS);
