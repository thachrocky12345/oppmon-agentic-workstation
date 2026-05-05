import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { requestAuth, requireRole, AuthenticatedRequest } from './request-auth.js';

// Mock jwt
vi.mock('jsonwebtoken');

// Mock database query
vi.mock('../lib/db.js', () => ({
  query: vi.fn(),
}));

import { query } from '../lib/db.js';

describe('Request Auth Middleware', () => {
  let mockReq: Partial<AuthenticatedRequest>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    vi.clearAllMocks();
    mockReq = {
      headers: {},
    };
    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
    mockNext = vi.fn();
  });

  describe('requestAuth', () => {
    it('returns 401 when no authorization header is present', async () => {
      await requestAuth(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Missing or invalid authorization header' });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('returns 401 when authorization header is not Bearer token', async () => {
      mockReq.headers = { authorization: 'Basic abc123' };

      await requestAuth(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Missing or invalid authorization header' });
    });

    it('returns 401 when token is invalid', async () => {
      mockReq.headers = { authorization: 'Bearer invalid-token' };
      vi.mocked(jwt.verify).mockImplementation(() => {
        throw new jwt.JsonWebTokenError('Invalid token');
      });

      await requestAuth(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid token' });
    });

    it('returns 401 when token is expired', async () => {
      mockReq.headers = { authorization: 'Bearer expired-token' };
      vi.mocked(jwt.verify).mockImplementation(() => {
        throw new jwt.TokenExpiredError('Token expired', new Date());
      });

      await requestAuth(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Token expired' });
    });

    it('returns 401 when user not found in database', async () => {
      mockReq.headers = { authorization: 'Bearer valid-token' };
      const payload = {
        sub: 'user-123',
        email: 'test@example.com',
        role: 'admin',
        tenantId: 'tenant-456',
        exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
      };
      vi.mocked(jwt.verify).mockReturnValue(payload as any);
      vi.mocked(query).mockResolvedValue({ rows: [], rowCount: 0 } as any);

      await requestAuth(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'User not found or inactive' });
    });

    it('sets user info and calls next on valid token', async () => {
      mockReq.headers = { authorization: 'Bearer valid-token' };
      const payload = {
        sub: 'user-123',
        email: 'test@example.com',
        role: 'admin',
        tenantId: 'tenant-456',
        exp: Math.floor(Date.now() / 1000) + 3600,
      };
      vi.mocked(jwt.verify).mockReturnValue(payload as any);
      vi.mocked(query).mockResolvedValue({
        rows: [{
          id: 'user-123',
          email: 'test@example.com',
          role: 'admin',
          tenantId: 'tenant-456',
        }],
        rowCount: 1,
      } as any);

      await requestAuth(mockReq as Request, mockRes as Response, mockNext);

      expect((mockReq as AuthenticatedRequest).userId).toBe('user-123');
      expect((mockReq as AuthenticatedRequest).tenantId).toBe('tenant-456');
      expect((mockReq as AuthenticatedRequest).userRole).toBe('admin');
      expect((mockReq as AuthenticatedRequest).user).toEqual({
        id: 'user-123',
        email: 'test@example.com',
        role: 'admin',
        tenantId: 'tenant-456',
      });
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('requireRole', () => {
    it('returns 401 when user is not authenticated', () => {
      mockReq = {
        user: undefined,
      } as AuthenticatedRequest;

      const middleware = requireRole('admin');
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Authentication required' });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('returns 403 when user role does not match required roles', () => {
      mockReq = {
        user: {
          id: 'user-123',
          email: 'test@example.com',
          role: 'viewer',
          tenantId: 'tenant-456',
        },
      } as AuthenticatedRequest;

      const middleware = requireRole('admin', 'TENANT_ADMIN');
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Insufficient permissions' });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('calls next when user role matches required role', () => {
      mockReq = {
        user: {
          id: 'user-123',
          email: 'test@example.com',
          role: 'admin',
          tenantId: 'tenant-456',
        },
      } as AuthenticatedRequest;

      const middleware = requireRole('admin', 'TENANT_ADMIN');
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });
});
