# Architecture Diagrams

**Last Updated:** 2026-05-06 (init sync)

This directory contains Mermaid architecture diagrams for the Arkon project.

## Diagrams

| File | Description | Last Updated |
|------|-------------|--------------|
| [architecture.md](architecture.md) | System component overview with LLM/RAG services | 2026-05-06 (init sync) |
| [dependencies.md](dependencies.md) | Package dependency graph (monorepo structure) | 2026-05-06 (init sync) |
| [data-model.md](data-model.md) | Entity relationship diagram (Prisma schema) | 2026-05-06 (init sync) |
| [deployment.md](deployment.md) | Docker Compose deployment architecture | 2026-05-06 (init sync) |

## Quick Links

- **System Architecture**: How components connect (frontend, API, database, LLM providers, CLI)
- **Dependencies**: What packages each app uses (pnpm + Turborepo monorepo, including CLI)
- **Data Model**: Database schema with multi-tenancy, skills, LLM sessions, embeddings, MCP servers, usage analytics, models, virtual keys, routing state
- **Deployment**: Docker services, ports, volumes, and profiles

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
