/**
 * Audit Service Tests
 *
 * Tests for audit logging operations against audit_log_v2.
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

// Capture inserts so each test can assert on them.
const inserted: Array<{ sql: string; params: unknown[] }> = [];
let queryFn: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;

vi.mock('../lib/db.js', () => ({
  withTenantPg: async <T,>(_tenantId: string, fn: (client: unknown) => Promise<T>) => {
    const client = {
      query: (sql: string, params: unknown[] = []) => {
        inserted.push({ sql, params });
        return queryFn(sql, params);
      },
    };
    return fn(client);
  },
}));

beforeEach(() => {
  inserted.length = 0;
  queryFn = async () => ({ rows: [] });
});

describe('Audit Service (audit_log_v2)', () => {
  describe('logAudit', () => {
    it('inserts a row into audit_log_v2', async () => {
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

      expect(inserted).toHaveLength(1);
      expect(inserted[0].sql).toContain('INSERT INTO audit_log_v2');
      // Param order: actor_type, actor_id, action, target_type, target_id,
      //              description, metadata, old_value, new_value, ip_address, tenant_id
      expect(inserted[0].params[0]).toBe('user');
      expect(inserted[0].params[1]).toBe('user-1');
      expect(inserted[0].params[2]).toBe('CREATE');
      expect(inserted[0].params[3]).toBe('skill');
      expect(inserted[0].params[4]).toBe('skill-1');
      expect(inserted[0].params[10]).toBe('tenant-1');
    });

    it('does not throw on database error', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      queryFn = async () => { throw new Error('DB error'); };

      await expect(
        logAudit({
          tenantId: 'tenant-1',
          resourceType: 'skill',
          resourceId: 'skill-1',
          action: 'CREATE',
          actorId: 'user-1',
        }),
      ).resolves.toBeUndefined();

      expect(consoleSpy).toHaveBeenCalledWith(
        '[Audit] Failed to write audit log:',
        expect.any(Error),
      );
      consoleSpy.mockRestore();
    });
  });

  describe('logCreate / logUpdate / logDelete / logDenied', () => {
    const ctx: AuditContext = { tenantId: 'tenant-1', actorId: 'user-1' };

    it('logCreate sets action=CREATE with null beforeState', async () => {
      await logCreate(ctx, 'skill', 'skill-1', { name: 'New' });
      expect(inserted[0].params[2]).toBe('CREATE');
      expect(inserted[0].params[7]).toBeNull(); // old_value
      expect(inserted[0].params[8]).toBe(JSON.stringify({ name: 'New' })); // new_value
    });

    it('logUpdate captures both states', async () => {
      await logUpdate(ctx, 'skill', 'skill-1', { name: 'Old' }, { name: 'New' });
      expect(inserted[0].params[2]).toBe('UPDATE');
      expect(inserted[0].params[7]).toBe(JSON.stringify({ name: 'Old' }));
      expect(inserted[0].params[8]).toBe(JSON.stringify({ name: 'New' }));
    });

    it('logDelete sets null afterState', async () => {
      await logDelete(ctx, 'skill', 'skill-1', { name: 'Gone' });
      expect(inserted[0].params[2]).toBe('DELETE');
      expect(inserted[0].params[7]).toBe(JSON.stringify({ name: 'Gone' }));
      expect(inserted[0].params[8]).toBeNull();
    });

    it('logDenied includes metadata', async () => {
      await logDenied(ctx, 'skill', 'skill-1', { reason: 'forbidden' });
      expect(inserted[0].params[2]).toBe('DENIED');
      const meta = JSON.parse(String(inserted[0].params[6]));
      expect(meta.reason).toBe('forbidden');
    });
  });

  describe('getAuditContext', () => {
    it('returns null when user is not authenticated', () => {
      const req = { user: undefined, headers: {}, socket: {} } as never;
      expect(getAuditContext(req)).toBeNull();
    });

    it('extracts context from authenticated request', () => {
      const req = {
        user: { id: 'user-1', tenantId: 'tenant-1' },
        headers: { 'user-agent': 'Mozilla/5.0' },
        socket: { remoteAddress: '192.168.1.1' },
      } as never;
      expect(getAuditContext(req)).toEqual({
        tenantId: 'tenant-1',
        actorId: 'user-1',
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
      });
    });

    it('extracts IP from x-forwarded-for header', () => {
      const req = {
        user: { id: 'user-1', tenantId: 'tenant-1' },
        headers: { 'x-forwarded-for': '10.0.0.1, 172.16.0.1', 'user-agent': 'test' },
        socket: { remoteAddress: '127.0.0.1' },
      } as never;
      expect(getAuditContext(req)?.ipAddress).toBe('10.0.0.1');
    });
  });

  describe('queryAuditLogs', () => {
    it('selects from audit_log_v2 with filters', async () => {
      queryFn = async (sql: string) => {
        if (sql.includes('COUNT(*)')) return { rows: [{ total: '7' }] };
        return { rows: [{ id: 'log-1', action: 'CREATE' }] };
      };

      const result = await queryAuditLogs({
        tenantId: 'tenant-1',
        resourceType: 'skill',
        action: 'CREATE',
      });

      expect(result.total).toBe(7);
      expect(result.logs).toHaveLength(1);
      const selectCall = inserted.find((i) => i.sql.includes('SELECT'));
      expect(selectCall?.sql).toContain('FROM audit_log_v2');
    });
  });

  describe('getResourceAuditLog', () => {
    it('delegates to queryAuditLogs', async () => {
      queryFn = async (sql: string) => {
        if (sql.includes('COUNT(*)')) return { rows: [{ total: '0' }] };
        return { rows: [{ id: 'log-x', action: 'UPDATE' }] };
      };
      const rows = await getResourceAuditLog('tenant-1', 'skill', 'skill-1');
      expect(rows).toHaveLength(1);
    });
  });
});
