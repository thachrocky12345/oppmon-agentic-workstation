/**
 * Migration Runner
 *
 * Runs all pending SQL migrations in order.
 * Tracks applied migrations in a `_migrations` table with full metadata:
 * checksum (drift detection), duration_ms (perf tracking),
 * status ('applied' | 'failed' | 'rolled_back'), error_message, executed_by.
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
import { createHash } from 'crypto';
import { hostname, userInfo } from 'os';
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
  checksum: string;
}

interface AppliedMigration {
  name: string;
  applied_at: Date;
  checksum: string | null;
  status: string;
}

function sha256(s: string): string {
  return createHash('sha256').update(s, 'utf-8').digest('hex');
}

function executor(): string {
  try {
    return `${userInfo().username}@${hostname()}`;
  } catch {
    return 'unknown';
  }
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
      applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      checksum     TEXT,
      duration_ms  INTEGER,
      status       TEXT NOT NULL DEFAULT 'applied',
      error_message TEXT,
      executed_by  TEXT
    )
  `);
  // Defensive ALTERs — older databases with the bare-bones table need these
  // columns added before we can INSERT them. Idempotent.
  await client.query(`
    ALTER TABLE _migrations
      ADD COLUMN IF NOT EXISTS checksum     TEXT,
      ADD COLUMN IF NOT EXISTS duration_ms  INTEGER,
      ADD COLUMN IF NOT EXISTS status       TEXT NOT NULL DEFAULT 'applied',
      ADD COLUMN IF NOT EXISTS error_message TEXT,
      ADD COLUMN IF NOT EXISTS executed_by  TEXT
  `);
}

async function getAppliedMigrations(client: pg.Client): Promise<Map<string, AppliedMigration>> {
  const result = await client.query<AppliedMigration>(
    'SELECT name, applied_at, checksum, status FROM _migrations ORDER BY name',
  );
  const map = new Map<string, AppliedMigration>();
  for (const row of result.rows) {
    map.set(row.name, row);
  }
  return map;
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
      checksum: sha256(sql),
    });
  }

  return migrations;
}

/**
 * Strip SQL line comments (-- ...) and block comments so we can scan the
 * actual statements for transaction-incompatible directives. Cheap, not
 * a full SQL parser — good enough to spot CREATE INDEX CONCURRENTLY when
 * an author writes it in plain SQL.
 */
function stripSqlComments(sql: string): string {
  // Remove block comments first (greedy across newlines), then line comments.
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/--[^\n]*/g, '');
}

/**
 * Some Postgres statements (notably ``CREATE INDEX CONCURRENTLY``,
 * ``REINDEX CONCURRENTLY``, ``VACUUM``) cannot run inside a transaction
 * block. If a migration file contains any of them, we must skip the
 * BEGIN/COMMIT wrapper and rely on the file's own idempotency
 * (``IF NOT EXISTS``) for crash safety.
 */
function needsAutocommit(sql: string): boolean {
  const stripped = stripSqlComments(sql);
  return /\bCONCURRENTLY\b/i.test(stripped) || /\bVACUUM\b/i.test(stripped);
}

/**
 * Naive top-level statement splitter for autocommit migrations.
 * Postgres's simple-query protocol implicitly wraps a multi-statement
 * string in a transaction (which defeats the whole point of autocommit
 * mode), so we have to issue each statement as its own ``client.query``.
 *
 * The splitter respects:
 *   - single-quoted string literals  (``'...''...'``)
 *   - dollar-quoted strings          (``$$ ... $$``, ``$tag$ ... $tag$``)
 *   - line comments                  (``-- ...``)
 *   - block comments                 (``/* ... *\/``)
 *
 * It's intentionally simple — sufficient for the DDL we write in
 * migrations, but NOT a general-purpose SQL parser. If a migration
 * needs constructs this can't handle, split it into smaller files.
 */
function splitStatements(sql: string): string[] {
  const out: string[] = [];
  let buf = '';
  let i = 0;
  const n = sql.length;
  while (i < n) {
    const c = sql[i];
    const c2 = sql[i + 1];
    // Line comment
    if (c === '-' && c2 === '-') {
      const nl = sql.indexOf('\n', i);
      const end = nl === -1 ? n : nl;
      buf += sql.slice(i, end);
      i = end;
      continue;
    }
    // Block comment
    if (c === '/' && c2 === '*') {
      const end = sql.indexOf('*/', i + 2);
      const stop = end === -1 ? n : end + 2;
      buf += sql.slice(i, stop);
      i = stop;
      continue;
    }
    // Single-quoted string (with '' escape handling).
    if (c === "'") {
      buf += c;
      i++;
      while (i < n) {
        if (sql[i] === "'") {
          if (sql[i + 1] === "'") {
            buf += "''";
            i += 2;
            continue;
          }
          buf += "'";
          i++;
          break;
        }
        buf += sql[i];
        i++;
      }
      continue;
    }
    // Dollar-quoted string: $tag$ ... $tag$
    if (c === '$') {
      const tagMatch = sql.slice(i).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/);
      if (tagMatch) {
        const tag = tagMatch[0];
        const end = sql.indexOf(tag, i + tag.length);
        const stop = end === -1 ? n : end + tag.length;
        buf += sql.slice(i, stop);
        i = stop;
        continue;
      }
    }
    if (c === ';') {
      const stmt = buf.trim();
      if (stmt) out.push(stmt);
      buf = '';
      i++;
      continue;
    }
    buf += c;
    i++;
  }
  const tail = buf.trim();
  if (tail) out.push(tail);
  return out;
}

async function applyMigration(client: pg.Client, migration: Migration): Promise<void> {
  console.log(`  Applying: ${migration.name}`);

  if (DRY_RUN) {
    console.log('    [DRY RUN] Would execute:');
    console.log(migration.sql.split('\n').map(l => `      ${l}`).join('\n'));
    return;
  }

  const autocommit = needsAutocommit(migration.sql);
  if (autocommit) {
    console.log(
      '    (autocommit mode — file contains CONCURRENTLY/VACUUM, ' +
        'transaction wrapper skipped; relies on IF NOT EXISTS for re-run safety)',
    );
  }

  const start = Date.now();
  if (!autocommit) await client.query('BEGIN');
  try {
    if (autocommit) {
      // pg's simple-query protocol wraps a multi-statement string in an
      // implicit transaction. Splitting into individual statements is
      // the only way to keep ``CREATE INDEX CONCURRENTLY`` out of one.
      const statements = splitStatements(migration.sql);
      for (const stmt of statements) {
        await client.query(stmt);
      }
    } else {
      await client.query(migration.sql);
    }
    const durationMs = Date.now() - start;
    // Bookkeeping insert. In transaction mode it lives in the same txn
    // as the migration body; in autocommit mode it's a standalone write
    // after the body has already committed statement-by-statement.
    await client.query(
      `INSERT INTO _migrations (name, checksum, duration_ms, status, executed_by)
       VALUES ($1, $2, $3, 'applied', $4)
       ON CONFLICT (name) DO UPDATE SET
         applied_at    = NOW(),
         checksum      = EXCLUDED.checksum,
         duration_ms   = EXCLUDED.duration_ms,
         status        = 'applied',
         error_message = NULL,
         executed_by   = EXCLUDED.executed_by`,
      [migration.name, migration.checksum, durationMs, executor()],
    );
    if (!autocommit) await client.query('COMMIT');
    console.log(`    Applied successfully (${durationMs}ms)`);
  } catch (error) {
    if (!autocommit) {
      await client.query('ROLLBACK');
    }
    // Record the failure outside the rolled-back transaction (or as a
    // standalone insert in autocommit mode) so operators can see what
    // blew up.
    const errMsg = error instanceof Error ? error.message : String(error);
    try {
      await client.query(
        `INSERT INTO _migrations (name, checksum, duration_ms, status, error_message, executed_by)
         VALUES ($1, $2, $3, 'failed', $4, $5)
         ON CONFLICT (name) DO UPDATE SET
           applied_at    = NOW(),
           checksum      = EXCLUDED.checksum,
           duration_ms   = EXCLUDED.duration_ms,
           status        = 'failed',
           error_message = EXCLUDED.error_message,
           executed_by   = EXCLUDED.executed_by`,
        [migration.name, migration.checksum, Date.now() - start, errMsg, executor()],
      );
    } catch {
      // Failure-recording is best-effort; the original error matters more.
    }
    throw error;
  }
}

async function checkChecksumDrift(
  applied: Map<string, AppliedMigration>,
  migrations: Migration[],
): Promise<void> {
  const drifts: Array<{ name: string; storedChecksum: string | null; currentChecksum: string }> = [];
  for (const m of migrations) {
    const a = applied.get(m.name);
    if (!a || a.status !== 'applied') continue;
    if (a.checksum && a.checksum !== m.checksum) {
      drifts.push({ name: m.name, storedChecksum: a.checksum, currentChecksum: m.checksum });
    }
  }
  if (drifts.length > 0) {
    console.warn('');
    console.warn('  ⚠️  Checksum drift detected for already-applied migrations:');
    for (const d of drifts) {
      console.warn(`    - ${d.name}`);
      console.warn(`        stored:  ${d.storedChecksum}`);
      console.warn(`        current: ${d.currentChecksum}`);
    }
    console.warn('  These files were edited after being applied. Review before continuing.');
    console.warn('');
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
    // Ensure migrations table exists with full metadata schema.
    await ensureMigrationsTable(client);

    // Get applied migrations (with metadata).
    const appliedMap = FORCE ? new Map<string, AppliedMigration>() : await getAppliedMigrations(client);
    console.log(`Applied migrations: ${appliedMap.size}`);

    // Load all migrations
    const migrations = await loadMigrations();
    console.log(`Total migrations: ${migrations.length}`);

    // Drift check (warn-only, never blocks).
    if (!FORCE) {
      await checkChecksumDrift(appliedMap, migrations);
    }

    console.log();

    // Find pending migrations (those without an 'applied' record).
    const pending = migrations.filter((m) => {
      const a = appliedMap.get(m.name);
      return !a || a.status !== 'applied';
    });

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
