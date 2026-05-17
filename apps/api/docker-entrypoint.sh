#!/bin/sh
# Copyright (c) 2024 Oppmon. All rights reserved.
# SPDX-License-Identifier: MIT

set -e

# Gated, one-shot schema sync. Set DB_AUTO_PUSH=true once after a deploy,
# then remove it so normal restarts don't re-sync the schema.
if [ "$DB_AUTO_PUSH" = "true" ]; then
  echo "[entrypoint] DB_AUTO_PUSH=true -> prisma db push --accept-data-loss"
  cd /app/packages/database
  pnpm exec prisma db push --accept-data-loss
  echo "[entrypoint] schema sync done"

  # Apply pgvector columns + indexes that Prisma cannot represent.
  # Idempotent: uses IF NOT EXISTS so safe to re-run.
  echo "[entrypoint] applying pgvector columns"
  cd /app/apps/api
  node --input-type=module -e "
    import pkg from 'pg';
    const { Client } = pkg;
    const c = new Client({ connectionString: process.env.DATABASE_URL });
    await c.connect();
    const stmts = [
      \"CREATE EXTENSION IF NOT EXISTS vector\",
      \"ALTER TABLE embeddings ADD COLUMN IF NOT EXISTS embedding vector(1536)\",
      \"CREATE INDEX IF NOT EXISTS embeddings_embedding_idx ON embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)\",
      \"ALTER TABLE rag_chunks ADD COLUMN IF NOT EXISTS embedding vector(1536)\",
      \"CREATE INDEX IF NOT EXISTS rag_chunks_embedding_idx ON rag_chunks USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64)\",
    ];
    for (const s of stmts) {
      try { await c.query(s); console.log('  OK ' + s.slice(0, 70)); }
      catch (e) { console.log('  ERR ' + s.slice(0, 70) + ' -> ' + e.message); }
    }
    await c.end();
  "
  echo "[entrypoint] pgvector columns done"
fi

# Gated, idempotent schema patch for legacy raw-SQL migrations that the
# migrate.ts runner can't apply (duplicate prefixes + conflicts with Prisma).
# Set DB_APPLY_PATCH=true once after staging a new patch file, then flip back.
if [ "$DB_APPLY_PATCH" = "true" ]; then
  PATCH=/app/apps/api/scripts/2026-05-07_pending_schema_patch.sql
  if [ -f "$PATCH" ]; then
    echo "[entrypoint] applying $PATCH"
    cd /app/apps/api
    node --input-type=module -e "
      import pkg from 'pg';
      import { readFileSync } from 'fs';
      const { Client } = pkg;
      const c = new Client({ connectionString: process.env.DATABASE_URL });
      await c.connect();
      const sql = readFileSync('$PATCH', 'utf-8');
      try { await c.query(sql); console.log('  PATCH OK'); }
      catch (e) { console.log('  PATCH ERR: ' + e.message + (e.position ? ' @ ' + e.position : '')); }
      await c.end();
    "
    echo "[entrypoint] patch done"
  else
    echo "[entrypoint] DB_APPLY_PATCH=true but $PATCH not found"
  fi
fi

cd /app/apps/api
exec pnpm exec tsx src/index.ts
