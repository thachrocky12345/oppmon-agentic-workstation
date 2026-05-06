/**
 * Skills Service
 *
 * Business logic for Skills Registry CRUD operations:
 * - Create/update skills with automatic versioning
 * - SHA-256 hash computation for content integrity
 * - Soft delete with version history preservation
 * - Scope-based filtering respecting team memberships
 */

import { prisma } from "@oppmon/database";
import { Skill, SkillScope, Prisma } from "@oppmon/database";
import { createHash } from "crypto";
import {
  embedSkill,
  deleteSkillEmbedding,
} from "./embedding-hooks.js";

// ============================================================================
// Types
// ============================================================================

export interface CreateSkillInput {
  name: string;
  description?: string;
  content: string;
  scope: SkillScope;
  teamId?: string | null;
}

export interface UpdateSkillInput {
  description?: string;
  content?: string;
  scope?: SkillScope;
  teamId?: string | null;
}

export interface SkillFilter {
  tenantId: string;
  teamIds: string[]; // User's team memberships
  scope?: SkillScope;
  search?: string;
  includeDeleted?: boolean;
}

export interface SkillWithVersions extends Skill {
  versions: {
    id: string;
    version: number;
    sha256: string;
    createdAt: Date;
    createdBy: { id: string; name: string; email: string };
  }[];
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Compute SHA-256 hash of content
 */
export function computeSha256(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

/**
 * Build where clause for skill queries with scope filtering
 */
function buildSkillWhereClause(filter: SkillFilter): Prisma.SkillWhereInput {
  const where: Prisma.SkillWhereInput = {
    tenantId: filter.tenantId,
  };

  // Scope filtering: user can see tenant-scoped OR their team-scoped skills
  where.OR = [
    { scope: "TENANT" },
    { scope: "TEAM", teamId: { in: filter.teamIds } },
  ];

  // Optional scope filter
  if (filter.scope) {
    where.scope = filter.scope;
  }

  // Search filter
  if (filter.search) {
    where.AND = [
      {
        OR: [
          { name: { contains: filter.search, mode: "insensitive" } },
          { description: { contains: filter.search, mode: "insensitive" } },
        ],
      },
    ];
  }

  // Exclude soft-deleted unless requested
  if (!filter.includeDeleted) {
    where.deletedAt = null;
  }

  return where;
}

// ============================================================================
// Service Functions
// ============================================================================

/**
 * List skills with scope filtering
 */
export async function listSkills(
  filter: SkillFilter,
  pagination: { limit?: number; offset?: number } = {}
) {
  const where = buildSkillWhereClause(filter);
  const limit = pagination.limit ?? 50;
  const offset = pagination.offset ?? 0;

  const [skills, total] = await Promise.all([
    prisma.skill.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      take: limit,
      skip: offset,
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        team: { select: { id: true, name: true } },
      },
    }),
    prisma.skill.count({ where }),
  ]);

  return { skills, total, limit, offset };
}

/**
 * Get a single skill by ID
 */
export async function getSkill(
  id: string,
  filter: SkillFilter
): Promise<Skill | null> {
  const where = buildSkillWhereClause(filter);

  return prisma.skill.findFirst({
    where: { ...where, id },
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
      team: { select: { id: true, name: true } },
    },
  });
}

/**
 * Get skill with all versions
 */
export async function getSkillWithVersions(
  id: string,
  filter: SkillFilter
): Promise<SkillWithVersions | null> {
  const where = buildSkillWhereClause(filter);

  return prisma.skill.findFirst({
    where: { ...where, id },
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
      team: { select: { id: true, name: true } },
      versions: {
        orderBy: { version: "desc" },
        include: {
          createdBy: { select: { id: true, name: true, email: true } },
        },
      },
    },
  }) as Promise<SkillWithVersions | null>;
}

/**
 * Create a new skill
 */
export async function createSkill(
  tenantId: string,
  createdById: string,
  input: CreateSkillInput
): Promise<Skill> {
  const sha256 = computeSha256(input.content);

  // Validate team belongs to tenant if specified
  if (input.teamId) {
    const team = await prisma.team.findFirst({
      where: { id: input.teamId, tenantId },
    });
    if (!team) {
      throw new Error("Team not found in tenant");
    }
  }

  // If scope is TEAM, teamId is required
  if (input.scope === "TEAM" && !input.teamId) {
    throw new Error("Team ID is required for team-scoped skills");
  }

  // If scope is TENANT, teamId should be null
  const teamId = input.scope === "TENANT" ? null : input.teamId;

  const skill = await prisma.$transaction(async (tx) => {
    // Create the skill
    const created = await tx.skill.create({
      data: {
        tenantId,
        teamId,
        name: input.name,
        description: input.description,
        content: input.content,
        sha256,
        scope: input.scope,
        version: 1,
        createdById,
      },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        team: { select: { id: true, name: true } },
      },
    });

    // Create initial version entry
    await tx.skillVersion.create({
      data: {
        skillId: created.id,
        version: 1,
        content: input.content,
        sha256,
        createdById,
      },
    });

    return created;
  });

  // Trigger auto-embedding (non-blocking)
  embedSkill(tenantId, skill);

  return skill;
}

/**
 * Update an existing skill
 * Creates a new version if content changes
 */
export async function updateSkill(
  id: string,
  updatedById: string,
  input: UpdateSkillInput
): Promise<{ skill: Skill; beforeState: Skill }> {
  let contentChanged = false;
  let tenantId: string | undefined;

  const result = await prisma.$transaction(async (tx) => {
    // Get current state
    const current = await tx.skill.findUnique({
      where: { id },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        team: { select: { id: true, name: true } },
      },
    });

    if (!current) {
      throw new Error("Skill not found");
    }

    if (current.deletedAt) {
      throw new Error("Cannot update a deleted skill");
    }

    tenantId = current.tenantId;
    const beforeState = { ...current };

    // Prepare update data
    const updateData: Prisma.SkillUpdateInput = {};

    if (input.description !== undefined) {
      updateData.description = input.description;
    }

    if (input.scope !== undefined) {
      updateData.scope = input.scope;
      // If changing to TENANT scope, clear teamId
      if (input.scope === "TENANT") {
        updateData.team = { disconnect: true };
      }
    }

    if (input.teamId !== undefined) {
      if (input.teamId === null) {
        updateData.team = { disconnect: true };
      } else {
        updateData.team = { connect: { id: input.teamId } };
      }
    }

    // If content changes, increment version and create version entry
    if (input.content !== undefined && input.content !== current.content) {
      const newVersion = current.version + 1;
      const newSha256 = computeSha256(input.content);

      updateData.content = input.content;
      updateData.sha256 = newSha256;
      updateData.version = newVersion;
      contentChanged = true;

      // Create version entry
      await tx.skillVersion.create({
        data: {
          skillId: id,
          version: newVersion,
          content: input.content,
          sha256: newSha256,
          createdById: updatedById,
        },
      });
    }

    // Update skill
    const skill = await tx.skill.update({
      where: { id },
      data: updateData,
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        team: { select: { id: true, name: true } },
      },
    });

    return { skill, beforeState: beforeState as Skill };
  });

  // Trigger auto-embedding if content changed (non-blocking)
  if (contentChanged && tenantId) {
    embedSkill(tenantId, result.skill);
  }

  return result;
}

/**
 * Soft delete a skill
 */
export async function deleteSkill(
  id: string
): Promise<{ skill: Skill; beforeState: Skill }> {
  const result = await prisma.$transaction(async (tx) => {
    const current = await tx.skill.findUnique({
      where: { id },
    });

    if (!current) {
      throw new Error("Skill not found");
    }

    if (current.deletedAt) {
      throw new Error("Skill already deleted");
    }

    const beforeState = { ...current };

    const skill = await tx.skill.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return { skill, beforeState: beforeState as Skill, tenantId: current.tenantId };
  });

  // Delete embedding (non-blocking)
  deleteSkillEmbedding(result.tenantId, id);

  return { skill: result.skill, beforeState: result.beforeState };
}

/**
 * Get version history for a skill
 */
export async function getSkillVersions(skillId: string) {
  return prisma.skillVersion.findMany({
    where: { skillId },
    orderBy: { version: "desc" },
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
    },
  });
}

/**
 * Get a specific version of a skill
 */
export async function getSkillVersion(skillId: string, version: number) {
  return prisma.skillVersion.findUnique({
    where: {
      skillId_version: { skillId, version },
    },
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
    },
  });
}
