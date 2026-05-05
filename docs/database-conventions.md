# Database Conventions

This document describes the critical database conventions for the Arkon project.

---

## The #1 Rule: Prisma Uses camelCase

**Prisma ORM generates database columns in camelCase, NOT snake_case.**

This is different from many traditional PostgreSQL projects that use snake_case. Failing to follow this convention will result in `"column does not exist"` errors.

---

## Column Naming

### Prisma Schema → Database Column

| Prisma Field | Database Column | SQL Query |
|--------------|-----------------|-----------|
| `tenantId` | `tenantId` | `WHERE "tenantId" = $1` |
| `createdAt` | `createdAt` | `ORDER BY "createdAt" DESC` |
| `updatedAt` | `updatedAt` | `SET "updatedAt" = NOW()` |
| `isActive` | `isActive` | `WHERE "isActive" = true` |
| `sourceType` | `sourceType` | `WHERE "sourceType" = $1` |
| `sourceId` | `sourceId` | `WHERE "sourceId" = $1` |
| `passwordHash` | `passwordHash` | `SELECT "passwordHash"` |

### Why Double Quotes?

PostgreSQL automatically lowercases unquoted identifiers:

```sql
-- PostgreSQL interprets this as:
SELECT tenantId FROM users;
-- → SELECT tenantid FROM users;  (lowercase)

-- To preserve case, use quotes:
SELECT "tenantId" FROM users;
-- → SELECT tenantId FROM users;  (exact case)
```

---

## Writing Raw SQL

### When to Use Raw SQL

Use raw SQL only when Prisma doesn't support the operation:
- pgvector similarity searches
- Complex aggregations
- Bulk operations
- CTEs and window functions

### Correct Pattern

```typescript
// CORRECT - camelCase with double quotes
const results = await prisma.$queryRaw`
  SELECT
    id,
    "tenantId",
    "sourceType",
    "sourceId",
    content,
    1 - (embedding <=> ${vector}::vector) AS similarity
  FROM embeddings
  WHERE "tenantId" = ${tenantId}
    AND "sourceType" = ${sourceType}
  ORDER BY embedding <=> ${vector}::vector
  LIMIT ${limit}
`;
```

### Incorrect Pattern (DO NOT USE)

```typescript
// WRONG - snake_case causes "column does not exist" errors
const results = await prisma.$queryRaw`
  SELECT
    id,
    tenant_id,      // ERROR: column "tenant_id" does not exist
    source_type,    // ERROR: column "source_type" does not exist
    source_id,
    content
  FROM embeddings
  WHERE tenant_id = ${tenantId}
`;
```

---

## Table Reference

### users

```sql
SELECT
  id,
  email,
  "passwordHash",
  name,
  role,
  "tenantId",
  "isActive",
  "createdAt",
  "updatedAt"
FROM users
WHERE id = $1 AND "isActive" = true
```

### tenants

```sql
SELECT
  id,
  name,
  slug,
  "isActive",
  "createdAt",
  "updatedAt"
FROM tenants
```

### agents

```sql
SELECT
  id,
  name,
  description,
  status,
  "tenantId",
  "teamId",
  config,
  "lastSeen",
  "createdAt",
  "updatedAt"
FROM agents
WHERE "tenantId" = $1
```

### embeddings

```sql
SELECT
  id,
  "tenantId",
  "sourceType",
  "sourceId",
  content,
  "contentHash",
  embedding,
  provider,
  model,
  dimensions,
  metadata,
  "createdAt",
  "updatedAt"
FROM embeddings
WHERE "tenantId" = $1
```

### skills

```sql
SELECT
  id,
  "tenantId",
  "teamId",
  name,
  description,
  version,
  content,
  sha256,
  scope,
  "createdById",
  "createdAt",
  "updatedAt",
  "deletedAt"
FROM skills
WHERE "tenantId" = $1 AND "deletedAt" IS NULL
```

### audit_logs

```sql
SELECT
  id,
  "tenantId",
  "resourceType",
  "resourceId",
  action,
  "actorId",
  "beforeState",
  "afterState",
  "ipAddress",
  "userAgent",
  metadata,
  "createdAt"
FROM audit_logs
WHERE "tenantId" = $1
ORDER BY "createdAt" DESC
```

### llm_sessions

```sql
SELECT
  id,
  "tenantId",
  "userId",
  title,
  provider,
  "createdAt",
  "updatedAt"
FROM llm_sessions
WHERE "tenantId" = $1 AND "userId" = $2
```

### llm_messages

```sql
SELECT
  id,
  "sessionId",
  provider,
  model,
  role,
  content,
  "inputTokens",
  "outputTokens",
  "createdAt"
FROM llm_messages
WHERE "sessionId" = $1
```

---

## Migrations

### SQL Migration Files

When writing SQL migration files, always use camelCase with quotes:

```sql
-- migrations/001_add_feature.sql

-- CORRECT
CREATE INDEX IF NOT EXISTS embeddings_tenant_source_idx
ON embeddings ("tenantId", "sourceType");

-- WRONG
CREATE INDEX IF NOT EXISTS embeddings_tenant_source_idx
ON embeddings (tenant_id, source_type);
```

### Prisma Migrations

Prefer `prisma db push` or `prisma migrate dev` which handle column naming automatically.

---

## Debugging Column Errors

### Error Message

```
error: column "tenant_id" does not exist
```

### Diagnosis

1. Find the SQL query causing the error
2. Check for snake_case column references
3. Replace with quoted camelCase

### Common Fixes

| Wrong | Correct |
|-------|---------|
| `tenant_id` | `"tenantId"` |
| `created_at` | `"createdAt"` |
| `updated_at` | `"updatedAt"` |
| `source_type` | `"sourceType"` |
| `source_id` | `"sourceId"` |
| `is_active` | `"isActive"` |
| `password_hash` | `"passwordHash"` |
| `team_id` | `"teamId"` |
| `user_id` | `"userId"` |
| `session_id` | `"sessionId"` |
| `content_hash` | `"contentHash"` |
| `created_by_id` | `"createdById"` |
| `deleted_at` | `"deletedAt"` |
| `last_seen` | `"lastSeen"` |
| `input_tokens` | `"inputTokens"` |
| `output_tokens` | `"outputTokens"` |
| `ip_address` | `"ipAddress"` |
| `user_agent` | `"userAgent"` |
| `before_state` | `"beforeState"` |
| `after_state` | `"afterState"` |
| `resource_type` | `"resourceType"` |
| `resource_id` | `"resourceId"` |
| `actor_id` | `"actorId"` |

---

## Best Practices

1. **Prefer Prisma Client over raw SQL** - Prisma handles column naming automatically
2. **Always check the schema** - Reference `packages/database/prisma/schema.prisma` for exact field names
3. **Test queries in psql first** - Verify your SQL works before adding to code
4. **Use TypeScript types** - The raw query results should match the expected types
5. **Copy from working examples** - When in doubt, copy column references from existing working code

---

## Reference

- [Prisma Schema](../packages/database/prisma/schema.prisma)
- [PostgreSQL Identifiers](https://www.postgresql.org/docs/current/sql-syntax-lexical.html#SQL-SYNTAX-IDENTIFIERS)
- [Prisma Raw Queries](https://www.prisma.io/docs/concepts/components/prisma-client/raw-database-access)
