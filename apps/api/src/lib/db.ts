import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { pino } from 'pino';
import { prisma } from '@oppmon/database';
import type { Prisma } from '@oppmon/database';

export const SYSTEM_TENANT_ID = 'system';

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

// Default to Docker Compose database URL (port 5433)
const DATABASE_URL = process.env.DATABASE_URL || 'postgres://oppmon:oppmon_dev_password@localhost:5433/oppmon';

/**
 * Non-superuser role used inside tenant-scoped transactions so PostgreSQL RLS
 * policies are enforced. Created by the `2026-05-08_rls_and_rbac.sql`
 * migration with NOSUPERUSER + NOBYPASSRLS.
 *
 * Set APP_DB_ROLE='' to disable role-demotion (e.g. when running migrations
 * or smoke scripts that need superuser privileges). Empty string ⇒ skip.
 */
export const APP_DB_ROLE = process.env.APP_DB_ROLE ?? 'oppmon_app';

// Whitelist guard: SET LOCAL role cannot be parameterised, so we only allow
// alphanumeric + underscore role names to prevent injection. Matches the
// names actually used by the migrations (oppmon_app, oppmon).
function assertSafeRoleName(role: string): void {
  if (role && !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(role)) {
    throw new Error(`Invalid APP_DB_ROLE: ${role}`);
  }
}
assertSafeRoleName(APP_DB_ROLE);

// Connection pool configuration
const pool = new Pool({
  connectionString: DATABASE_URL,
  max: parseInt(process.env.DB_POOL_MAX || '20', 10),
  idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT || '30000', 10),
  connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT || '5000', 10),
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
});

// Log pool events
pool.on('connect', () => {
  logger.debug('Database pool: new client connected');
});

pool.on('error', (err) => {
  logger.error({ err }, 'Database pool error');
});

pool.on('remove', () => {
  logger.debug('Database pool: client removed');
});

/**
 * Execute a query with automatic connection handling
 */
export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<QueryResult<T>> {
  const start = Date.now();
  try {
    const result = await pool.query<T>(text, params);
    const duration = Date.now() - start;

    if (duration > 1000) {
      logger.warn({ query: text.slice(0, 100), duration }, 'Slow query detected');
    }

    return result;
  } catch (error) {
    logger.error({ error, query: text.slice(0, 100) }, 'Query error');
    throw error;
  }
}

/**
 * Get a client from the pool for transactions
 */
export async function getClient(): Promise<PoolClient> {
  return pool.connect();
}

/**
 * Execute a transaction
 */
export async function transaction<T>(
  callback: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Run a Prisma transaction with `app.current_tenant` set so RLS policies
 * scope every query to the caller's tenant. Use the SYSTEM_TENANT_ID
 * constant for global-admin operations that need to span tenants.
 *
 * @example
 * const skills = await withTenant(req.user.tenantId, (tx) =>
 *   tx.skill.findMany({ where: { deletedAt: null } })
 * );
 */
export async function withTenant<T>(
  tenantId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  if (!tenantId) {
    throw new Error('withTenant: tenantId is required');
  }
  return prisma.$transaction(async (tx) => {
    // Demote to NOSUPERUSER role so RLS is enforced inside this transaction.
    // SET LOCAL is transaction-scoped — Prisma commits/rolls back at the end
    // and the role reverts. The role name is whitelisted at module load.
    if (APP_DB_ROLE) {
      await tx.$executeRawUnsafe(`SET LOCAL ROLE ${APP_DB_ROLE}`);
    }
    // set_config is parameter-safe; never concatenate tenantId into raw SQL.
    // The third arg (true) makes the setting transaction-local.
    await tx.$executeRaw`SELECT set_config('app.current_tenant', ${tenantId}, true)`;
    return fn(tx);
  });
}

/**
 * Same idea as withTenant but for raw pg pool queries. Holds a single client
 * across the SET + caller queries so the GUC sticks. Caller is responsible
 * for managing transaction boundaries inside the callback if needed.
 */
export async function withTenantPg<T>(
  tenantId: string,
  callback: (client: PoolClient) => Promise<T>,
): Promise<T> {
  if (!tenantId) {
    throw new Error('withTenantPg: tenantId is required');
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (APP_DB_ROLE) {
      // SET LOCAL ROLE auto-reverts on COMMIT/ROLLBACK so the pooled client
      // returns to its original role for the next checkout.
      await client.query(`SET LOCAL ROLE ${APP_DB_ROLE}`);
    }
    await client.query(`SELECT set_config('app.current_tenant', $1, true)`, [tenantId]);
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Health check
 */
export async function healthCheck(): Promise<boolean> {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

/**
 * Graceful shutdown
 */
export async function closePool(): Promise<void> {
  logger.info('Closing database pool...');
  await pool.end();
  logger.info('Database pool closed');
}

// Handle process termination
process.on('SIGTERM', closePool);
process.on('SIGINT', closePool);

export { pool };
