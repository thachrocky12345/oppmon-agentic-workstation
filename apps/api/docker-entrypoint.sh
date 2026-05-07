#!/bin/sh
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

cd /app/apps/api
exec pnpm exec tsx src/index.ts
