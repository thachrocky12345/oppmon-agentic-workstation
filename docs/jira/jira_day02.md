# TAG-02: Skills Registry CRUD

## Description

**Suggested Points:** 8 (High — RBAC implementation with complex permission matrix, audit logging infrastructure, and scope filtering; requires careful security testing for authorization boundaries)

## Objective

Build the Skills Registry API with full CRUD operations, role-based access control (RBAC) enforcing tenant and team boundaries, comprehensive audit logging for all mutations, and scope filtering that respects user permissions.

## Requirements

### Skills Data Model
- `skills` table: id, tenant_id FK, team_id FK (nullable for tenant-wide), name, description, version, content, sha256, scope (enum: 'tenant', 'team'), created_by FK, created_at, updated_at
- `skill_versions` table for version history: id, skill_id FK, version, content, sha256, created_by FK, created_at
- Unique constraint on (tenant_id, name, version)
- Soft delete with `deleted_at` timestamp

### RBAC Implementation
- Three roles: `tenant_admin`, `team_admin`, `member`
- `tenant_admin`: Full CRUD on any skill within tenant
- `team_admin`: Full CRUD on skills within their team(s), read on tenant-scoped skills
- `member`: Read-only on skills they have access to (their teams + tenant-scoped)
- RBAC middleware that extracts role from JWT and enforces permissions
- Permission denied returns 403 with audit log entry

### API Endpoints
- `GET /api/skills` — List skills visible to user (filtered by scope)
- `GET /api/skills/:id` — Get single skill (if authorized)
- `POST /api/skills` — Create skill (team_admin+)
- `PUT /api/skills/:id` — Update skill (team_admin+ for team, tenant_admin for tenant)
- `DELETE /api/skills/:id` — Soft delete skill (same as update permissions)
- `GET /api/skills/:id/versions` — List version history

### Audit Logging
- `audit_log` table: id, tenant_id, resource_type, resource_id, action, actor_id, before_state (jsonb), after_state (jsonb), ip_address, user_agent, created_at
- Every mutation (create, update, delete) writes to audit_log
- Failed authorization attempts logged with action='denied'
- Audit log is append-only, no updates or deletes

### Scope Filtering
- `scope=tenant` skills visible to all tenant members
- `scope=team` skills visible only to team members
- API list endpoint automatically filters based on user's team memberships
- No leakage of team-scoped skill metadata to non-members

## Implementation Notes
- Backend: NestJS guards for RBAC, interceptors for audit logging
- Frontend: N/A (API only today)
- CLI: N/A (integration in Day 8)
- Database: Prisma migrations for skills, skill_versions, audit_log tables

## Unit Tests

### Required Unit Tests
| Test File | Test Case | Assertion |
|-----------|-----------|-----------|
| `apps/api/src/middleware/__tests__/rbac.test.ts` | `tenant_admin can CRUD any skill in tenant` | All operations succeed with 200/201 |
| `apps/api/src/middleware/__tests__/rbac.test.ts` | `team_admin can CRUD skills in their team only` | Operations on own team succeed |
| `apps/api/src/middleware/__tests__/rbac.test.ts` | `team_admin cannot CRUD skills in other teams` | Returns 403 Forbidden |
| `apps/api/src/middleware/__tests__/rbac.test.ts` | `member can only read, not write` | POST/PUT/DELETE return 403 |
| `apps/api/src/middleware/__tests__/rbac.test.ts` | `member cannot see team-scoped skills from other teams` | Skill absent from list response |
| `apps/api/src/skills/__tests__/skills.service.test.ts` | `creates skill with correct sha256` | sha256 matches computed hash of content |
| `apps/api/src/skills/__tests__/skills.service.test.ts` | `increments version on update` | Version number increases |
| `apps/api/src/skills/__tests__/skills.service.test.ts` | `preserves version history` | Old version accessible via versions endpoint |
| `apps/api/src/audit/__tests__/audit.service.test.ts` | `logs create with before=null` | before_state is null, after_state is object |
| `apps/api/src/audit/__tests__/audit.service.test.ts` | `logs update with before and after` | Both states captured correctly |
| `apps/api/src/audit/__tests__/audit.service.test.ts` | `logs denied access attempts` | action='denied' with actor details |

### Test Coverage Requirements
- 100% branch coverage on RBAC middleware
- 100% coverage on scope filtering logic
- All permission combinations tested (3 roles × 4 operations × 2 scopes)

## Integration Tests

### Required Integration Tests
| Test Scenario | Setup | Steps | Expected Result |
|---------------|-------|-------|-----------------|
| `GET /api/skills scope filtering` | Tenant T, Teams A and B, User U member of B only, Skill X team-scoped to A | 1. GET /api/skills as User U | Skill X not in response |
| `team_admin cross-team denial` | Teams A and B, User admin of A only, Skill in B | 1. PUT /api/skills/:skillB as User | 403 Forbidden |
| `audit log on create` | Empty audit log | 1. POST /api/skills | audit_log has entry with before=null |
| `audit log on update` | Existing skill | 1. PUT /api/skills/:id | audit_log has before and after states |
| `audit log on denied` | member user, skill in other team | 1. DELETE /api/skills/:id | audit_log has action='denied' |
| `soft delete hides skill` | Existing skill | 1. DELETE /api/skills/:id 2. GET /api/skills | Skill not in list |
| `version history preserved` | Skill created then updated twice | 1. GET /api/skills/:id/versions | Returns 3 versions |

### End-to-End Flows
- Create skill → Update skill → Verify version history → Soft delete → Verify hidden from list
- Team admin creates team-scoped skill → Member of different team cannot see it
- Failed permission attempt → Verify audit log entry with denial

## Acceptance Criteria
1. All CRUD endpoints functional with proper status codes
2. RBAC correctly enforces tenant_admin > team_admin > member hierarchy
3. Team-scoped skills invisible to non-team-members in list endpoint
4. Every mutation creates audit_log entry with before/after state
5. Failed authorization attempts logged with action='denied'
6. Skill versions preserved and accessible via versions endpoint
7. sha256 hash computed and stored for each skill version
8. All unit tests pass with 100% RBAC branch coverage

## Review Checklist
- [ ] Can a member escalate to team_admin by modifying their JWT claims?
- [ ] Is the scope filter applied in the database query, not post-fetch?
- [ ] Does the audit log capture the actual user, not a spoofed value?
- [ ] Are soft-deleted skills excluded from all list queries?
- [ ] Is there an index on audit_log(tenant_id, resource_type, created_at)?
- [ ] Can team_admin see audit logs only for their team's skills?

## Dependencies
- Depends on: Day 1 (auth, database, JWT infrastructure)
- Blocks: Day 3 (MCP registry uses similar patterns), Day 8 (CLI sync needs skills API)

## Risk Factors
- **RBAC bypass via JWT manipulation** — Mitigation: JWT signature verification, claims extracted server-side only
- **Scope filter leakage** — Mitigation: Database-level WHERE clause, not application-level filter
- **Audit log performance** — Mitigation: Async write, proper indexing, consider partitioning by month
- **Version history growth** — Mitigation: Add cleanup job for old versions beyond retention policy
