# Triggers, Functions, and RLS Policies

**Last updated:** 2026-05-10 (post schema consolidation)

This appendix is the single source of truth for every database-side behavior — triggers, stored functions, RLS policies, and DB roles.

## Triggers

| Name | Table | Event | Function | Purpose |
|---|---|---|---|---|
| `tenants_snapshot_trigger` | `tenants` | `BEFORE DELETE` | `tenants_snapshot_before_delete()` | Snapshot tenant + child row counts into `tenant_archives` and write a `tenant_deletion_audit` row before the cascade fires. GDPR proof-of-deletion. |
| `events_threat_classifier_trigger` | `events` | `BEFORE INSERT` | `classify_event_threat()` | Populates `threat_level` and `threat_classes` from regex/heuristic rules. |
| `audit_log_v2_no_update_trigger` | `audit_log_v2` | `BEFORE UPDATE` | `raise_immutable_audit()` | Hard-blocks any UPDATE on the audit table; defense-in-depth on top of `REVOKE UPDATE`. |
| `audit_log_v2_no_delete_trigger` | `audit_log_v2` | `BEFORE DELETE` | `raise_immutable_audit()` | Hard-blocks any DELETE on the audit table. |
| `tenant_archives_immutable` | `tenant_archives` | `BEFORE UPDATE/DELETE` | `raise_immutable_audit()` | Same immutability story as `audit_log_v2`. |

> Triggers added by the `2026-05-10_*` consolidation migrations are flagged in their corresponding migration headers. The defense-in-depth triggers complement `REVOKE UPDATE, DELETE FROM oppmon_app` — that revocation prevents the app role from mutating; the trigger prevents *anyone* (including superusers running as the app) from mutating.

## Stored Functions

| Name | Signature | Purpose |
|---|---|---|
| `tenants_snapshot_before_delete()` | `() RETURNS trigger` | See `tenants_snapshot_trigger`. Reads tenant id from `OLD`, builds a JSONB row-count snapshot, inserts into `tenant_archives` + `tenant_deletion_audit`. |
| `classify_event_threat()` | `() RETURNS trigger` | Populates `events.threat_level` / `threat_classes` based on regex matches against `events.content`. |
| `raise_immutable_audit()` | `() RETURNS trigger` | Trivial trigger: `RAISE EXCEPTION 'audit table is immutable'`. Used by every immutability trigger. |
| `current_tenant()` | `() RETURNS text` | Convenience accessor for `current_setting('app.current_tenant', true)`. Used in RLS policies for readability. |
| `time_bucket(...)` | TimescaleDB built-in | Used by every continuous aggregate (`daily_stats_cagg`, `mcp_calls_hourly_cagg`). |

## RLS Policies

All tenant-scoped tables follow the same pattern:

```sql
CREATE POLICY tenant_isolation_<table> ON <table>
  USING (
    tenant_id = current_setting('app.current_tenant', true)
    OR current_setting('app.current_tenant', true) = 'system'
  )
  WITH CHECK (
    tenant_id = current_setting('app.current_tenant', true)
    OR current_setting('app.current_tenant', true) = 'system'
  );
```

The `system` tenant escape hatch is what global-admin operations use (cron jobs, background drainers, smoke tests).

| Policy | Table | Notes |
|---|---|---|
| `tenant_isolation_<table>` | every tenant-scoped table with a `tenant_id` column | Standard tenant_id == GUC pattern. |
| `tenant_isolation_notifications` | `notifications` | **JOIN-based** — notifications has no `tenant_id`; policy joins `user_id → users.tenant_id`. Added in `2026-05-10_notifications_consolidation.sql`. |
| `tenant_isolation_memory_facts` | `memory_facts` | Standard pattern, but added in the consolidation migration after RLS was previously off. |
| `tenant_isolation_event_outbox` | `event_outbox` | Standard. Drainer runs as `system`. |
| `tenant_isolation_idempotency_keys` | `idempotency_keys` | Standard. |
| `<table>_with_soft_delete` | every soft-deletable table | `2026-05-10_soft_delete_and_archival.sql` rewrites the standard policy to add `AND (deleted_at IS NULL OR app.current_tenant = 'system')`. The `system` tenant continues to see soft-deleted rows for admin/audit. |

> **Operator note:** `audit_log_v2`, `tenant_archives`, and `tenant_deletion_audit` enable RLS but do not have soft-delete filtering — they are append-only and tenant-scoped only via the GUC.

## DB Roles

| Role | Privileges | Used By |
|---|---|---|
| `oppmon_app` | NOSUPERUSER, NOBYPASSRLS. SELECT/INSERT/UPDATE/DELETE on tenant tables; SELECT/INSERT only on `audit_log_v2`, `tenant_archives`, `tenant_deletion_audit`. | API process. Set via `SET LOCAL ROLE` inside `withTenant()` / `withTenantPg()`. |
| `oppmon` (default superuser) | All privileges. | Migrations, smoke scripts. Disable role-demotion via `APP_DB_ROLE=''`. |
| `mcadmin` | NOSUPERUSER. SELECT on every tenant for admin dashboards; no write. | Internal admin tooling. |

## Where the policies/triggers/roles are defined

| File | Owns |
|---|---|
| `apps/api/scripts/migrations/2026-05-08_rls_and_rbac.sql` | Initial RLS rollout, `oppmon_app` role creation, base `tenant_isolation_*` policies. |
| `apps/api/scripts/migrations/2026-05-10_soft_delete_and_archival.sql` | Soft-delete refresh of every policy + `tenant_archives` + `tenant_deletion_audit` + `tenants_snapshot_trigger`. |
| `apps/api/scripts/migrations/2026-05-10_audit_consolidation.sql` | `audit_log_v2` immutability triggers. |
| `apps/api/scripts/migrations/2026-05-10_memory_consolidation.sql` | `memory_facts.kind` CHECK + `tenant_isolation_memory_facts`. |
| `apps/api/scripts/migrations/2026-05-10_notifications_consolidation.sql` | JOIN-based `tenant_isolation_notifications`. |
| `apps/api/scripts/migrations/2026-05-10_event_outbox.sql` | `tenant_isolation_event_outbox`. |
| `apps/api/scripts/migrations/2026-05-10_idempotency_keys.sql` | `tenant_isolation_idempotency_keys`. |

## Verifying in a running DB

```sql
-- All triggers
SELECT event_object_table, trigger_name, action_timing, event_manipulation
  FROM information_schema.triggers
 WHERE trigger_schema = 'public'
 ORDER BY event_object_table, trigger_name;

-- All RLS policies
SELECT schemaname, tablename, policyname, cmd, qual, with_check
  FROM pg_policies
 WHERE schemaname = 'public'
 ORDER BY tablename, policyname;

-- All non-extension functions
SELECT n.nspname, p.proname, pg_get_function_arguments(p.oid) AS args
  FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
 WHERE n.nspname = 'public'
   AND p.prokind = 'f'
 ORDER BY p.proname;

-- Roles
SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname LIKE 'oppmon%' OR rolname = 'mcadmin';
```
