import { Request } from 'express';
import { withTenant } from './db.js';
import type { Prisma } from '@oppmon/database';

export interface AuditEntry {
  actorType: 'user' | 'agent' | 'system' | 'cron';
  actorId?: string;
  action: string;
  targetType?: string;
  targetId?: string;
  description?: string;
  metadata?: Record<string, unknown>;
  oldValue?: Record<string, unknown>;
  newValue?: Record<string, unknown>;
  ipAddress?: string;
  /**
   * Tenant ID for the audit row. SHOULD always come from req.user.tenantId at
   * the middleware layer — never trust client input. The new audit_logs
   * BEFORE INSERT trigger enforces that this matches app.current_tenant, so
   * mis-scoped writes will raise rather than silently land in the wrong row.
   */
  tenantId?: string;
}

// Map a free-form action string ("workflow.create", "skill.delete", ...) to
// the AuditAction enum the audit_logs schema requires.
function toAuditAction(action: string): 'CREATE' | 'READ' | 'UPDATE' | 'DELETE' | 'DENIED' {
  const verb = action.toLowerCase().split('.').pop() ?? '';
  if (verb.startsWith('create') || verb === 'register' || verb === 'add')   return 'CREATE';
  if (verb.startsWith('delete') || verb === 'remove' || verb === 'destroy') return 'DELETE';
  if (verb.startsWith('update') || verb === 'edit'   || verb === 'patch')   return 'UPDATE';
  if (verb === 'denied' || verb === 'deny' || verb === 'forbidden')         return 'DENIED';
  return 'READ';
}

/**
 * Log an audit event. Fire-and-forget — never throws.
 *
 * Writes via withTenant() so the audit_logs row is inserted inside a
 * transaction with `app.current_tenant` set. RLS + the BEFORE INSERT trigger
 * both verify that the persisted tenant_id matches the session context — the
 * caller can't accidentally (or maliciously) write to another tenant's audit.
 *
 * Skips silently when actor_id or tenant_id are missing (the columns are
 * NOT NULL with FKs to users/tenants).
 */
export function logAudit(entry: AuditEntry): void {
  if (!entry.actorId || !entry.tenantId) {
    console.log('[audit] (skipped, no actor/tenant)', entry.action, entry.targetType, entry.targetId);
    return;
  }

  const metadata = {
    ...(entry.metadata ?? {}),
    ...(entry.actorType ? { actorType: entry.actorType } : {}),
    ...(entry.description ? { description: entry.description } : {}),
    ...(entry.action !== toAuditAction(entry.action) ? { rawAction: entry.action } : {}),
  };

  // Capture into locals so the closure doesn't reference mutable entry.
  const tenantId = entry.tenantId;
  const data = {
    tenantId,
    resourceType: entry.targetType ?? 'unknown',
    resourceId: entry.targetId ?? 'unknown',
    action: toAuditAction(entry.action),
    actorId: entry.actorId,
    beforeState: (entry.oldValue ?? null) as Prisma.InputJsonValue | null,
    afterState: (entry.newValue ?? null) as Prisma.InputJsonValue | null,
    ipAddress: entry.ipAddress ?? null,
    metadata: metadata as Prisma.InputJsonValue,
  };

  withTenant(tenantId, (tx) =>
    tx.auditLog.create({ data: data as Prisma.AuditLogUncheckedCreateInput }),
  ).catch((err) => {
    console.error('[audit] Failed to log audit event:', err);
  });
}

/**
 * Extract client IP from request headers (respects X-Forwarded-For behind proxy).
 */
export function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0]?.trim() ?? 'unknown';
  }
  if (Array.isArray(forwarded)) {
    return forwarded[0]?.split(',')[0]?.trim() ?? 'unknown';
  }
  return req.headers['x-real-ip'] as string ?? req.socket.remoteAddress ?? 'unknown';
}
