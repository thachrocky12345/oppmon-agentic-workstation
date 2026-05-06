# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

#### Platform Core
- Multi-tenant architecture with tenant isolation
- JWT-based authentication with OAuth device flow
- GitHub OAuth integration for CLI authentication
- Role-based access control (RBAC) with tenant/team admin roles

#### Skills Registry (@arkon/api)
- Skills CRUD operations with RBAC
- Audit logging for all skill mutations
- Team-scoped and tenant-scoped skills
- sha256 verification for skill content integrity

#### MCP Server Registry
- MCP server registration and management
- Bundle storage with S3/local abstraction
- Version tracking and sha256 verification
- Scope-based visibility (tenant/team)

#### RAG Pipeline
- Document ingestion with chunking
- Vector embeddings using OpenAI
- Hybrid search with BM25 + vector + RRF
- Cross-tenant isolation for embeddings
- Privacy-first design (no user_id in queries)

#### CLI Tool (@arkon/cli)
- `tag login` - OAuth device flow authentication
- `tag status` - Show auth status and user context
- `tag init` - Project initialization wizard
- `tag sync` - Skills and MCP server synchronization
- `tag rag` - RAG ingestion and search commands
- `tag hooks` - Claude Code hook management
- `tag events` - Event collection management
- `tag doctor` - Diagnostic and repair tool

#### Admin UI (@arkon/web)
- Teams management with member roles
- Skills management with CRUD UI
- MCP server registry interface
- Usage analytics dashboard (privacy-first)
- Audit log viewer
- User registration flow

#### Usage Analytics
- Privacy-first event collection (no user_id)
- Opt-in by default (eventsEnabled: false)
- 15-minute bucket aggregation
- Resource type and action tracking
- Time series visualization

### Security
- Cross-tenant isolation in all database queries
- No user_id storage in usage events (privacy by design)
- sha256 verification for bundle downloads
- RBAC enforcement on all API endpoints
- JWT token expiration handling
- Rate limiting on authentication endpoints

### Architecture Decisions
- ADR-0001: JWT-based authentication
- ADR-0002: Multi-tenancy with row-level security
- ADR-0003: Prisma with raw SQL for performance
- ADR-0004: Privacy-first usage analytics
- ADR-0005: Hybrid search with BM25 + vector + RRF
- ADR-0006: Privacy-first usage analytics (no user_id)

## [0.1.0] - 2026-05-05

### Added
- Initial release
- Monorepo setup with Turborepo
- TypeScript configuration across packages
- Docker Compose development environment
- PostgreSQL with TimescaleDB
- API server with Express
- Next.js frontend with App Router
- CLI tool with Commander

---

## Version History

| Version | Date | Description |
|---------|------|-------------|
| 0.1.0 | 2026-05-05 | Initial release |

## Contributors

- Initial development team

## Links

- [Documentation](./docs/)
- [Architecture](./docs/architecture.md)
- [ADRs](./docs/decisions/)
