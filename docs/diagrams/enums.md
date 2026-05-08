# Enum Reference

**Last updated:** 2026-05-10 (post schema consolidation)

This appendix lists every enumerated value in the OppMon (Arkon) database, whether the constraint lives in a Prisma `enum`, a Postgres `CHECK` constraint, or an unconstrained string column with an enforced application-layer vocabulary.

## Prisma Enums

| Enum | Values | Used By |
|---|---|---|
| `Role` | `OWNER`, `ADMIN`, `EDITOR`, `VIEWER` | `users.role`, JWT claims |
| `TeamRole` | `LEAD`, `MEMBER`, `OBSERVER` | `team_memberships.role` |
| `TenantStatus` | `ACTIVE`, `SUSPENDED`, `DELETED` | `tenants.status` |
| `IncidentStatus` | `OPEN`, `INVESTIGATING`, `RESOLVED`, `CLOSED` | `incidents.status` |
| `IncidentSeverity` | `LOW`, `MEDIUM`, `HIGH`, `CRITICAL` | `incidents.severity` |
| `WorkflowStatus` | `DRAFT`, `ACTIVE`, `PAUSED`, `ARCHIVED` | `workflows.status` |
| `RunStatus` | `PENDING`, `RUNNING`, `SUCCEEDED`, `FAILED`, `CANCELLED` | `workflow_runs.status` |
| `EmbeddingProvider` | `openai`, `gemini`, `voyage`, `cohere`, `baai` | written into `*.embedding_provider` (string column, vocabulary enforced in app) |

> **Removed:** The `AuditAction` enum was deleted in `2026-05-10_audit_consolidation.sql`. Audit events now write `action` as a free-form string into `audit_log_v2`.

## CHECK-constraint Vocabularies

| Table.Column | Constraint | Values | Source Migration |
|---|---|---|---|
| `memory_facts.kind` | `memory_facts_kind_check` | `preference`, `project-context`, `decision`, `person`, `pattern`, `semantic`, `workflow`, `toolbox`, `entity` | `2026-05-10_memory_consolidation.sql` |
| `_migrations.status` | `_migrations_status_check` | `applied`, `failed`, `rolled_back` | `2026-05-10_migrations_metadata.sql` |
| `notifications.severity` | (vocabulary, no CHECK) | `info`, `warning`, `error`, `success` | `2026-05-10_notifications_consolidation.sql` |
| `notifications.type` | (vocabulary, no CHECK) | `system`, `incident`, `budget`, `security`, `agent`, `test`, `info` | enforced in `apps/api/src/routes/notifications.ts` |
| `event_outbox.event_type` | (vocabulary, no CHECK) | `<aggregate>.<verb>`, e.g. `incident.created`, `agent.registered` | `2026-05-10_event_outbox.sql` |
| `event_outbox.aggregate_type` | (vocabulary, no CHECK) | `incident`, `agent`, `workflow`, `tenant`, `user` | enforced in `apps/api/src/lib/outbox.ts` callers |

## Application-Layer Vocabularies

These columns are plain `TEXT` with vocabulary enforced by Zod schemas or service code. Listed for completeness — DB layer accepts any string.

| Column | Values | Enforced In |
|---|---|---|
| `agents.status` | `idle`, `running`, `error`, `paused` | `apps/api/src/routes/agents.ts` |
| `events.event_type` | `prompt`, `response`, `tool_call`, `tool_result`, `error`, `audit` | `apps/api/src/routes/events.ts` |
| `events.threat_level` | `none`, `low`, `medium`, `high`, `critical` | `apps/api/src/agent/threat-classifier.ts` |
| `tenant_archives.reason` | `gdpr_dsr`, `admin`, `churn`, `cascade_delete` | `apps/api/src/services/tenant-archival.ts` |
| `audit_log_v2.action` | `READ`, `CREATE`, `UPDATE`, `DELETE`, `DENIED`, `LOGIN`, `LOGOUT`, `LOGIN_FAILED`, `PERMISSION_CHANGE` | `apps/api/src/lib/audit.ts` |
| `audit_log_v2.actor_type` | `user`, `agent`, `system`, `api_key` | `apps/api/src/lib/audit.ts` |
| `tool_calls.status` | `pending`, `running`, `completed`, `failed`, `denied` | `apps/api/src/agent/toolbox.ts` |

## Why a mix of Prisma enums and CHECK constraints?

- **Prisma enum** — when the value is part of a domain model that the API exposes via typed responses; gives compile-time safety on the TS side.
- **CHECK constraint** — when the vocabulary needs to evolve with raw-SQL migrations (the consolidation migrations couldn't add Prisma enums without churning the client).
- **Application vocabulary** — append-only event tables (`audit_log_v2`, `event_outbox`) where new values land frequently; freezing them in the DB schema would slow shipping.
