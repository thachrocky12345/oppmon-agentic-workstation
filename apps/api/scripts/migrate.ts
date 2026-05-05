/**
 * Database Migration Runner
 *
 * Runs SQL migrations in order from the migrations folder.
 * Tracks applied migrations in a schema_migrations table.
 *
 * Cross-platform: Works on Windows, Mac, and Linux.
 */

import { readdir, readFile } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { Pool } from 'pg';
import { config } from 'dotenv';

// ESM-compatible __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from apps/api directory
config({ path: join(__dirname, '..', '.env') });

// Default to Docker Compose database URL
const DATABASE_URL = process.env.DATABASE_URL || 'postgres://arkon:arkon_dev_password@localhost:5433/arkon';

const pool = new Pool({
  connectionString: DATABASE_URL,
});

async function ensureMigrationTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(255) PRIMARY KEY,
      applied_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

async function getAppliedMigrations(): Promise<Set<string>> {
  const result = await pool.query('SELECT version FROM schema_migrations ORDER BY version');
  return new Set(result.rows.map((row) => row.version));
}

async function applyMigration(version: string, sql: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [version]);
    await client.query('COMMIT');
    console.log(`✓ Applied migration: ${version}`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function main(): Promise<void> {
  const migrationsDir = join(__dirname, 'migrations');

  console.log('Running database migrations...');
  console.log(`Migrations directory: ${migrationsDir}`);
  console.log(`Database: ${DATABASE_URL.replace(/:[^:@]+@/, ':****@')}`);

  await ensureMigrationTable();
  const applied = await getAppliedMigrations();

  // Read all migration files
  const files = await readdir(migrationsDir);
  const migrations = files
    .filter((f) => f.endsWith('.sql') && !f.startsWith('_'))
    .sort();

  let appliedCount = 0;

  for (const file of migrations) {
    const version = file.replace('.sql', '');

    if (applied.has(version)) {
      console.log(`  Skipping (already applied): ${version}`);
      continue;
    }

    const sql = await readFile(join(migrationsDir, file), 'utf-8');
    await applyMigration(version, sql);
    appliedCount++;
  }

  if (appliedCount === 0) {
    console.log('No new migrations to apply.');
  } else {
    console.log(`\nApplied ${appliedCount} migration(s).`);
  }

  await pool.end();
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
