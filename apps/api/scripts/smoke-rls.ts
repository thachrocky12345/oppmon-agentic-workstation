/**
 * RLS smoke test
 *
 * Connects to Postgres as the non-superuser app role (`oppmon_app`) and
 * verifies that Row-Level Security correctly scopes reads/writes by the
 * `app.current_tenant` GUC.
 *
 * Exit code 0 = all assertions pass. Non-zero = mismatch — do NOT promote
 * the build past this gate.
 *
 * Required env:
 *   - APP_DATABASE_URL  postgres URL using the oppmon_app role (NOSUPERUSER,
 *                       NOBYPASSRLS). Falls back to a sane default for local
 *                       docker-compose if unset.
 *
 * Pre-conditions: the migration `2026-05-08_rls_and_rbac.sql` has been
 * applied AND the seed script has been run (so there's at least one
 * non-system tenant with rows).
 */

import { Pool, PoolClient } from 'pg';

const APP_DATABASE_URL =
  process.env.APP_DATABASE_URL ||
  'postgres://oppmon_app:oppmon_app_password@localhost:5433/oppmon';

// Tables we'll spot-check. Skills is the canonical example from the plan.
const SCOPED_TABLE = 'skills';

interface AssertionResult {
  name: string;
  ok: boolean;
  detail?: string;
}

async function withClient<T>(pool: Pool, fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

async function setTenant(client: PoolClient, tenantId: string): Promise<void> {
  await client.query(`SELECT set_config('app.current_tenant', $1, false)`, [tenantId]);
}

async function resetTenant(client: PoolClient): Promise<void> {
  await client.query(`SELECT set_config('app.current_tenant', '', false)`);
}

async function countRows(client: PoolClient, table: string): Promise<number> {
  const r = await client.query(`SELECT COUNT(*)::int AS c FROM ${table}`);
  return r.rows[0]?.c ?? 0;
}

async function main(): Promise<void> {
  const pool = new Pool({ connectionString: APP_DATABASE_URL });
  const results: AssertionResult[] = [];

  try {
    // Discover a real tenant id with rows in SCOPED_TABLE. We need 'system'
    // context to bypass RLS for this introspection step.
    const tenantId = await withClient(pool, async (client) => {
      await setTenant(client, 'system');
      const r = await client.query(
        `SELECT tenant_id FROM ${SCOPED_TABLE} WHERE tenant_id <> 'system' LIMIT 1`,
      );
      return r.rows[0]?.tenant_id as string | undefined;
    });

    if (!tenantId) {
      console.warn(
        `[smoke-rls] No non-system rows in ${SCOPED_TABLE}; running shape-only checks.`,
      );
    }

    // 1. With matching tenant context, count > 0 (when seed data exists).
    if (tenantId) {
      await withClient(pool, async (client) => {
        await setTenant(client, tenantId);
        const c = await countRows(client, SCOPED_TABLE);
        results.push({
          name: `tenant context returns scoped rows (${SCOPED_TABLE}, ${tenantId})`,
          ok: c > 0,
          detail: `count=${c}`,
        });
      });
    }

    // 2. With NO tenant context, RLS should hide rows (count == 0).
    await withClient(pool, async (client) => {
      await resetTenant(client);
      const c = await countRows(client, SCOPED_TABLE);
      results.push({
        name: `unset tenant context hides rows (${SCOPED_TABLE})`,
        ok: c === 0,
        detail: `count=${c}`,
      });
    });

    // 3. With 'system' tenant context, RLS bypasses scoping.
    await withClient(pool, async (client) => {
      await setTenant(client, 'system');
      const c = await countRows(client, SCOPED_TABLE);
      results.push({
        name: `system tenant context bypasses RLS (${SCOPED_TABLE})`,
        ok: c >= (tenantId ? 1 : 0),
        detail: `count=${c}`,
      });
    });

    // 4. Cross-tenant: setting a fake tenant id should return 0 rows.
    await withClient(pool, async (client) => {
      await setTenant(client, 'tenant_does_not_exist_xyz');
      const c = await countRows(client, SCOPED_TABLE);
      results.push({
        name: `unknown tenant context returns 0 rows`,
        ok: c === 0,
        detail: `count=${c}`,
      });
    });

    // 5. audit_log_v2 trigger: insert without app.current_tenant must raise.
    //    audit_log_v2 is the canonical event-sourced audit store (audit_logs is
    //    deprecated; see 2026-05-10_audit_consolidation.sql).
    await withClient(pool, async (client) => {
      await resetTenant(client);
      let raised = false;
      try {
        await client.query(
          `INSERT INTO audit_log_v2 (id, actor_type, actor_id, action, target_type, target_id, tenant_id, created_at)
           VALUES ('aud_smoke_test', 'user', $2, 'READ', 'smoke', 'x', $1, NOW())`,
          [tenantId ?? 'tenant_x', 'user_x'],
        );
      } catch (e) {
        raised = true;
      }
      results.push({
        name: `audit_log_v2 trigger blocks inserts without tenant context`,
        ok: raised,
        detail: raised ? 'raised as expected' : 'NO ERROR — trigger missing!',
      });
    });
  } finally {
    await pool.end();
  }

  // Report.
  let failed = 0;
  for (const r of results) {
    const icon = r.ok ? '✓' : '✗';
    console.log(`${icon} ${r.name}${r.detail ? ` — ${r.detail}` : ''}`);
    if (!r.ok) failed++;
  }
  console.log('');
  if (failed > 0) {
    console.error(`[smoke-rls] FAILED: ${failed}/${results.length} assertions did not pass.`);
    process.exit(1);
  }
  console.log(`[smoke-rls] OK: all ${results.length} assertions passed.`);
}

main().catch((err) => {
  console.error('[smoke-rls] unexpected error:', err);
  process.exit(1);
});
