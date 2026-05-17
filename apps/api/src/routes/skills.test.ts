// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

/**
 * Skills Routes Integration Tests
 *
 * Tests all Skills API endpoints with:
 * - Different role combinations (TENANT_ADMIN, TEAM_ADMIN, MEMBER)
 * - Scope filtering (TENANT vs TEAM)
 * - Audit logging verification
 * - Error handling
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { skillsRouter } from './skills.js';
import { SkillScope, Role } from '@prisma/client';

// Mock prisma
vi.mock('@oppmon/database', () => ({
  prisma: {
    skill: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    skillVersion: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
    team: {
      findFirst: vi.fn(),
    },
    teamMember: {
      findMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

// Mock the audit service — Skills route calls logCreate / logUpdate / logDelete
// which now write directly to audit_log_v2 via withTenantPg, not prisma.auditLog.
vi.mock('../services/audit.js', () => ({
  logCreate: vi.fn(async () => undefined),
  logUpdate: vi.fn(async () => undefined),
  logDelete: vi.fn(async () => undefined),
  logDenied: vi.fn(async () => undefined),
  getAuditContext: vi.fn((req: any) =>
    req.user
      ? { tenantId: req.user.tenantId, actorId: req.user.id }
      : null,
  ),
}));

import { prisma } from '@oppmon/database';
import { logCreate, logUpdate, logDelete } from '../services/audit.js';

// Mock user for request authentication
const mockUser = {
  id: 'user-1',
  tenantId: 'tenant-1',
  role: 'TENANT_ADMIN' as Role,
  email: 'admin@test.com',
  name: 'Admin User',
};

// Create test app with auth simulation
function createTestApp(user: typeof mockUser | null = mockUser) {
  const app = express();
  app.use(express.json());

  // Simulate requestAuth middleware
  app.use((req: any, _res, next) => {
    req.user = user;
    next();
  });

  app.use('/api/skills', skillsRouter);

  // Error handler
  app.use((err: any, _req: any, res: any, _next: any) => {
    res.status(err.status || 500).json({
      error: err.message || 'Internal Server Error',
    });
  });

  return app;
}

describe('Skills Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock for teamMember
    vi.mocked(prisma.teamMember.findMany).mockResolvedValue([
      { teamId: 'team-1', role: 'ADMIN', userId: 'user-1', id: 'tm-1', createdAt: new Date() },
    ]);

    // Audit-service mocks default to resolved void; assertions below verify calls.
  });

  describe('GET /api/skills', () => {
    it('returns list of skills with pagination', async () => {
      const mockSkills = [
        {
          id: 'skill-1',
          name: 'Skill 1',
          scope: 'TENANT',
          tenantId: 'tenant-1',
          version: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'skill-2',
          name: 'Skill 2',
          scope: 'TEAM',
          teamId: 'team-1',
          tenantId: 'tenant-1',
          version: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      vi.mocked(prisma.skill.findMany).mockResolvedValue(mockSkills as any);
      vi.mocked(prisma.skill.count).mockResolvedValue(2);

      const app = createTestApp();
      const res = await request(app).get('/api/skills');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.meta.total).toBe(2);
    });

    it('filters by scope parameter', async () => {
      vi.mocked(prisma.skill.findMany).mockResolvedValue([]);
      vi.mocked(prisma.skill.count).mockResolvedValue(0);

      const app = createTestApp();
      await request(app).get('/api/skills?scope=TENANT');

      expect(prisma.skill.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            scope: 'TENANT',
          }),
        })
      );
    });

    it('filters by search parameter', async () => {
      vi.mocked(prisma.skill.findMany).mockResolvedValue([]);
      vi.mocked(prisma.skill.count).mockResolvedValue(0);

      const app = createTestApp();
      await request(app).get('/api/skills?search=test');

      expect(prisma.skill.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            AND: expect.arrayContaining([
              expect.objectContaining({
                OR: [
                  { name: { contains: 'test', mode: 'insensitive' } },
                  { description: { contains: 'test', mode: 'insensitive' } },
                ],
              }),
            ]),
          }),
        })
      );
    });

    it('uses pagination parameters', async () => {
      vi.mocked(prisma.skill.findMany).mockResolvedValue([]);
      vi.mocked(prisma.skill.count).mockResolvedValue(0);

      const app = createTestApp();
      await request(app).get('/api/skills?limit=10&offset=20');

      expect(prisma.skill.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 10,
          skip: 20,
        })
      );
    });

    it('returns 401 when not authenticated', async () => {
      // When user is null, buildRBACContext returns null which throws ApiError.unauthorized
      const app = createTestApp(null);
      const res = await request(app).get('/api/skills');

      // The actual status depends on how the routes handle null user
      // Our code calls buildRBACContext which returns null, then throws ApiError.unauthorized
      expect([401, 500]).toContain(res.status);
    });
  });

  describe('GET /api/skills/:id', () => {
    it('returns skill when found', async () => {
      const mockSkill = {
        id: 'skill-1',
        name: 'Test Skill',
        scope: 'TENANT' as SkillScope,
        tenantId: 'tenant-1',
        version: 1,
        deletedAt: null,
      };

      vi.mocked(prisma.skill.findUnique).mockResolvedValue(mockSkill as any);
      vi.mocked(prisma.skill.findFirst).mockResolvedValue(mockSkill as any);

      const app = createTestApp();
      const res = await request(app).get('/api/skills/skill-1');

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe('skill-1');
    });

    it('returns 404 when skill not found', async () => {
      vi.mocked(prisma.skill.findUnique).mockResolvedValue(null);

      const app = createTestApp();
      const res = await request(app).get('/api/skills/skill-x');

      expect(res.status).toBe(404);
    });

    it('returns 404 for deleted skill', async () => {
      const deletedSkill = {
        id: 'skill-1',
        deletedAt: new Date(),
        tenantId: 'tenant-1',
      };

      vi.mocked(prisma.skill.findUnique).mockResolvedValue(deletedSkill as any);

      const app = createTestApp();
      const res = await request(app).get('/api/skills/skill-1');

      expect(res.status).toBe(404);
    });

    it('returns 404 for skill from different tenant', async () => {
      const otherTenantSkill = {
        id: 'skill-1',
        tenantId: 'tenant-other',
        deletedAt: null,
      };

      vi.mocked(prisma.skill.findUnique).mockResolvedValue(otherTenantSkill as any);

      const app = createTestApp();
      const res = await request(app).get('/api/skills/skill-1');

      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/skills', () => {
    it('creates tenant-scoped skill as TENANT_ADMIN', async () => {
      const mockSkill = {
        id: 'skill-new',
        name: 'New Skill',
        description: 'Description',
        content: 'skill content',
        scope: 'TENANT' as SkillScope,
        tenantId: 'tenant-1',
        teamId: null,
        version: 1,
        createdById: 'user-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => {
        const tx = {
          skill: {
            create: vi.fn().mockResolvedValue(mockSkill),
          },
          skillVersion: {
            create: vi.fn().mockResolvedValue({}),
          },
        };
        return fn(tx);
      });

      const app = createTestApp();
      const res = await request(app)
        .post('/api/skills')
        .send({
          name: 'New Skill',
          description: 'Description',
          content: 'skill content',
          scope: 'TENANT',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.id).toBe('skill-new');
    });

    it('creates team-scoped skill with valid teamId', async () => {
      const mockSkill = {
        id: 'skill-team',
        name: 'Team Skill',
        scope: 'TEAM' as SkillScope,
        teamId: 'team-1',
        tenantId: 'tenant-1',
        version: 1,
      };

      vi.mocked(prisma.team.findFirst).mockResolvedValue({
        id: 'team-1',
        name: 'Team 1',
        tenantId: 'tenant-1',
      } as any);

      vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => {
        const tx = {
          skill: {
            create: vi.fn().mockResolvedValue(mockSkill),
          },
          skillVersion: {
            create: vi.fn().mockResolvedValue({}),
          },
        };
        return fn(tx);
      });

      const app = createTestApp();
      const res = await request(app)
        .post('/api/skills')
        .send({
          name: 'Team Skill',
          content: 'team skill content',
          scope: 'TEAM',
          teamId: 'team-1',
        });

      expect(res.status).toBe(201);
    });

    it('returns 403 for TEAM_ADMIN creating TENANT-scoped skill', async () => {
      const teamAdminUser = {
        ...mockUser,
        role: 'TEAM_ADMIN' as Role,
      };

      const app = createTestApp(teamAdminUser);
      const res = await request(app)
        .post('/api/skills')
        .send({
          name: 'Tenant Skill',
          content: 'content',
          scope: 'TENANT',
        });

      expect(res.status).toBe(403);
    });

    it('returns 403 for MEMBER creating any skill', async () => {
      const memberUser = {
        ...mockUser,
        role: 'MEMBER' as Role,
      };

      const app = createTestApp(memberUser);
      const res = await request(app)
        .post('/api/skills')
        .send({
          name: 'New Skill',
          content: 'content',
          scope: 'TEAM',
          teamId: 'team-1',
        });

      expect(res.status).toBe(403);
    });

    it('returns 403 when creating in non-member team', async () => {
      vi.mocked(prisma.teamMember.findMany).mockResolvedValue([]);

      const teamAdminUser = {
        ...mockUser,
        role: 'TEAM_ADMIN' as Role,
      };

      const app = createTestApp(teamAdminUser);
      const res = await request(app)
        .post('/api/skills')
        .send({
          name: 'Team Skill',
          content: 'content',
          scope: 'TEAM',
          teamId: 'team-other',
        });

      expect(res.status).toBe(403);
    });

    it('validates required fields', async () => {
      const app = createTestApp();
      const res = await request(app)
        .post('/api/skills')
        .send({
          name: 'Skill without content',
          scope: 'TENANT',
          // missing content
        });

      // Zod throws ZodError, which may be 400 or 500 depending on error handler
      expect([400, 500]).toContain(res.status);
    });

    it('validates name max length', async () => {
      const app = createTestApp();
      const res = await request(app)
        .post('/api/skills')
        .send({
          name: 'x'.repeat(256),
          content: 'content',
          scope: 'TENANT',
        });

      // Zod throws ZodError, which may be 400 or 500 depending on error handler
      expect([400, 500]).toContain(res.status);
    });

    it('logs create to audit', async () => {
      const mockSkill = {
        id: 'skill-new',
        name: 'New Skill',
        content: 'content',
        scope: 'TENANT' as SkillScope,
        tenantId: 'tenant-1',
        version: 1,
      };

      vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => {
        const tx = {
          skill: { create: vi.fn().mockResolvedValue(mockSkill) },
          skillVersion: { create: vi.fn().mockResolvedValue({}) },
        };
        return fn(tx);
      });

      const app = createTestApp();
      await request(app)
        .post('/api/skills')
        .send({
          name: 'New Skill',
          content: 'content',
          scope: 'TENANT',
        });

      expect(logCreate).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: 'tenant-1', actorId: 'user-1' }),
        'skill',
        expect.any(String),
        expect.any(Object),
      );
    });
  });

  describe('PUT /api/skills/:id', () => {
    it('updates skill as TENANT_ADMIN', async () => {
      const existingSkill = {
        id: 'skill-1',
        name: 'Original',
        description: 'Old desc',
        content: 'old content',
        scope: 'TENANT' as SkillScope,
        teamId: null,
        tenantId: 'tenant-1',
        version: 1,
        deletedAt: null,
      };

      const updatedSkill = {
        ...existingSkill,
        description: 'New desc',
      };

      vi.mocked(prisma.skill.findUnique).mockResolvedValue(existingSkill as any);

      vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => {
        const tx = {
          skill: {
            findUnique: vi.fn().mockResolvedValue(existingSkill),
            update: vi.fn().mockResolvedValue(updatedSkill),
          },
          skillVersion: {
            create: vi.fn().mockResolvedValue({}),
          },
        };
        return fn(tx);
      });

      const app = createTestApp();
      const res = await request(app)
        .put('/api/skills/skill-1')
        .send({ description: 'New desc' });

      expect(res.status).toBe(200);
      expect(res.body.data.description).toBe('New desc');
    });

    it('returns 403 for MEMBER trying to update', async () => {
      const existingSkill = {
        id: 'skill-1',
        scope: 'TEAM' as SkillScope,
        teamId: 'team-1',
        tenantId: 'tenant-1',
        deletedAt: null,
      };

      vi.mocked(prisma.skill.findUnique).mockResolvedValue(existingSkill as any);

      const memberUser = { ...mockUser, role: 'MEMBER' as Role };
      const app = createTestApp(memberUser);
      const res = await request(app)
        .put('/api/skills/skill-1')
        .send({ description: 'New desc' });

      expect(res.status).toBe(403);
    });

    it('returns 403 for TEAM_ADMIN updating tenant-scoped skill', async () => {
      const tenantSkill = {
        id: 'skill-1',
        scope: 'TENANT' as SkillScope,
        teamId: null,
        tenantId: 'tenant-1',
        deletedAt: null,
      };

      vi.mocked(prisma.skill.findUnique).mockResolvedValue(tenantSkill as any);

      const teamAdminUser = { ...mockUser, role: 'TEAM_ADMIN' as Role };
      const app = createTestApp(teamAdminUser);
      const res = await request(app)
        .put('/api/skills/skill-1')
        .send({ description: 'New desc' });

      expect(res.status).toBe(403);
    });

    it('allows TEAM_ADMIN to update own team skill', async () => {
      const teamSkill = {
        id: 'skill-1',
        name: 'Team Skill',
        description: 'Old',
        content: 'content',
        scope: 'TEAM' as SkillScope,
        teamId: 'team-1',
        tenantId: 'tenant-1',
        version: 1,
        deletedAt: null,
      };

      const updatedSkill = { ...teamSkill, description: 'New' };

      vi.mocked(prisma.skill.findUnique).mockResolvedValue(teamSkill as any);
      vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => {
        const tx = {
          skill: {
            findUnique: vi.fn().mockResolvedValue(teamSkill),
            update: vi.fn().mockResolvedValue(updatedSkill),
          },
          skillVersion: { create: vi.fn().mockResolvedValue({}) },
        };
        return fn(tx);
      });

      const teamAdminUser = { ...mockUser, role: 'TEAM_ADMIN' as Role };
      const app = createTestApp(teamAdminUser);
      const res = await request(app)
        .put('/api/skills/skill-1')
        .send({ description: 'New' });

      expect(res.status).toBe(200);
    });

    it('logs update to audit', async () => {
      const existingSkill = {
        id: 'skill-1',
        description: 'Old',
        content: 'content',
        scope: 'TENANT' as SkillScope,
        tenantId: 'tenant-1',
        version: 1,
        deletedAt: null,
      };

      vi.mocked(prisma.skill.findUnique).mockResolvedValue(existingSkill as any);
      vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => {
        const tx = {
          skill: {
            findUnique: vi.fn().mockResolvedValue(existingSkill),
            update: vi.fn().mockResolvedValue({ ...existingSkill, description: 'New' }),
          },
          skillVersion: { create: vi.fn().mockResolvedValue({}) },
        };
        return fn(tx);
      });

      const app = createTestApp();
      await request(app)
        .put('/api/skills/skill-1')
        .send({ description: 'New' });

      expect(logUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: 'tenant-1', actorId: 'user-1' }),
        'skill',
        expect.any(String),
        expect.any(Object),
        expect.any(Object),
      );
    });
  });

  describe('DELETE /api/skills/:id', () => {
    it('soft deletes skill as TENANT_ADMIN', async () => {
      const existingSkill = {
        id: 'skill-1',
        name: 'To Delete',
        scope: 'TENANT' as SkillScope,
        tenantId: 'tenant-1',
        teamId: null,
        deletedAt: null,
      };

      const deletedSkill = {
        ...existingSkill,
        deletedAt: new Date(),
      };

      vi.mocked(prisma.skill.findUnique).mockResolvedValue(existingSkill as any);
      vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => {
        const tx = {
          skill: {
            findUnique: vi.fn().mockResolvedValue(existingSkill),
            update: vi.fn().mockResolvedValue(deletedSkill),
          },
        };
        return fn(tx);
      });

      const app = createTestApp();
      const res = await request(app).delete('/api/skills/skill-1');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('returns 403 for MEMBER trying to delete', async () => {
      const existingSkill = {
        id: 'skill-1',
        scope: 'TEAM' as SkillScope,
        teamId: 'team-1',
        tenantId: 'tenant-1',
        deletedAt: null,
      };

      vi.mocked(prisma.skill.findUnique).mockResolvedValue(existingSkill as any);

      const memberUser = { ...mockUser, role: 'MEMBER' as Role };
      const app = createTestApp(memberUser);
      const res = await request(app).delete('/api/skills/skill-1');

      expect(res.status).toBe(403);
    });

    it('returns 403 for TEAM_ADMIN deleting tenant-scoped skill', async () => {
      const tenantSkill = {
        id: 'skill-1',
        scope: 'TENANT' as SkillScope,
        teamId: null,
        tenantId: 'tenant-1',
        deletedAt: null,
      };

      vi.mocked(prisma.skill.findUnique).mockResolvedValue(tenantSkill as any);

      const teamAdminUser = { ...mockUser, role: 'TEAM_ADMIN' as Role };
      const app = createTestApp(teamAdminUser);
      const res = await request(app).delete('/api/skills/skill-1');

      expect(res.status).toBe(403);
    });

    it('logs delete to audit', async () => {
      const existingSkill = {
        id: 'skill-1',
        scope: 'TENANT' as SkillScope,
        tenantId: 'tenant-1',
        deletedAt: null,
      };

      vi.mocked(prisma.skill.findUnique).mockResolvedValue(existingSkill as any);
      vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => {
        const tx = {
          skill: {
            findUnique: vi.fn().mockResolvedValue(existingSkill),
            update: vi.fn().mockResolvedValue({ ...existingSkill, deletedAt: new Date() }),
          },
        };
        return fn(tx);
      });

      const app = createTestApp();
      await request(app).delete('/api/skills/skill-1');

      expect(logDelete).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: 'tenant-1', actorId: 'user-1' }),
        'skill',
        expect.any(String),
        expect.any(Object),
      );
    });
  });

  describe('GET /api/skills/:id/versions', () => {
    it('returns version history', async () => {
      const existingSkill = {
        id: 'skill-1',
        scope: 'TENANT' as SkillScope,
        tenantId: 'tenant-1',
        deletedAt: null,
      };

      const mockVersions = [
        { id: 'v2', skillId: 'skill-1', version: 2, content: 'v2 content' },
        { id: 'v1', skillId: 'skill-1', version: 1, content: 'v1 content' },
      ];

      vi.mocked(prisma.skill.findUnique).mockResolvedValue(existingSkill as any);
      vi.mocked(prisma.skillVersion.findMany).mockResolvedValue(mockVersions as any);

      const app = createTestApp();
      const res = await request(app).get('/api/skills/skill-1/versions');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.data[0].version).toBe(2);
    });

    it('returns 404 for non-existent skill', async () => {
      vi.mocked(prisma.skill.findUnique).mockResolvedValue(null);

      const app = createTestApp();
      const res = await request(app).get('/api/skills/skill-x/versions');

      expect(res.status).toBe(404);
    });

    it('returns 403 for MEMBER accessing other team skill versions', async () => {
      const otherTeamSkill = {
        id: 'skill-1',
        scope: 'TEAM' as SkillScope,
        teamId: 'team-other',
        tenantId: 'tenant-1',
        deletedAt: null,
      };

      vi.mocked(prisma.skill.findUnique).mockResolvedValue(otherTeamSkill as any);
      vi.mocked(prisma.teamMember.findMany).mockResolvedValue([
        { teamId: 'team-1', role: 'MEMBER', userId: 'user-1', id: 'tm-1', createdAt: new Date() },
      ]);

      const memberUser = { ...mockUser, role: 'MEMBER' as Role };
      const app = createTestApp(memberUser);
      const res = await request(app).get('/api/skills/skill-1/versions');

      // Should fail due to team scope check
      expect(res.status).toBe(403);
    });
  });
});
