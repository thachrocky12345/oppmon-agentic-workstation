// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

/**
 * Database Migration Runner
 *
 * Executes SQL migrations in order. Tracks applied migrations in a migrations table.
 * Usage: npx tsx scripts/run-migrations.ts
 */

import { Pool } from 'pg';
import { readdir, readFile } from 'fs/promises';
import { join } from 'path';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://oppmon:oppmon_dev_password@localhost:5433/oppmon',
});

async function ensureMigrationsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMP DEFAULT NOW()
    )
  `);
}

async function getAppliedMigrations(): Promise<Set<string>> {
  const result = await pool.query('SELECT name FROM _migrations');
  return new Set(result.rows.map((r) => r.name));
}

async function applyMigration(name: string, sql: string) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('INSERT INTO _migrations (name) VALUES ($1)', [name]);
    await client.query('COMMIT');
    console.log(`✓ Applied: ${name}`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function main() {
  console.log('Running database migrations...\n');

  await ensureMigrationsTable();
  const applied = await getAppliedMigrations();

  const migrationsDir = join(process.cwd(), 'migrations');
  let files: string[];

  try {
    files = await readdir(migrationsDir);
  } catch (error) {
    console.log('No migrations directory found. Creating...');
    console.log('Add .sql files to the migrations/ directory to run migrations.');
    await pool.end();
    return;
  }

  const sqlFiles = files
    .filter((f) => f.endsWith('.sql') && !f.startsWith('_'))
    .sort();

  let appliedCount = 0;
  for (const file of sqlFiles) {
    if (applied.has(file)) {
      continue;
    }

    const sql = await readFile(join(migrationsDir, file), 'utf-8');
    await applyMigration(file, sql);
    appliedCount++;
  }

  if (appliedCount === 0) {
    console.log('No new migrations to apply.');
  } else {
    console.log(`\n✓ Applied ${appliedCount} migration(s).`);
  }

  await pool.end();
}

main().catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
