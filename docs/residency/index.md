# Residency & Governance

**Last Updated:** 2026-05-14

This directory is the **single source of truth** for how OppMon (Arkon)
handles data residency, cross-tenant isolation, and customer-controlled
deployment topologies. If a procurement reviewer asks "where does my data
live and who else can see it?", point them here.

## Read in this order

1. **[architecture.md](./architecture.md)** — long-form story, file-path
   anchored, with explicit ✅ / 🟡 / 🔴 status per pillar.
2. **[control-plane-vs-data-plane.md](./control-plane-vs-data-plane.md)** —
   responsibility table: what the control plane sees vs. what the data plane
   sees.
3. **[topology.md](./topology.md)** — three deployment topologies side by
   side: SaaS, single-tenant, BYO-VPC.
4. **[cross-tenant-isolation-flow.md](./cross-tenant-isolation-flow.md)** —
   sequence diagram showing how a Tenant B query for a Tenant A collection
   is denied at the SQL layer.

## The two locking decisions

These are governed by ADRs. Future contributors should not relitigate them.

| ADR | Decision |
|-----|----------|
| [ADR-0012](../decisions/ADR-0012-residency-model.md) | Centralize metadata, isolate content; tenant_id enforced at chunk and document layers; pluggable storage / embedding / LLM seams; three deployment topologies. |
| [ADR-0013](../decisions/ADR-0013-byo-vpc-upgrade-channel.md) | BYO-VPC uses customer-managed semver-pinned image tags; separate security track for CVE patches; 90-day deprecation window; no auto-update. |

## The implementation arc

The current code partially implements the model in ADR-0012. The remaining
work is tracked under epic [TAG-78](../jira/TAG-78-residency-governance-hardening-epic.md)
with stories TAG-79..TAG-86 (required) and TAG-87..TAG-88 (stretch).

[architecture.md](./architecture.md) carries the "current status" table that
maps each pillar to either a merged commit or an open ticket. Stories update
that table on merge.
