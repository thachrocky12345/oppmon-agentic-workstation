/**
 * RBAC Middleware Tests
 *
 * Covers all branches of the permission matrix:
 * - TENANT_ADMIN: full access
 * - TEAM_ADMIN: team-scoped access
 * - MEMBER: read-only access
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import {
  checkPermission,
  isRoleAtLeast,
  isTeamMember,
  isTeamAdmin,
  RBACContext,
  ResourceContext,
  rbac,
  requireRole,
  requireRoleLevel,
} from './rbac.js';
import { Role, TeamRole } from '@prisma/client';

// Mock prisma
vi.mock('@arkon/database', () => ({
  prisma: {
    teamMember: {
      findMany: vi.fn(),
    },
  },
}));

// Mock audit service
vi.mock('../services/audit.js', () => ({
  logDenied: vi.fn(),
  getAuditContext: vi.fn().mockReturnValue({
    tenantId: 'tenant-1',
    actorId: 'user-1',
  }),
}));

import { prisma } from '@arkon/database';

describe('RBAC Middleware', () => {
  describe('isRoleAtLeast', () => {
    it('returns true when user role equals required role', () => {
      expect(isRoleAtLeast('TENANT_ADMIN', 'TENANT_ADMIN')).toBe(true);
      expect(isRoleAtLeast('TEAM_ADMIN', 'TEAM_ADMIN')).toBe(true);
      expect(isRoleAtLeast('MEMBER', 'MEMBER')).toBe(true);
    });

    it('returns true when user role exceeds required role', () => {
      expect(isRoleAtLeast('TENANT_ADMIN', 'TEAM_ADMIN')).toBe(true);
      expect(isRoleAtLeast('TENANT_ADMIN', 'MEMBER')).toBe(true);
      expect(isRoleAtLeast('TEAM_ADMIN', 'MEMBER')).toBe(true);
    });

    it('returns false when user role is below required role', () => {
      expect(isRoleAtLeast('MEMBER', 'TEAM_ADMIN')).toBe(false);
      expect(isRoleAtLeast('MEMBER', 'TENANT_ADMIN')).toBe(false);
      expect(isRoleAtLeast('TEAM_ADMIN', 'TENANT_ADMIN')).toBe(false);
    });
  });

  describe('isTeamMember', () => {
    const ctx: RBACContext = {
      userId: 'user-1',
      tenantId: 'tenant-1',
      role: 'MEMBER',
      teamIds: ['team-1', 'team-2'],
      teamRoles: new Map([
        ['team-1', 'MEMBER'],
        ['team-2', 'ADMIN'],
      ]),
    };

    it('returns true when user is a member of the team', () => {
      expect(isTeamMember(ctx, 'team-1')).toBe(true);
      expect(isTeamMember(ctx, 'team-2')).toBe(true);
    });

    it('returns false when user is not a member of the team', () => {
      expect(isTeamMember(ctx, 'team-3')).toBe(false);
    });
  });

  describe('isTeamAdmin', () => {
    const ctx: RBACContext = {
      userId: 'user-1',
      tenantId: 'tenant-1',
      role: 'TEAM_ADMIN',
      teamIds: ['team-1', 'team-2'],
      teamRoles: new Map([
        ['team-1', 'MEMBER'],
        ['team-2', 'ADMIN'],
      ]),
    };

    it('returns true when user is admin of the team', () => {
      expect(isTeamAdmin(ctx, 'team-2')).toBe(true);
    });

    it('returns false when user is not admin of the team', () => {
      expect(isTeamAdmin(ctx, 'team-1')).toBe(false);
    });

    it('returns false when user is not a member of the team', () => {
      expect(isTeamAdmin(ctx, 'team-3')).toBe(false);
    });
  });

  describe('checkPermission', () => {
    describe('TENANT_ADMIN role', () => {
      const ctx: RBACContext = {
        userId: 'user-1',
        tenantId: 'tenant-1',
        role: 'TENANT_ADMIN',
        teamIds: [],
        teamRoles: new Map(),
      };

      it('allows all permissions for any resource', () => {
        const resource: ResourceContext = {
          resourceType: 'skill',
          scope: 'TENANT',
        };

        expect(checkPermission(ctx, 'create', resource).allowed).toBe(true);
        expect(checkPermission(ctx, 'read', resource).allowed).toBe(true);
        expect(checkPermission(ctx, 'update', resource).allowed).toBe(true);
        expect(checkPermission(ctx, 'delete', resource).allowed).toBe(true);
      });

      it('allows operations on team-scoped resources in any team', () => {
        const resource: ResourceContext = {
          resourceType: 'skill',
          scope: 'TEAM',
          teamId: 'team-x',
        };

        expect(checkPermission(ctx, 'create', resource).allowed).toBe(true);
        expect(checkPermission(ctx, 'update', resource).allowed).toBe(true);
        expect(checkPermission(ctx, 'delete', resource).allowed).toBe(true);
      });
    });

    describe('TEAM_ADMIN role', () => {
      const ctx: RBACContext = {
        userId: 'user-1',
        tenantId: 'tenant-1',
        role: 'TEAM_ADMIN',
        teamIds: ['team-1', 'team-2'],
        teamRoles: new Map([
          ['team-1', 'ADMIN'],
          ['team-2', 'ADMIN'],
        ]),
      };

      it('cannot create tenant-scoped resources', () => {
        const resource: ResourceContext = {
          resourceType: 'skill',
          scope: 'TENANT',
        };

        const result = checkPermission(ctx, 'create', resource);
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain('TEAM_ADMIN');
        expect(result.reason).toContain('cannot');
      });

      it('can read tenant-scoped resources', () => {
        const resource: ResourceContext = {
          resourceType: 'skill',
          scope: 'TENANT',
        };

        expect(checkPermission(ctx, 'read', resource).allowed).toBe(true);
      });

      it('cannot update tenant-scoped resources', () => {
        const resource: ResourceContext = {
          resourceType: 'skill',
          scope: 'TENANT',
        };

        expect(checkPermission(ctx, 'update', resource).allowed).toBe(false);
      });

      it('cannot delete tenant-scoped resources', () => {
        const resource: ResourceContext = {
          resourceType: 'skill',
          scope: 'TENANT',
        };

        expect(checkPermission(ctx, 'delete', resource).allowed).toBe(false);
      });

      it('can create team-scoped resources in own team', () => {
        const resource: ResourceContext = {
          resourceType: 'skill',
          scope: 'TEAM',
          teamId: 'team-1',
        };

        expect(checkPermission(ctx, 'create', resource).allowed).toBe(true);
      });

      it('cannot create team-scoped resources in other teams', () => {
        const resource: ResourceContext = {
          resourceType: 'skill',
          scope: 'TEAM',
          teamId: 'team-x',
        };

        expect(checkPermission(ctx, 'create', resource).allowed).toBe(false);
      });

      it('can create team-scoped resource when no teamId specified', () => {
        const resource: ResourceContext = {
          resourceType: 'skill',
          scope: 'TEAM',
        };

        expect(checkPermission(ctx, 'create', resource).allowed).toBe(true);
      });

      it('can read team-scoped resources in own team', () => {
        const resource: ResourceContext = {
          resourceType: 'skill',
          scope: 'TEAM',
          teamId: 'team-1',
        };

        expect(checkPermission(ctx, 'read', resource).allowed).toBe(true);
      });

      it('cannot read team-scoped resources in other teams', () => {
        const resource: ResourceContext = {
          resourceType: 'skill',
          scope: 'TEAM',
          teamId: 'team-x',
        };

        expect(checkPermission(ctx, 'read', resource).allowed).toBe(false);
      });

      it('can update team-scoped resources in own team', () => {
        const resource: ResourceContext = {
          resourceType: 'skill',
          scope: 'TEAM',
          teamId: 'team-1',
        };

        expect(checkPermission(ctx, 'update', resource).allowed).toBe(true);
      });

      it('cannot update team-scoped resources in other teams', () => {
        const resource: ResourceContext = {
          resourceType: 'skill',
          scope: 'TEAM',
          teamId: 'team-x',
        };

        expect(checkPermission(ctx, 'update', resource).allowed).toBe(false);
      });

      it('can delete team-scoped resources in own team', () => {
        const resource: ResourceContext = {
          resourceType: 'skill',
          scope: 'TEAM',
          teamId: 'team-1',
        };

        expect(checkPermission(ctx, 'delete', resource).allowed).toBe(true);
      });

      it('cannot delete team-scoped resources in other teams', () => {
        const resource: ResourceContext = {
          resourceType: 'skill',
          scope: 'TEAM',
          teamId: 'team-x',
        };

        expect(checkPermission(ctx, 'delete', resource).allowed).toBe(false);
      });

      it('cannot update resource with no teamId', () => {
        const resource: ResourceContext = {
          resourceType: 'skill',
          scope: 'TEAM',
        };

        expect(checkPermission(ctx, 'update', resource).allowed).toBe(false);
      });

      it('cannot delete resource with no teamId', () => {
        const resource: ResourceContext = {
          resourceType: 'skill',
          scope: 'TEAM',
        };

        expect(checkPermission(ctx, 'delete', resource).allowed).toBe(false);
      });
    });

    describe('MEMBER role', () => {
      const ctx: RBACContext = {
        userId: 'user-1',
        tenantId: 'tenant-1',
        role: 'MEMBER',
        teamIds: ['team-1'],
        teamRoles: new Map([['team-1', 'MEMBER']]),
      };

      it('cannot create any resources', () => {
        const tenantResource: ResourceContext = {
          resourceType: 'skill',
          scope: 'TENANT',
        };
        const teamResource: ResourceContext = {
          resourceType: 'skill',
          scope: 'TEAM',
          teamId: 'team-1',
        };

        expect(checkPermission(ctx, 'create', tenantResource).allowed).toBe(false);
        expect(checkPermission(ctx, 'create', teamResource).allowed).toBe(false);
      });

      it('can read tenant-scoped resources', () => {
        const resource: ResourceContext = {
          resourceType: 'skill',
          scope: 'TENANT',
        };

        expect(checkPermission(ctx, 'read', resource).allowed).toBe(true);
      });

      it('can read team-scoped resources in own team', () => {
        const resource: ResourceContext = {
          resourceType: 'skill',
          scope: 'TEAM',
          teamId: 'team-1',
        };

        expect(checkPermission(ctx, 'read', resource).allowed).toBe(true);
      });

      it('cannot read team-scoped resources in other teams', () => {
        const resource: ResourceContext = {
          resourceType: 'skill',
          scope: 'TEAM',
          teamId: 'team-x',
        };

        expect(checkPermission(ctx, 'read', resource).allowed).toBe(false);
      });

      it('cannot read team-scoped resource with no teamId', () => {
        const resource: ResourceContext = {
          resourceType: 'skill',
          scope: 'TEAM',
        };

        expect(checkPermission(ctx, 'read', resource).allowed).toBe(false);
      });

      it('cannot update any resources', () => {
        const tenantResource: ResourceContext = {
          resourceType: 'skill',
          scope: 'TENANT',
        };
        const teamResource: ResourceContext = {
          resourceType: 'skill',
          scope: 'TEAM',
          teamId: 'team-1',
        };

        expect(checkPermission(ctx, 'update', tenantResource).allowed).toBe(false);
        expect(checkPermission(ctx, 'update', teamResource).allowed).toBe(false);
      });

      it('cannot delete any resources', () => {
        const tenantResource: ResourceContext = {
          resourceType: 'skill',
          scope: 'TENANT',
        };
        const teamResource: ResourceContext = {
          resourceType: 'skill',
          scope: 'TEAM',
          teamId: 'team-1',
        };

        expect(checkPermission(ctx, 'delete', tenantResource).allowed).toBe(false);
        expect(checkPermission(ctx, 'delete', teamResource).allowed).toBe(false);
      });
    });
  });

  describe('rbac middleware', () => {
    let mockReq: Partial<Request>;
    let mockRes: Partial<Response>;
    let mockNext: NextFunction;

    beforeEach(() => {
      vi.clearAllMocks();
      mockReq = {
        user: {
          id: 'user-1',
          tenantId: 'tenant-1',
          role: 'TENANT_ADMIN',
        },
        params: {},
        body: {},
      } as any;
      mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
      };
      mockNext = vi.fn();

      vi.mocked(prisma.teamMember.findMany).mockResolvedValue([]);
    });

    it('returns 401 when user is not authenticated', async () => {
      mockReq.user = undefined;

      const middleware = rbac({
        resourceType: 'skill',
        permission: 'read',
      });

      await middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Authentication required' });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('returns 404 when resource context returns null', async () => {
      const middleware = rbac({
        resourceType: 'skill',
        permission: 'read',
        getResourceContext: async () => null,
      });

      await middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Resource not found' });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('returns 403 when permission is denied', async () => {
      mockReq.user = {
        id: 'user-1',
        tenantId: 'tenant-1',
        role: 'MEMBER',
      } as any;

      const middleware = rbac({
        resourceType: 'skill',
        permission: 'create',
        getResourceContext: async () => ({
          resourceType: 'skill',
          scope: 'TEAM' as const,
          teamId: 'team-1',
        }),
      });

      await middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Forbidden' })
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('calls next when permission is granted', async () => {
      const middleware = rbac({
        resourceType: 'skill',
        permission: 'read',
        getResourceContext: async () => ({
          resourceType: 'skill',
          scope: 'TENANT' as const,
        }),
      });

      await middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect((mockReq as any).rbacContext).toBeDefined();
      expect((mockReq as any).rbacContext.userId).toBe('user-1');
    });

    it('passes errors to next', async () => {
      const error = new Error('Test error');
      const middleware = rbac({
        resourceType: 'skill',
        permission: 'read',
        getResourceContext: async () => {
          throw error;
        },
      });

      await middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });

  describe('requireRole middleware', () => {
    let mockReq: Partial<Request>;
    let mockRes: Partial<Response>;
    let mockNext: NextFunction;

    beforeEach(() => {
      mockReq = {
        user: {
          id: 'user-1',
          tenantId: 'tenant-1',
          role: 'TEAM_ADMIN',
        },
      } as any;
      mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
      };
      mockNext = vi.fn();
    });

    it('returns 401 when user is not authenticated', async () => {
      mockReq.user = undefined;

      const middleware = requireRole('TENANT_ADMIN');
      await middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('returns 403 when user role is not in allowed roles', async () => {
      const middleware = requireRole('TENANT_ADMIN');
      await middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Forbidden',
          message: expect.stringContaining('TENANT_ADMIN'),
        })
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('calls next when user role is in allowed roles', async () => {
      const middleware = requireRole('TEAM_ADMIN', 'TENANT_ADMIN');
      await middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('requireRoleLevel middleware', () => {
    let mockReq: Partial<Request>;
    let mockRes: Partial<Response>;
    let mockNext: NextFunction;

    beforeEach(() => {
      mockReq = {
        user: {
          id: 'user-1',
          tenantId: 'tenant-1',
          role: 'TEAM_ADMIN',
        },
      } as any;
      mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
      };
      mockNext = vi.fn();
    });

    it('returns 401 when user is not authenticated', async () => {
      mockReq.user = undefined;

      const middleware = requireRoleLevel('MEMBER');
      await middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('returns 403 when user role level is insufficient', async () => {
      const middleware = requireRoleLevel('TENANT_ADMIN');
      await middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Forbidden',
          message: expect.stringContaining('TENANT_ADMIN or higher'),
        })
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('calls next when user role level is sufficient', async () => {
      const middleware = requireRoleLevel('MEMBER');
      await middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('calls next when user role level equals minimum', async () => {
      const middleware = requireRoleLevel('TEAM_ADMIN');
      await middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });
});
