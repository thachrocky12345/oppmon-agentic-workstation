# ADR-0001: [AUTO] Adopt Prisma as ORM

**Date:** 2026-05-05

**Status:** Accepted

## Context

The Arkon platform requires a robust database access layer that supports:
- Multi-tenancy with tenant isolation
- Complex relationships (users, teams, agents, skills)
- Type safety for TypeScript codebase
- Schema migrations and evolution
- Support for PostgreSQL extensions (TimescaleDB, pgvector)

The original codebase used raw `pg` queries, which worked but lacked type safety and required manual query construction.

## Decision

Adopt **Prisma** (version 5.22) as the primary ORM for database access.

Key implementation details:
- Schema defined in `packages/database/prisma/schema.prisma`
- Exported as `@arkon/database` workspace package
- Uses `postgresqlExtensions` preview feature for pgvector and TimescaleDB
- All queries use the Prisma Client with typed results

## Alternatives Considered

| Alternative | Pros | Cons | Why Not Chosen |
|-------------|------|------|----------------|
| Raw pg queries | No abstraction, full SQL control | No type safety, manual relationship handling | Type safety critical for large codebase |
| Drizzle ORM | Lightweight, SQL-like, type-safe | Newer ecosystem, less mature tooling | Prisma has better migration tooling |
| TypeORM | Mature, decorator-based | TypeScript support less idiomatic | Prisma's schema-first approach preferred |
| Kysely | Type-safe query builder | Not a full ORM, no migrations | Need schema management and migrations |

## Consequences

### Positive

- Full TypeScript type safety for all database operations
- Auto-generated types from schema
- Declarative schema with clear relationship definitions
- Built-in migration system (`prisma migrate`)
- Prisma Studio for database inspection
- Support for PostgreSQL extensions via `previewFeatures`

### Negative

- Additional build step required (`prisma generate`)
- Learning curve for team members unfamiliar with Prisma
- Some advanced PostgreSQL features require raw queries
- pgvector column requires raw SQL migration (Prisma doesn't natively support vector type)

## Related

- [Data Model Diagram](../diagrams/data-model.md)
- [Database Conventions](../database-conventions.md)
- `packages/database/prisma/schema.prisma`
