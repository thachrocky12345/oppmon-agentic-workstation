# Data Migration Procedure

**Last Updated:** 2026-05-05

Safe procedure for migrating or transforming data in production.

## Pre-Migration

### Planning

- [ ] Data migration script written and reviewed
- [ ] Script tested on staging with production data copy
- [ ] Rollback script prepared and tested
- [ ] Estimated duration calculated
- [ ] Maintenance window scheduled (if needed)

### Data Backup

```bash
# Create point-in-time backup
pnpm db:backup:create --name "pre-migration-$(date +%Y%m%d)"

# Verify backup
pnpm db:backup:verify --name "pre-migration-$(date +%Y%m%d)"
```

### Impact Assessment

| Question | Answer |
|----------|--------|
| Tables affected | |
| Rows to be modified | |
| Estimated duration | |
| Requires maintenance window? | |
| User impact | |

## Migration Script Template

```typescript
// scripts/migrations/YYYYMMDD-description.ts

import { prisma } from '@arkon/database'

const BATCH_SIZE = 1000
const DRY_RUN = process.env.DRY_RUN === 'true'

async function migrate() {
  console.log(`Starting migration (dry_run: ${DRY_RUN})`)

  let processed = 0
  let errors = 0

  // Process in batches
  while (true) {
    const records = await prisma.targetTable.findMany({
      where: { /* condition for records to migrate */ },
      take: BATCH_SIZE,
      skip: 0,
    })

    if (records.length === 0) break

    for (const record of records) {
      try {
        if (!DRY_RUN) {
          await prisma.targetTable.update({
            where: { id: record.id },
            data: { /* transformed data */ },
          })
        }
        processed++
      } catch (error) {
        console.error(`Error processing ${record.id}:`, error)
        errors++
      }
    }

    console.log(`Processed: ${processed}, Errors: ${errors}`)
  }

  console.log(`Migration complete. Processed: ${processed}, Errors: ${errors}`)
}

migrate()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
```

## Execution

### 1. Pre-Flight Check

```bash
# Verify database connectivity
pnpm db:ping

# Dry run first
DRY_RUN=true pnpm db:migrate:data --script YYYYMMDD-description

# Review dry run output
```

### 2. Execute Migration

```bash
# Start migration
pnpm db:migrate:data --script YYYYMMDD-description

# Monitor progress
watch -n 5 "pnpm db:migrate:status"
```

### 3. Monitor

- [ ] Watch migration progress
- [ ] Monitor database performance
- [ ] Watch application error rates
- [ ] Check for lock contention

### 4. Verify

```bash
# Verify data integrity
pnpm db:migrate:verify --script YYYYMMDD-description

# Sample check
psql -c "SELECT COUNT(*) FROM target_table WHERE condition"
```

## Rollback

### If Migration Fails

```bash
# Stop migration if running
pkill -f "migrate:data"

# Execute rollback script
pnpm db:migrate:rollback --script YYYYMMDD-description

# Verify rollback
pnpm db:migrate:verify --script YYYYMMDD-description
```

### If Application Issues After Migration

1. Assess severity
2. If critical, restore from backup:
   ```bash
   pnpm db:restore --name "pre-migration-$(date +%Y%m%d)"
   ```

## Post-Migration

- [ ] Verify data integrity
- [ ] Update documentation
- [ ] Remove old data/columns (in future release)
- [ ] Archive migration script

---

## Checklist Summary

| Phase | Status |
|-------|--------|
| Script reviewed | |
| Staging tested | |
| Backup created | |
| Dry run passed | |
| Migration executed | |
| Data verified | |
| Documentation updated | |
