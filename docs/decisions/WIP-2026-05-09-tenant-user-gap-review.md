# WIP: Tenant + User Surface Gap Review

**Date:** 2026-05-09 (post migration ID-cutover)
**Scope:** Identity & Tenancy domain in `apps/api/src/`, `apps/web/src/middleware.ts`, `packages/database/prisma/schema.prisma`
**Source of truth:** [docs/diagrams/data-model.md §1 Identity & Tenancy](../diagrams/data-model.md)

This is a snapshot of how the application currently uses the Identity & Tenancy
tables, where scoping is enforced, and where gaps exist. Use it as a checklist
when debugging auth/tenant issues or before adding new tenant-scoped surfaces.

---

## 2026-05-09 PM — Four-Step Hardening Pass Applied

| # | Step | Status | Files |
|---|------|--------|-------|
| 1 | Switch DB session to `oppmon_app` role inside tenant transactions | ✅ DONE | `apps/api/src/lib/db.ts` (added `APP_DB_ROLE` env, `SET LOCAL ROLE` inside `withTenant`/`withTenantPg`); `apps/api/.env.example` |
| 2 | Wire `bumpTokenVersion()` into team-membership mutations | ✅ DONE (teams) | `apps/api/src/routes/teams.ts` (POST/DELETE `/:id/members`, DELETE `/:id`) |
| 3 | Register `tenantContext` middleware globally | ✅ DONE | `apps/api/src/index.ts` (`authChain = [requestAuth, tenantContext]`) |
| 4 | Roll out `canAccess()` for resource-level ACL | ⚠️ PARTIAL — skills only | `apps/api/src/middleware/access.ts` (NEW `requireAccess()`); `apps/api/src/routes/skills.ts` (GET/PUT/DELETE `/:id`, GET `/:id/versions`) |

### Notes / Caveats

- **Step 1 implementation choice.** Instead of changing `DATABASE_URL` to authenticate as `oppmon_app` (which would require ops to set the role's password and update env files everywhere), we issue `SET LOCAL ROLE oppmon_app` *inside* every `withTenant()` / `withTenantPg()` transaction. SET LOCAL is transaction-scoped, so the pooled connection reverts to its original role on COMMIT/ROLLBACK. Auth bootstrap (`login`/`register`) uses bare `query()` and is unaffected — intentional, because the `users` RLS policy permits empty-string GUC for that path. Set `APP_DB_ROLE=''` to disable.
- **Step 2 scope.** No user-role-update or user-deactivate endpoints exist yet; password change isn't exposed either. The only authorization-changing surface today is team membership, so that's where `bumpTokenVersion()` is wired. When role-change / deactivate / password-change endpoints are added, they MUST also bump.
- **Step 3 wiring.** Every previously-protected route now passes through `[requestAuth, tenantContext]`. Existing handlers that use raw `query()` are unaffected by tenant-context (the GUC just gets set on `req.dbTx` calls, which they don't use yet). New handlers can adopt `req.dbTx((tx) => ...)` to opt into RLS-enforced transactions.
- **Step 4 rollout target.** `requireAccess(resourceType, level)` is a new middleware that calls `lib/authz.canAccess()` inside `req.dbTx`, returning 404 (not 403) on deny so we don't leak existence. It's applied to `skills` resource-instance routes alongside the existing `rbac()` (defense in depth — both must pass). Pending rollout to: `agents`, `models`, `rag_collections`, `mcp_servers`, `workflows` resource-instance routes.

### Verified

- `pnpm --filter @oppmon/api typecheck` — only pre-existing errors remain (memory-manager, litellm-*, models, retrieval); none in files touched by this pass.

---

## TL;DR

- ✅ **No cross-tenant leaks found** in sampled raw SQL queries — every tenant-scoped query filters by `tenant_id = $1` using `req.tenantId` from JWT.
- ✅ **No consolidation drift** in `users.name`/`display_name` or `user_sessions.token`/`token_hash` — app reads only the Prisma fields. Legacy columns coexist on disk for back-fill but are not read.
- ✅ **`'system'` tenant is the only hardcoded tenant ID**, centralized in `apps/api/src/lib/db.ts:SYSTEM_TENANT_ID` and used correctly.
- ⚠️ **RLS exists but the app likely bypasses it.** `oppmon_app` role is created in `2026-05-08_rls_and_rbac.sql` (NOSUPERUSER NOBYPASSRLS), but the API connects via `DATABASE_URL`, which in dev is the superuser. RLS is defense-in-depth at the table level only.
- ⚠️ **Three new files staged but not fully integrated:**
  - `apps/api/src/middleware/tenant-context.ts` — never wired into `index.ts`.
  - `apps/api/src/lib/authz.ts` — `canAccess()` exported, no callers.
  - `apps/api/src/lib/token-version.ts` — `getTokenVersion()` used on every auth check; `bumpTokenVersion()` is not called on role/team mutations.

---

## 1. Writers & Readers per Table

| Table | Write paths | Read paths | Scoping | Status |
|-------|-------------|-----------|---------|--------|
| `tenants` | `POST /api/auth/register` (raw SQL); seeds via `001`, `017`, `2026-05-08` | `GET /api/admin/tenants` (SYSTEM_ADMIN only) | `register` mints a new id; admin list requires SYSTEM_ADMIN | ✅ |
| `tenant_settings` | (none in app code) | (none direct) | RLS-only | ✅ implicit |
| `tenant_routing_states` | `litellm-orchestrator.ts` (Prisma upsert) | `litellm-orchestrator.ts` (Prisma findUnique) | Prisma `where: { tenantId }` | ✅ |
| `users` | `POST /api/auth/register`; login UPDATEs `last_login_at` | `GET /api/auth/me`, `/sessions`; admin user mgmt | Auth bootstrap runs **before** tenant context (intentional) | ⚠️ pre-tenant-context window |
| `user_sessions` | login creates; logout deletes | `GET /api/auth/sessions` (`WHERE user_id = $1`) | User-scoped (single-user table) | ✅ |
| `oauth_accounts` | OAuth flow | (not exposed) | FK to `users` → tenant inherited | ✅ |
| `teams` | `POST/PUT/DELETE /api/admin/teams[/:id]` | `GET /api/admin/teams[/:id]` | All filter `WHERE tenant_id = $N` | ✅ |
| `team_members` | `POST /api/admin/teams/:id/members`, `DELETE …/:memberId` | `GET /api/admin/teams/:id` (joined) | Team is tenant-checked first | ✅ (transitive) |
| `api_keys` | (no live route found) | (no live route found) | n/a | ❓ unused |
| `magic_link_tokens` | (no live route found) | (no live route found) | n/a | ❓ unused |
| `token_versions` | Prisma create at register; `bumpTokenVersion()` upsert | `getTokenVersion()` Prisma findUnique (cached) | User-scoped | ✅ wiring partial |
| `resource_shares` | (no live route found) | `canAccess()` in `lib/authz.ts` (Prisma) | Filters by `tenantId` on row | ⚠️ canAccess unused |

---

## 2. Tenant Scoping Enforcement

### Strongly enforced

- **Raw SQL routes** (`admin.ts`, `auth.ts`, `teams.ts`, `agents.ts`): all writes/reads on tenant-scoped tables use `WHERE tenant_id = $1` with `req.tenantId`.
- **Prisma queries**: explicitly include `where: { tenantId: req.tenantId }`.
- **RLS policies** (`2026-05-08_rls_and_rbac.sql`): 26+ tables have `ENABLE + FORCE ROW LEVEL SECURITY` with policies of the form
  ```sql
  tenant_id = current_setting('app.current_tenant', true)
    OR current_setting('app.current_tenant', true) = 'system'
  ```
- **Audit service**: wraps inserts in `withTenant(entry.tenantId, …)` which calls `set_config('app.current_tenant', $tenantId, true)`.

### Weak spots

1. **Auth bootstrap before tenant context.** `/api/auth/login` and `/api/auth/register` use raw `pool.query()` directly — no `withTenant()` wrap. The `users` RLS policy permits empty-string GUC for this exact reason (login is identity-by-email, no tenant known yet). Acceptable, but means register/login depend on connection role rather than RLS.
2. **`tenantContext` middleware never wired.** Defined at `apps/api/src/middleware/tenant-context.ts` but `index.ts` does not register it. Routes do not call `req.dbTx(...)`. RLS still enforced at DB level if connecting as `oppmon_app`.
3. **`team_members` reads** (`GET /api/admin/teams/:id`) join on `team_id` without re-checking `tenant_id`. Safe today because the preceding `SELECT FROM teams WHERE id = $1 AND tenant_id = $2` constrains the join, but the safety is opaque.

---

## 3. Hardcoded Tenant References

All occurrences of literal `'system'`/`'default'`/`'transformate'`:

| File:Line | Reference | Purpose | Verdict |
|-----------|-----------|---------|---------|
| `apps/api/src/lib/db.ts:6` | `SYSTEM_TENANT_ID = 'system'` | central constant | ✅ |
| `apps/api/src/middleware/request-auth.ts:5,97` | `SYSTEM_TENANT_ID` | `isSystem` flag derivation | ✅ |
| `apps/api/src/middleware/tenant-context.ts:21` | `SYSTEM_TENANT_ID` | resolves tenant for system users | ✅ |
| `apps/api/src/lib/jwt.ts:39` | `payload.tenantId === SYSTEM_TENANT_ID` | sets `isSystem` in JWT | ✅ |
| `apps/api/src/routes/auth.ts:12,94` | `SYSTEM_TENANT_ID` | login → JWT `isSystem` | ✅ |
| `2026-05-08_rls_and_rbac.sql:61` | `INSERT INTO tenants ('system', …)` | seed | ✅ |
| `2026-05-08_rls_and_rbac.sql:186-187` | `current_setting('app.current_tenant', true) = 'system'` | RLS bypass for system tenant | ✅ |
| `001_create_tenants.sql` | seeds `default` | seed | ✅ |
| `017_journal.sql` | upserts `transformate` | seed (now idempotent post-migration cutover) | ✅ |

No unsafe hardcoding. The `'system'` constant is correctly centralized.

---

## 4. Consolidation Drift

### `display_name` vs `name`

- `users.name` is the canonical Prisma field; legacy `display_name` column was added defensively in `006_user_accounts.sql` for back-fill but no app code reads it.
- `models.display_name` is a **separate** field (user-friendly model label) — not the same concept as `users.name`. No drift.

### `token` vs `token_hash`

- `user_sessions.token` is the Prisma `@unique` field used by the app.
- `user_sessions.token_hash` is a defensive ADD COLUMN from `006` — no app reads. Schema is clean.

✅ No drift. The legacy columns exist on disk only; deletion can be planned post-migration-stabilization.

---

## 5. RLS Adoption

### What's wired

- Role `oppmon_app` exists with `NOSUPERUSER NOBYPASSRLS` (line 38).
- `withTenant()` / `withTenantPg()` in `apps/api/src/lib/db.ts` set `app.current_tenant` GUC transactionally (`set_config(..., true)`).
- 26+ tables enable + force RLS with the standard `tenant_id = current_setting('app.current_tenant', true)` policy.
- Audit service is the primary caller of `withTenant()`.

### What's missing

- **App pool likely connects as superuser**, not `oppmon_app`. Check `DATABASE_URL` — in dev it's typically the postgres superuser, which can bypass RLS unless the role has `BYPASSRLS` removed and `FORCE ROW LEVEL SECURITY` is set on each table (which it is — so RLS is enforced even for superuser writes via `FORCE`, but reads can still bypass).
- **`tenantContext` middleware never registered** in `apps/api/src/index.ts`. Routes use raw `query()` without setting the GUC.
- **`req.dbTx` usage** documented in the middleware's example block but unused.

### Risk

⚠️ Medium. RLS is partially relied upon (audit) but not consistently wired. If someone accidentally promotes the app's DB role to BYPASSRLS, all tenant scoping collapses to "trust the app's WHERE clauses" — which is what the current code already does anyway. Defense-in-depth is the missing piece.

### Remediation

1. Set up a dedicated `oppmon_app` Postgres user; point `DATABASE_URL` at it.
2. Wire `tenantContext` middleware into the protected route stack so `app.current_tenant` is set on every transaction.
3. Migrate raw `query()` calls in tenant-scoped routes to `withTenant()`.

---

## 6. New Files: Wiring Status

| File | Status | Wiring | Action |
|------|--------|--------|--------|
| `apps/api/src/lib/authz.ts` | NEW | `canAccess()` exported, **0 callers** | Wire into resource-level ACL (skills, agents, models) when ResourceShare is exposed |
| `apps/api/src/lib/token-version.ts` | NEW | `getTokenVersion()` ✅ used by `request-auth.ts` + `jwt.ts`; `bumpTokenVersion()` ❌ never called | Call `bumpTokenVersion(userId)` after role updates and team-membership changes in `/api/admin/*` routes |
| `apps/api/src/middleware/tenant-context.ts` | NEW | Defined but **not registered** in `apps/api/src/index.ts` | Register globally for `requestAuth`-protected routes |

---

## 7. Suspect List (specific file:line, all currently safe)

| File:Line | Why we checked | Verdict |
|-----------|----------------|---------|
| `apps/api/src/routes/auth.ts:144-150` | `register` mints tenant + user without prior auth | ✅ creates random id; isolated |
| `apps/api/src/routes/admin.ts:21-28` | `GET /api/admin/tenants` lists all tenants | ✅ guarded by `requireSystemTenant()` + `requireRole('SYSTEM_ADMIN')` |
| `apps/api/src/routes/auth.ts:287-297` | `GET /api/auth/sessions` with raw SQL | ✅ filters by `req.user!.id` |
| `apps/api/src/routes/teams.ts:84-96` | `team_members` joined without explicit tenant filter | ✅ team verified before join |
| `apps/api/src/routes/admin.ts:679-703` | `GET /api/admin/llm-usage/users` raw SQL | ✅ `WHERE u.tenant_id = $req.tenantId` present |

No leaks identified.

---

## 8. Critical Findings — Severity Ranked

| # | Finding | Severity | Remediation |
|---|---------|----------|-------------|
| 1 | App likely connects as superuser; RLS not enforced at role level | HIGH | Switch `DATABASE_URL` to `oppmon_app`; or `SET SESSION ROLE oppmon_app` post-connect |
| 2 | `bumpTokenVersion()` not called on role / team-membership changes | MEDIUM | Wire into all admin mutation handlers (PATCH role, POST/DELETE team_members) |
| 3 | `tenantContext` middleware not registered globally | LOW | Wire under `requestAuth` for defense-in-depth |
| 4 | `authz.canAccess()` exported but unused | LOW | Plan resource-level ACL rollout (skills, models, agents) |
| 5 | Frontend middleware accepts legacy lowercase role names | LOW | Drop after a forced re-auth window |
| 6 | Auth bootstrap (`login`/`register`) bypasses `tenantContext` | ACCEPTABLE | Intentional — login is by email, no tenant known yet |

---

## 9. Quick-Reference: Auth Stack per Route Class

| Route class | Middleware chain | Tenant scoping |
|-------------|------------------|----------------|
| `POST /api/auth/register`, `POST /api/auth/login` | (public) | superuser query → mints/loads tenant |
| `GET /api/auth/me`, `GET /api/auth/sessions` | `requestAuth` | scoped by `req.user.id` |
| `GET /api/admin/tenants`, system mgmt | `requestAuth` → `requireSystemTenant()` → `requireRole('SYSTEM_ADMIN')` | global (cross-tenant by design) |
| `GET/POST /api/admin/teams`, `/api/admin/agents`, etc. | `requestAuth` → `requireRole('TENANT_ADMIN')` | `WHERE tenant_id = $req.tenantId` |
| `GET /api/skills`, `/api/models`, `/api/llm/*`, `/api/rag/*` | `requestAuth` | Prisma `where: { tenantId: req.tenantId }` |
| Frontend `/admin/*` | `apps/web/src/middleware.ts` | jose JWT verify; sets `x-tenant-id`, `x-is-system`; checks `ADMIN_ROLES` |

---

## 10. Next Actions (suggested order)

1. **Stand up `oppmon_app` connection** in dev + prod docker-compose; update API to use it.
2. **Wire `bumpTokenVersion()`** into admin mutation handlers — sequential, low risk.
3. **Wire `tenantContext`** middleware globally (start with `apps/api/src/index.ts`); convert raw `query()` calls in tenant-scoped routes to `req.dbTx(...)` or `withTenant(...)` over a follow-up sweep.
4. **Drop legacy `display_name`/`token_hash`** from `users`/`user_sessions` once a stabilization window passes — these were back-fill columns for the migration cutover and have no readers.
5. **Roll out `canAccess()`** in skills/models/agents routes when ResourceShare-based sharing UI is implemented.

---

## Cross-References

- [docs/diagrams/data-model.md §1](../diagrams/data-model.md) — Identity & Tenancy ERD
- [WIP-2026-05-09-migration-id-cutover.md](./WIP-2026-05-09-migration-id-cutover.md) — Migration consolidation context
- `apps/api/scripts/migrations/2026-05-08_rls_and_rbac.sql` — RLS + RBAC source
- `apps/api/src/middleware/request-auth.ts` — JWT verify + `isSystem` flag
- `apps/api/src/middleware/rbac.ts` — Role hierarchy
- `apps/api/src/middleware/tenant-context.ts` — `req.dbTx` factory (unwired)
- `apps/api/src/lib/db.ts` — `SYSTEM_TENANT_ID`, `withTenant()`
- `apps/api/src/lib/authz.ts` — `canAccess()` (unused)
- `apps/api/src/lib/token-version.ts` — `getTokenVersion()`, `bumpTokenVersion()`
