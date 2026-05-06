# Emergency Migration Rollback

**Last Updated:** 2026-05-05

Emergency procedure for rolling back failed migrations. Target: < 10 minutes.

## Triggers for Emergency Rollback

- Migration script failed mid-execution
- Application completely broken after migration
- Data corruption detected
- Critical security issue discovered
- Performance severely degraded (> 10x latency)

## Immediate Actions

### 1. Stop the Bleeding

```bash
# If migration still running, stop it
pkill -f "migrate" || true

# If application is failing, scale down to reduce impact
pnpm deploy:scale --replicas 0
```

### 2. Notify Team

```
@team EMERGENCY: Database migration rollback in progress
Issue: [brief description]
Impact: [user impact]
ETA: 10 minutes
```

### 3. Assess Situation

| Question | Answer |
|----------|--------|
| Migration completed? | |
| Data modified? | |
| Application running? | |
| Data corruption? | |

## Rollback Options

### Option A: Prisma Migration Rollback

Use when: Migration was Prisma-managed and reversible.

```bash
# Check migration history
pnpm db:migrate:status

# Rollback last migration
pnpm db:migrate:rollback

# Verify
pnpm db:migrate:status
```

### Option B: Manual SQL Rollback

Use when: Need to run specific rollback SQL.

```bash
# Connect to database
psql $DATABASE_URL

# Run rollback SQL
\i scripts/rollbacks/YYYYMMDD-rollback.sql

# Verify
SELECT COUNT(*) FROM affected_table;
```

### Option C: Point-in-Time Recovery

Use when: Data corruption or need to restore to exact pre-migration state.

```bash
# List available backups
pnpm db:backup:list

# Restore to point in time
pnpm db:restore --pit "2026-05-05T10:00:00Z"

# This will:
# 1. Stop application
# 2. Restore database
# 3. Start application
# 4. Verify health
```

### Option D: Full Backup Restore

Use when: Point-in-time not available or corruption is severe.

```bash
# List backups
pnpm db:backup:list

# Restore from backup
pnpm db:restore --name "pre-migration-20260505"

# WARNING: Data since backup will be lost
```

## Verification

### 1. Database State

```bash
# Check schema
pnpm db:schema:verify

# Check data integrity
pnpm db:integrity:check
```

### 2. Application Health

```bash
# Scale application back up
pnpm deploy:scale --replicas 2

# Check health
curl -s https://arkon.app/api/health/ready

# Monitor logs
pnpm deploy:logs --follow
```

### 3. User Impact

- [ ] Login working
- [ ] Core features functional
- [ ] No data loss visible to users
- [ ] Error rates normalized

## Post-Rollback

### 1. Stabilize

- [ ] Confirm system is stable
- [ ] Monitor for 30 minutes
- [ ] No new errors appearing

### 2. Communicate

```
@team Database rollback COMPLETE
System status: STABLE
Data loss: [none / describe]
Root cause: [investigating]
```

### 3. Document

Create incident report:
- Timeline of events
- Root cause
- Impact
- Actions taken
- Lessons learned

### 4. Fix Forward

- [ ] Identify root cause
- [ ] Fix migration script
- [ ] Test on staging
- [ ] Schedule re-attempt

---

## Emergency Contacts

| Role | Contact | Escalate When |
|------|---------|---------------|
| DBA | @dba-team | Database issues |
| Platform | @platform | Infrastructure |
| Security | @security | Data breach |
| Exec | @leadership | Customer impact |

---

## Quick Commands Reference

```bash
# Stop everything
pnpm deploy:scale --replicas 0

# Check database
psql $DATABASE_URL -c "SELECT 1"

# Rollback migration
pnpm db:migrate:rollback

# Restore backup
pnpm db:restore --name BACKUP_NAME

# Start application
pnpm deploy:scale --replicas 2

# Check health
curl https://arkon.app/api/health
```
