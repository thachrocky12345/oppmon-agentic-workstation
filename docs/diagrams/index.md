# Architecture Diagrams

**Last Updated:** 2026-05-10 (post schema improvement plan)

This directory contains Mermaid architecture diagrams for the OppMon (Arkon) project.

## Diagrams

| File | Description | Last Updated |
|------|-------------|--------------|
| [architecture.md](architecture.md) | System component overview with LLM/RAG services | 2026-05-07 (init sync) |
| [dependencies.md](dependencies.md) | Package dependency graph (monorepo structure) | 2026-05-07 (init sync) |
| [data-model.md](data-model.md) | Full DB inventory: 82 tables across 11 domains, per-domain ERDs, migration error→fix lookup, ops quick-reference | 2026-05-10 (post consolidation) |
| [deployment.md](deployment.md) | Docker Compose deployment architecture | 2026-05-07 (init sync) |
| [enums.md](enums.md) | Every Prisma enum + CHECK-constraint vocabulary in the schema | 2026-05-10 |
| [triggers-and-policies.md](triggers-and-policies.md) | Triggers, stored functions, RLS policies, DB roles | 2026-05-10 |

## Quick Links

- **System Architecture**: How components connect (frontend, API, router, database, LLM providers, agent subsystem, guardrails, CLI)
- **Dependencies**: Package graph for the monorepo including router app, agent-engine, guardrails, observability, skill-framework
- **Data Model**: Comprehensive DB schema reference covering all 82 tables across Identity & Tenancy, Agent Runtime, LLM/Routing/MCP, Memory Subsystem, RAG, Journal, Workflows/Skills, Audit & Usage, Notifications, Infrastructure & Cost, Security & Rate Limit. Includes pgvector dimensions, TimescaleDB hypertables, RLS policies, idempotent migration patterns, and an error→fix lookup for the seven legacy migrations consolidated on 2026-05-09.
- **Deployment**: Docker services (oppmon-*), ports, volumes, and profiles + production Swarm stack

## Usage

All diagrams use Mermaid syntax and can be viewed:
- Directly on GitHub (renders automatically)
- In VS Code with Mermaid preview extension
- In any Mermaid-compatible viewer

## Updating Diagrams

Diagrams are automatically updated when running `/init`. Manual edits are preserved but may be overwritten if the structure changes significantly.

## Adding New Diagrams

1. Create a new `.md` file in this directory
2. Add Mermaid diagram inside fenced code block
3. Include a plain-English explanation above the diagram
4. Update this index file

## Related Documentation

- [Flow Diagrams](../flows/index.md) - Request, auth, data, and error flows
- [Architecture Overview](../architecture.md) - High-level architecture document
- [ADRs](../decisions/index.md) - Architecture Decision Records
