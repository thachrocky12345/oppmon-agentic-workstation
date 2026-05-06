# Raw SQL Checker Skill

## Purpose

Prevent "A required field is missing" and "null value violates not-null constraint" errors when using raw SQL queries with Prisma schemas.

## Problem

Prisma's decorators only work when using Prisma Client:
- `@default(cuid())` - auto-generates ID
- `@default(now())` - sets createdAt timestamp
- `@updatedAt` - auto-sets updatedAt timestamp

**When writing raw SQL, NONE of these work automatically!**

## Common Errors

```
❌ null value in column "id" violates not-null constraint
❌ null value in column "updatedAt" violates not-null constraint
❌ A required field is missing
```

## Quick Fix Pattern

```typescript
// WRONG - missing fields
await query(`
  INSERT INTO rag_collections ("tenantId", name, ...)
  VALUES ($1, $2, ...)
`, [tenantId, name, ...]);

// CORRECT - include id, createdAt, updatedAt
import { createId } from '@paralleldrive/cuid2';

const id = createId();
await query(`
  INSERT INTO rag_collections (id, "tenantId", name, ..., "createdAt", "updatedAt")
  VALUES ($1, $2, $3, ..., NOW(), NOW())
  RETURNING *
`, [id, tenantId, name, ...]);
```

## Required Fields for Raw SQL INSERT

| Prisma Decorator | Raw SQL Requirement |
|------------------|---------------------|
| `@id @default(cuid())` | Must provide: `createId()` |
| `@default(now())` | Must provide: `NOW()` or `new Date()` |
| `@updatedAt` | Must provide: `NOW()` or `new Date()` |

## Checklist for Raw SQL INSERTs

### 1. Import createId
```typescript
import { createId } from '@paralleldrive/cuid2';
```

### 2. Generate ID before INSERT
```typescript
const id = createId();
```

### 3. Include ALL required columns
```sql
INSERT INTO table_name (
  id,              -- Always include
  "tenantId",      -- If required
  name,            -- Required fields
  "createdAt",     -- If @default(now())
  "updatedAt"      -- If @updatedAt
) VALUES (
  $1,              -- id from createId()
  $2,              -- tenantId
  $3,              -- name
  NOW(),           -- createdAt
  NOW()            -- updatedAt
)
```

### 4. Use camelCase with double quotes
```sql
-- CORRECT
"tenantId", "createdAt", "updatedAt"

-- WRONG (will fail)
tenant_id, created_at, updated_at
```

## Tables Reference

| Table | Required Raw SQL Fields |
|-------|------------------------|
| `rag_collections` | `id`, `tenantId`, `name`, `createdById`, `createdAt`, `updatedAt` |
| `rag_documents` | `id`, `collectionId`, `tenantId`, `originalFilename`, `mimeType`, `sizeBytes`, `filePath`, `fileSha256`, `uploadedById`, `createdAt`, `updatedAt` |
| `rag_chunks` | `id`, `documentId`, `tenantId`, `chunkIndex`, `content`, `tokenCount`, `createdAt` |
| `incidents` | `id`, `agentId`, `title`, `description`, `createdAt` |
| `incident_updates` | `id`, `incidentId`, `userId`, `message`, `createdAt` |
| `workflows` | `id`, `name`, `tenantId`, `createdAt`, `updatedAt` |
| `workflow_runs` | `id`, `workflowId`, `status`, `startedAt` |

## Best Practice: Use Prisma Client

Prefer Prisma Client for all CRUD operations:

```typescript
// BEST - Prisma handles all defaults automatically
const collection = await prisma.ragCollection.create({
  data: {
    tenantId,
    name: input.name,
    description: input.description,
    scope: input.scope,
    teamId: input.teamId,
    createdById: userId,
  },
});
```

Only use raw SQL when necessary:
- Complex joins
- Vector operations (`::vector`)
- Bulk operations
- Raw aggregations

## Audit Script

Find potentially problematic INSERTs:

```bash
# Find all raw SQL INSERTs
grep -rn "INSERT INTO" apps/api/src --include="*.ts" | grep -v "\.test\.ts"

# Check if they include 'id,' and timestamps
grep -rn "INSERT INTO" apps/api/src --include="*.ts" | grep -v "id," | grep -v "\.test\.ts"
```

## When to Run This Skill

- After writing any raw SQL INSERT
- When seeing "required field is missing" error
- When seeing "null value violates not-null constraint"
- Before committing code that uses `query()` or `$queryRaw`
