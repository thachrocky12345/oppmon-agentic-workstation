// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

/**
 * Audit Logging Service
 *
 * Provides comprehensive audit logging for all mutations:
 * - CREATE: oldValue is null, newValue is the created object
 * - UPDATE: oldValue is old object, newValue is new object
 * - DELETE: oldValue is deleted object, newValue is null
 * - DENIED: logs failed authorization attempts
 *
 * Writes to audit_log_v2 (event-sourced, append-only, RLS-scoped). The Prisma
 * AuditLog model is being deprecated; do not write to audit_logs anymore.
 */

import { AuthenticatedRequest } from "../middleware/request-auth.js";
import { withTenantPg } from "../lib/db.js";

// ============================================================================
// Types
// ============================================================================

export type AuditActionVerb = "CREATE" | "READ" | "UPDATE" | "DELETE" | "DENIED";

export interface AuditEntry {
  tenantId: string;
  resourceType: string;
  resourceId: string;
  action: AuditActionVerb;
  actorId: string;
  actorType?: "user" | "agent" | "system" | "cron" | "service";
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
 * Log an audit entry into audit_log_v2.
 *
 * Inserts under withTenantPg() so RLS + the audit_log_v2 BEFORE INSERT trigger
 * both verify that NEW.tenant_id matches app.current_tenant. Failures are
 * caught here so audit problems never break the parent operation.
 */
export async function logAudit(entry: AuditEntry): Promise<void> {
  try {
    await withTenantPg(entry.tenantId, async (client) => {
      const merged = {
        ...(entry.metadata ?? {}),
        ...(entry.userAgent ? { userAgent: entry.userAgent } : {}),
      };
      await client.query(
        `INSERT INTO audit_log_v2
           (actor_type, actor_id, action, target_type, target_id,
            description, metadata, old_value, new_value, ip_address, tenant_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb, $10, $11)`,
        [
          entry.actorType ?? "user",
          entry.actorId,
          entry.action,
          entry.resourceType,
          entry.resourceId,
          null,
          JSON.stringify(merged),
          entry.beforeState ? JSON.stringify(entry.beforeState) : null,
          entry.afterState ? JSON.stringify(entry.afterState) : null,
          entry.ipAddress ?? null,
          entry.tenantId,
        ],
      );
    });
  } catch (error) {
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
  action?: AuditActionVerb;
  actorId?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

export interface AuditLogRow {
  id: string;
  tenantId: string | null;
  resourceType: string | null;
  resourceId: string | null;
  action: string;
  actorType: string;
  actorId: string | null;
  beforeState: unknown;
  afterState: unknown;
  ipAddress: string | null;
  metadata: unknown;
  createdAt: Date;
  actor?: { id: string; email: string; name: string } | null;
}

/**
 * Query audit_log_v2 with filters. Runs inside a withTenantPg() transaction so
 * RLS scopes results to the requested tenant.
 */
export async function queryAuditLogs(filter: AuditLogFilter): Promise<{ logs: AuditLogRow[]; total: number }> {
  return withTenantPg(filter.tenantId, async (client) => {
    let where = 'v.tenant_id = $1';
    const params: unknown[] = [filter.tenantId];

    if (filter.resourceType) {
      params.push(filter.resourceType);
      where += ` AND v.target_type = $${params.length}`;
    }
    if (filter.resourceId) {
      params.push(filter.resourceId);
      where += ` AND v.target_id = $${params.length}`;
    }
    if (filter.action) {
      params.push(filter.action);
      where += ` AND v.action = $${params.length}`;
    }
    if (filter.actorId) {
      params.push(filter.actorId);
      where += ` AND v.actor_id = $${params.length}`;
    }
    if (filter.startDate) {
      params.push(filter.startDate);
      where += ` AND v.created_at >= $${params.length}`;
    }
    if (filter.endDate) {
      params.push(filter.endDate);
      where += ` AND v.created_at <= $${params.length}`;
    }

    const countParams = [...params];
    params.push(filter.limit ?? 50);
    const limitIdx = params.length;
    params.push(filter.offset ?? 0);
    const offsetIdx = params.length;

    const rows = await client.query<AuditLogRow>(
      `SELECT
         v.id,
         v.tenant_id   AS "tenantId",
         v.target_type AS "resourceType",
         v.target_id   AS "resourceId",
         v.action,
         v.actor_type  AS "actorType",
         v.actor_id    AS "actorId",
         v.old_value   AS "beforeState",
         v.new_value   AS "afterState",
         v.ip_address  AS "ipAddress",
         v.metadata,
         v.created_at  AS "createdAt",
         CASE WHEN u.id IS NULL THEN NULL ELSE
           jsonb_build_object('id', u.id, 'email', u.email, 'name', u.name)
         END AS actor
       FROM audit_log_v2 v
       LEFT JOIN users u ON u.id = v.actor_id
       WHERE ${where}
       ORDER BY v.created_at DESC
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      params,
    );

    const totalResult = await client.query<{ total: string }>(
      `SELECT COUNT(*)::int AS total FROM audit_log_v2 v WHERE ${where}`,
      countParams,
    );

    return {
      logs: rows.rows,
      total: Number(totalResult.rows[0]?.total ?? 0),
    };
  });
}

/**
 * Get audit log for a specific resource (RLS-scoped).
 */
export async function getResourceAuditLog(
  tenantId: string,
  resourceType: string,
  resourceId: string,
  limit = 50,
): Promise<AuditLogRow[]> {
  const { logs } = await queryAuditLogs({ tenantId, resourceType, resourceId, limit });
  return logs;
}
