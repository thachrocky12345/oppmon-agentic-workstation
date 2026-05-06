# Migration Safety Checklist

**Last Updated:** 2026-05-05

Complete before applying any database migration to production.

## Pre-Migration Checks

### Migration Review

- [ ] Migration SQL reviewed by another developer
- [ ] Migration is reversible (has down migration)
- [ ] No destructive operations (DROP TABLE, TRUNCATE)
- [ ] No data loss operations without backup plan
- [ ] Column additions are nullable or have defaults
- [ ] Index creation uses CONCURRENTLY (if applicable)

### Safety Analysis

```bash
# Run migration safety check
pnpm db:migrate:check

# Expected output:
# - No destructive operations
# - All changes reversible
# - Estimated lock time: < 1s
```

### Impact Assessment

| Question | Answer |
|----------|--------|
| Tables affected | |
| Estimated rows affected | |
| Estimated duration | |
| Lock type required | |
| Can run during traffic? | |

### Backup Verification

- [ ] Recent backup exists (< 24 hours)
- [ ] Backup verified restorable
- [ ] Point-in-time recovery enabled
- [ ] Backup retention covers rollback window

## Safe Migration Patterns

### Adding Columns

```sql
-- SAFE: Nullable column
ALTER TABLE users ADD COLUMN timezone VARCHAR(50) NULL;

-- SAFE: Column with default
ALTER TABLE users ADD COLUMN is_active BOOLEAN DEFAULT true;

-- UNSAFE: Non-nullable without default
ALTER TABLE users ADD COLUMN required_field VARCHAR(50) NOT NULL;
-- Must add as nullable, backfill, then add constraint
```

### Adding Indexes

```sql
-- SAFE: Concurrent index (no lock)
CREATE INDEX CONCURRENTLY idx_users_email ON users(email);

-- UNSAFE: Regular index (locks table)
CREATE INDEX idx_users_email ON users(email);
```

### Dropping Columns

```sql
-- SAFE: Drop after confirming no code references
-- 1. Remove code references
-- 2. Deploy
-- 3. Wait for stability
-- 4. Drop column in next release

-- UNSAFE: Drop immediately (may break running code)
ALTER TABLE users DROP COLUMN old_field;
```

### Renaming

```sql
-- SAFE: Add new, migrate data, drop old (3 deployments)
-- Deploy 1: Add new column
ALTER TABLE users ADD COLUMN full_name VARCHAR(255);
UPDATE users SET full_name = name;

-- Deploy 2: Update code to use new column

-- Deploy 3: Drop old column
ALTER TABLE users DROP COLUMN name;

-- UNSAFE: Direct rename (breaks code)
ALTER TABLE users RENAME COLUMN name TO full_name;
```

## Migration Execution

### Staging Test

- [ ] Migration applied to staging successfully
- [ ] Rollback tested on staging
- [ ] Application works with migrated schema
- [ ] Performance acceptable

### Production Execution

```bash
# Check current status
pnpm db:status

# Apply migration
pnpm db:migrate:deploy

# Verify
pnpm db:status
```

### Monitoring During Migration

- [ ] Watch database CPU/memory
- [ ] Watch query latency
- [ ] Watch lock contention
- [ ] Watch application errors

## Post-Migration Verification

- [ ] Migration completed successfully
- [ ] Application functioning normally
- [ ] No unexpected errors in logs
- [ ] Performance within normal range
- [ ] Data integrity verified

## Rollback Decision Tree

```
Migration failed?
├── Yes → Execute rollback immediately
└── No → Continue monitoring

Application errors after migration?
├── Yes → Can we hotfix quickly?
│   ├── Yes → Apply hotfix
│   └── No → Execute rollback
└── No → Continue monitoring

Performance degraded?
├── Yes → Severity critical?
│   ├── Yes → Execute rollback
│   └── No → Investigate, plan fix
└── No → Migration successful
```

---

## Sign-off

| Role | Name | Date |
|------|------|------|
| Developer | | |
| Reviewer | | |
| DBA (if complex) | | |
