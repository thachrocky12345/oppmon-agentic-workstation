import { query } from './db.js';
import { Request } from 'express';

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

const cuid = () => 'aud_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

/**
 * Log an audit event. Fire-and-forget — never throws.
 * Writes to audit_logs (the Prisma-managed table). Skips silently when the
 * NOT-NULL actor_id or tenant_id are missing (system-level events without a
 * user are not persisted; in-process logs only).
 */
export function logAudit(entry: AuditEntry): void {
  // audit_logs.actor_id and tenant_id are NOT NULL with FKs to users/tenants.
  // Without both, we can't write a valid row — log to console and bail.
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

  query(
    `INSERT INTO audit_logs
     (id, tenant_id, resource_type, resource_id, action, actor_id, before_state, after_state, ip_address, metadata, created_at)
     VALUES ($1, $2, $3, $4, $5::"AuditAction", $6, $7, $8, $9, $10, NOW())`,
    [
      cuid(),
      entry.tenantId,
      entry.targetType ?? 'unknown',
      entry.targetId ?? 'unknown',
      toAuditAction(entry.action),
      entry.actorId,
      entry.oldValue ? JSON.stringify(entry.oldValue) : null,
      entry.newValue ? JSON.stringify(entry.newValue) : null,
      entry.ipAddress ?? null,
      JSON.stringify(metadata),
    ],
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
