# Arkon API

Express.js backend API for the Arkon AI Gateway platform.

## Quick Start

```bash
# Install dependencies
pnpm install

# Set up environment
cp .env.example .env
# Edit .env with your settings

# Push database schema
pnpm db:push

# Seed database
pnpm db:seed

# Start development server
pnpm dev
```

## Available Scripts

| Script | Description |
|--------|-------------|
| `pnpm dev` | Start development server with hot reload |
| `pnpm build` | Build for production |
| `pnpm start` | Start production server |
| `pnpm db:push` | Push Prisma schema to database |
| `pnpm db:seed` | Seed database with test data |
| `pnpm db:migrate` | Run database migrations |
| `pnpm smoke:week1` | Run Week 1 smoke tests |
| `pnpm test` | Run unit tests |

## Environment Variables

See `.env.example` for all available configuration options.

**Required:**
- `DATABASE_URL` - PostgreSQL connection string (default: `postgres://arkon:arkon_dev_password@localhost:5433/arkon`)
- `JWT_SECRET` - Secret for JWT token signing

**Optional:**
- `OPENAI_API_KEY` - For embeddings
- `ANTHROPIC_API_KEY` - For Claude LLM
- `OLLAMA_BASE_URL` - For local Ollama LLM

---

## CRITICAL: Database Column Naming Convention

### Prisma Uses camelCase Columns

This project uses **Prisma ORM** which generates database columns in **camelCase**, not snake_case.

| Prisma Field | Database Column | SQL Reference |
|--------------|-----------------|---------------|
| `tenantId` | `tenantId` | `"tenantId"` |
| `createdAt` | `createdAt` | `"createdAt"` |
| `updatedAt` | `updatedAt` | `"updatedAt"` |
| `sourceType` | `sourceType` | `"sourceType"` |
| `sourceId` | `sourceId` | `"sourceId"` |
| `isActive` | `isActive` | `"isActive"` |
| `passwordHash` | `passwordHash` | `"passwordHash"` |

### Writing Raw SQL Queries

When writing raw SQL (with `prisma.$queryRaw`, `prisma.$executeRaw`, or the `pg` library), you **MUST** use double-quoted camelCase column names:

```typescript
// CORRECT - camelCase with double quotes
const results = await prisma.$queryRaw`
  SELECT id, "tenantId", "sourceType", "createdAt"
  FROM embeddings
  WHERE "tenantId" = ${tenantId}
`;

// WRONG - snake_case will cause "column does not exist" errors
const results = await prisma.$queryRaw`
  SELECT id, tenant_id, source_type, created_at
  FROM embeddings
  WHERE tenant_id = ${tenantId}
`;
```

### Why Double Quotes?

PostgreSQL lowercases unquoted identifiers. Since Prisma creates camelCase columns, you must quote them to preserve case:

```sql
-- These are DIFFERENT in PostgreSQL:
SELECT tenantId FROM users;     -- PostgreSQL sees: tenantid (lowercase)
SELECT "tenantId" FROM users;   -- PostgreSQL sees: tenantId (exact case)
```

### Common Column Mappings

| Entity | Columns to Quote |
|--------|------------------|
| users | `"tenantId"`, `"passwordHash"`, `"isActive"`, `"createdAt"`, `"updatedAt"` |
| tenants | `"isActive"`, `"createdAt"`, `"updatedAt"` |
| agents | `"tenantId"`, `"teamId"`, `"lastSeen"`, `"createdAt"`, `"updatedAt"` |
| embeddings | `"tenantId"`, `"sourceType"`, `"sourceId"`, `"contentHash"`, `"createdAt"`, `"updatedAt"` |
| skills | `"tenantId"`, `"teamId"`, `"createdById"`, `"deletedAt"`, `"createdAt"`, `"updatedAt"` |
| audit_logs | `"tenantId"`, `"resourceType"`, `"resourceId"`, `"actorId"`, `"beforeState"`, `"afterState"`, `"ipAddress"`, `"userAgent"`, `"createdAt"` |

### Best Practices

1. **Prefer Prisma Client** - Use `prisma.model.findMany()` instead of raw SQL when possible
2. **Always quote camelCase** - When raw SQL is required, always use `"columnName"`
3. **Test your queries** - Run queries manually in psql/pgAdmin before adding to code
4. **Check the schema** - Reference `packages/database/prisma/schema.prisma` for exact field names

---

## Project Structure

```
apps/api/
├── src/
│   ├── index.ts              # Express app entry point
│   ├── routes/               # API route handlers
│   │   ├── auth.ts           # Authentication endpoints
│   │   ├── skills.ts         # Skills CRUD
│   │   ├── llm.ts            # LLM chat endpoints
│   │   ├── embedding.ts      # Embedding endpoints
│   │   ├── rag.ts            # RAG query endpoints
│   │   └── ...
│   ├── services/             # Business logic
│   │   ├── skills.ts
│   │   ├── llm.ts
│   │   ├── embedding.ts
│   │   ├── rag.ts
│   │   └── audit.ts
│   ├── middleware/           # Express middleware
│   │   ├── request-auth.ts   # JWT authentication
│   │   ├── rbac.ts           # Role-based access control
│   │   └── error-handler.ts
│   └── lib/                  # Utilities and clients
│       ├── db.ts             # PostgreSQL connection pool
│       ├── llm/              # LLM provider clients
│       ├── embedding/        # Embedding provider clients
│       └── rag/              # RAG pipeline
├── scripts/
│   ├── seed.ts               # Database seeding
│   ├── migrate.ts            # Migration runner
│   └── smoke-week1.ts        # Smoke tests
└── .env                      # Environment configuration
```

## API Endpoints

### Health
- `GET /api/health` - Health check (returns `{ status: 'healthy' }`)
- `GET /api/health/live` - Liveness probe
- `GET /api/health/ready` - Readiness probe

### Authentication
- `POST /api/auth/login` - Login and get JWT
- `POST /api/auth/register` - Register new user
- `GET /api/auth/me` - Get current user info

### Skills
- `GET /api/skills` - List skills
- `GET /api/skills/:id` - Get skill by ID
- `POST /api/skills` - Create skill
- `PUT /api/skills/:id` - Update skill
- `DELETE /api/skills/:id` - Soft delete skill

### LLM
- `POST /api/llm/chat` - Send chat message
- `GET /api/llm/providers` - List LLM providers
- `GET /api/llm/status` - Get LLM service status
- `GET /api/llm/models` - List available models

### Embeddings
- `POST /api/embedding/embed` - Generate embedding
- `POST /api/embedding/search` - Semantic search
- `GET /api/embedding/stats` - Get embedding statistics

### RAG
- `POST /api/rag/query` - Execute RAG query
- `GET /api/rag/status` - Get RAG pipeline status

## Database Migrations

SQL migrations are stored in `scripts/migrations/` and tracked in a `_migrations` table.

### Running Migrations

```bash
# Run all pending migrations
pnpm --filter @arkon/api migrate

# Preview without applying
pnpm --filter @arkon/api migrate --dry-run
```

### Creating a New Migration

1. Create a timestamped SQL file:
   ```bash
   # Format: YYYYMMDDHHMMSS_description.sql
   touch scripts/migrations/20250505143000_add_new_column.sql
   ```

2. Write your SQL with safety checks:
   ```sql
   -- Migration: 20250505143000_add_new_column
   -- Description: Add new column to table
   -- Author: Your Name

   ALTER TABLE "tableName" ADD COLUMN IF NOT EXISTS "newColumn" TEXT;
   ```

3. Run:
   ```bash
   pnpm --filter @arkon/api migrate
   ```

See `scripts/migrations/README.md` for full documentation.

---

## Troubleshooting

### "column tenant_id does not exist"

This error means raw SQL is using snake_case instead of camelCase. Fix by:
1. Change `tenant_id` to `"tenantId"`
2. Change `created_at` to `"createdAt"`
3. See the "Database Column Naming Convention" section above

### "ECONNREFUSED port 5432"

The database runs on port **5433** (Docker host port), not 5432:
```
DATABASE_URL=postgres://arkon:arkon_dev_password@localhost:5433/arkon
```

### "EADDRINUSE port 3001"

Kill existing node processes:
```bash
taskkill /f /im node.exe   # Windows
pkill -f node              # Linux/Mac
```

### ESM Module Issues

This project uses ES Modules. Use `import.meta.url` instead of `__dirname`:
```typescript
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
```
