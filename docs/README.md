# Arkon Documentation

**Last Updated:** May 4, 2026

---

## Documentation Index

| Document | Description | Audience |
|----------|-------------|----------|
| [Architecture](./architecture.md) | System architecture and tech stack | All Engineers |
| [Local Development](./LOCAL_DEVELOPMENT.md) | Setup guide for local development | All Engineers |
| [Database Migrations](./DATABASE_MIGRATIONS.md) | Prisma migration workflow per Jira ticket | All Engineers |
| [Deployment](./DEPLOYMENT.md) | CI/CD, staging, and production deployment | DevOps, SRE, Senior Engineers |

### Architecture Diagrams

| Document | Description |
|----------|-------------|
| [System Architecture](./diagrams/architecture.md) | High-level system diagram |
| [Data Model](./diagrams/data-model.md) | Entity relationship diagram |
| [Dependencies](./diagrams/dependencies.md) | Package dependency graph |

### Flow Documentation

| Document | Description |
|----------|-------------|
| [Request Flow](./flows/request-flow.md) | API request lifecycle |
| [Auth Flow](./flows/auth-flow.md) | Authentication flow |

---

## Quick Start

```bash
# Clone and setup
git clone <repo-url> arkon-workstation
cd arkon-workstation
pnpm setup

# Start development
pnpm dev

# Access the application
# Frontend: http://localhost:3002
# API:      http://localhost:3001
```

See [Local Development Guide](./LOCAL_DEVELOPMENT.md) for detailed instructions.

---

## Repository Structure

```
arkon-workstation/
├── apps/
│   ├── api/           # Express API (@arkon/api)
│   └── web/           # Next.js frontend (@arkon/web)
├── packages/
│   ├── database/      # Prisma schema (@arkon/database)
│   ├── shared/        # Shared types (@arkon/shared)
│   ├── tsconfig/      # Shared configs (@arkon/tsconfig)
│   └── engine-core/   # Rust workspace
└── docs/              # Documentation
```

---

## Default Ports

| Service | Port | Notes |
|---------|------|-------|
| Frontend | 3002 | Next.js application |
| Backend API | 3001 | Express REST API |
| PostgreSQL | 5433 | TimescaleDB |
| Prisma Studio | 5555 | Database GUI |
| Redis | 6379 | Cache (optional) |

---

## Default Credentials (Development)

| Service | Credential |
|---------|------------|
| Admin Email | admin@arkon.dev |
| Admin Password | admin123 |
| PostgreSQL User | arkon |
| PostgreSQL Password | arkon_dev_password |

> **Warning:** Change these immediately in production environments.

---

## Common Commands

| Task | Command |
|------|---------|
| Install dependencies | `pnpm install` |
| Start development | `pnpm dev` |
| Run tests | `pnpm test` |
| Build for production | `pnpm build` |
| Start database only | `pnpm docker:up` |
| View database (GUI) | `pnpm db:studio` |
| Create migration | `pnpm db:migrate --name JIRA-XXX_description` |
| Apply migrations | `pnpm db:migrate:deploy` |
| Reset database | `pnpm db:reset` |

---

## Support

- **Slack:** #arkon-engineering
- **Issues:** GitHub Issues
- **On-Call:** PagerDuty rotation
