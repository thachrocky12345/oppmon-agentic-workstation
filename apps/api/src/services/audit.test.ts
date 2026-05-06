/**
 * Audit Service Tests
 *
 * Tests for audit logging operations:
 * - CREATE, UPDATE, DELETE, DENIED actions
 * - Query with filters
 * - Context extraction from request
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  logAudit,
  logCreate,
  logUpdate,
  logDelete,
  logDenied,
  getAuditContext,
  queryAuditLogs,
  getResourceAuditLog,
  AuditContext,
} from './audit.js';
import { Request } from 'express';

// Mock prisma
vi.mock('@oppmon/database', () => ({
  prisma: {
    auditLog: {
      create: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}));

import { prisma } from '@oppmon/database';

describe('Audit Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('logAudit', () => {
    it('creates audit log entry', async () => {
      vi.mocked(prisma.auditLog.create).mockResolvedValue({} as any);

      await logAudit({
        tenantId: 'tenant-1',
        resourceType: 'skill',
        resourceId: 'skill-1',
        action: 'CREATE',
        actorId: 'user-1',
        afterState: { name: 'Test' },
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
      });

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId: 'tenant-1',
          resourceType: 'skill',
          resourceId: 'skill-1',
          action: 'CREATE',
          actorId: 'user-1',
          afterState: { name: 'Test' },
          ipAddress: '127.0.0.1',
          userAgent: 'test-agent',
        }),
      });
    });

    it('does not throw on database error', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.mocked(prisma.auditLog.create).mockRejectedValue(new Error('DB error'));

      await expect(
        logAudit({
          tenantId: 'tenant-1',
          resourceType: 'skill',
          resourceId: 'skill-1',
          action: 'CREATE',
          actorId: 'user-1',
        })
      ).resolves.toBeUndefined();

      expect(consoleSpy).toHaveBeenCalledWith(
        '[Audit] Failed to write audit log:',
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });

  describe('logCreate', () => {
    it('logs CREATE action with afterState only', async () => {
      vi.mocked(prisma.auditLog.create).mockResolvedValue({} as any);

      const ctx: AuditContext = {
        tenantId: 'tenant-1',
        actorId: 'user-1',
        ipAddress: '127.0.0.1',
      };

      await logCreate(ctx, 'skill', 'skill-1', { name: 'New Skill' });

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'CREATE',
          beforeState: null,
          afterState: { name: 'New Skill' },
        }),
      });
    });
  });

  describe('logUpdate', () => {
    it('logs UPDATE action with before and after states', async () => {
      vi.mocked(prisma.auditLog.create).mockResolvedValue({} as any);

      const ctx: AuditContext = {
        tenantId: 'tenant-1',
        actorId: 'user-1',
      };

      await logUpdate(
        ctx,
        'skill',
        'skill-1',
        { name: 'Old Name' },
        { name: 'New Name' }
      );

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'UPDATE',
          beforeState: { name: 'Old Name' },
          afterState: { name: 'New Name' },
        }),
      });
    });
  });

  describe('logDelete', () => {
    it('logs DELETE action with beforeState only', async () => {
      vi.mocked(prisma.auditLog.create).mockResolvedValue({} as any);

      const ctx: AuditContext = {
        tenantId: 'tenant-1',
        actorId: 'user-1',
      };

      await logDelete(ctx, 'skill', 'skill-1', { name: 'Deleted Skill' });

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'DELETE',
          beforeState: { name: 'Deleted Skill' },
          afterState: null,
        }),
      });
    });
  });

  describe('logDenied', () => {
    it('logs DENIED action with metadata', async () => {
      vi.mocked(prisma.auditLog.create).mockResolvedValue({} as any);

      const ctx: AuditContext = {
        tenantId: 'tenant-1',
        actorId: 'user-1',
      };

      await logDenied(ctx, 'skill', 'skill-1', {
        permission: 'delete',
        reason: 'Insufficient permissions',
      });

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'DENIED',
          beforeState: null,
          afterState: null,
          metadata: {
            permission: 'delete',
            reason: 'Insufficient permissions',
          },
        }),
      });
    });

    it('logs DENIED action without metadata', async () => {
      vi.mocked(prisma.auditLog.create).mockResolvedValue({} as any);

      const ctx: AuditContext = {
        tenantId: 'tenant-1',
        actorId: 'user-1',
      };

      await logDenied(ctx, 'skill', 'skill-1');

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'DENIED',
          metadata: undefined,
        }),
      });
    });
  });

  describe('getAuditContext', () => {
    it('returns null when user is not authenticated', () => {
      const req = {
        user: undefined,
        headers: {},
        socket: {},
      } as any;

      const result = getAuditContext(req);

      expect(result).toBeNull();
    });

    it('extracts context from authenticated request', () => {
      const req = {
        user: {
          id: 'user-1',
          tenantId: 'tenant-1',
        },
        headers: {
          'user-agent': 'Mozilla/5.0',
        },
        socket: {
          remoteAddress: '192.168.1.1',
        },
      } as any;

      const result = getAuditContext(req);

      expect(result).toEqual({
        tenantId: 'tenant-1',
        actorId: 'user-1',
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
      });
    });

    it('extracts IP from x-forwarded-for header', () => {
      const req = {
        user: {
          id: 'user-1',
          tenantId: 'tenant-1',
        },
        headers: {
          'x-forwarded-for': '10.0.0.1, 172.16.0.1',
          'user-agent': 'test',
        },
        socket: {
          remoteAddress: '127.0.0.1',
        },
      } as any;

      const result = getAuditContext(req);

      expect(result?.ipAddress).toBe('10.0.0.1');
    });
  });

  describe('queryAuditLogs', () => {
    it('queries audit logs with basic filters', async () => {
      const mockLogs = [
        { id: 'log-1', action: 'CREATE' },
        { id: 'log-2', action: 'UPDATE' },
      ];

      vi.mocked(prisma.auditLog.findMany).mockResolvedValue(mockLogs as any);
      vi.mocked(prisma.auditLog.count).mockResolvedValue(10);

      const result = await queryAuditLogs({
        tenantId: 'tenant-1',
        resourceType: 'skill',
        limit: 50,
        offset: 0,
      });

      expect(result.logs).toEqual(mockLogs);
      expect(result.total).toBe(10);
      expect(prisma.auditLog.findMany).toHaveBeenCalledWith({
        where: {
          tenantId: 'tenant-1',
          resourceType: 'skill',
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
        skip: 0,
        include: {
          actor: { select: { id: true, email: true, name: true } },
        },
      });
    });

    it('queries with all filters', async () => {
      vi.mocked(prisma.auditLog.findMany).mockResolvedValue([]);
      vi.mocked(prisma.auditLog.count).mockResolvedValue(0);

      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-12-31');

      await queryAuditLogs({
        tenantId: 'tenant-1',
        resourceType: 'skill',
        resourceId: 'skill-1',
        action: 'UPDATE',
        actorId: 'user-1',
        startDate,
        endDate,
        limit: 25,
        offset: 10,
      });

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith({
        where: {
          tenantId: 'tenant-1',
          resourceType: 'skill',
          resourceId: 'skill-1',
          action: 'UPDATE',
          actorId: 'user-1',
          createdAt: {
            gte: startDate,
            lte: endDate,
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 25,
        skip: 10,
        include: {
          actor: { select: { id: true, email: true, name: true } },
        },
      });
    });

    it('uses default pagination values', async () => {
      vi.mocked(prisma.auditLog.findMany).mockResolvedValue([]);
      vi.mocked(prisma.auditLog.count).mockResolvedValue(0);

      await queryAuditLogs({ tenantId: 'tenant-1' });

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 50,
          skip: 0,
        })
      );
    });

    it('queries with startDate only', async () => {
      vi.mocked(prisma.auditLog.findMany).mockResolvedValue([]);
      vi.mocked(prisma.auditLog.count).mockResolvedValue(0);

      const startDate = new Date('2024-01-01');

      await queryAuditLogs({
        tenantId: 'tenant-1',
        startDate,
      });

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: { gte: startDate },
          }),
        })
      );
    });

    it('queries with endDate only', async () => {
      vi.mocked(prisma.auditLog.findMany).mockResolvedValue([]);
      vi.mocked(prisma.auditLog.count).mockResolvedValue(0);

      const endDate = new Date('2024-12-31');

      await queryAuditLogs({
        tenantId: 'tenant-1',
        endDate,
      });

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: { lte: endDate },
          }),
        })
      );
    });
  });

  describe('getResourceAuditLog', () => {
    it('returns audit logs for specific resource', async () => {
      const mockLogs = [
        { id: 'log-1', action: 'UPDATE' },
        { id: 'log-2', action: 'CREATE' },
      ];

      vi.mocked(prisma.auditLog.findMany).mockResolvedValue(mockLogs as any);

      const result = await getResourceAuditLog('tenant-1', 'skill', 'skill-1');

      expect(result).toEqual(mockLogs);
      expect(prisma.auditLog.findMany).toHaveBeenCalledWith({
        where: {
          tenantId: 'tenant-1',
          resourceType: 'skill',
          resourceId: 'skill-1',
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: {
          actor: { select: { id: true, email: true, name: true } },
        },
      });
    });

    it('uses custom limit', async () => {
      vi.mocked(prisma.auditLog.findMany).mockResolvedValue([]);

      await getResourceAuditLog('tenant-1', 'skill', 'skill-1', 10);

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 10,
        })
      );
    });
  });
});
