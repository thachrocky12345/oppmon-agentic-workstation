/**
 * Skills Service Tests
 *
 * Unit tests for skills CRUD operations:
 * - SHA-256 hashing
 * - Create with versioning
 * - Update with version increment
 * - Soft delete
 * - Scope filtering
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  computeSha256,
  createSkill,
  updateSkill,
  deleteSkill,
  listSkills,
  getSkill,
  getSkillVersions,
  getSkillVersion,
  SkillFilter,
} from './skills.js';
import { SkillScope } from '@prisma/client';

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
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    team: {
      findFirst: vi.fn(),
    },
    $transaction: vi.fn((fn) => fn({
      skill: {
        create: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      skillVersion: {
        create: vi.fn(),
      },
    })),
  },
}));

import { prisma } from '@oppmon/database';

describe('Skills Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('computeSha256', () => {
    it('computes SHA-256 hash of content', () => {
      const content = 'test content';
      const hash = computeSha256(content);

      expect(hash).toBe('6ae8a75555209fd6c44157c0aed8016e763ff435a19cf186f76863140143ff72');
    });

    it('returns different hash for different content', () => {
      const hash1 = computeSha256('content1');
      const hash2 = computeSha256('content2');

      expect(hash1).not.toBe(hash2);
    });

    it('returns same hash for same content', () => {
      const content = 'same content';
      const hash1 = computeSha256(content);
      const hash2 = computeSha256(content);

      expect(hash1).toBe(hash2);
    });

    it('handles empty string', () => {
      const hash = computeSha256('');
      expect(hash).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    });

    it('handles unicode content', () => {
      const hash = computeSha256('こんにちは世界');
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[a-f0-9]+$/);
    });
  });

  describe('createSkill', () => {
    it('creates skill with version 1', async () => {
      const mockSkill = {
        id: 'skill-1',
        tenantId: 'tenant-1',
        teamId: 'team-1',
        name: 'Test Skill',
        description: 'Test description',
        content: 'skill content',
        sha256: computeSha256('skill content'),
        scope: 'TEAM' as SkillScope,
        version: 1,
        createdById: 'user-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
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

      const result = await createSkill('tenant-1', 'user-1', {
        name: 'Test Skill',
        description: 'Test description',
        content: 'skill content',
        scope: 'TEAM',
        teamId: 'team-1',
      });

      expect(result).toEqual(mockSkill);
    });

    it('throws error when team not found in tenant', async () => {
      vi.mocked(prisma.team.findFirst).mockResolvedValue(null);

      await expect(
        createSkill('tenant-1', 'user-1', {
          name: 'Test Skill',
          content: 'skill content',
          scope: 'TEAM',
          teamId: 'team-x',
        })
      ).rejects.toThrow('Team not found in tenant');
    });

    it('throws error when team-scoped skill has no teamId', async () => {
      await expect(
        createSkill('tenant-1', 'user-1', {
          name: 'Test Skill',
          content: 'skill content',
          scope: 'TEAM',
        })
      ).rejects.toThrow('Team ID is required for team-scoped skills');
    });

    it('clears teamId for tenant-scoped skills', async () => {
      const mockSkill = {
        id: 'skill-1',
        tenantId: 'tenant-1',
        teamId: null,
        name: 'Tenant Skill',
        content: 'content',
        sha256: computeSha256('content'),
        scope: 'TENANT' as SkillScope,
        version: 1,
        createdById: 'user-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };

      // For TENANT scope, teamId validation is skipped (teamId becomes null)
      // so we don't need to mock team.findFirst

      let capturedData: any;
      vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => {
        const tx = {
          skill: {
            create: vi.fn().mockImplementation(({ data }) => {
              capturedData = data;
              return mockSkill;
            }),
          },
          skillVersion: {
            create: vi.fn().mockResolvedValue({}),
          },
        };
        return fn(tx);
      });

      await createSkill('tenant-1', 'user-1', {
        name: 'Tenant Skill',
        content: 'content',
        scope: 'TENANT',
        // No teamId - for TENANT scope this is correct
      });

      expect(capturedData.teamId).toBeNull();
    });
  });

  describe('updateSkill', () => {
    it('updates skill without version increment when content unchanged', async () => {
      const currentSkill = {
        id: 'skill-1',
        tenantId: 'tenant-1',
        teamId: 'team-1',
        name: 'Test Skill',
        description: 'Old description',
        content: 'skill content',
        sha256: computeSha256('skill content'),
        scope: 'TEAM' as SkillScope,
        version: 1,
        createdById: 'user-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };

      const updatedSkill = {
        ...currentSkill,
        description: 'New description',
      };

      vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => {
        const tx = {
          skill: {
            findUnique: vi.fn().mockResolvedValue(currentSkill),
            update: vi.fn().mockResolvedValue(updatedSkill),
          },
          skillVersion: {
            create: vi.fn(),
          },
        };
        return fn(tx);
      });

      const result = await updateSkill('skill-1', 'user-1', {
        description: 'New description',
      });

      expect(result.skill.description).toBe('New description');
      expect(result.skill.version).toBe(1);
      expect(result.beforeState.description).toBe('Old description');
    });

    it('increments version and creates version entry when content changes', async () => {
      const currentSkill = {
        id: 'skill-1',
        tenantId: 'tenant-1',
        teamId: 'team-1',
        name: 'Test Skill',
        content: 'old content',
        sha256: computeSha256('old content'),
        scope: 'TEAM' as SkillScope,
        version: 1,
        createdById: 'user-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };

      const updatedSkill = {
        ...currentSkill,
        content: 'new content',
        sha256: computeSha256('new content'),
        version: 2,
      };

      let versionCreated = false;
      vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => {
        const tx = {
          skill: {
            findUnique: vi.fn().mockResolvedValue(currentSkill),
            update: vi.fn().mockResolvedValue(updatedSkill),
          },
          skillVersion: {
            create: vi.fn().mockImplementation(() => {
              versionCreated = true;
              return {};
            }),
          },
        };
        return fn(tx);
      });

      const result = await updateSkill('skill-1', 'user-1', {
        content: 'new content',
      });

      expect(result.skill.version).toBe(2);
      expect(result.skill.sha256).toBe(computeSha256('new content'));
      expect(versionCreated).toBe(true);
    });

    it('throws error when skill not found', async () => {
      vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => {
        const tx = {
          skill: {
            findUnique: vi.fn().mockResolvedValue(null),
            update: vi.fn(),
          },
          skillVersion: {
            create: vi.fn(),
          },
        };
        return fn(tx);
      });

      await expect(updateSkill('skill-x', 'user-1', { description: 'new' })).rejects.toThrow(
        'Skill not found'
      );
    });

    it('throws error when skill is deleted', async () => {
      const deletedSkill = {
        id: 'skill-1',
        deletedAt: new Date(),
      };

      vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => {
        const tx = {
          skill: {
            findUnique: vi.fn().mockResolvedValue(deletedSkill),
            update: vi.fn(),
          },
          skillVersion: {
            create: vi.fn(),
          },
        };
        return fn(tx);
      });

      await expect(
        updateSkill('skill-1', 'user-1', { description: 'new' })
      ).rejects.toThrow('Cannot update a deleted skill');
    });

    it('disconnects team when changing to TENANT scope', async () => {
      const currentSkill = {
        id: 'skill-1',
        tenantId: 'tenant-1',
        teamId: 'team-1',
        name: 'Test Skill',
        content: 'content',
        sha256: computeSha256('content'),
        scope: 'TEAM' as SkillScope,
        version: 1,
        createdById: 'user-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };

      let capturedUpdateData: any;
      vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => {
        const tx = {
          skill: {
            findUnique: vi.fn().mockResolvedValue(currentSkill),
            update: vi.fn().mockImplementation(({ data }) => {
              capturedUpdateData = data;
              return { ...currentSkill, scope: 'TENANT', teamId: null };
            }),
          },
          skillVersion: {
            create: vi.fn(),
          },
        };
        return fn(tx);
      });

      await updateSkill('skill-1', 'user-1', {
        scope: 'TENANT',
      });

      expect(capturedUpdateData.scope).toBe('TENANT');
      expect(capturedUpdateData.team).toEqual({ disconnect: true });
    });

    it('connects team when setting teamId', async () => {
      const currentSkill = {
        id: 'skill-1',
        tenantId: 'tenant-1',
        teamId: null,
        name: 'Test Skill',
        content: 'content',
        sha256: computeSha256('content'),
        scope: 'TEAM' as SkillScope,
        version: 1,
        createdById: 'user-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };

      let capturedUpdateData: any;
      vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => {
        const tx = {
          skill: {
            findUnique: vi.fn().mockResolvedValue(currentSkill),
            update: vi.fn().mockImplementation(({ data }) => {
              capturedUpdateData = data;
              return { ...currentSkill, teamId: 'team-2' };
            }),
          },
          skillVersion: {
            create: vi.fn(),
          },
        };
        return fn(tx);
      });

      await updateSkill('skill-1', 'user-1', {
        teamId: 'team-2',
      });

      expect(capturedUpdateData.team).toEqual({ connect: { id: 'team-2' } });
    });

    it('disconnects team when setting teamId to null', async () => {
      const currentSkill = {
        id: 'skill-1',
        tenantId: 'tenant-1',
        teamId: 'team-1',
        name: 'Test Skill',
        content: 'content',
        sha256: computeSha256('content'),
        scope: 'TEAM' as SkillScope,
        version: 1,
        createdById: 'user-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };

      let capturedUpdateData: any;
      vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => {
        const tx = {
          skill: {
            findUnique: vi.fn().mockResolvedValue(currentSkill),
            update: vi.fn().mockImplementation(({ data }) => {
              capturedUpdateData = data;
              return { ...currentSkill, teamId: null };
            }),
          },
          skillVersion: {
            create: vi.fn(),
          },
        };
        return fn(tx);
      });

      await updateSkill('skill-1', 'user-1', {
        teamId: null,
      });

      expect(capturedUpdateData.team).toEqual({ disconnect: true });
    });
  });

  describe('deleteSkill', () => {
    it('soft deletes skill by setting deletedAt', async () => {
      const currentSkill = {
        id: 'skill-1',
        tenantId: 'tenant-1',
        teamId: 'team-1',
        name: 'Test Skill',
        content: 'content',
        sha256: computeSha256('content'),
        scope: 'TEAM' as SkillScope,
        version: 1,
        createdById: 'user-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };

      let capturedUpdateData: any;
      vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => {
        const tx = {
          skill: {
            findUnique: vi.fn().mockResolvedValue(currentSkill),
            update: vi.fn().mockImplementation(({ data }) => {
              capturedUpdateData = data;
              return { ...currentSkill, deletedAt: data.deletedAt };
            }),
          },
        };
        return fn(tx);
      });

      const result = await deleteSkill('skill-1');

      expect(capturedUpdateData.deletedAt).toBeInstanceOf(Date);
      expect(result.beforeState.deletedAt).toBeNull();
      expect(result.skill.deletedAt).toBeInstanceOf(Date);
    });

    it('throws error when skill not found', async () => {
      vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => {
        const tx = {
          skill: {
            findUnique: vi.fn().mockResolvedValue(null),
            update: vi.fn(),
          },
        };
        return fn(tx);
      });

      await expect(deleteSkill('skill-x')).rejects.toThrow('Skill not found');
    });

    it('throws error when skill already deleted', async () => {
      const deletedSkill = {
        id: 'skill-1',
        deletedAt: new Date(),
      };

      vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => {
        const tx = {
          skill: {
            findUnique: vi.fn().mockResolvedValue(deletedSkill),
            update: vi.fn(),
          },
        };
        return fn(tx);
      });

      await expect(deleteSkill('skill-1')).rejects.toThrow('Skill already deleted');
    });
  });

  describe('listSkills', () => {
    it('returns skills with pagination', async () => {
      const mockSkills = [
        { id: 'skill-1', name: 'Skill 1' },
        { id: 'skill-2', name: 'Skill 2' },
      ];

      vi.mocked(prisma.skill.findMany).mockResolvedValue(mockSkills as any);
      vi.mocked(prisma.skill.count).mockResolvedValue(10);

      const filter: SkillFilter = {
        tenantId: 'tenant-1',
        teamIds: ['team-1'],
      };

      const result = await listSkills(filter, { limit: 2, offset: 0 });

      expect(result.skills).toEqual(mockSkills);
      expect(result.total).toBe(10);
      expect(result.limit).toBe(2);
      expect(result.offset).toBe(0);
    });

    it('uses default pagination values', async () => {
      vi.mocked(prisma.skill.findMany).mockResolvedValue([]);
      vi.mocked(prisma.skill.count).mockResolvedValue(0);

      const filter: SkillFilter = {
        tenantId: 'tenant-1',
        teamIds: [],
      };

      const result = await listSkills(filter);

      expect(result.limit).toBe(50);
      expect(result.offset).toBe(0);
    });

    it('filters by scope when specified', async () => {
      let capturedWhere: any;
      vi.mocked(prisma.skill.findMany).mockImplementation(async ({ where }) => {
        capturedWhere = where;
        return [];
      });
      vi.mocked(prisma.skill.count).mockResolvedValue(0);

      const filter: SkillFilter = {
        tenantId: 'tenant-1',
        teamIds: ['team-1'],
        scope: 'TENANT',
      };

      await listSkills(filter);

      expect(capturedWhere.scope).toBe('TENANT');
    });

    it('filters by search term', async () => {
      let capturedWhere: any;
      vi.mocked(prisma.skill.findMany).mockImplementation(async ({ where }) => {
        capturedWhere = where;
        return [];
      });
      vi.mocked(prisma.skill.count).mockResolvedValue(0);

      const filter: SkillFilter = {
        tenantId: 'tenant-1',
        teamIds: ['team-1'],
        search: 'test',
      };

      await listSkills(filter);

      expect(capturedWhere.AND).toBeDefined();
      expect(capturedWhere.AND[0].OR).toEqual([
        { name: { contains: 'test', mode: 'insensitive' } },
        { description: { contains: 'test', mode: 'insensitive' } },
      ]);
    });

    it('excludes deleted skills by default', async () => {
      let capturedWhere: any;
      vi.mocked(prisma.skill.findMany).mockImplementation(async ({ where }) => {
        capturedWhere = where;
        return [];
      });
      vi.mocked(prisma.skill.count).mockResolvedValue(0);

      const filter: SkillFilter = {
        tenantId: 'tenant-1',
        teamIds: ['team-1'],
      };

      await listSkills(filter);

      expect(capturedWhere.deletedAt).toBeNull();
    });

    it('includes deleted skills when requested', async () => {
      let capturedWhere: any;
      vi.mocked(prisma.skill.findMany).mockImplementation(async ({ where }) => {
        capturedWhere = where;
        return [];
      });
      vi.mocked(prisma.skill.count).mockResolvedValue(0);

      const filter: SkillFilter = {
        tenantId: 'tenant-1',
        teamIds: ['team-1'],
        includeDeleted: true,
      };

      await listSkills(filter);

      expect(capturedWhere.deletedAt).toBeUndefined();
    });
  });

  describe('getSkill', () => {
    it('returns skill when found', async () => {
      const mockSkill = {
        id: 'skill-1',
        name: 'Test Skill',
        scope: 'TENANT',
      };

      vi.mocked(prisma.skill.findFirst).mockResolvedValue(mockSkill as any);

      const filter: SkillFilter = {
        tenantId: 'tenant-1',
        teamIds: ['team-1'],
      };

      const result = await getSkill('skill-1', filter);

      expect(result).toEqual(mockSkill);
    });

    it('returns null when skill not found', async () => {
      vi.mocked(prisma.skill.findFirst).mockResolvedValue(null);

      const filter: SkillFilter = {
        tenantId: 'tenant-1',
        teamIds: ['team-1'],
      };

      const result = await getSkill('skill-x', filter);

      expect(result).toBeNull();
    });
  });

  describe('getSkillVersions', () => {
    it('returns version history for skill', async () => {
      const mockVersions = [
        { id: 'v2', skillId: 'skill-1', version: 2 },
        { id: 'v1', skillId: 'skill-1', version: 1 },
      ];

      vi.mocked(prisma.skillVersion.findMany).mockResolvedValue(mockVersions as any);

      const result = await getSkillVersions('skill-1');

      expect(result).toEqual(mockVersions);
      expect(prisma.skillVersion.findMany).toHaveBeenCalledWith({
        where: { skillId: 'skill-1' },
        orderBy: { version: 'desc' },
        include: {
          createdBy: { select: { id: true, name: true, email: true } },
        },
      });
    });
  });

  describe('getSkillVersion', () => {
    it('returns specific version', async () => {
      const mockVersion = {
        id: 'v1',
        skillId: 'skill-1',
        version: 1,
        content: 'version 1 content',
      };

      vi.mocked(prisma.skillVersion.findUnique).mockResolvedValue(mockVersion as any);

      const result = await getSkillVersion('skill-1', 1);

      expect(result).toEqual(mockVersion);
      expect(prisma.skillVersion.findUnique).toHaveBeenCalledWith({
        where: {
          skillId_version: { skillId: 'skill-1', version: 1 },
        },
        include: {
          createdBy: { select: { id: true, name: true, email: true } },
        },
      });
    });

    it('returns null when version not found', async () => {
      vi.mocked(prisma.skillVersion.findUnique).mockResolvedValue(null);

      const result = await getSkillVersion('skill-1', 99);

      expect(result).toBeNull();
    });
  });
});
