// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

/**
 * Tenant Context Middleware
 *
 * Runs after `requestAuth`. Resolves the effective tenant context for the
 * request and exposes a `req.dbTx` factory that wraps every Prisma transaction
 * with the correct `app.current_tenant` GUC for RLS enforcement.
 *
 * Effective tenant resolution:
 *   - System-tenant users (req.user.isSystem) get 'system' which the RLS
 *     policies treat as a bypass.
 *   - All other users get their home tenantId from the verified JWT/DB row.
 *
 * Usage in routes:
 *   router.get('/skills', requestAuth, tenantContext, async (req, res) => {
 *     const skills = await req.dbTx!((tx) => tx.skill.findMany({...}));
 *     res.json(skills);
 *   });
 */
import { Response, NextFunction } from 'express';
import type { Prisma } from '@oppmon/database';
import { SYSTEM_TENANT_ID } from '@oppmon/shared';
import { withTenant } from '../lib/db.js';
import type { AuthenticatedRequest } from './request-auth.js';

export type DbTxFactory = <T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
) => Promise<T>;

export interface TenantScopedRequest extends AuthenticatedRequest {
  /** Effective tenant ID for RLS scoping ('system' for System Tenant users). */
  effectiveTenantId?: string;
  /** Run a Prisma transaction with `app.current_tenant` set for RLS. */
  dbTx?: DbTxFactory;
}

export function tenantContext(
  req: TenantScopedRequest,
  res: Response,
  next: NextFunction,
): void {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  // System tenant users use the 'system' GUC value to bypass RLS at the
  // policy layer. Everyone else is scoped to their home tenant.
  const tenantId = req.user.isSystem ? SYSTEM_TENANT_ID : req.user.tenantId;
  req.effectiveTenantId = tenantId;
  req.dbTx = (fn) => withTenant(tenantId, fn);

  next();
}
