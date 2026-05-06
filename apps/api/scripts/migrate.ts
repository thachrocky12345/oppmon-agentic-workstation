/**
 * Migration Runner
 *
 * Runs all pending SQL migrations in order.
 * Tracks applied migrations in a `_migrations` table.
 *
 * Usage:
 *   pnpm --filter @oppmon/api migrate
 *
 * Options:
 *   --dry-run    Show what would be run without executing
 *   --force      Re-run all migrations (dangerous!)
 */

import { readdir, readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, 'migrations');

// Parse command line arguments
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const FORCE = args.includes('--force');

// Database connection
const DATABASE_URL = process.env.DATABASE_URL || 'postgres://oppmon:oppmon_dev_password@localhost:5433/oppmon';

interface Migration {
  name: string;
  sql: string;
}

interface AppliedMigration {
  name: string;
  applied_at: Date;
}

async function getClient(): Promise<pg.Client> {
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  return client;
}

async function ensureMigrationsTable(client: pg.Client): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);
}

async function getAppliedMigrations(client: pg.Client): Promise<Set<string>> {
  const result = await client.query<AppliedMigration>('SELECT name FROM _migrations ORDER BY name');
  return new Set(result.rows.map(r => r.name));
}

async function loadMigrations(): Promise<Migration[]> {
  const files = await readdir(MIGRATIONS_DIR);
  const sqlFiles = files
    .filter(f => f.endsWith('.sql'))
    .sort(); // Sort by filename (timestamp prefix ensures order)

  const migrations: Migration[] = [];

  for (const file of sqlFiles) {
    const sql = await readFile(join(MIGRATIONS_DIR, file), 'utf-8');
    migrations.push({
      name: file.replace('.sql', ''),
      sql,
    });
  }

  return migrations;
}

async function applyMigration(client: pg.Client, migration: Migration): Promise<void> {
  console.log(`  Applying: ${migration.name}`);

  if (DRY_RUN) {
    console.log('    [DRY RUN] Would execute:');
    console.log(migration.sql.split('\n').map(l => `      ${l}`).join('\n'));
    return;
  }

  await client.query('BEGIN');
  try {
    await client.query(migration.sql);
    await client.query('INSERT INTO _migrations (name) VALUES ($1)', [migration.name]);
    await client.query('COMMIT');
    console.log(`    Applied successfully`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function main(): Promise<void> {
  console.log('='.repeat(60));
  console.log('Arkon Migration Runner');
  console.log('='.repeat(60));
  console.log(`Database: ${DATABASE_URL.replace(/:[^:@]+@/, ':****@')}`);
  if (DRY_RUN) console.log('Mode: DRY RUN (no changes will be made)');
  if (FORCE) console.log('Mode: FORCE (re-running all migrations)');
  console.log();

  const client = await getClient();

  try {
    // Ensure migrations table exists
    await ensureMigrationsTable(client);

    // Get applied migrations
    const applied = FORCE ? new Set<string>() : await getAppliedMigrations(client);
    console.log(`Applied migrations: ${applied.size}`);

    // Load all migrations
    const migrations = await loadMigrations();
    console.log(`Total migrations: ${migrations.length}`);
    console.log();

    // Find pending migrations
    const pending = migrations.filter(m => !applied.has(m.name));

    if (pending.length === 0) {
      console.log('No pending migrations.');
      return;
    }

    console.log(`Pending migrations: ${pending.length}`);
    console.log();

    // Apply pending migrations
    for (const migration of pending) {
      await applyMigration(client, migration);
    }

    console.log();
    console.log('='.repeat(60));
    console.log(DRY_RUN ? 'Dry run complete.' : 'All migrations applied successfully!');
    console.log('='.repeat(60));

  } finally {
    await client.end();
  }
}

main().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
