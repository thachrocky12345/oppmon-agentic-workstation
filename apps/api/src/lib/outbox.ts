/**
 * Transactional outbox helper.
 *
 * Use inside the same transaction as your domain write so the event row
 * lands atomically with the state change. A separate worker drains the
 * `event_outbox` table.
 *
 * Two flavours:
 *   - enqueue(tx, event)        — Prisma transaction (preferred)
 *   - enqueuePg(client, event)  — raw pg PoolClient (when you're already
 *                                 inside withTenantPg)
 *
 * Both expect `app.current_tenant` to be set on the connection so the row
 * passes RLS. The dedicated `tenant_id` column on `event_outbox` is checked
 * against that GUC by the policy.
 */
import type { PoolClient } from 'pg';
import { createId } from '@paralleldrive/cuid2';
import type { Prisma } from '@oppmon/database';

export interface OutboxEvent {
  tenantId: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: Record<string, unknown>;
}

/**
 * Enqueue an outbox event via Prisma. Caller must already be inside a
 * tenant-scoped Prisma transaction (e.g. withTenant()).
 */
export async function enqueue(
  tx: Prisma.TransactionClient,
  event: OutboxEvent,
): Promise<string> {
  const id = createId();
  await tx.$executeRaw`
    INSERT INTO event_outbox
      (id, tenant_id, aggregate_type, aggregate_id, event_type, payload)
    VALUES
      (${id}, ${event.tenantId}, ${event.aggregateType}, ${event.aggregateId},
       ${event.eventType}, ${JSON.stringify(event.payload)}::jsonb)
  `;
  return id;
}

/**
 * Enqueue an outbox event via a raw pg client. Use when you're already
 * inside a withTenantPg() block and don't want to mix Prisma in.
 */
export async function enqueuePg(
  client: PoolClient,
  event: OutboxEvent,
): Promise<string> {
  const id = createId();
  await client.query(
    `INSERT INTO event_outbox
       (id, tenant_id, aggregate_type, aggregate_id, event_type, payload)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [
      id,
      event.tenantId,
      event.aggregateType,
      event.aggregateId,
      event.eventType,
      JSON.stringify(event.payload),
    ],
  );
  return id;
}
