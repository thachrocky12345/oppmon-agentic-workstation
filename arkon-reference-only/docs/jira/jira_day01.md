# TAG-01: Repo + DB + Auth Shell

## Description

**Suggested Points:** 5 (Medium — foundational setup with OAuth integration complexity, database schema design, and JWT infrastructure; low risk as patterns are well-established but requires careful security implementation)

## Objective

Establish the foundational monorepo structure, PostgreSQL database with tenant/team/user schema, and OAuth 2.0 authentication flow that issues JWTs. This day creates the security perimeter and data model that all subsequent days depend on.

## Requirements

### Repository Structure
- Initialize monorepo with Turborepo or Nx workspace configuration
- Create `apps/api` for backend NestJS/Express application
- Create `apps/web` for admin UI (Next.js)
- Create `packages/cli` for CLI tool
- Create `packages/shared` for shared types and utilities
- Configure TypeScript paths and project references
- Set up ESLint, Prettier, and Husky pre-commit hooks

### Database Schema
- PostgreSQL with `tenants` table (id, name, slug, created_at, updated_at)
- `teams` table (id, tenant_id FK, name, created_at, updated_at)
- `users` table (id, tenant_id FK, email, name, role, created_at, updated_at)
- `team_memberships` table (user_id FK, team_id FK, role, created_at)
- Implement row-level security (RLS) policies for tenant isolation
- Create migration system (Prisma or Drizzle)

### Authentication Shell
- OAuth 2.0 flow with configurable provider (GitHub/Google initially)
- JWT issuance with claims: `sub`, `tenant_id`, `teams[]`, `role`, `exp`, `iat`
- JWT validation middleware extracting tenant context
- `/api/auth/login` — redirect to OAuth provider
- `/api/auth/callback` — handle OAuth callback, issue JWT
- `/api/me` — return current user with tenant context
- Refresh token mechanism with secure httpOnly cookies

## Implementation Notes
- Backend: NestJS with Passport.js for OAuth, jose for JWT handling
- Frontend: Next.js with next-auth or custom OAuth flow
- CLI: Placeholder structure, login implementation in Day 5
- Database: Prisma with PostgreSQL, migrations in `prisma/migrations/`

## Unit Tests

### Required Unit Tests
| Test File | Test Case | Assertion |
|-----------|-----------|-----------|
| `apps/api/src/auth/__tests__/jwt.test.ts` | `issues JWT with required claims` | JWT contains `sub`, `tenant_id`, `teams[]`, `role`, `exp`, `iat` |
| `apps/api/src/auth/__tests__/jwt.test.ts` | `rejects expired JWT` | Returns 401 for expired token |
| `apps/api/src/auth/__tests__/jwt.test.ts` | `rejects malformed JWT` | Returns 401 for invalid signature |
| `apps/api/src/auth/__tests__/jwt.test.ts` | `rejects JWT with missing tenant_id` | Returns 401 if tenant_id claim absent |
| `apps/api/src/auth/__tests__/jwt.test.ts` | `extracts tenant_id from valid JWT` | Middleware populates `req.tenantId` |
| `apps/api/src/auth/__tests__/oauth.test.ts` | `generates correct OAuth redirect URL` | URL contains client_id, redirect_uri, scope |
| `apps/api/src/auth/__tests__/oauth.test.ts` | `exchanges code for tokens` | Calls provider token endpoint correctly |
| `apps/api/src/middleware/__tests__/auth.test.ts` | `attaches user to request` | `req.user` populated after validation |

### Test Coverage Requirements
- 90% line coverage on `apps/api/src/auth/`
- 100% branch coverage on JWT validation logic
- All error paths tested (expired, malformed, missing claims)

## Integration Tests

### Required Integration Tests
| Test Scenario | Setup | Steps | Expected Result |
|---------------|-------|-------|-----------------|
| `OAuth login flow` | Mock OAuth provider | 1. GET /api/auth/login 2. Follow redirect 3. Callback with code | JWT issued, user created in DB |
| `/api/me returns user` | Valid JWT in header | 1. GET /api/me with Authorization header | 200 with user object including tenant |
| `/api/me rejects invalid` | Expired JWT | 1. GET /api/me with expired token | 401 Unauthorized |
| `tenant isolation` | Two tenants created | 1. User A login 2. Check tenant_id in JWT | JWT contains only User A's tenant |
| `database seeding` | Empty database | 1. Run migrations 2. Run seed script | Default tenant and admin user exist |

### End-to-End Flows
- Complete OAuth flow from login redirect through callback to JWT issuance
- JWT refresh flow before expiration
- Logout flow clearing tokens

## Acceptance Criteria
1. Monorepo builds successfully with `turbo build` or `nx build`
2. `docker-compose up` starts PostgreSQL and API server
3. Migrations run without error on fresh database
4. OAuth login flow completes and issues valid JWT
5. `/api/me` returns current user with tenant context when authenticated
6. `/api/me` returns 401 when unauthenticated or token invalid
7. JWT contains all required claims: `sub`, `tenant_id`, `teams[]`, `role`
8. All unit tests pass with >90% coverage on auth module

## Review Checklist
- [ ] Is the JWT signing key loaded from environment variable, not hardcoded?
- [ ] Are refresh tokens stored securely (httpOnly cookie or encrypted)?
- [ ] Does the schema support multi-tenancy with proper foreign keys?
- [ ] Are database credentials externalized to environment variables?
- [ ] Is there a clear separation between tenant-scoped and global data?
- [ ] Are all OAuth secrets in `.env.example` documented?

## Dependencies
- Depends on: None (Day 1 is foundation)
- Blocks: Day 2, Day 3, Day 4, Day 5 (all subsequent days)

## Risk Factors
- **OAuth provider configuration complexity** — Mitigation: Use well-documented providers (GitHub first), provide clear setup docs
- **JWT security misconfiguration** — Mitigation: Use established libraries (jose), review OWASP JWT guidelines
- **Database connection pooling** — Mitigation: Configure Prisma connection pool limits, test under load
