/**
 * Audit Logging Service
 *
 * Provides comprehensive audit logging for all mutations:
 * - CREATE: before_state is null, after_state is the created object
 * - UPDATE: before_state is old object, after_state is new object
 * - DELETE: before_state is deleted object, after_state is null
 * - DENIED: logs failed authorization attempts
 *
 * Audit logs are append-only and should never be updated or deleted.
 */

import { Prisma } from "@oppmon/database";
import type { AuditAction } from "@oppmon/database";
import { AuthenticatedRequest } from "../middleware/request-auth.js";
import { withTenant } from "../lib/db.js";

// ============================================================================
// Types
// ============================================================================

export interface AuditEntry {
  tenantId: string;
  resourceType: string;
  resourceId: string;
  action: AuditAction;
  actorId: string;
  beforeState?: Record<string, unknown> | null;
  afterState?: Record<string, unknown> | null;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

export interface AuditContext {
  tenantId: string;
  actorId: string;
  ipAddress?: string;
  userAgent?: string;
}

// ============================================================================
// Audit Service
// ============================================================================

/**
 * Log an audit entry.
 *
 * Inserts via withTenant() so RLS + the audit_logs BEFORE INSERT trigger both
 * verify that `tenantId` on the row matches `app.current_tenant`. Any caller
 * passing a tenantId that doesn't match its session context will get an
 * exception (caught here so audit failures never break the parent operation).
 */
export async function logAudit(entry: AuditEntry): Promise<void> {
  try {
    await withTenant(entry.tenantId, (tx) =>
      tx.auditLog.create({
        data: {
          tenantId: entry.tenantId,
          resourceType: entry.resourceType,
          resourceId: entry.resourceId,
          action: entry.action,
          actorId: entry.actorId,
          beforeState: entry.beforeState as Prisma.InputJsonValue | undefined,
          afterState: entry.afterState as Prisma.InputJsonValue | undefined,
          ipAddress: entry.ipAddress,
          userAgent: entry.userAgent,
          metadata: entry.metadata as Prisma.InputJsonValue | undefined,
        },
      }),
    );
  } catch (error) {
    // Log to console but don't fail the operation
    console.error("[Audit] Failed to write audit log:", error);
  }
}

/**
 * Log a CREATE action
 */
export async function logCreate(
  ctx: AuditContext,
  resourceType: string,
  resourceId: string,
  afterState: Record<string, unknown>
): Promise<void> {
  await logAudit({
    tenantId: ctx.tenantId,
    resourceType,
    resourceId,
    action: "CREATE",
    actorId: ctx.actorId,
    beforeState: null,
    afterState,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });
}

/**
 * Log an UPDATE action
 */
export async function logUpdate(
  ctx: AuditContext,
  resourceType: string,
  resourceId: string,
  beforeState: Record<string, unknown>,
  afterState: Record<string, unknown>
): Promise<void> {
  await logAudit({
    tenantId: ctx.tenantId,
    resourceType,
    resourceId,
    action: "UPDATE",
    actorId: ctx.actorId,
    beforeState,
    afterState,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });
}

/**
 * Log a DELETE action (soft delete)
 */
export async function logDelete(
  ctx: AuditContext,
  resourceType: string,
  resourceId: string,
  beforeState: Record<string, unknown>
): Promise<void> {
  await logAudit({
    tenantId: ctx.tenantId,
    resourceType,
    resourceId,
    action: "DELETE",
    actorId: ctx.actorId,
    beforeState,
    afterState: null,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });
}

/**
 * Log a DENIED access attempt
 */
export async function logDenied(
  ctx: AuditContext,
  resourceType: string,
  resourceId: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  await logAudit({
    tenantId: ctx.tenantId,
    resourceType,
    resourceId,
    action: "DENIED",
    actorId: ctx.actorId,
    beforeState: null,
    afterState: null,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
    metadata,
  });
}

/**
 * Extract audit context from request
 */
export function getAuditContext(req: AuthenticatedRequest): AuditContext | null {
  if (!req.user) return null;

  return {
    tenantId: req.user.tenantId,
    actorId: req.user.id,
    ipAddress: getClientIP(req),
    userAgent: req.headers["user-agent"],
  };
}

/**
 * Get client IP address from request
 */
function getClientIP(req: AuthenticatedRequest): string | undefined {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") {
    return forwarded.split(",")[0].trim();
  }
  return req.socket?.remoteAddress;
}

// ============================================================================
// Query Functions
// ============================================================================

export interface AuditLogFilter {
  tenantId: string;
  resourceType?: string;
  resourceId?: string;
  action?: AuditAction;
  actorId?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

/**
 * Query audit logs with filters. Runs inside a withTenant() transaction so
 * RLS scopes results to the requested tenant when the caller is the
 * non-superuser app role.
 */
export async function queryAuditLogs(filter: AuditLogFilter) {
  const where: Record<string, unknown> = {
    tenantId: filter.tenantId,
  };

  if (filter.resourceType) where.resourceType = filter.resourceType;
  if (filter.resourceId) where.resourceId = filter.resourceId;
  if (filter.action) where.action = filter.action;
  if (filter.actorId) where.actorId = filter.actorId;

  if (filter.startDate || filter.endDate) {
    where.createdAt = {};
    if (filter.startDate) (where.createdAt as Record<string, unknown>).gte = filter.startDate;
    if (filter.endDate) (where.createdAt as Record<string, unknown>).lte = filter.endDate;
  }

  return withTenant(filter.tenantId, async (tx) => {
    const [logs, total] = await Promise.all([
      tx.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: filter.limit ?? 50,
        skip: filter.offset ?? 0,
        include: {
          actor: {
            select: { id: true, email: true, name: true },
          },
        },
      }),
      tx.auditLog.count({ where }),
    ]);
    return { logs, total };
  });
}

/**
 * Get audit log for a specific resource (RLS-scoped).
 */
export async function getResourceAuditLog(
  tenantId: string,
  resourceType: string,
  resourceId: string,
  limit = 50
) {
  return withTenant(tenantId, (tx) =>
    tx.auditLog.findMany({
      where: {
        tenantId,
        resourceType,
        resourceId,
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        actor: {
          select: { id: true, email: true, name: true },
        },
      },
    }),
  );
}
