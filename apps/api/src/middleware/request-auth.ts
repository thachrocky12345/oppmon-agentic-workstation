// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { query } from '../lib/db.js';
import { getTokenVersion } from '../lib/token-version.js';
import { SYSTEM_TENANT_ID } from '@oppmon/shared';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
    tenantId: string;
    /** True when the user belongs to the System Tenant (global admin context). */
    isSystem: boolean;
  };
  userId?: string;
  tenantId?: string;
  userRole?: string;
}

const JWT_SECRET = process.env.JWT_SECRET || 'development-secret-change-in-production';

/**
 * Authentication middleware
 * Validates JWT token and attaches user info to request
 */
export async function requestAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    // Get token from header or cookie
    let token: string | undefined;

    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.slice(7);
    } else if (req.cookies?.auth_token) {
      token = req.cookies.auth_token;
    }

    if (!token) {
      res.status(401).json({ error: 'Missing or invalid authorization' });
      return;
    }

    // Verify JWT
    const decoded = jwt.verify(token, JWT_SECRET) as {
      sub: string;
      email: string;
      role: string;
      tenantId: string;
      tv?: number;
      isSystem?: boolean;
      exp: number;
    };

    // Check if token is expired
    if (decoded.exp && decoded.exp * 1000 < Date.now()) {
      res.status(401).json({ error: 'Token expired' });
      return;
    }

    // Event-driven revocation: compare the token's version snapshot to the
    // current value. A mismatch means the user's role/team/password changed
    // (or sessions were force-revoked) since this token was issued.
    const claimedVersion = decoded.tv ?? 1;
    const currentVersion = await getTokenVersion(decoded.sub);
    if (claimedVersion !== currentVersion) {
      res.status(401).json({ error: 'Session revoked, please re-authenticate' });
      return;
    }

    // Verify user still exists and is active.
    // DB columns are snake_case; alias preserves camelCase shape.
    const result = await query<{
      id: string;
      email: string;
      role: string;
      tenantId: string;
    }>(
      'SELECT id, email, role, tenant_id AS "tenantId" FROM users WHERE id = $1 AND is_active = true',
      [decoded.sub],
    );

    if (result.rows.length === 0) {
      res.status(401).json({ error: 'User not found or inactive' });
      return;
    }

    const user = result.rows[0];

    // isSystem is authoritative from the DB tenant_id, not the JWT — we trust
    // verified claims but the DB is the source of truth in case the user was
    // moved between tenants.
    const isSystem = user.tenantId === SYSTEM_TENANT_ID;

    // Attach user to request
    req.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
      isSystem,
    };
    req.userId = user.id;
    req.tenantId = user.tenantId;
    req.userRole = user.role;

    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      res.status(401).json({ error: 'Invalid token' });
      return;
    }
    if (error instanceof jwt.TokenExpiredError) {
      res.status(401).json({ error: 'Token expired' });
      return;
    }
    next(error);
  }
}

/**
 * Optional auth - doesn't fail if no token, but attaches user if present
 */
export async function optionalAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers.authorization;
  const hasBearerToken = authHeader?.startsWith('Bearer ');
  const hasCookieToken = !!req.cookies?.auth_token;

  if (!hasBearerToken && !hasCookieToken) {
    next();
    return;
  }

  // If token present, validate it
  await requestAuth(req, res, next);
}

/**
 * Role-based access control middleware factory
 */
export function requireRole(...roles: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    next();
  };
}
