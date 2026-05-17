// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

/**
 * Skills Registry API Routes
 *
 * Endpoints:
 * - GET    /api/skills          - List skills (filtered by scope)
 * - GET    /api/skills/:id      - Get single skill
 * - POST   /api/skills          - Create skill (team_admin+)
 * - PUT    /api/skills/:id      - Update skill (team_admin+ for team, tenant_admin for tenant)
 * - DELETE /api/skills/:id      - Soft delete skill
 * - GET    /api/skills/:id/versions - List version history
 */

import { Router, Response } from "express";
import { z } from "zod";
import { prisma } from "@oppmon/database";
import { SkillScope } from "@oppmon/database";
import { asyncHandler, ApiError } from "../middleware/error-handler.js";
import { AuthenticatedRequest } from "../middleware/request-auth.js";
import { rbac, buildRBACContext, RBACContext } from "../middleware/rbac.js";
import { requireAccess } from "../middleware/access.js";
import {
  listSkills,
  getSkill,
  createSkill,
  updateSkill,
  deleteSkill,
  getSkillVersions,
  SkillFilter,
} from "../services/skills.js";
import {
  logCreate,
  logUpdate,
  logDelete,
  getAuditContext,
} from "../services/audit.js";

export const skillsRouter = Router();

// ============================================================================
// Validation Schemas
// ============================================================================

const createSkillSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  content: z.string().min(1),
  scope: z.enum(["TENANT", "TEAM"]),
  teamId: z.string().optional().nullable(),
});

const updateSkillSchema = z.object({
  description: z.string().max(1000).optional(),
  content: z.string().min(1).optional(),
  scope: z.enum(["TENANT", "TEAM"]).optional(),
  teamId: z.string().optional().nullable(),
});

const listSkillsQuerySchema = z.object({
  scope: z.enum(["TENANT", "TEAM"]).optional(),
  search: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).optional(),
  offset: z.coerce.number().min(0).optional(),
});

// ============================================================================
// Helper Functions
// ============================================================================

async function getResourceContext(req: AuthenticatedRequest) {
  const skillId = req.params.id;
  if (!skillId) return null;

  const skill = await prisma.skill.findUnique({
    where: { id: skillId },
    select: { id: true, teamId: true, scope: true, tenantId: true, deletedAt: true },
  });

  if (!skill || skill.deletedAt) return null;

  // Verify skill belongs to user's tenant
  if (skill.tenantId !== req.user?.tenantId) return null;

  return {
    resourceType: "skill",
    resourceId: skill.id,
    teamId: skill.teamId,
    scope: skill.scope,
  };
}

// ============================================================================
// Routes
// ============================================================================

/**
 * GET /api/skills
 * List skills visible to the current user
 */
skillsRouter.get(
  "/",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const query = listSkillsQuerySchema.parse(req.query);
    const rbacCtx = await buildRBACContext(req);

    if (!rbacCtx) {
      throw ApiError.unauthorized("Authentication required");
    }

    const filter: SkillFilter = {
      tenantId: rbacCtx.tenantId,
      teamIds: rbacCtx.teamIds,
      scope: query.scope as SkillScope | undefined,
      search: query.search,
    };

    const result = await listSkills(filter, {
      limit: query.limit,
      offset: query.offset,
    });

    res.json({
      data: result.skills,
      meta: {
        total: result.total,
        limit: result.limit,
        offset: result.offset,
      },
    });
  })
);

/**
 * GET /api/skills/:id
 * Get a single skill by ID
 */
skillsRouter.get(
  "/:id",
  // canAccess() short-circuits on owner / share / system; rbac() then layers
  // role-based checks. Both must pass.
  requireAccess("skill", "read"),
  rbac({
    resourceType: "skill",
    permission: "read",
    getResourceContext,
  }),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const rbacCtx = (req as any).rbacContext as RBACContext;

    const skill = await getSkill(req.params.id, {
      tenantId: rbacCtx.tenantId,
      teamIds: rbacCtx.teamIds,
    });

    if (!skill) {
      throw ApiError.notFound("Skill not found");
    }

    res.json({ data: skill });
  })
);

/**
 * POST /api/skills
 * Create a new skill
 */
skillsRouter.post(
  "/",
  rbac({
    resourceType: "skill",
    permission: "create",
    getResourceContext: async (req) => {
      // For create, check if user can create in the specified scope/team
      const body = req.body;
      return {
        resourceType: "skill",
        scope: body.scope as SkillScope,
        teamId: body.teamId,
      };
    },
  }),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const input = createSkillSchema.parse(req.body);
    const rbacCtx = (req as any).rbacContext as RBACContext;

    // Validate team membership if creating team-scoped skill
    if (input.scope === "TEAM" && input.teamId) {
      if (!rbacCtx.teamIds.includes(input.teamId)) {
        throw ApiError.forbidden("You are not a member of this team");
      }
    }

    const skill = await createSkill(rbacCtx.tenantId, rbacCtx.userId, {
      name: input.name,
      description: input.description,
      content: input.content,
      scope: input.scope as SkillScope,
      teamId: input.teamId,
    });

    // Audit log
    const auditCtx = getAuditContext(req);
    if (auditCtx) {
      await logCreate(auditCtx, "skill", skill.id, skill as unknown as Record<string, unknown>);
    }

    res.status(201).json({ data: skill });
  })
);

/**
 * PUT /api/skills/:id
 * Update an existing skill
 */
skillsRouter.put(
  "/:id",
  requireAccess("skill", "write"),
  rbac({
    resourceType: "skill",
    permission: "update",
    getResourceContext,
  }),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const input = updateSkillSchema.parse(req.body);
    const rbacCtx = (req as any).rbacContext as RBACContext;

    // If changing team, validate membership
    if (input.teamId && !rbacCtx.teamIds.includes(input.teamId)) {
      throw ApiError.forbidden("You are not a member of the target team");
    }

    const { skill, beforeState } = await updateSkill(
      req.params.id,
      rbacCtx.userId,
      input
    );

    // Audit log
    const auditCtx = getAuditContext(req);
    if (auditCtx) {
      await logUpdate(
        auditCtx,
        "skill",
        skill.id,
        beforeState as unknown as Record<string, unknown>,
        skill as unknown as Record<string, unknown>
      );
    }

    res.json({ data: skill });
  })
);

/**
 * DELETE /api/skills/:id
 * Soft delete a skill
 */
skillsRouter.delete(
  "/:id",
  requireAccess("skill", "admin"),
  rbac({
    resourceType: "skill",
    permission: "delete",
    getResourceContext,
  }),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { skill, beforeState } = await deleteSkill(req.params.id);

    // Audit log
    const auditCtx = getAuditContext(req);
    if (auditCtx) {
      await logDelete(
        auditCtx,
        "skill",
        skill.id,
        beforeState as unknown as Record<string, unknown>
      );
    }

    res.json({ success: true, data: skill });
  })
);

/**
 * GET /api/skills/:id/versions
 * List version history for a skill
 */
skillsRouter.get(
  "/:id/versions",
  requireAccess("skill", "read"),
  rbac({
    resourceType: "skill",
    permission: "read",
    getResourceContext,
  }),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const versions = await getSkillVersions(req.params.id);

    res.json({ data: versions });
  })
);
