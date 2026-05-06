/**
 * Virtual Key Management API Routes
 *
 * Endpoints:
 * - GET    /api/virtual-keys           - List user's virtual keys (no secrets)
 * - POST   /api/virtual-keys           - Create new key (returns plaintext ONCE)
 * - DELETE /api/virtual-keys/:id       - Revoke key
 * - POST   /api/virtual-keys/:id/rotate - Rotate key (returns new plaintext)
 */

import { Router, Response } from 'express';
import { z } from 'zod';
import { randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '@oppmon/database';
import { createId } from '@paralleldrive/cuid2';
import { asyncHandler, ApiError } from '../middleware/error-handler.js';
import { AuthenticatedRequest } from '../middleware/request-auth.js';
import { buildRBACContext } from '../middleware/rbac.js';
import { logCreate, logDelete, getAuditContext } from '../services/audit.js';

export const virtualKeysRouter = Router();

// ============================================================================
// Types
// ============================================================================

interface VirtualKeyResponse {
  id: string;
  keyPrefix: string;
  label: string | null;
  enabled: boolean;
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  createdAt: Date;
  revokedAt: Date | null;
}

// ============================================================================
// Validation Schemas
// ============================================================================

const createKeySchema = z.object({
  label: z.string().max(255).optional(),
  expiresAt: z.coerce.date().optional(),
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate a secure virtual key
 * Format: sk-tag-{8charPrefix}-{32charSecret}
 */
function generateVirtualKey(): { full: string; prefix: string; secret: string } {
  const prefix = randomBytes(4).toString('hex'); // 8 characters
  const secret = randomBytes(16).toString('hex'); // 32 characters
  const full = `sk-tag-${prefix}-${secret}`;

  return { full, prefix, secret };
}

/**
 * Hash a virtual key for storage
 */
async function hashKey(fullKey: string): Promise<string> {
  return bcrypt.hash(fullKey, 10);
}

/**
 * Transform database record to API response
 */
function toResponse(key: {
  id: string;
  keyPrefix: string;
  label: string | null;
  enabled: boolean;
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  createdAt: Date;
  revokedAt: Date | null;
}): VirtualKeyResponse {
  return {
    id: key.id,
    keyPrefix: key.keyPrefix,
    label: key.label,
    enabled: key.enabled,
    expiresAt: key.expiresAt,
    lastUsedAt: key.lastUsedAt,
    createdAt: key.createdAt,
    revokedAt: key.revokedAt,
  };
}

// ============================================================================
// Routes
// ============================================================================

/**
 * GET /api/virtual-keys
 * List current user's virtual keys (no secrets returned)
 */
virtualKeysRouter.get(
  '/',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const rbacCtx = await buildRBACContext(req);

    if (!rbacCtx) {
      throw ApiError.unauthorized('Authentication required');
    }

    const keys = await prisma.virtualKey.findMany({
      where: {
        userId: rbacCtx.userId,
        tenantId: rbacCtx.tenantId,
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        keyPrefix: true,
        label: true,
        enabled: true,
        expiresAt: true,
        lastUsedAt: true,
        createdAt: true,
        revokedAt: true,
      },
    });

    res.json({
      data: keys.map(toResponse),
    });
  })
);

/**
 * POST /api/virtual-keys
 * Create a new virtual key
 * WARNING: The full key is returned only once in this response
 */
virtualKeysRouter.post(
  '/',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const rbacCtx = await buildRBACContext(req);

    if (!rbacCtx) {
      throw ApiError.unauthorized('Authentication required');
    }

    const input = createKeySchema.parse(req.body);

    // Generate key
    const { full, prefix, secret } = generateVirtualKey();
    const keyHash = await hashKey(full);

    // Create key record
    const key = await prisma.virtualKey.create({
      data: {
        id: createId(),
        tenantId: rbacCtx.tenantId,
        userId: rbacCtx.userId,
        keyPrefix: prefix,
        keyHash,
        label: input.label,
        expiresAt: input.expiresAt,
      },
      select: {
        id: true,
        keyPrefix: true,
        label: true,
        enabled: true,
        expiresAt: true,
        lastUsedAt: true,
        createdAt: true,
        revokedAt: true,
      },
    });

    // Audit log (don't log the actual key)
    const auditCtx = getAuditContext(req);
    if (auditCtx) {
      await logCreate(auditCtx, 'virtual_key', key.id, {
        keyPrefix: prefix,
        label: input.label,
        expiresAt: input.expiresAt,
      });
    }

    // Return with full key (only time it's returned)
    res.status(201).json({
      data: {
        ...toResponse(key),
        key: full, // This is returned only once!
      },
      warning:
        'Store this key securely. You will not be able to see it again.',
    });
  })
);

/**
 * DELETE /api/virtual-keys/:id
 * Revoke a virtual key
 */
virtualKeysRouter.delete(
  '/:id',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const rbacCtx = await buildRBACContext(req);

    if (!rbacCtx) {
      throw ApiError.unauthorized('Authentication required');
    }

    const keyId = req.params.id;

    // Find key and verify ownership
    const key = await prisma.virtualKey.findFirst({
      where: {
        id: keyId,
        userId: rbacCtx.userId,
        tenantId: rbacCtx.tenantId,
      },
    });

    if (!key) {
      throw ApiError.notFound('Virtual key not found');
    }

    if (key.revokedAt) {
      throw ApiError.badRequest('Key is already revoked');
    }

    // Revoke key
    const updated = await prisma.virtualKey.update({
      where: { id: keyId },
      data: {
        revokedAt: new Date(),
        enabled: false,
      },
      select: {
        id: true,
        keyPrefix: true,
        label: true,
        enabled: true,
        expiresAt: true,
        lastUsedAt: true,
        createdAt: true,
        revokedAt: true,
      },
    });

    // Audit log
    const auditCtx = getAuditContext(req);
    if (auditCtx) {
      await logDelete(auditCtx, 'virtual_key', key.id, {
        keyPrefix: key.keyPrefix,
        label: key.label,
      });
    }

    res.json({
      data: toResponse(updated),
      message: 'Key revoked successfully',
    });
  })
);

/**
 * POST /api/virtual-keys/:id/rotate
 * Rotate a virtual key (creates new secret, invalidates old)
 * WARNING: The new key is returned only once in this response
 */
virtualKeysRouter.post(
  '/:id/rotate',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const rbacCtx = await buildRBACContext(req);

    if (!rbacCtx) {
      throw ApiError.unauthorized('Authentication required');
    }

    const keyId = req.params.id;

    // Find key and verify ownership
    const key = await prisma.virtualKey.findFirst({
      where: {
        id: keyId,
        userId: rbacCtx.userId,
        tenantId: rbacCtx.tenantId,
      },
    });

    if (!key) {
      throw ApiError.notFound('Virtual key not found');
    }

    if (key.revokedAt) {
      throw ApiError.badRequest('Cannot rotate a revoked key');
    }

    // Generate new key with same prefix (for consistency)
    const { secret } = generateVirtualKey();
    const newFull = `sk-tag-${key.keyPrefix}-${secret}`;
    const newHash = await hashKey(newFull);

    // Update key
    const updated = await prisma.virtualKey.update({
      where: { id: keyId },
      data: {
        keyHash: newHash,
      },
      select: {
        id: true,
        keyPrefix: true,
        label: true,
        enabled: true,
        expiresAt: true,
        lastUsedAt: true,
        createdAt: true,
        revokedAt: true,
      },
    });

    // Audit log (don't log the actual key)
    const auditCtx = getAuditContext(req);
    if (auditCtx) {
      await logCreate(auditCtx, 'virtual_key_rotation', key.id, {
        keyPrefix: key.keyPrefix,
        rotatedAt: new Date().toISOString(),
      });
    }

    // Return with new key (only time it's returned)
    res.json({
      data: {
        ...toResponse(updated),
        key: newFull, // This is returned only once!
      },
      warning:
        'Store this key securely. You will not be able to see it again. The old key is now invalid.',
    });
  })
);
