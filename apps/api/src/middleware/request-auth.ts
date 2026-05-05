import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { query } from '../lib/db.js';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
    tenantId: string;
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
      exp: number;
    };

    // Check if token is expired
    if (decoded.exp && decoded.exp * 1000 < Date.now()) {
      res.status(401).json({ error: 'Token expired' });
      return;
    }

    // Verify user still exists and is active (Prisma uses camelCase columns)
    const result = await query<{
      id: string;
      email: string;
      role: string;
      tenantId: string;
    }>(
      'SELECT id, email, role, "tenantId" FROM users WHERE id = $1 AND "isActive" = true',
      [decoded.sub],
    );

    if (result.rows.length === 0) {
      res.status(401).json({ error: 'User not found or inactive' });
      return;
    }

    const user = result.rows[0];

    // Attach user to request
    req.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
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
