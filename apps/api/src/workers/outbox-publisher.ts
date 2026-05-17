// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

/**
 * Outbox publisher.
 *
 * Polls `event_outbox` for unpublished events, hands each to a registered
 * handler keyed by `event_type` (or aggregate_type), and marks them
 * published_at on success. Failures bump attempt_count + last_error and
 * push available_at out by exponential backoff.
 *
 * Concurrency model:
 *   - Single instance per process. Multiple instances are safe because rows
 *     are claimed via `SELECT ... FOR UPDATE SKIP LOCKED`.
 *   - Tick-based; default 2s. Backoff: 30s * 2^attempt, capped at 1h.
 *   - Connection runs as `system` tenant so it sees rows across tenants.
 *
 * Handler contract:
 *   - Idempotent: a handler may be invoked more than once for the same
 *     row (process crash between handler success and DB UPDATE).
 *   - Any throw is caught; row stays unpublished.
 */
import { hostname } from 'node:os';
import { pino } from 'pino';
import { pool, APP_DB_ROLE } from '../lib/db.js';

const logger = pino({ level: process.env.LOG_LEVEL || 'info' }).child({
  worker: 'outbox-publisher',
});

const WORKER_ID = `${hostname()}#${process.pid}`;

// Tunables — env-overridable for ops.
const TICK_INTERVAL_MS = parseInt(process.env.OUTBOX_TICK_MS || '2000', 10);
const BATCH_SIZE = parseInt(process.env.OUTBOX_BATCH || '50', 10);
const MAX_ATTEMPTS = parseInt(process.env.OUTBOX_MAX_ATTEMPTS || '20', 10);

interface OutboxRow {
  id: string;
  tenant_id: string;
  aggregate_type: string;
  aggregate_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  attempt_count: number;
}

export type OutboxHandler = (event: OutboxRow) => Promise<void>;

const handlers = new Map<string, OutboxHandler>();

/**
 * Register a handler for a specific event_type. Last writer wins; intended
 * to be set up once at startup. The wildcard '*' matches every event.
 */
export function registerHandler(eventType: string, handler: OutboxHandler): void {
  handlers.set(eventType, handler);
}

function pickHandler(eventType: string): OutboxHandler | undefined {
  return handlers.get(eventType) ?? handlers.get('*');
}

function nextBackoffSeconds(attempt: number): number {
  // 30s, 60s, 120s, ..., capped at 1h.
  const base = 30 * Math.pow(2, attempt);
  return Math.min(base, 3600);
}

/**
 * Drain one batch. Returns the number of rows processed (regardless of
 * outcome) so the caller can decide to keep ticking or sleep.
 */
async function drainBatch(): Promise<number> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Run as system tenant — drainer is a global infra concern.
    await client.query(`SELECT set_config('app.current_tenant', 'system', true)`);

    // Claim a batch atomically. SKIP LOCKED lets multiple drainers cooperate.
    const claimed = await client.query<OutboxRow>(
      `SELECT id, tenant_id, aggregate_type, aggregate_id, event_type, payload, attempt_count
         FROM event_outbox
        WHERE published_at IS NULL
          AND available_at <= NOW()
        ORDER BY available_at ASC
        LIMIT $1
        FOR UPDATE SKIP LOCKED`,
      [BATCH_SIZE],
    );

    if (claimed.rows.length === 0) {
      await client.query('COMMIT');
      return 0;
    }

    const claimedIds = claimed.rows.map((r) => r.id);
    await client.query(
      `UPDATE event_outbox
          SET locked_at = NOW(), locked_by = $1
        WHERE id = ANY($2)`,
      [WORKER_ID, claimedIds],
    );

    await client.query('COMMIT');

    // Process outside the claim transaction so handlers can take their time
    // without holding row locks. Each row gets its own short transaction
    // for the success/failure update.
    for (const row of claimed.rows) {
      const handler = pickHandler(row.event_type);
      if (!handler) {
        logger.warn({ id: row.id, eventType: row.event_type }, 'no handler registered');
        await markFailed(row, 'no_handler', /* terminal */ true);
        continue;
      }
      try {
        await handler(row);
        await markPublished(row.id);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error({ id: row.id, eventType: row.event_type, err: msg }, 'handler failed');
        await markFailed(row, msg, false);
      }
    }

    return claimed.rows.length;
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error({ err }, 'drainBatch failed');
    return 0;
  } finally {
    client.release();
  }
}

async function markPublished(id: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`SELECT set_config('app.current_tenant', 'system', true)`);
    await client.query(
      `UPDATE event_outbox
          SET published_at = NOW(),
              locked_at = NULL,
              locked_by = NULL,
              last_error = NULL
        WHERE id = $1`,
      [id],
    );
  } finally {
    client.release();
  }
}

async function markFailed(row: OutboxRow, error: string, terminal: boolean): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`SELECT set_config('app.current_tenant', 'system', true)`);
    const nextAttempt = row.attempt_count + 1;
    const giveUp = terminal || nextAttempt >= MAX_ATTEMPTS;
    await client.query(
      `UPDATE event_outbox
          SET attempt_count = $2,
              last_error    = $3,
              available_at  = NOW() + ($4 || ' seconds')::interval,
              locked_at     = NULL,
              locked_by     = NULL,
              published_at  = CASE WHEN $5 THEN NOW() ELSE NULL END
        WHERE id = $1`,
      [
        row.id,
        nextAttempt,
        error.slice(0, 1000),
        giveUp ? '0' : String(nextBackoffSeconds(nextAttempt)),
        // If terminal, we mark published to drain it; ops can grep last_error
        // to inspect the dead-letters. A separate dead-letter table would be
        // cleaner but is overkill until we have data.
        giveUp,
      ],
    );
  } finally {
    client.release();
  }
}

let interval: NodeJS.Timeout | null = null;
let running = false;

/**
 * Start the publisher loop. Idempotent.
 */
export function startOutboxPublisher(): void {
  if (interval) return;
  logger.info({ workerId: WORKER_ID, tickMs: TICK_INTERVAL_MS, batch: BATCH_SIZE }, 'starting outbox publisher');

  interval = setInterval(async () => {
    if (running) return; // Skip if previous tick still draining.
    running = true;
    try {
      // Drain until empty, then yield. Keeps latency low under bursts.
      let processed = 0;
      do {
        processed = await drainBatch();
      } while (processed === BATCH_SIZE);
    } finally {
      running = false;
    }
  }, TICK_INTERVAL_MS);

  // Allow the process to exit even if the interval is pending.
  if (interval.unref) interval.unref();
}

export function stopOutboxPublisher(): void {
  if (interval) {
    clearInterval(interval);
    interval = null;
  }
}

// Defensive: don't leak the role demotion choice — drainer always uses
// the connection's default role. Touching APP_DB_ROLE keeps the import
// from getting tree-shaken even if a future refactor needs the role.
void APP_DB_ROLE;
