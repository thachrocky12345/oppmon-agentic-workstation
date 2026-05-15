# Deployment Topologies

**Last Updated:** 2026-05-14

OppMon (Arkon) ships **one codebase, three topologies**. The topology a
customer gets is a config bundle decision — not a code fork. See
[ADR-0012](../decisions/ADR-0012-residency-model.md) for why.

| Topology | DB owner | Storage owner | LLM owner | Telemetry | Upgrade channel |
|----------|----------|---------------|-----------|-----------|-----------------|
| **SaaS (default)** | Arkon | Arkon (region-pinned) | Arkon-keyed OR customer-keyed | Arkon hosted, allowlist-redacted | Arkon controls |
| **Single-tenant managed** | Arkon (dedicated cluster) | Arkon (region-pinned per contract) | Customer-keyed only | Arkon hosted, allowlist-redacted | Arkon controls (with customer maintenance window) |
| **BYO-VPC** | Customer | Customer | Customer-keyed only | Customer hosted (or none in air-gap) | Customer pulls per [ADR-0013](../decisions/ADR-0013-byo-vpc-upgrade-channel.md) |

---

## SaaS (default)

The shared multi-tenant deployment Arkon operates. Tenant isolation is
enforced by `tenant_id` predicates at the SQL layer (the cross-tenant test
from TAG-59 is the contract).

```mermaid
flowchart TB
  subgraph Arkon["Arkon-Operated SaaS Region"]
    LB["Load Balancer"]
    APIA["apps/api"]
    APIK["apps/agent_graph_backend"]
    PG[("Postgres<br/>+ pgvector<br/>tenant_id partitioned")]
    S3[("Storage<br/>S3 / region-pinned")]
    OAI["OpenAI / Anthropic<br/>(Arkon keys or BYOK)"]
    Telem["Telemetry<br/>(Arkon-hosted, allowlist-redacted)"]
  end

  TA["Tenant A user"] --> LB
  TB["Tenant B user"] --> LB
  TC["Tenant C user"] --> LB
  LB --> APIA
  LB --> APIK
  APIA --> PG
  APIK --> PG
  APIK --> S3
  APIK --> OAI
  APIA --> Telem
  APIK --> Telem

  style Arkon fill:#1e3a5f,stroke:#fff,color:#fff
  style TA fill:#5a2d6e,stroke:#fff,color:#fff
  style TB fill:#5a6e2d,stroke:#fff,color:#fff
  style TC fill:#6e5a2d,stroke:#fff,color:#fff
```

**Who can see what:** Arkon SRE can read metadata (tenant ID, model
selection, request counts). Arkon SRE cannot read chat bodies, document
contents, or chunk text — those fields are not in the redaction allowlist
(TAG-84).

---

## Single-tenant managed

Dedicated stack per customer, still inside Arkon's cloud account, but with
its own Postgres cluster, its own storage bucket pinned to the contracted
region, and customer-keyed LLM providers only.

```mermaid
flowchart TB
  subgraph Arkon["Arkon Cloud, Region per Contract"]
    subgraph DedA["Dedicated Stack: Customer A"]
      ApiA["apps/api"]
      KA["apps/agent_graph_backend"]
      PGa[("Postgres<br/>customer A only")]
      S3a[("Storage<br/>region-pinned per contract")]
    end
    Telem["Telemetry<br/>(Arkon-hosted, redacted)"]
  end

  Cust["Customer A users"] --> ApiA
  Cust --> KA
  ApiA --> PGa
  KA --> PGa
  KA --> S3a
  KA --> ExtLLM["Customer A LLM keys<br/>(Anthropic / Azure / Bedrock)"]
  ApiA --> Telem
  KA --> Telem

  style Arkon fill:#1e3a5f,stroke:#fff,color:#fff
  style DedA fill:#1f5132,stroke:#fff,color:#fff
  style Cust fill:#5a2d6e,stroke:#fff,color:#fff
```

**Who can see what:** Same as SaaS, but the storage region is contractually
fixed and the LLM provider keys are the customer's. Arkon never holds the
LLM keys. Compute is still in Arkon's cloud account.

---

## BYO-VPC

Customer runs our images in their cloud account. Arkon publishes images +
manifest; customer pulls per ADR-0013. Optional air-gap mode forbids all
outbound except the customer-pinned LLM endpoint.

```mermaid
flowchart TB
  subgraph CustVPC["Customer VPC (their cloud account, their region)"]
    APIB["apps/api"]
    KB["apps/agent_graph_backend"]
    PGb[("Postgres<br/>customer-operated")]
    S3b[("Storage<br/>customer bucket")]
    EmbedC["Embedding endpoint<br/>(customer-hosted or customer-pinned)"]
    TelemC["Telemetry collector<br/>(customer or none in air-gap)"]
  end

  subgraph ExtLLM["Customer-approved LLM endpoint"]
    LLMx["Anthropic / Azure OpenAI / Bedrock<br/>(customer keys, customer egress rules)"]
  end

  subgraph ArkonReg["Arkon Registry (Arkon-hosted)"]
    Img["Signed images<br/>v2.x.y, v2.x.y-sec.n"]
    Man["Manifest feed<br/>(signed JSON)"]
  end

  Users["Customer users"] --> APIB
  Users --> KB
  APIB --> PGb
  KB --> PGb
  KB --> S3b
  KB --> EmbedC
  KB -.->|customer egress allowlist| LLMx
  APIB --> TelemC
  KB --> TelemC

  ArkonReg -.->|customer pulls on their schedule| CustVPC

  style CustVPC fill:#1f5132,stroke:#fff,color:#fff
  style ExtLLM fill:#5a2d6e,stroke:#fff,color:#fff
  style ArkonReg fill:#1e3a5f,stroke:#fff,color:#fff
```

**Who can see what:** Arkon sees nothing about the customer's runtime. The
manifest feed is read-only and outbound from Arkon. The customer's
telemetry collector (if any) is theirs. In air-gap mode the only outbound
is the customer-pinned LLM endpoint.

**Upgrades:** governed by [ADR-0013](../decisions/ADR-0013-byo-vpc-upgrade-channel.md).
`tag deploy byo-vpc` renders the bundle (TAG-85).

---

## Why one codebase

[ADR-0012](../decisions/ADR-0012-residency-model.md) commits us to a single
codebase across all three topologies. The seams (storage / embedding / LLM)
let topology be a config decision, not a fork.

The Three Pillars from the residency architecture map cleanly:

| Pillar | SaaS | Single-tenant | BYO-VPC |
|--------|------|---------------|---------|
| tenant_id SQL predicate | ✅ shared cluster | ✅ even though only one tenant | ✅ (paranoia + parity) |
| Pluggable seams | ✅ but Arkon-configured | ✅ region-pinned per contract | ✅ customer-configured |
| Per-request LLM client | ✅ | ✅ | ✅ |

## Related

- [ADR-0012](../decisions/ADR-0012-residency-model.md)
- [ADR-0013](../decisions/ADR-0013-byo-vpc-upgrade-channel.md)
- [architecture.md](./architecture.md)
- [control-plane-vs-data-plane.md](./control-plane-vs-data-plane.md)
- [TAG-85: BYO-VPC Deployment Package](../jira/TAG-85-byo-vpc-deployment-package.md)
