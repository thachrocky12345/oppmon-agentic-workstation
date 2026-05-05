# Database Migrations Runbook

**Last Updated:** May 4, 2026 | **Owner:** Engineering Team

---

## Overview

This runbook covers the complete database migration workflow for the Arkon platform using **Prisma ORM**. Every schema change that affects production must go through this workflow.

---

## Table of Contents

1. [Quick Reference](#1-quick-reference)
2. [Migration Workflow per Jira Ticket](#2-migration-workflow-per-jira-ticket)
3. [Schema Change Types](#3-schema-change-types)
4. [CI/CD Integration](#4-cicd-integration)
5. [Rollback Procedures](#5-rollback-procedures)
6. [Best Practices](#6-best-practices)
7. [Troubleshooting](#7-troubleshooting)

---

## 1. Quick Reference

### Commands

| Command | Purpose | When to Use |
|---------|---------|-------------|
| `pnpm db:generate` | Generate Prisma client | After ANY schema change |
| `pnpm db:push` | Push schema to database | Local development only |
| `pnpm db:migrate --name <name>` | Create migration file | Before committing schema changes |
| `pnpm db:migrate:deploy` | Apply pending migrations | CI/CD and production |
| `pnpm db:seed` | Run seed script | After reset or fresh setup |
| `pnpm db:reset` | Reset database + seed | Local development only |
| `pnpm db:studio` | Open Prisma Studio GUI | Debugging and inspection |

### File Locations

```
packages/database/
├── prisma/
│   ├── schema.prisma              # Database schema
│   ├── seed.ts                    # Seed data script
│   └── migrations/                # Migration files (committed to git)
│       ├── 20260504_initial/
│       │   └── migration.sql
│       └── 20260505_jira_123_add_feature/
│           └── migration.sql
└── src/
    ├── client.ts                  # Prisma client singleton
    └── index.ts                   # Exports
```

---

## 2. Migration Workflow per Jira Ticket

### Step-by-Step Process

```
┌──────────────────────────────────────────────────────────────────────────┐
│                        JIRA TICKET WORKFLOW                               │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  1. CREATE BRANCH                                                        │
│     git checkout -b feature/JIRA-123-add-user-preferences                │
│                                                                          │
│  2. EDIT SCHEMA                                                          │
│     Edit: packages/database/prisma/schema.prisma                         │
│                                                                          │
│  3. GENERATE CLIENT                                                      │
│     pnpm db:generate                                                     │
│                                                                          │
│  4. TEST LOCALLY                                                         │
│     pnpm db:push  (applies schema without migration file)                │
│     pnpm dev      (test your changes)                                    │
│                                                                          │
│  5. CREATE MIGRATION                                                     │
│     pnpm db:migrate --name JIRA-123_add_user_preferences                 │
│                                                                          │
│  6. REVIEW MIGRATION SQL                                                 │
│     Check: prisma/migrations/20260504_jira_123_add_user_preferences/     │
│                                                                          │
│  7. COMMIT & PUSH                                                        │
│     git add .                                                            │
│     git commit -m "JIRA-123: Add user preferences table"                 │
│     git push origin feature/JIRA-123-add-user-preferences                │
│                                                                          │
│  8. CREATE PR                                                            │
│     - Migration file is reviewed with PR                                 │
│     - CI runs db:migrate:deploy on test database                         │
│                                                                          │
│  9. MERGE TO DEVELOP                                                     │
│     - Staging deployment runs db:migrate:deploy                          │
│     - QA validates on staging                                            │
│                                                                          │
│  10. MERGE TO MAIN                                                       │
│      - Production deployment runs db:migrate:deploy                      │
│      - Migration applied to production                                   │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### Example: Adding a New Table

**Jira Ticket:** JIRA-456 - Add user preferences feature

#### Step 1: Create Branch

```bash
git checkout develop
git pull origin develop
git checkout -b feature/JIRA-456-user-preferences
```

#### Step 2: Edit Schema

```prisma
// packages/database/prisma/schema.prisma

model UserPreference {
  id        String   @id @default(cuid())
  userId    String
  key       String
  value     Json
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, key])
  @@index([userId])
  @@map("user_preferences")
}

// Also add the relation to User model
model User {
  // ... existing fields
  preferences UserPreference[]
}
```

#### Step 3: Generate and Test Locally

```bash
# Generate Prisma client
pnpm db:generate

# Push to local database (no migration file yet)
pnpm db:push

# Test your feature
pnpm dev
```

#### Step 4: Create Migration

```bash
# Create migration file with descriptive name
pnpm db:migrate --name JIRA-456_add_user_preferences

# Output:
# ✔ Generated Prisma Client
# ✔ Created migration: 20260504143022_jira_456_add_user_preferences
```

#### Step 5: Review Generated SQL

```sql
-- prisma/migrations/20260504143022_jira_456_add_user_preferences/migration.sql

-- CreateTable
CREATE TABLE "user_preferences" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_preferences_userId_idx" ON "user_preferences"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "user_preferences_userId_key_key" ON "user_preferences"("userId", "key");

-- AddForeignKey
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

#### Step 6: Commit

```bash
git add packages/database/prisma/
git commit -m "JIRA-456: Add user preferences table

- Added UserPreference model
- Created migration for user_preferences table
- Added relation to User model"

git push origin feature/JIRA-456-user-preferences
```

---

## 3. Schema Change Types

### Safe Changes (Auto-generated migrations work well)

| Change Type | Example | Notes |
|-------------|---------|-------|
| Add table | `model NewTable { ... }` | Always safe |
| Add nullable column | `newField String?` | Safe, no data migration |
| Add column with default | `status String @default("active")` | Safe |
| Add index | `@@index([field])` | Safe, may take time on large tables |
| Add relation | `user User @relation(...)` | Safe if FK column exists |

### Careful Changes (Review migration carefully)

| Change Type | Example | Risk |
|-------------|---------|------|
| Add required column | `newField String` | Fails if table has data |
| Rename column | Requires manual SQL | Data loss if done wrong |
| Change column type | `Int` → `String` | May fail or lose data |
| Remove column | Delete field | Data loss |
| Remove table | Delete model | Data loss |

### Required Column on Existing Table

**Problem:** Adding a required field to a table with existing rows fails.

**Solution:** Three-step migration:

```bash
# Step 1: Add as nullable
pnpm db:migrate --name JIRA-789_add_status_nullable

# Step 2: Backfill data (custom script or SQL)
# UPDATE users SET status = 'active' WHERE status IS NULL;

# Step 3: Make required
pnpm db:migrate --name JIRA-789_make_status_required
```

---

## 4. CI/CD Integration

### GitHub Actions Workflow

```yaml
# .github/workflows/ci.yml

jobs:
  test:
    services:
      postgres:
        image: timescale/timescaledb:latest-pg15
        env:
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
          POSTGRES_DB: arkon_test
        ports:
          - 5432:5432

    env:
      DATABASE_URL: postgres://test:test@localhost:5432/arkon_test

    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v3
        with:
          version: 9

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Generate Prisma client
        run: pnpm db:generate

      - name: Run migrations
        run: pnpm db:migrate:deploy

      - name: Run tests
        run: pnpm test
```

### Deployment Pipeline

```yaml
# .github/workflows/deploy.yml

jobs:
  deploy-staging:
    steps:
      - name: Run migrations on staging
        env:
          DATABASE_URL: ${{ secrets.STAGING_DATABASE_URL }}
        run: pnpm db:migrate:deploy

      - name: Deploy application
        run: # ... deploy steps

  deploy-production:
    steps:
      - name: Backup database
        run: |
          pg_dump ${{ secrets.PROD_DATABASE_URL }} > backup_$(date +%Y%m%d_%H%M%S).sql
          # Upload to Azure Blob Storage

      - name: Run migrations on production
        env:
          DATABASE_URL: ${{ secrets.PROD_DATABASE_URL }}
        run: pnpm db:migrate:deploy

      - name: Deploy application
        run: # ... deploy steps
```

---

## 5. Rollback Procedures

### Before You Rollback

1. **Assess impact** - What data was affected?
2. **Check if reversible** - Can we roll forward instead?
3. **Backup current state** - Always backup first
4. **Notify team** - Coordinate the rollback

### Rollback Strategies

#### Strategy 1: Roll Forward (Preferred)

Create a new migration that fixes the issue:

```bash
# Fix the schema
pnpm db:migrate --name JIRA-456_fix_user_preferences

# Deploy the fix
pnpm db:migrate:deploy
```

#### Strategy 2: Manual SQL Rollback

For simple changes, manually reverse in SQL:

```bash
# 1. Backup first
pg_dump $DATABASE_URL > backup_before_rollback.sql

# 2. Connect to database
psql $DATABASE_URL

# 3. Reverse the migration
DROP TABLE IF EXISTS user_preferences;

# 4. Mark migration as rolled back
DELETE FROM _prisma_migrations
WHERE migration_name = '20260504143022_jira_456_add_user_preferences';

# 5. Deploy previous application version
```

#### Strategy 3: Full Database Restore

For catastrophic failures:

```bash
# 1. Stop application
docker compose down

# 2. Restore from backup
psql $DATABASE_URL < backup_20260504_120000.sql

# 3. Deploy previous application version
git checkout <previous-tag>
docker compose up -d
```

### Rollback Checklist

- [ ] Database backed up before rollback
- [ ] Team notified of rollback
- [ ] Rollback steps documented
- [ ] Application version matches schema
- [ ] Health checks passing after rollback
- [ ] Post-mortem scheduled

---

## 6. Best Practices

### Naming Conventions

```bash
# Format: JIRA-XXX_short_description
pnpm db:migrate --name JIRA-123_add_user_preferences
pnpm db:migrate --name JIRA-456_add_index_on_events
pnpm db:migrate --name JIRA-789_rename_status_to_state
```

### Schema Design Rules

1. **Always add `@@map()`** - Use snake_case for table names
   ```prisma
   model UserPreference {
     // ...
     @@map("user_preferences")
   }
   ```

2. **Always add indexes for foreign keys**
   ```prisma
   model Event {
     agentId String
     agent   Agent @relation(fields: [agentId], references: [id])

     @@index([agentId])  // Don't forget this!
   }
   ```

3. **Use `cuid()` for IDs** - Better for distributed systems
   ```prisma
   id String @id @default(cuid())
   ```

4. **Add `createdAt` and `updatedAt`** to all tables
   ```prisma
   createdAt DateTime @default(now())
   updatedAt DateTime @updatedAt
   ```

5. **Use `onDelete: Cascade`** appropriately
   ```prisma
   user User @relation(fields: [userId], references: [id], onDelete: Cascade)
   ```

### Code Review Checklist for Migrations

- [ ] Migration name includes Jira ticket number
- [ ] Migration SQL is reviewed (check generated file)
- [ ] No destructive changes without backup plan
- [ ] Required columns have default values or are nullable first
- [ ] Indexes added for foreign keys and frequently queried fields
- [ ] Tested on local database with realistic data volume
- [ ] Rollback procedure documented if risky

---

## 7. Troubleshooting

### Migration Drift

**Symptom:** `pnpm db:migrate:deploy` fails with drift error

```
Error: Drift detected: Your database schema is not in sync
```

**Solution:**

```bash
# Option 1: Reset migration history (dev only)
pnpm db:migrate reset

# Option 2: Baseline existing database
pnpm db:migrate resolve --applied 20260504_initial
```

### Migration Already Applied

**Symptom:** Migration fails because objects already exist

```
Error: relation "user_preferences" already exists
```

**Solution:**

```bash
# Mark migration as applied without running it
pnpm db:migrate resolve --applied 20260504143022_jira_456_add_user_preferences
```

### Cannot Connect to Database

**Symptom:** Connection refused or timeout

```bash
# Check database is running
pnpm docker:ps

# Check connection string
echo $DATABASE_URL

# Test connection
psql $DATABASE_URL -c "SELECT 1"
```

### Prisma Client Out of Sync

**Symptom:** TypeScript errors after schema change

```bash
# Regenerate client
pnpm db:generate

# Restart TypeScript server in VS Code
Cmd+Shift+P > TypeScript: Restart TS Server
```

### Long-Running Migration

**Symptom:** Migration takes too long on large table

**Solution:** Run during maintenance window or use batched updates:

```sql
-- Instead of one big UPDATE, batch it:
UPDATE users SET status = 'active'
WHERE id IN (SELECT id FROM users WHERE status IS NULL LIMIT 10000);
-- Repeat until done
```

---

## Appendix: Migration Status Commands

```bash
# Check migration status
pnpm --filter @arkon/database exec prisma migrate status

# View migration history
psql $DATABASE_URL -c "SELECT * FROM _prisma_migrations ORDER BY finished_at DESC"

# View pending migrations
pnpm --filter @arkon/database exec prisma migrate diff \
  --from-schema-datamodel prisma/schema.prisma \
  --to-schema-datasource prisma/schema.prisma
```

---

## Revision History

| Date | Author | Changes |
|------|--------|---------|
| 2026-05-04 | Engineering | Initial runbook for Prisma migrations |
