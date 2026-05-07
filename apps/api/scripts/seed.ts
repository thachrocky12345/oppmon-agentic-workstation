/**
 * Database Seeder
 *
 * Creates initial dev/test data:
 *   - The System Tenant (id='system') used by SYSTEM_ADMIN users.
 *   - A default tenant + admin user (TENANT_ADMIN) for local login.
 *   - One TokenVersion row per seeded user (required by event-driven
 *     revocation — JWTs embed `tv` and the auth middleware compares).
 *   - Sample agents and 30 days of synthetic daily_stats.
 *
 * Idempotent — every INSERT uses ON CONFLICT DO NOTHING so re-running won't
 * duplicate rows. Safe to run after the multi-tenant migration; the SQL
 * companion (`migrations/2026-05-08_rls_and_rbac.sql`) also seeds the System
 * Tenant on its own, but having it here keeps `pnpm db:seed` self-sufficient.
 *
 * Usage: npx tsx scripts/seed.ts
 */

import { Pool } from 'pg';
import bcrypt from 'bcryptjs';
import { createId } from '@paralleldrive/cuid2';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://oppmon:oppmon_dev_password@localhost:5433/oppmon',
});

async function seed() {
  console.log('Seeding database...\n');

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // System Tenant — required for SYSTEM_ADMIN users to bypass tenant scoping
    // via RLS (app.current_tenant = 'system').
    await client.query(
      `INSERT INTO tenants (id, name, slug, is_active, created_at, updated_at)
       VALUES ('system', 'System', '__system__', true, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
    );
    console.log('✓ System tenant ensured');

    // Default tenant for local development.
    let tenantId: string;
    const existingTenant = await client.query(
      "SELECT id FROM tenants WHERE slug = 'default'",
    );
    if (existingTenant.rows.length > 0) {
      tenantId = existingTenant.rows[0].id;
    } else {
      tenantId = createId();
      await client.query(
        `INSERT INTO tenants (id, name, slug, is_active, created_at, updated_at)
         VALUES ($1, 'Default Tenant', 'default', true, NOW(), NOW())`,
        [tenantId],
      );
    }
    console.log(`✓ Default tenant: ${tenantId}`);

    // Admin user — TENANT_ADMIN role on the default tenant.
    const passwordHash = await bcrypt.hash('admin123', 10);
    let adminUserId: string;
    const existingUser = await client.query(
      `SELECT id FROM users WHERE email = 'admin@arkon.dev'`,
    );
    if (existingUser.rows.length > 0) {
      adminUserId = existingUser.rows[0].id;
      console.log('✓ Admin user already exists');
    } else {
      adminUserId = createId();
      await client.query(
        `INSERT INTO users (id, email, password_hash, name, role, tenant_id, is_active, created_at, updated_at)
         VALUES ($1, 'admin@arkon.dev', $2, 'Admin User', 'TENANT_ADMIN', $3, true, NOW(), NOW())`,
        [adminUserId, passwordHash, tenantId],
      );
      console.log('✓ Admin user created: admin@arkon.dev (password: admin123)');
    }

    // Token version row — required for the auth middleware's `tv` check.
    await client.query(
      `INSERT INTO token_versions (user_id, version, updated_at)
       VALUES ($1, 1, NOW())
       ON CONFLICT (user_id) DO NOTHING`,
      [adminUserId],
    );
    console.log('✓ Token version seeded for admin user');

    // Sample agents — agents.framework is the AgentFramework enum and
    // agents.status defaults to PENDING. Use ACTIVE for visible defaults.
    const sampleAgents: Array<{ name: string; framework: string }> = [
      { name: 'Claude Assistant', framework: 'ANTHROPIC' },
      { name: 'Code Reviewer', framework: 'OPENAI' },
      { name: 'Security Scanner', framework: 'LANGCHAIN' },
    ];
    for (const a of sampleAgents) {
      await client.query(
        `INSERT INTO agents (id, name, framework, status, tenant_id, config, created_at, updated_at)
         VALUES ($1, $2, $3::"AgentFramework", 'ACTIVE'::"AgentStatus", $4, '{}'::jsonb, NOW(), NOW())
         ON CONFLICT (tenant_id, name) DO NOTHING`,
        [createId(), a.name, a.framework, tenantId],
      );
    }
    console.log('✓ Sample agents created');

    // 30 days of synthetic daily_stats per agent.
    const agents = await client.query(
      'SELECT id FROM agents WHERE tenant_id = $1',
      [tenantId],
    );

    for (const agent of agents.rows) {
      for (let d = 0; d < 30; d++) {
        const day = new Date();
        day.setDate(day.getDate() - d);
        const dayStr = day.toISOString().split('T')[0];

        await client.query(
          `INSERT INTO daily_stats
            (id, agent_id, tenant_id, day, messages_received, messages_sent, tool_calls, errors, input_tokens, output_tokens, estimated_cost_usd, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
           ON CONFLICT (agent_id, day) DO NOTHING`,
          [
            createId(),
            agent.id,
            tenantId,
            dayStr,
            Math.floor(Math.random() * 100) + 10,
            Math.floor(Math.random() * 80) + 5,
            Math.floor(Math.random() * 50),
            Math.floor(Math.random() * 5),
            Math.floor(Math.random() * 25000) + 500,
            Math.floor(Math.random() * 25000) + 500,
            (Math.random() * 2 + 0.1).toFixed(6),
          ],
        );
      }
    }
    console.log('✓ Sample daily stats created');

    await client.query('COMMIT');
    console.log('\n✓ Seed completed successfully!');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  await pool.end();
}

seed().catch((error) => {
  console.error('Seed failed:', error);
  process.exit(1);
});
