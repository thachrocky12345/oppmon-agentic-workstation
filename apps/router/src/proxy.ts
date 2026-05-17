// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

/**
 * Proxy Middleware
 * Routes requests to tenant-specific LiteLLM containers
 */

import { createProxyMiddleware, type RequestHandler } from 'http-proxy-middleware';
import type { Request, Response, NextFunction } from 'express';
import { prisma } from '@arkon/database';
import bcrypt from 'bcryptjs';
import { pino } from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
});

// ============================================================================
// Types
// ============================================================================

interface VirtualKeyInfo {
  tenantId: string;
  userId: string;
  keyId: string;
}

interface TenantCache {
  tenantId: string;
  timestamp: number;
}

// ============================================================================
// Configuration
// ============================================================================

const KEY_CACHE_TTL_MS = 60 * 1000; // 60 seconds
const LITELLM_PORT = 4000;
const DOCKER_NETWORK = process.env.DOCKER_NETWORK || 'arkon-internal';

// ============================================================================
// Caching
// ============================================================================

// Cache: prefix -> { tenantId, timestamp }
const prefixCache = new Map<string, TenantCache>();

// Debounce: keyId -> timestamp
const lastUsedDebounce = new Map<string, number>();
const DEBOUNCE_MS = 5000; // Update last_used_at at most every 5 seconds

// ============================================================================
// Key Parsing and Validation
// ============================================================================

/**
 * Parse virtual key from Authorization header
 * Format: Bearer sk-tag-{8charPrefix}-{32charSecret}
 */
function parseVirtualKey(authHeader: string | undefined): {
  prefix: string;
  secret: string;
} | null {
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.substring(7);

  // Expected format: sk-tag-{prefix}-{secret}
  const match = token.match(/^sk-tag-([a-zA-Z0-9]{8})-([a-zA-Z0-9]+)$/);
  if (!match) {
    return null;
  }

  return {
    prefix: match[1],
    secret: match[2],
  };
}

/**
 * Validate virtual key and return tenant info
 */
async function validateVirtualKey(
  prefix: string,
  secret: string
): Promise<VirtualKeyInfo | null> {
  // Check cache first
  const cached = prefixCache.get(prefix);
  if (cached && Date.now() - cached.timestamp < KEY_CACHE_TTL_MS) {
    // Cache hit - still need to verify secret
    const key = await prisma.virtualKey.findFirst({
      where: {
        keyPrefix: prefix,
        tenantId: cached.tenantId,
        enabled: true,
        revokedAt: null,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } },
        ],
      },
      select: {
        id: true,
        tenantId: true,
        userId: true,
        keyHash: true,
      },
    });

    if (!key) {
      prefixCache.delete(prefix);
      return null;
    }

    // Verify secret
    const validSecret = await bcrypt.compare(
      `sk-tag-${prefix}-${secret}`,
      key.keyHash
    );

    if (!validSecret) {
      return null;
    }

    // Update last used (debounced)
    await updateLastUsed(key.id);

    return {
      tenantId: key.tenantId,
      userId: key.userId,
      keyId: key.id,
    };
  }

  // Cache miss - query database
  const key = await prisma.virtualKey.findFirst({
    where: {
      keyPrefix: prefix,
      enabled: true,
      revokedAt: null,
      OR: [
        { expiresAt: null },
        { expiresAt: { gt: new Date() } },
      ],
    },
    select: {
      id: true,
      tenantId: true,
      userId: true,
      keyHash: true,
    },
  });

  if (!key) {
    return null;
  }

  // Verify secret
  const validSecret = await bcrypt.compare(
    `sk-tag-${prefix}-${secret}`,
    key.keyHash
  );

  if (!validSecret) {
    return null;
  }

  // Update cache
  prefixCache.set(prefix, {
    tenantId: key.tenantId,
    timestamp: Date.now(),
  });

  // Update last used (debounced)
  await updateLastUsed(key.id);

  return {
    tenantId: key.tenantId,
    userId: key.userId,
    keyId: key.id,
  };
}

/**
 * Update last_used_at with debouncing
 */
async function updateLastUsed(keyId: string): Promise<void> {
  const lastUpdate = lastUsedDebounce.get(keyId);
  const now = Date.now();

  if (lastUpdate && now - lastUpdate < DEBOUNCE_MS) {
    return;
  }

  lastUsedDebounce.set(keyId, now);

  // Fire and forget - don't await
  prisma.virtualKey
    .update({
      where: { id: keyId },
      data: { lastUsedAt: new Date() },
    })
    .catch((err) => {
      logger.error({ err, keyId }, 'Failed to update lastUsedAt');
    });
}

// ============================================================================
// Container URL Resolution
// ============================================================================

/**
 * Get LiteLLM container URL for a tenant
 */
async function getContainerUrl(tenantId: string): Promise<string | null> {
  const state = await prisma.tenantRoutingState.findUnique({
    where: { tenantId },
    select: { litellmContainerName: true, status: true },
  });

  if (!state || state.status !== 'RUNNING' || !state.litellmContainerName) {
    return null;
  }

  // In Docker network, containers are reachable by name
  return `http://${state.litellmContainerName}:${LITELLM_PORT}`;
}

// ============================================================================
// Auth Middleware
// ============================================================================

export interface AuthenticatedProxyRequest extends Request {
  virtualKey?: VirtualKeyInfo;
  targetUrl?: string;
}

/**
 * Authentication middleware for proxy
 */
export async function authMiddleware(
  req: AuthenticatedProxyRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;

  const parsed = parseVirtualKey(authHeader);
  if (!parsed) {
    res.status(401).json({
      error: {
        message: 'Invalid authorization header. Expected: Bearer sk-tag-{prefix}-{secret}',
        type: 'authentication_error',
      },
    });
    return;
  }

  const keyInfo = await validateVirtualKey(parsed.prefix, parsed.secret);
  if (!keyInfo) {
    res.status(401).json({
      error: {
        message: 'Invalid or expired API key',
        type: 'authentication_error',
      },
    });
    return;
  }

  // Get container URL
  const containerUrl = await getContainerUrl(keyInfo.tenantId);
  if (!containerUrl) {
    res.status(503).json({
      error: {
        message: 'AI Gateway is not available for this tenant',
        type: 'service_unavailable',
      },
    });
    return;
  }

  req.virtualKey = keyInfo;
  req.targetUrl = containerUrl;

  next();
}

// ============================================================================
// Proxy Handler
// ============================================================================

/**
 * Create proxy middleware for routing to LiteLLM
 */
export function createProxy(): RequestHandler {
  return createProxyMiddleware({
    router: (req) => {
      const authReq = req as AuthenticatedProxyRequest;
      return authReq.targetUrl || 'http://localhost:4000';
    },
    changeOrigin: true,
    pathRewrite: (path) => {
      // LiteLLM expects /chat/completions, /v1/messages, etc.
      // Our router exposes /v1/chat/completions, /v1/messages
      // Keep the path as-is since LiteLLM handles both formats
      return path;
    },
    on: {
      proxyReq: (proxyReq, req) => {
        const authReq = req as AuthenticatedProxyRequest;

        // Remove original auth header (contains our virtual key)
        proxyReq.removeHeader('authorization');

        // Add tenant context headers for LiteLLM logging
        if (authReq.virtualKey) {
          proxyReq.setHeader('X-Arkon-Tenant', authReq.virtualKey.tenantId);
          proxyReq.setHeader('X-Arkon-User', authReq.virtualKey.userId);
          proxyReq.setHeader('X-Arkon-Key', authReq.virtualKey.keyId);
        }

        logger.debug({
          tenant: authReq.virtualKey?.tenantId,
          path: req.url,
          target: authReq.targetUrl,
        }, 'Proxying request');
      },
      proxyRes: (proxyRes, req) => {
        const authReq = req as AuthenticatedProxyRequest;

        logger.info({
          tenant: authReq.virtualKey?.tenantId,
          path: req.url,
          status: proxyRes.statusCode,
        }, 'Proxy response');
      },
      error: (err, req, res) => {
        const authReq = req as AuthenticatedProxyRequest;

        logger.error({
          err,
          tenant: authReq.virtualKey?.tenantId,
          path: req.url,
        }, 'Proxy error');

        if (!res.headersSent && 'json' in res) {
          (res as Response).status(502).json({
            error: {
              message: 'Failed to connect to AI Gateway',
              type: 'proxy_error',
            },
          });
        }
      },
    },
  });
}
