// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

/**
 * Idempotency middleware.
 *
 * Wire this onto mutating routes (POST/PATCH/DELETE) that you want safe to
 * retry. Clients send `Idempotency-Key: <opaque>` and get the original
 * response back on retry, even if the upstream call timed out.
 *
 * Storage: `idempotency_keys` table, scoped by tenant_id + key.
 *
 * Behavior:
 *   - No header     → pass through (caller did not opt-in).
 *   - Header + new  → reserve row, run handler, stamp response, return it.
 *   - Header + dupe → if request_hash matches → replay; else 409.
 *   - Header + in-flight (no completed_at yet) → 409 to discourage parallel
 *     identical calls; clients should poll or wait.
 *
 * Hash is SHA-256 of canonical(method + path + sorted body). Header values
 * (e.g. content-type) are intentionally excluded so reverse-proxy drift
 * doesn't break retries.
 */
import { Response, NextFunction } from 'express';
import { createHash } from 'node:crypto';
import { withTenantPg } from '../lib/db.js';
import { AuthenticatedRequest } from './request-auth.js';

const IDEMPOTENT_METHODS = new Set(['POST', 'PATCH', 'DELETE']);

function canonicalize(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  const keys = Object.keys(value as Record<string, unknown>).sort();
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${canonicalize((value as Record<string, unknown>)[k])}`)
    .join(',')}}`;
}

function hashRequest(method: string, path: string, body: unknown): string {
  const canonical = `${method.toUpperCase()} ${path} ${canonicalize(body ?? null)}`;
  return createHash('sha256').update(canonical).digest('hex');
}

interface StoredResponse {
  request_hash: string;
  response_status: number | null;
  response_body: unknown;
  completed_at: string | null;
}

export async function idempotency(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (!IDEMPOTENT_METHODS.has(req.method)) {
    next();
    return;
  }
  const key = req.header('idempotency-key');
  if (!key) {
    next();
    return;
  }
  if (!req.user?.tenantId) {
    // Unauthenticated requests can't be tenant-scoped; let auth middleware
    // reject. We don't try to be clever for anonymous mutations.
    next();
    return;
  }

  const tenantId = req.user.tenantId;
  const requestHash = hashRequest(req.method, req.originalUrl || req.url, req.body);

  try {
    const existing = await withTenantPg(tenantId, async (client) => {
      const { rows } = await client.query<StoredResponse>(
        `SELECT request_hash, response_status, response_body, completed_at
           FROM idempotency_keys
          WHERE tenant_id = $1 AND idempotency_key = $2
            AND expires_at > NOW()`,
        [tenantId, key],
      );
      return rows[0] ?? null;
    });

    if (existing) {
      if (existing.request_hash !== requestHash) {
        res.status(409).json({
          error: 'Idempotency-Key reuse with different request body',
          message:
            'This Idempotency-Key was already used for a different request. Generate a new key for new requests.',
        });
        return;
      }
      if (existing.completed_at === null) {
        // Same request still in flight from another connection.
        res.status(409).json({
          error: 'Idempotency-Key request in progress',
          message: 'A previous request with this Idempotency-Key is still being processed.',
        });
        return;
      }
      // Replay.
      res
        .status(existing.response_status ?? 200)
        .setHeader('Idempotency-Replay', 'true')
        .json(existing.response_body);
      return;
    }

    // Reserve row up-front. ON CONFLICT covers the race where two requests
    // with the same key race to insert; the loser will read the winner's
    // row on its next iteration but here we just bail and 409 — clients
    // shouldn't fan out the same key.
    const reserved = await withTenantPg(tenantId, async (client) => {
      const r = await client.query(
        `INSERT INTO idempotency_keys
           (tenant_id, idempotency_key, request_hash, request_method, request_path)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (tenant_id, idempotency_key) DO NOTHING
         RETURNING tenant_id`,
        [tenantId, key, requestHash, req.method, req.originalUrl || req.url],
      );
      return r.rowCount && r.rowCount > 0;
    });

    if (!reserved) {
      res.status(409).json({
        error: 'Idempotency-Key conflict',
        message: 'Concurrent request with the same Idempotency-Key. Retry after the first completes.',
      });
      return;
    }

    // Wrap res.json so we can capture the response body to stamp.
    const originalJson = res.json.bind(res);
    let captured = false;
    res.json = (body: unknown) => {
      captured = true;
      // Fire-and-forget the stamp; failure to stamp shouldn't block the
      // response. A row that's left without completed_at will block
      // subsequent retries with 409 until it expires (24h).
      withTenantPg(tenantId, async (client) => {
        await client.query(
          `UPDATE idempotency_keys
              SET response_status = $3,
                  response_body   = $4::jsonb,
                  completed_at    = NOW()
            WHERE tenant_id = $1 AND idempotency_key = $2`,
          [tenantId, key, res.statusCode, JSON.stringify(body ?? null)],
        );
      }).catch(() => {
        /* swallow — see comment above */
      });
      return originalJson(body);
    };

    // Make sure we don't leave a half-written row if the handler errors
    // without ever calling res.json (e.g. throws into the error handler
    // which sends a string). On 'finish' if we never captured, delete.
    res.on('finish', () => {
      if (captured) return;
      withTenantPg(tenantId, async (client) => {
        await client.query(
          `DELETE FROM idempotency_keys
            WHERE tenant_id = $1 AND idempotency_key = $2 AND completed_at IS NULL`,
          [tenantId, key],
        );
      }).catch(() => {
        /* swallow */
      });
    });

    next();
  } catch (err) {
    // If the idempotency layer itself fails, don't block the request —
    // log and pass through. The downside is we lose replay protection on
    // this one call.
    next(err);
  }
}
