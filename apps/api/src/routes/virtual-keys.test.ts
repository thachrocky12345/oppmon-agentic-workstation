/**
 * Virtual Key Management Routes Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { virtualKeysRouter } from './virtual-keys.js';
import { errorHandler } from '../middleware/error-handler.js';

// Mock dependencies
vi.mock('@oppmon/database', () => ({
  prisma: {
    virtualKey: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
  },
}));

vi.mock('../middleware/rbac.js', () => ({
  buildRBACContext: vi.fn().mockResolvedValue({
    tenantId: 'test-tenant',
    userId: 'test-user',
    teamIds: ['team-1'],
    role: 'member',
  }),
}));

vi.mock('../services/audit.js', () => ({
  logCreate: vi.fn(),
  logDelete: vi.fn(),
  getAuditContext: vi.fn().mockReturnValue(null),
}));

vi.mock('@paralleldrive/cuid2', () => ({
  createId: vi.fn().mockReturnValue('new-key-id'),
}));

import { prisma } from '@oppmon/database';
import { buildRBACContext } from '../middleware/rbac.js';

// Create app for testing
const app = express();
app.use(express.json());

// Mock auth middleware
app.use((req: any, _res, next) => {
  req.user = { id: 'test-user', tenantId: 'test-tenant', email: 'test@example.com' };
  next();
});

app.use('/api/virtual-keys', virtualKeysRouter);
app.use(errorHandler);

describe('Virtual Key Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/virtual-keys', () => {
    it('returns list of user virtual keys', async () => {
      vi.mocked(prisma.virtualKey.findMany).mockResolvedValueOnce([
        {
          id: 'key-1',
          tenantId: 'test-tenant',
          userId: 'test-user',
          keyPrefix: 'abc12345',
          keyHash: 'hash',
          label: 'My Key',
          enabled: true,
          expiresAt: null,
          lastUsedAt: null,
          createdAt: new Date('2024-01-01'),
          revokedAt: null,
        },
      ]);

      const res = await request(app).get('/api/virtual-keys');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0]).toHaveProperty('id', 'key-1');
      expect(res.body.data[0]).toHaveProperty('keyPrefix', 'abc12345');
      expect(res.body.data[0]).toHaveProperty('label', 'My Key');
      expect(res.body.data[0]).not.toHaveProperty('keyHash'); // Secret not returned
    });

    it('returns empty array when no keys', async () => {
      vi.mocked(prisma.virtualKey.findMany).mockResolvedValueOnce([]);

      const res = await request(app).get('/api/virtual-keys');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(0);
    });

    it('filters by user and tenant', async () => {
      vi.mocked(prisma.virtualKey.findMany).mockResolvedValueOnce([]);

      await request(app).get('/api/virtual-keys');

      expect(prisma.virtualKey.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId: 'test-user',
            tenantId: 'test-tenant',
          },
        })
      );
    });

    it('returns 401 when not authenticated', async () => {
      vi.mocked(buildRBACContext).mockResolvedValueOnce(null);

      const res = await request(app).get('/api/virtual-keys');

      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/virtual-keys', () => {
    it('creates a new virtual key', async () => {
      vi.mocked(prisma.virtualKey.create).mockResolvedValueOnce({
        id: 'new-key-id',
        tenantId: 'test-tenant',
        userId: 'test-user',
        keyPrefix: 'abc12345',
        keyHash: 'hash',
        label: 'Test Key',
        enabled: true,
        expiresAt: null,
        lastUsedAt: null,
        createdAt: new Date('2024-01-01'),
        revokedAt: null,
      });

      const res = await request(app)
        .post('/api/virtual-keys')
        .send({ label: 'Test Key' });

      expect(res.status).toBe(201);
      expect(res.body.data).toHaveProperty('id');
      expect(res.body.data).toHaveProperty('key'); // Full key returned once
      expect(res.body.data.key).toMatch(/^sk-tag-[a-f0-9]{8}-[a-f0-9]{32}$/);
      expect(res.body.warning).toContain('will not be able to see it again');
    });

    it('creates key with expiration date', async () => {
      const expiresAt = new Date('2025-01-01');

      vi.mocked(prisma.virtualKey.create).mockResolvedValueOnce({
        id: 'new-key-id',
        tenantId: 'test-tenant',
        userId: 'test-user',
        keyPrefix: 'abc12345',
        keyHash: 'hash',
        label: null,
        enabled: true,
        expiresAt,
        lastUsedAt: null,
        createdAt: new Date('2024-01-01'),
        revokedAt: null,
      });

      const res = await request(app)
        .post('/api/virtual-keys')
        .send({ expiresAt: '2025-01-01' });

      expect(res.status).toBe(201);
      expect(prisma.virtualKey.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            expiresAt: expect.any(Date),
          }),
        })
      );
    });

    it('creates key without label', async () => {
      vi.mocked(prisma.virtualKey.create).mockResolvedValueOnce({
        id: 'new-key-id',
        tenantId: 'test-tenant',
        userId: 'test-user',
        keyPrefix: 'abc12345',
        keyHash: 'hash',
        label: null,
        enabled: true,
        expiresAt: null,
        lastUsedAt: null,
        createdAt: new Date('2024-01-01'),
        revokedAt: null,
      });

      const res = await request(app)
        .post('/api/virtual-keys')
        .send({});

      expect(res.status).toBe(201);
      expect(res.body.data.label).toBeNull();
    });
  });

  describe('DELETE /api/virtual-keys/:id', () => {
    it('revokes a virtual key', async () => {
      vi.mocked(prisma.virtualKey.findFirst).mockResolvedValueOnce({
        id: 'key-1',
        tenantId: 'test-tenant',
        userId: 'test-user',
        keyPrefix: 'abc12345',
        keyHash: 'hash',
        label: 'My Key',
        enabled: true,
        expiresAt: null,
        lastUsedAt: null,
        createdAt: new Date('2024-01-01'),
        revokedAt: null,
      });

      vi.mocked(prisma.virtualKey.update).mockResolvedValueOnce({
        id: 'key-1',
        tenantId: 'test-tenant',
        userId: 'test-user',
        keyPrefix: 'abc12345',
        keyHash: 'hash',
        label: 'My Key',
        enabled: false,
        expiresAt: null,
        lastUsedAt: null,
        createdAt: new Date('2024-01-01'),
        revokedAt: new Date(),
      });

      const res = await request(app).delete('/api/virtual-keys/key-1');

      expect(res.status).toBe(200);
      expect(res.body.data.enabled).toBe(false);
      expect(res.body.data.revokedAt).toBeTruthy();
      expect(res.body.message).toBe('Key revoked successfully');
    });

    it('returns 404 for non-existent key', async () => {
      vi.mocked(prisma.virtualKey.findFirst).mockResolvedValueOnce(null);

      const res = await request(app).delete('/api/virtual-keys/non-existent');

      expect(res.status).toBe(404);
    });

    it('returns 400 for already revoked key', async () => {
      vi.mocked(prisma.virtualKey.findFirst).mockResolvedValueOnce({
        id: 'key-1',
        tenantId: 'test-tenant',
        userId: 'test-user',
        keyPrefix: 'abc12345',
        keyHash: 'hash',
        label: 'My Key',
        enabled: false,
        expiresAt: null,
        lastUsedAt: null,
        createdAt: new Date('2024-01-01'),
        revokedAt: new Date('2024-06-01'), // Already revoked
      });

      const res = await request(app).delete('/api/virtual-keys/key-1');

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('already revoked');
    });

    it('only allows owner to revoke their key', async () => {
      vi.mocked(prisma.virtualKey.findFirst).mockResolvedValueOnce(null); // Not found because query filters by userId

      const res = await request(app).delete('/api/virtual-keys/other-users-key');

      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/virtual-keys/:id/rotate', () => {
    it('rotates a virtual key', async () => {
      vi.mocked(prisma.virtualKey.findFirst).mockResolvedValueOnce({
        id: 'key-1',
        tenantId: 'test-tenant',
        userId: 'test-user',
        keyPrefix: 'abc12345',
        keyHash: 'old-hash',
        label: 'My Key',
        enabled: true,
        expiresAt: null,
        lastUsedAt: null,
        createdAt: new Date('2024-01-01'),
        revokedAt: null,
      });

      vi.mocked(prisma.virtualKey.update).mockResolvedValueOnce({
        id: 'key-1',
        tenantId: 'test-tenant',
        userId: 'test-user',
        keyPrefix: 'abc12345',
        keyHash: 'new-hash',
        label: 'My Key',
        enabled: true,
        expiresAt: null,
        lastUsedAt: null,
        createdAt: new Date('2024-01-01'),
        revokedAt: null,
      });

      const res = await request(app).post('/api/virtual-keys/key-1/rotate');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty('key');
      // Key should use same prefix
      expect(res.body.data.key).toMatch(/^sk-tag-abc12345-[a-f0-9]{32}$/);
      expect(res.body.warning).toContain('old key is now invalid');
    });

    it('returns 404 for non-existent key', async () => {
      vi.mocked(prisma.virtualKey.findFirst).mockResolvedValueOnce(null);

      const res = await request(app).post('/api/virtual-keys/non-existent/rotate');

      expect(res.status).toBe(404);
    });

    it('returns 400 for revoked key', async () => {
      vi.mocked(prisma.virtualKey.findFirst).mockResolvedValueOnce({
        id: 'key-1',
        tenantId: 'test-tenant',
        userId: 'test-user',
        keyPrefix: 'abc12345',
        keyHash: 'hash',
        label: 'My Key',
        enabled: false,
        expiresAt: null,
        lastUsedAt: null,
        createdAt: new Date('2024-01-01'),
        revokedAt: new Date('2024-06-01'),
      });

      const res = await request(app).post('/api/virtual-keys/key-1/rotate');

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('revoked');
    });
  });

  describe('Virtual Key Format', () => {
    it('generates keys in correct format', async () => {
      vi.mocked(prisma.virtualKey.create).mockResolvedValueOnce({
        id: 'new-key-id',
        tenantId: 'test-tenant',
        userId: 'test-user',
        keyPrefix: 'abc12345',
        keyHash: 'hash',
        label: null,
        enabled: true,
        expiresAt: null,
        lastUsedAt: null,
        createdAt: new Date('2024-01-01'),
        revokedAt: null,
      });

      const res = await request(app)
        .post('/api/virtual-keys')
        .send({});

      const key = res.body.data.key;

      // Format: sk-tag-{8chars}-{32chars}
      expect(key).toMatch(/^sk-tag-[a-f0-9]{8}-[a-f0-9]{32}$/);

      const parts = key.split('-');
      expect(parts[0]).toBe('sk');
      expect(parts[1]).toBe('tag');
      expect(parts[2].length).toBe(8);
      expect(parts[3].length).toBe(32);
    });
  });
});
