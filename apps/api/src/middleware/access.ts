// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

/**
 * `requireAccess` — resource-level authorization middleware
 *
 * Thin wrapper over `lib/authz.canAccess()`. Use AFTER `requestAuth` and
 * `tenantContext` (so `req.dbTx` is available) on routes that operate on a
 * single resource identified by `req.params.id`.
 *
 * Unlike the existing `rbac()` middleware (which only checks role + team
 * membership), this consults the `resource_shares` table so that explicit
 * share grants and owner short-circuits are honored.
 *
 * @example
 *   router.delete(
 *     '/skills/:id',
 *     requireAccess('skill', 'admin'),
 *     deleteSkillHandler,
 *   );
 */

import { Response, NextFunction } from 'express';
import { canAccess, type ResourceType } from '../lib/authz.js';
import type { TenantScopedRequest } from './tenant-context.js';

type AccessLevel = 'read' | 'write' | 'admin';

export interface RequireAccessOptions {
  /** Override the default `req.params.id` lookup. */
  paramName?: string;
}

export function requireAccess(
  resourceType: ResourceType,
  level: AccessLevel,
  options: RequireAccessOptions = {},
) {
  const paramName = options.paramName ?? 'id';

  return async (
    req: TenantScopedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    if (!req.user || !req.dbTx) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const resourceId = req.params[paramName];
    if (!resourceId) {
      res.status(400).json({ error: `Missing :${paramName} param` });
      return;
    }

    try {
      const allowed = await req.dbTx((tx) =>
        canAccess(
          tx,
          {
            id: req.user!.id,
            tenantId: req.user!.tenantId,
            role: req.user!.role,
            isSystem: req.user!.isSystem,
          },
          resourceType,
          resourceId,
          level,
        ),
      );

      if (!allowed) {
        // 404 (not 403) so we don't leak existence of cross-tenant resources.
        res.status(404).json({ error: `${resourceType} not found` });
        return;
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}
