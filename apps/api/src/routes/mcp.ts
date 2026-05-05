/**
 * MCP Server Registry API Routes
 *
 * Endpoints:
 * - GET    /api/mcp           - List MCP servers (filtered by scope)
 * - GET    /api/mcp/:id       - Get single MCP server
 * - POST   /api/mcp           - Create MCP server
 * - PUT    /api/mcp/:id       - Update MCP server
 * - DELETE /api/mcp/:id       - Soft delete MCP server
 * - PATCH  /api/mcp/:id/toggle - Toggle enabled status
 */

import { Router, Response } from "express";
import { z } from "zod";
import { prisma } from "@arkon/database";
import { SkillScope } from "@arkon/database";
import { asyncHandler, ApiError } from "../middleware/error-handler.js";
import { AuthenticatedRequest } from "../middleware/request-auth.js";
import { rbac, buildRBACContext, RBACContext } from "../middleware/rbac.js";
import {
  listMcpServers,
  getMcpServer,
  createMcpServer,
  updateMcpServer,
  deleteMcpServer,
  toggleMcpServer,
  McpServerFilter,
} from "../services/mcp.js";
import {
  logCreate,
  logUpdate,
  logDelete,
  getAuditContext,
} from "../services/audit.js";

export const mcpRouter = Router();

// ============================================================================
// Validation Schemas
// ============================================================================

const createMcpServerSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  command: z.string().min(1),
  args: z.array(z.string()).optional(),
  env: z.record(z.string()).optional(),
  version: z.string().optional(),
  scope: z.enum(["TENANT", "TEAM"]),
  teamId: z.string().optional().nullable(),
  enabled: z.boolean().optional(),
});

const updateMcpServerSchema = z.object({
  description: z.string().max(1000).optional(),
  command: z.string().min(1).optional(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string()).optional(),
  version: z.string().optional(),
  scope: z.enum(["TENANT", "TEAM"]).optional(),
  teamId: z.string().optional().nullable(),
  enabled: z.boolean().optional(),
});

const listMcpServersQuerySchema = z.object({
  scope: z.enum(["TENANT", "TEAM"]).optional(),
  search: z.string().optional(),
  enabled: z.coerce.boolean().optional(),
  limit: z.coerce.number().min(1).max(100).optional(),
  offset: z.coerce.number().min(0).optional(),
});

// ============================================================================
// Helper Functions
// ============================================================================

async function getResourceContext(req: AuthenticatedRequest) {
  const mcpId = req.params.id;
  if (!mcpId) return null;

  const mcp = await prisma.mcpServer.findUnique({
    where: { id: mcpId },
    select: { id: true, teamId: true, scope: true, tenantId: true, deletedAt: true },
  });

  if (!mcp || mcp.deletedAt) return null;

  // Verify MCP server belongs to user's tenant
  if (mcp.tenantId !== req.user?.tenantId) return null;

  return {
    resourceType: "mcp_server",
    resourceId: mcp.id,
    teamId: mcp.teamId,
    scope: mcp.scope,
  };
}

// ============================================================================
// Routes
// ============================================================================

/**
 * GET /api/mcp
 * List MCP servers visible to the current user
 */
mcpRouter.get(
  "/",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const query = listMcpServersQuerySchema.parse(req.query);
    const rbacCtx = await buildRBACContext(req);

    if (!rbacCtx) {
      throw ApiError.unauthorized("Authentication required");
    }

    const filter: McpServerFilter = {
      tenantId: rbacCtx.tenantId,
      teamIds: rbacCtx.teamIds,
      scope: query.scope as SkillScope | undefined,
      search: query.search,
      enabled: query.enabled,
    };

    const result = await listMcpServers(filter, {
      limit: query.limit,
      offset: query.offset,
    });

    res.json({
      data: result.servers,
      meta: {
        total: result.total,
        limit: result.limit,
        offset: result.offset,
      },
    });
  })
);

/**
 * GET /api/mcp/:id
 * Get a single MCP server by ID
 */
mcpRouter.get(
  "/:id",
  rbac({
    resourceType: "mcp_server",
    permission: "read",
    getResourceContext,
  }),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const rbacCtx = (req as any).rbacContext as RBACContext;

    const server = await getMcpServer(req.params.id, {
      tenantId: rbacCtx.tenantId,
      teamIds: rbacCtx.teamIds,
    });

    if (!server) {
      throw ApiError.notFound("MCP server not found");
    }

    res.json({ data: server });
  })
);

/**
 * POST /api/mcp
 * Create a new MCP server
 */
mcpRouter.post(
  "/",
  rbac({
    resourceType: "mcp_server",
    permission: "create",
    getResourceContext: async (req) => {
      const body = req.body;
      return {
        resourceType: "mcp_server",
        scope: body.scope as SkillScope,
        teamId: body.teamId,
      };
    },
  }),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const input = createMcpServerSchema.parse(req.body);
    const rbacCtx = (req as any).rbacContext as RBACContext;

    // Validate team membership if creating team-scoped server
    if (input.scope === "TEAM" && input.teamId) {
      if (!rbacCtx.teamIds.includes(input.teamId)) {
        throw ApiError.forbidden("You are not a member of this team");
      }
    }

    const server = await createMcpServer(rbacCtx.tenantId, {
      name: input.name,
      description: input.description,
      command: input.command,
      args: input.args,
      env: input.env,
      version: input.version,
      scope: input.scope as SkillScope,
      teamId: input.teamId,
      enabled: input.enabled,
    });

    // Audit log
    const auditCtx = getAuditContext(req);
    if (auditCtx) {
      await logCreate(auditCtx, "mcp_server", server.id, server as unknown as Record<string, unknown>);
    }

    res.status(201).json({ data: server });
  })
);

/**
 * PUT /api/mcp/:id
 * Update an existing MCP server
 */
mcpRouter.put(
  "/:id",
  rbac({
    resourceType: "mcp_server",
    permission: "update",
    getResourceContext,
  }),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const input = updateMcpServerSchema.parse(req.body);
    const rbacCtx = (req as any).rbacContext as RBACContext;

    // If changing team, validate membership
    if (input.teamId && !rbacCtx.teamIds.includes(input.teamId)) {
      throw ApiError.forbidden("You are not a member of the target team");
    }

    const { server, beforeState } = await updateMcpServer(req.params.id, input);

    // Audit log
    const auditCtx = getAuditContext(req);
    if (auditCtx) {
      await logUpdate(
        auditCtx,
        "mcp_server",
        server.id,
        beforeState as unknown as Record<string, unknown>,
        server as unknown as Record<string, unknown>
      );
    }

    res.json({ data: server });
  })
);

/**
 * DELETE /api/mcp/:id
 * Soft delete an MCP server
 */
mcpRouter.delete(
  "/:id",
  rbac({
    resourceType: "mcp_server",
    permission: "delete",
    getResourceContext,
  }),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { server, beforeState } = await deleteMcpServer(req.params.id);

    // Audit log
    const auditCtx = getAuditContext(req);
    if (auditCtx) {
      await logDelete(
        auditCtx,
        "mcp_server",
        server.id,
        beforeState as unknown as Record<string, unknown>
      );
    }

    res.json({ success: true, data: server });
  })
);

/**
 * PATCH /api/mcp/:id/toggle
 * Toggle MCP server enabled status
 */
mcpRouter.patch(
  "/:id/toggle",
  rbac({
    resourceType: "mcp_server",
    permission: "update",
    getResourceContext,
  }),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { enabled } = z.object({ enabled: z.boolean() }).parse(req.body);

    const server = await toggleMcpServer(req.params.id, enabled);

    res.json({ data: server });
  })
);
