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

/**
 * Log an audit event. Fire-and-forget — never throws.
 * Writes to audit_log_v2 (Phase 3 event-sourcing table).
 */
export function logAudit(entry: AuditEntry): void {
  query(
    `INSERT INTO audit_log_v2
     (actor_type, actor_id, action, target_type, target_id, description, metadata, old_value, new_value, ip_address, tenant_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      entry.actorType,
      entry.actorId ?? null,
      entry.action,
      entry.targetType ?? null,
      entry.targetId ?? null,
      entry.description ?? null,
      JSON.stringify(entry.metadata ?? {}),
      entry.oldValue ? JSON.stringify(entry.oldValue) : null,
      entry.newValue ? JSON.stringify(entry.newValue) : null,
      entry.ipAddress ?? null,
      entry.tenantId ?? null,
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
