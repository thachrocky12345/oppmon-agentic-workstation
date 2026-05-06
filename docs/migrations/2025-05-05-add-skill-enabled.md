# Migration: Add `enabled` field to Skills

**Date:** 2025-05-05
**Author:** Claude
**Affects:** `skills` table

## Change Description

Added `enabled` boolean field to the `Skill` model to support enabling/disabling skills from the admin panel.

## Schema Change

```prisma
model Skill {
  // ... existing fields
  enabled     Boolean    @default(true)  // NEW
  // ... rest of fields
}
```

## SQL (for manual application)

```sql
-- Add enabled column to skills table
ALTER TABLE "skills" ADD COLUMN IF NOT EXISTS "enabled" BOOLEAN NOT NULL DEFAULT true;

-- Optional: Create index for faster filtering
CREATE INDEX IF NOT EXISTS "skills_enabled_idx" ON "skills"("enabled");
```

## Deployment Steps

### Development
```bash
pnpm db:push
pnpm db:generate
```

### Production
Option 1: Use Prisma push (if acceptable for your workflow)
```bash
pnpm db:push
```

Option 2: Manual SQL (safer for production)
```bash
# Connect to production database and run:
ALTER TABLE "skills" ADD COLUMN IF NOT EXISTS "enabled" BOOLEAN NOT NULL DEFAULT true;
```

## Rollback

```sql
ALTER TABLE "skills" DROP COLUMN IF EXISTS "enabled";
```

## Verification

```sql
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'skills' AND column_name = 'enabled';
```

Expected output:
```
column_name | data_type | column_default
------------+-----------+---------------
enabled     | boolean   | true
```
