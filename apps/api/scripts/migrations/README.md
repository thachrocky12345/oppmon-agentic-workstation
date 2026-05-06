# Database Migrations

This directory contains SQL migrations for the Arkon API database.

## Quick Start

```bash
# Run all pending migrations
pnpm --filter @arkon/api migrate

# Preview migrations without applying (dry run)
pnpm --filter @arkon/api migrate --dry-run

# Force re-run all migrations (DANGEROUS - use only for testing)
pnpm --filter @arkon/api migrate --force
```

## How It Works

1. **Migration files** are stored in this directory as `.sql` files
2. **Naming convention**: `YYYYMMDDHHMMSS_description.sql` (timestamp prefix ensures order)
3. **Tracking**: Applied migrations are recorded in the `_migrations` table
4. **Idempotent**: Each migration runs exactly once (unless `--force` is used)
5. **Transactional**: Each migration runs in a transaction; failures roll back

## Creating a New Migration

1. Create a new `.sql` file with timestamp prefix:
   ```bash
   # Example: 20250505143000_add_user_avatar.sql
   touch scripts/migrations/$(date +%Y%m%d%H%M%S)_description.sql
   ```

2. Write your SQL:
   ```sql
   -- Migration: 20250505143000_add_user_avatar
   -- Description: Add avatar URL field to users table
   -- Author: Your Name
   -- Date: 2025-05-05

   ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "avatarUrl" TEXT;
   ```

3. Test with dry run:
   ```bash
   pnpm --filter @arkon/api migrate --dry-run
   ```

4. Apply:
   ```bash
   pnpm --filter @arkon/api migrate
   ```

## Best Practices

### DO
- Use `IF NOT EXISTS` / `IF EXISTS` for safety
- Include a header comment with description, author, date
- Test migrations locally before deploying
- Keep migrations small and focused
- Use transactions (handled automatically)

### DON'T
- Modify existing migration files after they're deployed
- Use `DROP TABLE` without `IF EXISTS`
- Include data migrations with schema changes (separate them)
- Forget to update Prisma schema after migration

## Migration Files

| File | Description | Date |
|------|-------------|------|
| `20250505120000_add_skill_enabled.sql` | Add enabled field to skills table | 2025-05-05 |

## Rollback

Rollbacks are manual. Create a new migration that undoes the changes:

```sql
-- Migration: 20250506000000_rollback_skill_enabled
-- Description: Rollback - Remove enabled field from skills

ALTER TABLE "skills" DROP COLUMN IF EXISTS "enabled";
DROP INDEX IF EXISTS "skills_enabled_idx";
```

## Deployment

### Development
```bash
pnpm --filter @arkon/api migrate
```

### Production (CI/CD)
```bash
# In your deployment pipeline
DATABASE_URL=$PROD_DATABASE_URL pnpm --filter @arkon/api migrate
```

### Docker
```bash
docker exec -e DATABASE_URL=$DATABASE_URL arkon-api pnpm migrate
```

## Troubleshooting

### "Migration already applied"
The migration is recorded in `_migrations` table. If you need to re-run:
```sql
DELETE FROM _migrations WHERE name = '20250505120000_add_skill_enabled';
```

### "Column already exists"
Use `IF NOT EXISTS`:
```sql
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "newColumn" TEXT;
```

### Migration failed mid-way
Migrations are transactional - they roll back on failure. Fix the SQL and re-run.

## Related

- **Prisma Schema**: `packages/database/prisma/schema.prisma`
- **Database Package**: `packages/database/`
- **API Scripts**: `apps/api/scripts/`
