# TAG-30: Migration Safety Framework

## Description

**Suggested Points:** 8 (High — implementing Django-style migration patterns in TypeScript/Prisma, data migration tooling, rollback procedures, and production safety checks; critical for sustainable database evolution)

## Objective

Implement a comprehensive migration safety framework inspired by Lumy-Backend's Django migration patterns, including data migrations with RunPython/RunSQL equivalents, reversible migrations, three-step nullable field additions, and pre-deployment safety checks.

## Requirements

### Migration Framework Enhancement
- Prisma migrations with custom SQL support
- Data migration scripts separate from schema migrations
- Reversible migration pattern (up/down functions)
- Migration testing against production data copies

### Data Migration Pattern (RunPython Equivalent)
```typescript
// migrations/data/20240115_backfill_profile_pic_nulls.ts

import { PrismaClient } from '@prisma/client'

export const meta = {
  name: 'backfill_profile_pic_nulls',
  description: 'Convert NULL profile_pic to empty string before making non-nullable',
  reversible: true,
}

export async function up(prisma: PrismaClient): Promise<void> {
  const updated = await prisma.user.updateMany({
    where: { profilePic: null },
    data: { profilePic: '' },
  })
  console.log(`Updated ${updated.count} users with NULL profile_pic`)
}

export async function down(prisma: PrismaClient): Promise<void> {
  await prisma.user.updateMany({
    where: { profilePic: '' },
    data: { profilePic: null },
  })
}
```

### SQL Migration Pattern (RunSQL Equivalent)
```typescript
// migrations/sql/20240120_convert_to_array.ts

export const meta = {
  name: 'convert_speciality_to_array',
  description: 'Convert integer column to integer array',
  reversible: true,
  requiresDowntime: true,  // Flag for deployment planning
}

export const up = `
  ALTER TABLE manage_pages
  ALTER COLUMN primary_speciality_id TYPE integer[]
  USING CASE
    WHEN primary_speciality_id IS NOT NULL
    THEN ARRAY[primary_speciality_id]
    ELSE NULL
  END;
`

export const down = `
  ALTER TABLE manage_pages
  ALTER COLUMN primary_speciality_id TYPE integer
  USING primary_speciality_id[1];
`
```

### Three-Step Nullable Field Addition
Pattern for safely adding NOT NULL fields to existing tables:

**Step 1:** Add nullable field
**Step 2:** Backfill existing records
**Step 3:** Make non-nullable

### Pre-Deployment Safety Checks
- Automated checks before migration runs
- Lock duration estimation for large tables
- Destructive operation detection (DROP, DELETE)
- Reversibility verification

### Migration CLI Commands
```bash
# Generate schema migration
npm run migrate:create -- --name add_dispute_fields

# Generate data migration
npm run migrate:data -- --name backfill_user_timezones

# Preview migration SQL
npm run migrate:preview

# Dry run against test database
npm run migrate:dry-run

# Apply migrations
npm run migrate:apply

# Rollback last migration
npm run migrate:rollback

# Rollback to specific version
npm run migrate:rollback -- --to 20240115

# Show migration status
npm run migrate:status
```

## Implementation Notes
- Backend: New `scripts/migrate/` directory with CLI tooling
- Frontend: N/A
- CLI: Migration commands integrated
- Database: Migration tracking table, lock management

## Unit Tests

### Required Unit Tests
| Test File | Test Case | Assertion |
|-----------|-----------|-----------|
| `scripts/migrate/__tests__/runner.test.ts` | `executes up migration` | Database state changed |
| `scripts/migrate/__tests__/runner.test.ts` | `executes down migration` | Database state reverted |
| `scripts/migrate/__tests__/runner.test.ts` | `tracks applied migrations` | Recorded in migrations table |
| `scripts/migrate/__tests__/safety.test.ts` | `detects DROP operations` | Warning raised |
| `scripts/migrate/__tests__/safety.test.ts` | `estimates lock duration` | Estimate returned for large tables |
| `scripts/migrate/__tests__/safety.test.ts` | `verifies reversibility` | Error if down missing |
| `scripts/migrate/__tests__/data.test.ts` | `data migration runs in transaction` | Rollback on error |
| `scripts/migrate/__tests__/data.test.ts` | `progress reported for large datasets` | Progress callback invoked |

### Test Coverage Requirements
- 100% coverage on migration runner
- All safety check scenarios tested
- Rollback tested for each migration type

## Integration Tests

### Required Integration Tests
| Test Scenario | Setup | Steps | Expected Result |
|---------------|-------|-------|-----------------|
| `full migration cycle` | Empty database | 1. Create 2. Apply 3. Rollback | Clean state |
| `data migration` | Table with data | 1. Run data migration | Data transformed |
| `three-step pattern` | Table with NULL values | 1. Add nullable 2. Backfill 3. Alter | Field non-nullable, data preserved |
| `safety check: DROP` | Migration with DROP | 1. Run safety check | Warning displayed |
| `concurrent migration block` | Migration running | 1. Attempt second migration | Blocked with message |
| `production data test` | Copy of production | 1. Apply migration | No errors, data intact |

### End-to-End Flows
- Create migration → Preview SQL → Dry run → Apply → Verify → (optional) Rollback
- Data migration: Identify NULLs → Write migration → Test on copy → Apply → Verify

## Migration Safety Framework

```typescript
// scripts/migrate/safety-checks.ts

interface SafetyCheck {
  name: string
  severity: 'error' | 'warning' | 'info'
  check: (sql: string, meta: MigrationMeta) => SafetyResult
}

interface SafetyResult {
  passed: boolean
  message?: string
  recommendation?: string
}

const safetyChecks: SafetyCheck[] = [
  {
    name: 'destructive_operation',
    severity: 'error',
    check: (sql) => {
      const destructive = /\b(DROP\s+TABLE|DROP\s+COLUMN|TRUNCATE|DELETE\s+FROM)\b/i
      if (destructive.test(sql)) {
        return {
          passed: false,
          message: 'Destructive operation detected',
          recommendation: 'Use soft delete or archive instead',
        }
      }
      return { passed: true }
    },
  },
  {
    name: 'reversibility',
    severity: 'error',
    check: (sql, meta) => {
      if (!meta.reversible) {
        return {
          passed: false,
          message: 'Migration is not reversible',
          recommendation: 'Add down() function or mark as intentionally irreversible',
        }
      }
      return { passed: true }
    },
  },
  {
    name: 'lock_duration',
    severity: 'warning',
    check: async (sql, meta) => {
      const tableMatch = sql.match(/ALTER\s+TABLE\s+(\w+)/i)
      if (tableMatch) {
        const rowCount = await estimateRowCount(tableMatch[1])
        if (rowCount > 100000) {
          return {
            passed: true,  // Warning, not blocking
            message: `Table has ${rowCount} rows, may lock for extended time`,
            recommendation: 'Consider running during low-traffic period',
          }
        }
      }
      return { passed: true }
    },
  },
  {
    name: 'not_null_without_default',
    severity: 'error',
    check: (sql) => {
      const notNullNoDefault = /ADD\s+COLUMN\s+\w+\s+\w+\s+NOT\s+NULL(?!\s+DEFAULT)/i
      if (notNullNoDefault.test(sql)) {
        return {
          passed: false,
          message: 'Adding NOT NULL column without default on existing table',
          recommendation: 'Use three-step pattern: add nullable, backfill, alter to not null',
        }
      }
      return { passed: true }
    },
  },
]

export async function runSafetyChecks(migration: Migration): Promise<SafetyReport> {
  const results: SafetyResult[] = []

  for (const check of safetyChecks) {
    const result = await check.check(migration.sql, migration.meta)
    results.push({ ...result, name: check.name, severity: check.severity })
  }

  const errors = results.filter(r => !r.passed && r.severity === 'error')
  const warnings = results.filter(r => !r.passed && r.severity === 'warning')

  return {
    canProceed: errors.length === 0,
    errors,
    warnings,
  }
}
```

## Three-Step Migration Generator

```typescript
// scripts/migrate/generators/add-required-field.ts

export function generateThreeStepMigration(options: {
  table: string
  column: string
  type: string
  defaultValue: any
}): Migration[] {
  const { table, column, type, defaultValue } = options
  const timestamp = Date.now()

  return [
    // Step 1: Add nullable
    {
      name: `${timestamp}_01_add_${column}_nullable`,
      up: `ALTER TABLE ${table} ADD COLUMN ${column} ${type} NULL;`,
      down: `ALTER TABLE ${table} DROP COLUMN ${column};`,
    },
    // Step 2: Backfill
    {
      name: `${timestamp}_02_backfill_${column}`,
      up: async (prisma) => {
        await prisma.$executeRaw`
          UPDATE ${table} SET ${column} = ${defaultValue} WHERE ${column} IS NULL
        `
      },
      down: async () => {
        // Backfill is naturally reversible (values stay)
      },
    },
    // Step 3: Make non-nullable
    {
      name: `${timestamp}_03_make_${column}_required`,
      up: `ALTER TABLE ${table} ALTER COLUMN ${column} SET NOT NULL;`,
      down: `ALTER TABLE ${table} ALTER COLUMN ${column} DROP NOT NULL;`,
    },
  ]
}

// Usage:
// npm run migrate:generate:required-field -- --table users --column timezone --type VARCHAR(50) --default "UTC"
```

## Acceptance Criteria
1. Data migration framework with up/down functions
2. SQL migration support with reversibility
3. Safety checks run automatically before apply
4. Three-step pattern generator for NOT NULL fields
5. Lock duration estimation for large tables
6. Destructive operation detection and blocking
7. Migration tracking table records all applied migrations
8. Rollback works for all migration types

## Review Checklist
- [ ] Are all migrations reversible (or explicitly marked irreversible)?
- [ ] Does the safety check catch all dangerous patterns?
- [ ] Is the lock estimation accurate for your database size?
- [ ] Can migrations be tested against production data copy?
- [ ] Is there a clear rollback procedure documented?
- [ ] Are data migrations wrapped in transactions?

## Dependencies
- Depends on: Day 1 (Database setup), Prisma/Drizzle ORM
- Blocks: Day 33 (Deployment runbooks include migration procedures)

## Risk Factors
- **Migration lock blocking traffic** — Mitigation: Lock estimation, off-peak deployment
- **Data migration performance** — Mitigation: Batching, progress indicators
- **Rollback data loss** — Mitigation: Down function preserves data where possible
- **Concurrent migration corruption** — Mitigation: Advisory locks, single-runner enforcement
