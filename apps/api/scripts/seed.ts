/**
 * Database Seeder
 *
 * Creates initial data for development/testing.
 * Usage: npx tsx scripts/seed.ts
 */

import { Pool } from 'pg';
import bcrypt from 'bcryptjs';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://arkon:arkon_dev_password@localhost:5433/arkon',
});

async function seed() {
  console.log('Seeding database...\n');

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Create default tenant
    const tenantResult = await client.query(`
      INSERT INTO tenants (name, domain, plan, settings)
      VALUES ('Default Tenant', 'localhost', 'pro', '{}')
      ON CONFLICT (domain) DO NOTHING
      RETURNING id
    `);

    let tenantId = tenantResult.rows[0]?.id;
    if (!tenantId) {
      const existing = await client.query("SELECT id FROM tenants WHERE domain = 'localhost'");
      tenantId = existing.rows[0].id;
    }
    console.log(`✓ Tenant: ${tenantId}`);

    // Create admin user
    const passwordHash = await bcrypt.hash('admin123', 10);
    const userResult = await client.query(`
      INSERT INTO users (email, password_hash, name, role, tenant_id)
      VALUES ('admin@arkon.dev', $1, 'Admin User', 'admin', $2)
      ON CONFLICT (email) DO NOTHING
      RETURNING id
    `, [passwordHash, tenantId]);

    if (userResult.rows[0]?.id) {
      console.log(`✓ Admin user created: admin@arkon.dev (password: admin123)`);
    } else {
      console.log(`✓ Admin user already exists`);
    }

    // Create sample agents
    const agentNames = ['Claude Assistant', 'Code Reviewer', 'Security Scanner'];
    const frameworks = ['anthropic', 'openai', 'langchain'];

    for (let i = 0; i < agentNames.length; i++) {
      await client.query(`
        INSERT INTO agents (name, framework, status, tenant_id, metadata)
        VALUES ($1, $2, 'active', $3, '{}')
        ON CONFLICT DO NOTHING
      `, [agentNames[i], frameworks[i], tenantId]);
    }
    console.log(`✓ Sample agents created`);

    // Create sample daily stats for the last 30 days
    const agents = await client.query('SELECT id FROM agents WHERE tenant_id = $1', [tenantId]);

    for (const agent of agents.rows) {
      for (let d = 0; d < 30; d++) {
        const day = new Date();
        day.setDate(day.getDate() - d);
        const dayStr = day.toISOString().split('T')[0];

        await client.query(`
          INSERT INTO daily_stats (agent_id, tenant_id, day, messages_received, messages_sent, tool_calls, errors, estimated_tokens, estimated_cost_usd)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          ON CONFLICT (agent_id, day) DO NOTHING
        `, [
          agent.id,
          tenantId,
          dayStr,
          Math.floor(Math.random() * 100) + 10,
          Math.floor(Math.random() * 80) + 5,
          Math.floor(Math.random() * 50),
          Math.floor(Math.random() * 5),
          Math.floor(Math.random() * 50000) + 1000,
          Math.random() * 2 + 0.1,
        ]);
      }
    }
    console.log(`✓ Sample daily stats created`);

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
