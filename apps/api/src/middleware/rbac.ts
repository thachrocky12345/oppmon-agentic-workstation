/**
 * Role-Based Access Control (RBAC) Middleware
 *
 * Implements a hierarchical permission system:
 * - TENANT_ADMIN: Full access to all resources in tenant
 * - TEAM_ADMIN: Full access to team resources, read on tenant-scoped
 * - MEMBER: Read-only access to accessible resources
 */

import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "./request-auth.js";
import { prisma } from "@oppmon/database";
import { Role, TeamRole, SkillScope } from "@oppmon/database";
import { logDenied, getAuditContext } from "../services/audit.js";

// ============================================================================
// Types
// ============================================================================

export type Permission = "create" | "read" | "update" | "delete";

export interface RBACContext {
  userId: string;
  tenantId: string;
  role: Role;
  teamIds: string[];
  teamRoles: Map<string, TeamRole>;
}

export interface ResourceContext {
  resourceType: string;
  resourceId?: string;
  teamId?: string | null;
  scope?: SkillScope;
}

export interface RBACResult {
  allowed: boolean;
  reason?: string;
}

// ============================================================================
// Role Hierarchy
// ============================================================================

const ROLE_HIERARCHY: Record<Role, number> = {
  // SYSTEM_ADMIN is only valid for users belonging to the System Tenant.
  // The `requireRole`/`requireSystemTenant` helpers enforce that constraint.
  SYSTEM_ADMIN: 4,
  TENANT_ADMIN: 3,
  TEAM_ADMIN: 2,
  MEMBER: 1,
};

/**
 * Check if role A is >= role B in hierarchy
 */
export function isRoleAtLeast(userRole: Role, requiredRole: Role): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole];
}

// ============================================================================
// Permission Matrix
// ============================================================================

const PERMISSION_MATRIX: Record<
  Role,
  Record<Permission, (ctx: RBACContext, resource: ResourceContext) => boolean>
> = {
  // System Tenant users get blanket access at the RBAC layer; tenant scoping
  // is handled at the RLS layer via app.current_tenant = 'system'.
  SYSTEM_ADMIN: {
    create: () => true,
    read: () => true,
    update: () => true,
    delete: () => true,
  },
  TENANT_ADMIN: {
    create: () => true,
    read: () => true,
    update: () => true,
    delete: () => true,
  },
  TEAM_ADMIN: {
    create: (ctx, resource) => {
      // Can create if tenant-scoped (becomes tenant-scoped) or in own team
      if (resource.scope === "TENANT") return false; // Only tenant_admin can create tenant-scoped
      if (!resource.teamId) return true; // Creating new resource, will be assigned to a team
      return ctx.teamIds.includes(resource.teamId);
    },
    read: (ctx, resource) => {
      // Can read tenant-scoped or own team resources
      if (resource.scope === "TENANT") return true;
      if (!resource.teamId) return true;
      return ctx.teamIds.includes(resource.teamId);
    },
    update: (ctx, resource) => {
      // Can update only own team resources (not tenant-scoped unless team_admin)
      if (resource.scope === "TENANT") return false;
      if (!resource.teamId) return false;
      return ctx.teamIds.includes(resource.teamId);
    },
    delete: (ctx, resource) => {
      // Same as update
      if (resource.scope === "TENANT") return false;
      if (!resource.teamId) return false;
      return ctx.teamIds.includes(resource.teamId);
    },
  },
  MEMBER: {
    create: () => false,
    read: (ctx, resource) => {
      // Can read tenant-scoped or own team resources
      if (resource.scope === "TENANT") return true;
      if (!resource.teamId) return false;
      return ctx.teamIds.includes(resource.teamId);
    },
    update: () => false,
    delete: () => false,
  },
};

// ============================================================================
// RBAC Functions
// ============================================================================

/**
 * Get user's team memberships
 */
export async function getUserTeams(
  userId: string
): Promise<{ teamId: string; role: TeamRole }[]> {
  const memberships = await prisma.teamMember.findMany({
    where: { userId },
    select: { teamId: true, role: true },
  });
  return memberships;
}

/**
 * Build RBAC context from authenticated request
 */
export async function buildRBACContext(
  req: AuthenticatedRequest
): Promise<RBACContext | null> {
  if (!req.user) return null;

  const teams = await getUserTeams(req.user.id);
  const teamRoles = new Map<string, TeamRole>();
  teams.forEach((t) => teamRoles.set(t.teamId, t.role));

  return {
    userId: req.user.id,
    tenantId: req.user.tenantId,
    role: req.user.role as Role,
    teamIds: teams.map((t) => t.teamId),
    teamRoles,
  };
}

/**
 * Check if user has permission for a resource
 */
export function checkPermission(
  ctx: RBACContext,
  permission: Permission,
  resource: ResourceContext
): RBACResult {
  const permissionFn = PERMISSION_MATRIX[ctx.role][permission];
  const allowed = permissionFn(ctx, resource);

  if (!allowed) {
    return {
      allowed: false,
      reason: `Role ${ctx.role} cannot ${permission} ${resource.resourceType}${
        resource.scope ? ` with scope ${resource.scope}` : ""
      }${resource.teamId ? ` in team ${resource.teamId}` : ""}`,
    };
  }

  return { allowed: true };
}

/**
 * Check if user is a member of a specific team
 */
export function isTeamMember(ctx: RBACContext, teamId: string): boolean {
  return ctx.teamIds.includes(teamId);
}

/**
 * Check if user is an admin of a specific team
 */
export function isTeamAdmin(ctx: RBACContext, teamId: string): boolean {
  return ctx.teamRoles.get(teamId) === "ADMIN";
}

// ============================================================================
// Middleware Factory
// ============================================================================

export interface RBACOptions {
  resourceType: string;
  permission: Permission;
  getResourceContext?: (
    req: AuthenticatedRequest
  ) => Promise<ResourceContext | null>;
}

/**
 * RBAC middleware factory
 *
 * @example
 * // Require create permission for skills
 * router.post('/skills', requestAuth, rbac({
 *   resourceType: 'skill',
 *   permission: 'create',
 * }), createSkillHandler);
 *
 * @example
 * // Require update permission for a specific skill
 * router.put('/skills/:id', requestAuth, rbac({
 *   resourceType: 'skill',
 *   permission: 'update',
 *   getResourceContext: async (req) => {
 *     const skill = await prisma.skill.findUnique({ where: { id: req.params.id }});
 *     return skill ? { resourceType: 'skill', resourceId: skill.id, teamId: skill.teamId, scope: skill.scope } : null;
 *   },
 * }), updateSkillHandler);
 */
export function rbac(options: RBACOptions) {
  return async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      // Build RBAC context
      const ctx = await buildRBACContext(req);
      if (!ctx) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      // Get resource context
      let resource: ResourceContext = {
        resourceType: options.resourceType,
      };

      if (options.getResourceContext) {
        const resourceCtx = await options.getResourceContext(req);
        if (resourceCtx === null) {
          res.status(404).json({ error: "Resource not found" });
          return;
        }
        resource = resourceCtx;
      }

      // Check permission
      const result = checkPermission(ctx, options.permission, resource);

      if (!result.allowed) {
        // Log denied access
        console.warn(
          `[RBAC] Access denied: user=${ctx.userId} action=${options.permission} resource=${options.resourceType} reason=${result.reason}`
        );

        // Log to audit trail
        const auditCtx = getAuditContext(req);
        if (auditCtx) {
          await logDenied(auditCtx, options.resourceType, resource.resourceId || "unknown", {
            permission: options.permission,
            reason: result.reason,
            scope: resource.scope,
            teamId: resource.teamId,
          });
        }

        res.status(403).json({
          error: "Forbidden",
          message: result.reason,
        });
        return;
      }

      // Attach RBAC context to request for use in handlers
      (req as any).rbacContext = ctx;

      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Simple role check middleware (no resource context needed).
 *
 * Extra invariant: SYSTEM_ADMIN is only honored when `req.user.isSystem` is
 * true (i.e. the user belongs to the System Tenant). A SYSTEM_ADMIN role on
 * a non-system user is treated as a misconfiguration and rejected.
 */
export function requireRole(...allowedRoles: Role[]) {
  return async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const userRole = req.user.role as Role;
    if (!allowedRoles.includes(userRole)) {
      res.status(403).json({
        error: "Forbidden",
        message: `Role ${userRole} is not allowed. Required: ${allowedRoles.join(" or ")}`,
      });
      return;
    }

    if (userRole === "SYSTEM_ADMIN" && !req.user.isSystem) {
      res.status(403).json({
        error: "Forbidden",
        message: "SYSTEM_ADMIN role requires System Tenant membership",
      });
      return;
    }

    next();
  };
}

/**
 * Gate routes to System Tenant users only. Use in combination with
 * `requireRole('SYSTEM_ADMIN')` for global-admin endpoints.
 */
export function requireSystemTenant() {
  return (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): void => {
    if (!req.user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    if (!req.user.isSystem) {
      res.status(403).json({
        error: "Forbidden",
        message: "System Tenant membership required",
      });
      return;
    }
    next();
  };
}

/**
 * Require at least a certain role level in hierarchy
 */
export function requireRoleLevel(minimumRole: Role) {
  return async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const userRole = req.user.role as Role;
    if (!isRoleAtLeast(userRole, minimumRole)) {
      res.status(403).json({
        error: "Forbidden",
        message: `Role ${userRole} is insufficient. Required: ${minimumRole} or higher`,
      });
      return;
    }

    next();
  };
}
