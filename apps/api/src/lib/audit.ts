// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

import { Request } from 'express';
import { withTenantPg } from './db.js';

export interface AuditEntry {
  actorType: 'user' | 'agent' | 'system' | 'cron' | 'service';
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
   * the middleware layer — never trust client input. The audit_log_v2 BEFORE
   * INSERT trigger enforces that this matches app.current_tenant, so
   * mis-scoped writes will raise rather than silently land in the wrong row.
   */
  tenantId?: string;
}

/**
 * Log an audit event into audit_log_v2 (the canonical event-sourced audit
 * store). Fire-and-forget — never throws.
 *
 * audit_log_v2 is append-only: oppmon_app has SELECT+INSERT only. RLS scopes
 * reads to the current tenant; the BEFORE INSERT trigger validates that
 * NEW.tenant_id matches app.current_tenant unless the caller is a 'system'
 * actor.
 *
 * Skips silently when actor_id and tenant_id are both missing (we can record
 * a 'system' event without a tenant, but anything else needs both).
 */
export function logAudit(entry: AuditEntry): void {
  const isSystem = entry.actorType === 'system';
  if (!isSystem && (!entry.actorId || !entry.tenantId)) {
    console.log('[audit] (skipped, no actor/tenant)', entry.action, entry.targetType, entry.targetId);
    return;
  }

  const metadata = {
    ...(entry.metadata ?? {}),
    ...(entry.description ? { description: entry.description } : {}),
  };

  // System events without a tenant write under SYSTEM_TENANT_ID context so RLS
  // and the trigger let them through.
  const ctxTenant = entry.tenantId ?? 'system';
  const persistTenant = entry.tenantId ?? null;

  void withTenantPg(ctxTenant, async (client) => {
    await client.query(
      `INSERT INTO audit_log_v2
         (actor_type, actor_id, action, target_type, target_id,
          description, metadata, old_value, new_value, ip_address, tenant_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb, $10, $11)`,
      [
        entry.actorType,
        entry.actorId ?? null,
        entry.action,
        entry.targetType ?? null,
        entry.targetId ?? null,
        entry.description ?? null,
        JSON.stringify(metadata ?? {}),
        entry.oldValue ? JSON.stringify(entry.oldValue) : null,
        entry.newValue ? JSON.stringify(entry.newValue) : null,
        entry.ipAddress ?? null,
        persistTenant,
      ],
    );
  }).catch((err) => {
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
