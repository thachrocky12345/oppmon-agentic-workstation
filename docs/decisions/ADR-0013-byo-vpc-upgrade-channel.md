# ADR-0013: BYO-VPC Upgrade Channel — Customer-Managed Image Tag Policy

**Date:** 2026-05-14

**Status:** Accepted

## Context

[ADR-0012](./ADR-0012-residency-model.md) commits us to a BYO-VPC topology
where customers run our container images in their own cloud account. That
raises an operational question: **how do they get updates?**

There are two failure modes we are trying to avoid:

1. **Silent auto-update.** Customers in regulated environments cannot accept
   container images that pull new versions without their change-management
   process running. Anything that does `:latest` is disqualifying.
2. **Stale forever.** Customers who never update will accumulate CVEs and the
   blame surface ends up on us when one of them gets popped.

We also have to be honest about what we control:

- We control the **registry** (image build + push).
- We control the **tag scheme** (`v2.x.y`).
- We do NOT control the customer's deployment runner, their CI, their
  change-approval calendar, or their k8s/swarm topology.

So the channel design has to be **pull-based, semver-pinned, with a clearly
labeled security track** the customer can subscribe to without taking
feature changes.

## Decision

BYO-VPC deployments use a **customer-managed, semver-pinned, pull-based**
upgrade channel with three image tracks and a 90-day deprecation window.

### Three image tracks

| Track | Tag shape | Pushed when | Customer expectation |
|-------|-----------|-------------|----------------------|
| **Stable** | `v2.<minor>.<patch>` | Every signed release | Pin to a specific minor; upgrade on customer's calendar |
| **Security** | `v2.<minor>.<patch>-sec.<n>` | CVE patches only, no feature changes | Pin a watcher; pull within 30 days for HIGH/CRITICAL |
| **Pre-release** | `v2.<minor>.<patch>-rc.<n>` | Release candidates | Optional; for customers who run staging environments |

No `:latest`. No floating tags. No `:edge`.

The Security track is the contract: customers who subscribe to ONLY the
security track get CVE patches against the minor version they have pinned,
with **no feature changes and no schema migrations**. This is the channel
they can put on auto-pull behind their own approval gate.

### Config bundle shape

A BYO-VPC deployment is fully described by one bundle:

```
byo-vpc-bundle/
  config.yaml                 # versioned, signed
  ├─ image_tag: v2.3.1
  ├─ db_dsn_ref: <secret-manager-path>
  ├─ storage:
  │   type: s3 | azure-blob
  │   region: us-east-1
  │   bucket_ref: <secret-manager-path>
  ├─ embedding:
  │   provider: openai-compatible
  │   base_url: https://customer-endpoint
  │   api_key_ref: <secret-manager-path>
  │   dim: 1536
  ├─ llm:
  │   providers: [anthropic, azure-openai, bedrock]
  │   keys_ref: <secret-manager-path>
  ├─ telemetry:
  │   mode: local-only | customer-collector
  │   collector_url: <optional>
  └─ jwt_secret_ref: <secret-manager-path>
```

The bundle is what `tag deploy byo-vpc` (TAG-85) renders. It is the same
shape regardless of whether the customer runs k8s, swarm, or compose.

### No auto-update

We do not provide a customer-side daemon that pulls new images. We do
provide:

- A signed JSON feed of currently-supported tags
  (e.g. `https://updates.arkon.example/v2/manifest.json`)
- A `tag check-updates --channel security` CLI command that diffs the
  customer's pinned tag against the feed and lists what's available.
- Release notes per tag including: changed images, schema migrations
  (yes/no), required config diffs, rollback steps.

The customer decides when to pull.

### 90-day deprecation window

When a minor version goes EoL:

- We announce 90 days before EoL via the manifest feed + release notes.
- Security patches continue for that minor until EoL.
- After EoL, no patches. We will tell the customer this on day zero of the
  90-day window, in writing, with the suggested upgrade path.

This is the explicit contract. Customers running pinned versions know the
clock.

## Alternatives Considered

| Alternative | Pros | Cons | Why Not Chosen |
|-------------|------|------|----------------|
| Auto-update via watchtower-style daemon | Customer always current | Regulated buyers reject anything that pulls without approval; one bad release nukes every BYO-VPC site | Disqualifying for the target market |
| `:latest` tag, customer pins by digest | Simple to publish | Pushes the "what version am I on" problem to the customer; encourages drift; harder to support | Inverts the support burden |
| Customer compiles from source | Maximum control | Requires shipping the source; massive ops cost for them; license / IP question | Out of scope for the product shape |
| Two tracks only (stable + security combined) | Simpler matrix | Customers want to pull CVE patches WITHOUT taking new features; combining them defeats the point | Doesn't solve the actual buyer ask |
| No deprecation window — support every version forever | Customer-friendly | Compounding maintenance cost; security backports to N minors is unbounded work | Operationally unsustainable |

## Consequences

### Positive

- BYO-VPC customers have a clear, written, reproducible upgrade story.
- The Security track is the part that makes procurement comfortable —
  "you can subscribe to CVE patches only and we will not change features
  on you."
- Bundle shape (one config.yaml) means the customer's deployment runner is
  trivial to write. `tag deploy byo-vpc` (TAG-85) renders it; their
  pipeline applies it.
- 90-day deprecation is explicit, so renewal conversations have a date.
- No floating tags means we can never accidentally nuke a customer
  environment with a bad push.

### Negative

- We carry the cost of maintaining N supported minor versions (target: N=2)
  with security backports.
- The Security track means a CVE patch sometimes has to go to multiple
  minors. Process overhead.
- Customers who never check the manifest feed will go stale. We mitigate
  with `tag check-updates` in the CLI runbook (TAG-85) but cannot force
  them.
- Pre-release track tempts customers to run RC in prod. Release notes
  carry a "not for production" header.
- The signed manifest feed is a new piece of infra to keep up. Whoever
  owns releases owns this.

## Related

- [ADR-0012: Residency Model](./ADR-0012-residency-model.md) — the topology
  decision this upgrade channel serves
- [ADR-0010: Document Ingestion Pipeline](./ADR-0010-document-ingestion-pipeline.md)
  — schema migration discipline this channel inherits
- [docs/residency/topology.md](../residency/topology.md) — where BYO-VPC sits
  in the topology matrix
- [TAG-85: BYO-VPC Deployment Package](../jira/TAG-85-byo-vpc-deployment-package.md)
  — the CLI command that renders the bundle defined here
- [TAG-78 epic](../jira/TAG-78-residency-governance-hardening-epic.md)
