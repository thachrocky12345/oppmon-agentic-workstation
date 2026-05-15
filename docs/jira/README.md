# Team AI Gateway - 48-Day Build Plan

## Overview

This directory contains 42 detailed JIRA-style tickets for the Team AI Gateway build, following a 48-day sprint schedule with Sundays off (Days 7, 14, 21, 28, 35, 42).

**Total Story Points:** ~286 points across 42 working days

**Week 5 Focus:** Admin patterns from Lumy-Backend Django, migration safety, CI/CD hardening, and deployment runbooks.

**Week 6 Focus:** Agent memory system, tool architecture, oracle loop, RAG enhancement, and domain pipelines (from agent-research-assistant patterns).

**Week 7 Focus:** Skill definition framework, research automation, Go+Rust high-performance engine, observability, and security guardrails (from phd-ai-cybersec-skills patterns).

## Quick Links by Week

### Week 1 — Foundation (Days 1-6)
| Day | Ticket | Points | Focus |
|-----|--------|--------|-------|
| 1 | [TAG-01: Repo + DB + Auth Shell](./jira_day01.md) | 5 | Monorepo, PostgreSQL, OAuth/JWT |
| 2 | [TAG-02: Skills Registry CRUD](./jira_day02.md) | 8 | RBAC, audit logging, scope filtering |
| 3 | [TAG-03: MCP Servers + Bundle Storage](./jira_day03.md) | 8 | Storage abstraction, sha256 verification |
| 4 | [TAG-04: RAG MCP Server + Ingestion](./jira_day04.md) | 13 | **CRITICAL: Cross-tenant isolation** |
| 5 | [TAG-05: CLI Scaffold: Login + Status](./jira_day05.md) | 5 | OAuth device flow, keychain storage |
| 6 | [TAG-06: Buffer Day + Smoke Test](./jira_day06.md) | 3 | Week 1 consolidation |

### Week 2 — CLI Product (Days 8-13)
| Day | Ticket | Points | Focus |
|-----|--------|--------|-------|
| 8 | [TAG-08: `tag sync` Skills](./jira_day08.md) | 8 | sha256 verification, interrupt recovery |
| 9 | [TAG-09: `tag sync` MCP + .mcp.json](./jira_day09.md) | 8 | User entry preservation, diff command |
| 10 | [TAG-10: RAG Ingestion CLI](./jira_day10.md) | 5 | Idempotency, auto MCP registration |
| 11 | [TAG-11: `tag init` + Project Config](./jira_day11.md) | 5 | Team scoping, wizard |
| 12 | [TAG-12: E2E Smoke + Onboarding](./jira_day12.md) | 3 | <5 min onboarding target |
| 13 | [TAG-13: Buffer Day](./jira_day13.md) | 2 | Week 2 consolidation |

### Week 3 — Admin UI + Observability (Days 15-20)
| Day | Ticket | Points | Focus |
|-----|--------|--------|-------|
| 15 | [TAG-15: Admin UI: Teams + Members](./jira_day15.md) | 8 | Auth gate, form validation |
| 16 | [TAG-16: Admin UI: Skills + MCP Registry](./jira_day16.md) | 8 | Toggle propagation, bundle upload |
| 17 | [TAG-17: Resource-Centric Event Logging](./jira_day17.md) | 8 | **CRITICAL: NO user_id storage** |
| 18 | [TAG-18: Claude Code Hook Integration](./jira_day18.md) | 8 | Non-blocking hooks, buffer management |
| 19 | [TAG-19: Usage Dashboard + Polish](./jira_day19.md) | 5 | Empty states, mobile responsive |
| 20 | [TAG-20: Buffer + Week 3 Retro](./jira_day20.md) | 3 | "Would I use this?" check |

### Week 4 — Users + Ship (Days 22-27)
| Day | Ticket | Points | Focus |
|-----|--------|--------|-------|
| 22 | [TAG-22: User Onboarding Round 1](./jira_day22.md) | 2 | Observation only, friction capture |
| 23 | [TAG-23: Fix Critical Friction](./jira_day23.md) | 5 | Regression tests for each fix |
| 24 | [TAG-24: Async Onboarding + tag doctor](./jira_day24.md) | 5 | Diagnostic command |
| 25 | [TAG-25: Fix Annoying Friction + Polish](./jira_day25.md) | 5 | Error message audit, README freshness |
| 26 | [TAG-26: Stability Pass](./jira_day26.md) | 3 | Log analysis, CHANGELOG accuracy |
| 27 | [TAG-27: Final Smoke + Retrospective](./jira_day27.md) | 3 | Clean-slate verification |

### Week 5 — Admin & DevOps Improvements (Days 29-34)
| Day | Ticket | Points | Focus |
|-----|--------|--------|-------|
| 29 | [TAG-29: Enhanced Admin with Audit Actions](./jira_day29.md) | 8 | Django-style admin patterns, fraud logging |
| 30 | [TAG-30: Migration Safety Framework](./jira_day30.md) | 8 | Data migrations, safety checks, rollback |
| 31 | [TAG-31: CI/CD Pipeline Hardening](./jira_day31.md) | 8 | Multi-stage deploy, approval gates |
| 32 | [TAG-32: Admin Custom Views & File Uploads](./jira_day32.md) | 5 | CSV import/export, report processing |
| 33 | [TAG-33: Deployment Runbooks & Rollback](./jira_day33.md) | 5 | Operational documentation |
| 34 | [TAG-34: Week 5 Integration & Documentation](./jira_day34.md) | 3 | Integration testing, knowledge transfer |

### Week 6 — Agent Core (Days 36-41)
| Day | Ticket | Points | Focus |
|-----|--------|--------|-------|
| 36 | [TAG-36: Agent Memory System Architecture](./jira_day36.md) | 13 | 8-table memory pattern, MemoryManager API |
| 37 | [TAG-37: Tool System Architecture](./jira_day37.md) | 13 | Decorator registration, parallel execution |
| 38 | [TAG-38: Oracle Agent Loop Implementation](./jira_day38.md) | 13 | 6-step pipeline, iterative tool calling |
| 39 | [TAG-39: Advanced RAG Enhancement](./jira_day39.md) | 8 | MMR, hybrid BM25+vector, HyDE |
| 40 | [TAG-40: Domain-Specific Preprocessing](./jira_day40.md) | 8 | Pattern detection, enrichment pipelines |
| 41 | [TAG-41: Week 6 Integration & Testing](./jira_day41.md) | 3 | NDCG/MRR benchmarks, documentation |

### Week 7 — Skills & Multi-Agent (Days 43-48)
| Day | Ticket | Points | Focus |
|-----|--------|--------|-------|
| 43 | [TAG-43: Skill Definition Framework](./jira_day43.md) | 8 | YAML frontmatter, intent-based triggers |
| 44 | [TAG-44: Skill Templates & Research Automation](./jira_day44.md) | 8 | Experiment logs, citation verification |
| 45 | [TAG-45: High-Performance Agent Engine](./jira_day45.md) | 13 | **Go + Rust architecture, parallel execution** |
| 46 | [TAG-46: Observability & Tracing](./jira_day46.md) | 8 | OpenTelemetry, Langfuse, consensus metrics |
| 47 | [TAG-47: Security & Ethics Guardrails](./jira_day47.md) | 8 | Scope boundaries, content filtering, audit |
| 48 | [TAG-48: Week 7 Integration & Final Docs](./jira_day48.md) | 3 | Complete system validation, demo ready |

## Hardening Phase — Residency & Governance (TAG-78..TAG-88)

Foundation: [ADR-0012 Residency Model](../decisions/ADR-0012-residency-model.md),
[ADR-0013 BYO-VPC Upgrade Channel](../decisions/ADR-0013-byo-vpc-upgrade-channel.md),
and [docs/residency/](../residency/index.md).

Closes the gap between "we have a residency story on paper" and "a
regulated-sector buyer can sign a contract on it." Pillar status is
tracked live in [docs/residency/architecture.md](../residency/architecture.md)
§ "Current status at a glance".

### Epic

| Ticket | Title | Points |
|---|---|---|
| [TAG-78](./TAG-78-residency-governance-hardening-epic.md) | Residency & Governance Hardening (EPIC) | 34 |

### Required stories

| Ticket | Title | Points | Layer |
|---|---|---|---|
| [TAG-79](./TAG-79-region-pinned-storage.md) | Pluggable region-pinned storage (S3 + AzureBlob) | 5 | Backend / Infra |
| [TAG-80](./TAG-80-ts-embedding-baseurl-parity.md) | TS embedding base_url + dim guard parity | 3 | Backend |
| [TAG-81](./TAG-81-ts-rag-cross-tenant-audit.md) | TS RAG cross-tenant audit + negative test | 3 | Backend / Security |
| [TAG-82](./TAG-82-collection-scope-enforcement.md) | Collection scope enforcement (API 403 + UI) | 5 | Backend + Frontend |
| [TAG-83](./TAG-83-azure-bedrock-llm-clients.md) | Azure OpenAI + Bedrock LLM clients | 5 | Backend |
| [TAG-84](./TAG-84-telemetry-redaction-layer.md) | Telemetry redaction layer + CI lint | 5 | Observability / CI |
| [TAG-85](./TAG-85-byo-vpc-deployment-package.md) | BYO-VPC deployment package + runbook | 5 | DevOps / CLI |
| [TAG-86](./TAG-86-ui-residency-surface.md) | UI residency surface (badge + docs page) | 3 | Frontend |

### Stretch stories

| Ticket | Title | Points | Layer |
|---|---|---|---|
| [TAG-87](./TAG-87-soc2-hipaa-evidence-pack.md) | SOC2 / HIPAA evidence pack generator | 5 | Compliance |
| [TAG-88](./TAG-88-tenant-export-purge.md) | Tenant data export + purge (GDPR Art. 17) | 5 | Backend / Compliance |

### Non-negotiables for this phase

1. **No app code lands in the planning sprint** — only the epic + stories + ADRs + framing docs.
2. **Every retrieval surface has its own cross-tenant negative test** (TAG-59 ✅, TAG-81 🟡).
3. **Telemetry redaction is allowlist + lint + ripgrep** — fail closed at three layers (TAG-84).
4. **BYO-VPC uses customer-pulled semver-pinned image tags** — no `:latest`, no auto-update (ADR-0013).
5. **Every merged story flips its pillar row in `docs/residency/architecture.md` from 🟡/🔴 to ✅** with the commit SHA — drift is detected on every quarter-close audit.

## Non-Negotiable Rules

These rules are architectural commitments that must be enforced:

1. **Day 4 tests written BEFORE implementation** — Cross-tenant isolation is the security boundary
2. **Day 17 never stores user_id** — Privacy commitment is architectural
3. **Every mutation audited** — audit_log is always present
4. **sha256 verified on sync** — Supply chain security
5. **RBAC negative tests exist** — Not just happy path

## Critical Security Boundaries

### Cross-Tenant Isolation (Day 4)
```typescript
// MUST PASS before Day 4 implementation
describe('CROSS-TENANT ISOLATION', () => {
  it('tenant B JWT searching "alpha-secret" returns 0 results')
  it('tenant A JWT searching "alpha-secret" returns 3 results')
})
```

### Privacy-by-Design (Day 17)
```typescript
// MUST PASS before Day 17 PR merge
describe('PRIVACY ENFORCEMENT', () => {
  it('usage_events has no user_id column')
  it('events_enabled defaults to false for new tenants')
  it('GET /api/usage response contains no user fields')
})
```

## Ticket Template Structure

Each ticket follows this format:
- **Description** with suggested points and complexity reasoning
- **Objective** statement
- **Requirements** organized by category
- **Implementation Notes** by layer (Backend/Frontend/CLI/Database)
- **Unit Tests** table with specific file paths, test cases, and assertions
- **Integration Tests** table with scenarios, setup, steps, and expected results
- **Acceptance Criteria** with testable conditions
- **Review Checklist** with security/quality questions
- **Dependencies** (depends on / blocks)
- **Risk Factors** with mitigations

## Points Distribution

| Week | Days | Points | Focus |
|------|------|--------|-------|
| 1 | 1-6 | 42 | Foundation infrastructure |
| 2 | 8-13 | 36 | CLI product features |
| 3 | 15-20 | 40 | Admin UI + observability |
| 4 | 22-27 | 23 | Users + polish + ship |
| 5 | 29-34 | 37 | Admin patterns + DevOps |
| 6 | 36-41 | 58 | Agent core (memory, tools, RAG) |
| 7 | 43-48 | 48 | Skills + multi-agent + guardrails |
| **Total** | **42** | **284** | |

## File Inventory

```
arkon/docs/jira/
├── README.md (this file)
│
├── # Week 1 — Foundation
├── jira_day01.md - Repo + DB + Auth Shell
├── jira_day02.md - Skills Registry CRUD
├── jira_day03.md - MCP Servers + Bundle Storage
├── jira_day04.md - RAG MCP Server + Ingestion
├── jira_day05.md - CLI Scaffold
├── jira_day06.md - Buffer Day + Smoke Test
│
├── # Week 2 — CLI Product
├── jira_day08.md - tag sync Skills
├── jira_day09.md - tag sync MCP + .mcp.json
├── jira_day10.md - RAG Ingestion CLI
├── jira_day11.md - tag init + Project Config
├── jira_day12.md - E2E Smoke + Onboarding
├── jira_day13.md - Buffer Day
│
├── # Week 3 — Admin UI + Observability
├── jira_day15.md - Admin UI: Teams + Members
├── jira_day16.md - Admin UI: Skills + MCP Registry
├── jira_day17.md - Resource-Centric Event Logging
├── jira_day18.md - Claude Code Hook Integration
├── jira_day19.md - Usage Dashboard + Polish
├── jira_day20.md - Buffer + Week 3 Retro
│
├── # Week 4 — Users + Ship
├── jira_day22.md - User Onboarding Round 1
├── jira_day23.md - Fix Critical Friction
├── jira_day24.md - Async Onboarding + tag doctor
├── jira_day25.md - Fix Annoying Friction + Polish
├── jira_day26.md - Stability Pass
├── jira_day27.md - Final Smoke + Retrospective
│
├── # Week 5 — Admin & DevOps Improvements
├── jira_day29.md - Enhanced Admin with Audit Actions
├── jira_day30.md - Migration Safety Framework
├── jira_day31.md - CI/CD Pipeline Hardening
├── jira_day32.md - Admin Custom Views & File Uploads
├── jira_day33.md - Deployment Runbooks & Rollback
├── jira_day34.md - Week 5 Integration & Documentation
│
├── # Week 6 — Agent Core
├── jira_day36.md - Agent Memory System Architecture
├── jira_day37.md - Tool System Architecture
├── jira_day38.md - Oracle Agent Loop Implementation
├── jira_day39.md - Advanced RAG Enhancement
├── jira_day40.md - Domain-Specific Preprocessing
├── jira_day41.md - Week 6 Integration & Testing
│
├── # Week 7 — Skills & Multi-Agent
├── jira_day43.md - Skill Definition Framework
├── jira_day44.md - Skill Templates & Research Automation
├── jira_day45.md - High-Performance Agent Engine (Go + Rust)
├── jira_day46.md - Observability & Tracing Integration
├── jira_day47.md - Security & Ethics Guardrails
└── jira_day48.md - Week 7 Integration & Final Documentation
```

**Total Files:** 43 (42 daily tickets + this README)

## Days Off (No Tickets)
- Day 7 (Sunday, Week 1)
- Day 14 (Sunday, Week 2)
- Day 21 (Sunday, Week 3)
- Day 28 (Sunday, Week 4)
- Day 35 (Sunday, Week 5)
- Day 42 (Sunday, Week 6)

## Week 5 Patterns (From Lumy-Backend Django)

Week 5 incorporates production patterns learned from the Lumy-Backend Django project:

### Admin Action Patterns
```python
# Pattern: Custom admin actions with audit logging
@admin.action(description="Retry failed charges")
def retry_failed_charges(self, request, queryset):
    fraud_logger.warning("Admin action executed", extra={...})
    queue.enqueue('process_charge', fee_id=fee.id)
```

### Migration Safety Patterns
```python
# Pattern: Three-step NOT NULL addition
# Step 1: Add nullable field
# Step 2: Backfill existing records
# Step 3: Make non-nullable
```

### CI/CD Pipeline Patterns
```yaml
# Pattern: Multi-stage with approval gates
jobs:
  test: ...
  build:
    needs: test
  deploy:
    needs: build
    environment: production  # Requires approval
```

## Week 6 Patterns (From agent-research-assistant)

Week 6 implements agent infrastructure patterns from the agent-research-assistant project:

### 8-Table Memory Architecture
```typescript
// Pattern: Partitioned memory for different purposes
const MEMORY_TABLES = [
  'conversational_memory',  // Thread history
  'semantic_memory',        // Knowledge base (pgvector)
  'workflow_memory',        // Multi-step patterns
  'toolbox_memory',         // Tool descriptions (augmented)
  'entity_memory',          // Extracted entities
  'summary_memory',         // Compressed context
  'persona_memory',         // Agent character
  'tool_log_memory',        // Execution history
]
```

### Oracle Agent Loop (6 Steps)
```
Request → Preprocessing → Memory Prefetch → Context Build →
  LOOP: LLM → Tools → Synthesis →
Memory Sync → Response
```

### REFRAG RAG Enhancement
```typescript
// Compression → Sensing → Expansion
const refragPipeline = {
  compression: { chunkSize: 800, overlap: 100, summarize: true },
  sensing: { mmrLambda: 0.5 },  // Balance relevance vs diversity
  expansion: { hyde: true, multiVector: true },
}
```

## Week 7 Patterns (From phd-ai-cybersec-skills)

Week 7 implements skill and multi-agent patterns from phd-ai-cybersec-skills:

### Intent-Based Skill Triggers
```yaml
---
name: literature-review
description: |
  Use this skill when the user wants to survey a field, map related work,
  perform gap analysis, or asks "what has been done on [topic]".
triggers:
  - "survey a field"
  - "gap analysis"
  - "related work section"
---
```

### Go + Rust Architecture
```
┌─────────────────────┐      ┌─────────────────────┐
│   Go Orchestrator   │      │    Rust Engine      │
│  - HTTP/SSE server  │ TCP  │  - Parallel tools   │
│  - Event routing    │◄────►│  - Vector ops       │
│  - Rate limiting    │      │  - Risk gate        │
└─────────────────────┘      └─────────────────────┘
```

### Security Scope Boundaries
```typescript
// Explicit in-scope vs out-of-scope definitions
const securityResearchScope = {
  inScope: [
    'Analyzing vulnerability classes and mitigations',
    'Building datasets for security ML',
    'Responsible disclosure processes',
  ],
  outOfScope: [
    'Producing functional exploits',
    'Generating malware or ransomware',
    'Attacking unauthorized systems',
  ],
}
```

### Grep-able Audit Markers
```markdown
[DRAFT]     - AI-generated section needing review
[VERIFY: x] - Specific claim requiring verification
[NOT READ]  - Paper not yet reviewed
[VIVA?]     - Defense vulnerability point
```
