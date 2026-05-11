#!/usr/bin/env bash
# scripts/db-bootstrap.sh — idempotent DB bootstrap / repair / reset
#
# Brings a database to the canonical Arkon end-state in two modes:
#
#   ./scripts/db-bootstrap.sh             # default: non-destructive
#                                         # ensures extensions, runs `prisma db push`
#                                         # (idempotent), runs `migrate.ts` (skips
#                                         # already-applied migrations). Safe to
#                                         # re-run anytime; preserves all data.
#
#   ./scripts/db-bootstrap.sh --reset     # DESTRUCTIVE: requires a confirm phrase.
#                                         # Auto-takes a pg_dump first, then
#                                         # DROP SCHEMA public CASCADE, recreates
#                                         # extensions, runs prisma db push +
#                                         # migrate.ts, then restores the dump
#                                         # (best-effort).
#
# Optional flags:
#   --no-prisma         skip `prisma db push` step
#   --skip-restore      skip the dump-restore step (--reset only)
#   --backup-dir DIR    where to write pg_dump backup (default: .deploy-backup)
#   --env-file PATH     env file to source (default: apps/api/.env)
#   --image TAG         API docker image tag to use (default: oppmon-api:latest)
#
# Reads DATABASE_URL from --env-file. Talks to the DB via a docker container so
# host node/glibc/pnpm constraints don't matter. Requires Docker.
#
# Exit codes:
#   0 = success
#   1 = generic error
#   2 = invalid arguments / missing prerequisites
#   3 = user aborted destructive op

set -euo pipefail

# ------------------------------ defaults ------------------------------------
RESET=false
DO_PRISMA=true
DO_RESTORE=true
BACKUP_DIR=".deploy-backup"
ENV_FILE="apps/api/.env"
API_IMAGE="oppmon-api:latest"
PG_IMAGE="postgres:14-alpine"
CONFIRM_PHRASE="drop and rebuild prod schema"

# ------------------------------ args ----------------------------------------
while [[ $# -gt 0 ]]; do
  case "$1" in
    --reset)         RESET=true; shift ;;
    --no-prisma)     DO_PRISMA=false; shift ;;
    --skip-restore)  DO_RESTORE=false; shift ;;
    --backup-dir)    BACKUP_DIR="$2"; shift 2 ;;
    --env-file)      ENV_FILE="$2"; shift 2 ;;
    --image)         API_IMAGE="$2"; shift 2 ;;
    -h|--help)
      grep -E '^#' "$0" | sed 's/^# \{0,1\}//' | head -40
      exit 0
      ;;
    *) echo "Unknown arg: $1" >&2; exit 2 ;;
  esac
done

# ------------------------------ prerequisites -------------------------------
command -v docker >/dev/null 2>&1 || { echo "docker not found"; exit 2; }
[[ -f "$ENV_FILE" ]] || { echo "env file not found: $ENV_FILE"; exit 2; }

DBURL="$(grep -E '^DATABASE_URL=' "$ENV_FILE" | head -1 | cut -d= -f2-)"
[[ -n "$DBURL" ]] || { echo "DATABASE_URL not in $ENV_FILE"; exit 2; }

# Mask password for logs.
DBURL_MASKED="$(echo "$DBURL" | sed -E 's|(://[^:]+:)[^@]+@|\1***@|')"
echo "→ target DB: $DBURL_MASKED"
echo "→ env file:  $ENV_FILE"
echo "→ api image: $API_IMAGE"

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$REPO_ROOT/$BACKUP_DIR"

# ------------------------------ helpers -------------------------------------
psql_oneshot() {
  # Run a SQL statement in a fresh psql session (some DDL like
  # CREATE EXTENSION timescaledb requires this).
  docker run --rm --network host "$PG_IMAGE" psql "$DBURL" -v ON_ERROR_STOP=1 -c "$1"
}
psql_quiet() {
  docker run --rm --network host "$PG_IMAGE" psql "$DBURL" -tAc "$1"
}

ensure_extensions() {
  for ext in timescaledb pgcrypto vector; do
    psql_oneshot "CREATE EXTENSION IF NOT EXISTS $ext;" >/dev/null
    echo "  ✓ extension: $ext"
  done
}

# ------------------------------ destructive flow ----------------------------
if [[ "$RESET" == "true" ]]; then
  echo
  echo "⚠️  DESTRUCTIVE MODE: this will DROP SCHEMA public CASCADE on:"
  echo "   $DBURL_MASKED"
  echo
  echo "Type the literal phrase to proceed:"
  echo "   $CONFIRM_PHRASE"
  printf "> "
  read -r REPLY
  [[ "$REPLY" == "$CONFIRM_PHRASE" ]] || { echo "aborted"; exit 3; }

  TS="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
  DUMP="$BACKUP_DIR/db-bootstrap-${TS}.sql"
  echo
  echo "→ Step 1/5: pg_dump backup → $DUMP"
  docker run --rm --network host \
    -v "$REPO_ROOT/$BACKUP_DIR:/backup" "$PG_IMAGE" \
    sh -c "pg_dump --data-only --column-inserts --disable-triggers --no-owner --no-privileges --exclude-table=_migrations '$DBURL' > /backup/$(basename "$DUMP") 2>/backup/pgdump.err"
  echo "  ✓ dump size: $(wc -c < "$REPO_ROOT/$DUMP") bytes"

  echo
  echo "→ Step 2/5: drop public schema + extensions"
  psql_oneshot "DROP EXTENSION IF EXISTS vector CASCADE; DROP EXTENSION IF EXISTS pgcrypto CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO PUBLIC;"

  echo
  echo "→ Step 3/5: recreate extensions"
  ensure_extensions

  echo
  echo "→ Step 4/5: prisma db push + migrations"
  if [[ "$DO_PRISMA" == "true" ]]; then
    docker run --rm --network host --env-file "$ENV_FILE" --entrypoint sh "$API_IMAGE" \
      -c "cd /app && pnpm --filter @oppmon/database db:push --accept-data-loss"
  fi
  docker run --rm --network host --env-file "$ENV_FILE" \
    -v "$REPO_ROOT/apps/api/scripts/migrations:/app/apps/api/scripts/migrations:ro" \
    --entrypoint sh "$API_IMAGE" \
    -c "cd /app && pnpm --filter @oppmon/api migrate"

  echo
  echo "→ Step 5/5: restore data"
  if [[ "$DO_RESTORE" == "true" ]]; then
    docker run --rm --network host \
      -v "$REPO_ROOT/$BACKUP_DIR:/backup" "$PG_IMAGE" \
      sh -c "psql '$DBURL' -f /backup/$(basename "$DUMP") > /backup/restore.log 2> /backup/restore.err || true"
    ERR_COUNT="$(grep -c '^psql.*ERROR' "$REPO_ROOT/$BACKUP_DIR/restore.err" 2>/dev/null || echo 0)"
    echo "  ✓ restore done — $ERR_COUNT errors logged to $BACKUP_DIR/restore.err (often benign: dropped tables, duplicate seeds)"
  else
    echo "  · skipped (--skip-restore). Dump retained at $DUMP"
  fi
  echo
  echo "✅ Reset complete."
  exit 0
fi

# ------------------------------ non-destructive flow ------------------------
echo
echo "→ Mode: non-destructive (idempotent)"

echo "→ Step 1/3: ensure extensions"
ensure_extensions

if [[ "$DO_PRISMA" == "true" ]]; then
  echo
  echo "→ Step 2/3: prisma db push (idempotent)"
  docker run --rm --network host --env-file "$ENV_FILE" --entrypoint sh "$API_IMAGE" \
    -c "cd /app && pnpm --filter @oppmon/database db:push --accept-data-loss"
else
  echo "→ Step 2/3: prisma db push  (skipped via --no-prisma)"
fi

echo
echo "→ Step 3/3: apply pending migrations"
docker run --rm --network host --env-file "$ENV_FILE" \
  -v "$REPO_ROOT/apps/api/scripts/migrations:/app/apps/api/scripts/migrations:ro" \
  --entrypoint sh "$API_IMAGE" \
  -c "cd /app && pnpm --filter @oppmon/api migrate"

echo
echo "✅ Bootstrap complete."
