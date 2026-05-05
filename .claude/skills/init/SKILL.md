# Init Skill

**Trigger:** `/init`

This skill synchronizes all project documentation, architecture records, diagrams, and flows whenever invoked.

## Execution Steps

### 1. Scan Project Structure
- Recursively scan the entire project directory
- Identify all source directories: `arkon/`, `arkon-backend/`, `arkon-frontend/`
- Detect configuration files: `package.json`, `tsconfig.json`, `docker-compose.yml`
- Catalog all major modules and their purposes

### 2. Update CLAUDE.md
Update the following sections (preserve other content):

- **Tech Stack**: Detect from `package.json` files (both frontend and backend)
- **Project Structure**: Generate from current directory tree (exclude `.git`, `node_modules`, `dist`, `.next`, `__pycache__`, `*.pyc`)
- **Key Modules**: Detect from `src/` directories in each package
- **Known Dependencies**: List major dependencies from all `package.json` files

### 3. Update docs/architecture.md
- Update the "Last Updated" timestamp to today's date
- Refresh system layers based on detected structure
- Add any new dependencies discovered
- Link to recent ADRs in docs/decisions/

### 4. Process ADR Reviews
Check `docs/decisions/.pending_adr_review` and process as follows:

**CREATE a new ADR when detecting:**
- New major framework (React, Next.js, Express, etc.)
- New database driver (pg, prisma, drizzle)
- New auth library (jsonwebtoken, passport, etc.)
- New infrastructure file (Dockerfile, k8s configs)

**DEPRECATE existing ADRs when:**
- A library has been completely removed from dependencies

**UPDATE ADR status when:**
- An ADR is superseded by a newer decision

**SKIP (do not create ADR) for:**
- Minor version bumps of existing dependencies
- Dev/test-only dependencies (vitest, jest, eslint, prettier, typescript)
- Type definition packages (@types/*)

### 5. Update ADR Index
After any ADR changes, update `docs/decisions/index.md` with the new entries.

### 6. Clean Up
- Delete `docs/decisions/.pending_adr_review` after processing
- Update the dependency snapshot in `docs/decisions/.last_deps_snapshot`

### 7. Generate Diagrams
Invoke the diagrams skill to generate/update all diagrams in `docs/diagrams/`:
- `architecture.md` - System component overview
- `dependencies.md` - Package dependency graph
- `data-model.md` - Entity relationship diagram
- `deployment.md` - Deployment infrastructure

### 8. Generate Flows
Invoke the diagrams skill to generate/update all flows in `docs/flows/`:
- `request-flow.md` - API request lifecycle
- `auth-flow.md` - Authentication flow
- `data-flow.md` - Data processing pipeline
- `error-flow.md` - Error propagation handling

### 9. Update Indexes
- Update `docs/diagrams/index.md` with current diagram list
- Update `docs/flows/index.md` with current flow list

### 10. Output Summary
Print a final summary in this format:
```
✅ Init sync complete
   Updated: [list of files modified]
   Created ADRs: [list of new ADRs, or "none"]
   Diagrams updated: [list of diagrams]
   Flows updated: [list of flows]
   Skipped: [reasons for any skipped items]
```

## Important Rules

1. **NEVER skip any step** even if nothing seems changed
2. **ALWAYS regenerate diagrams** to reflect current state
3. **PRESERVE existing content** in CLAUDE.md that isn't auto-managed
4. **USE Mermaid syntax** for all diagrams
5. **ADD timestamps** to all updated files
6. **LINK related files** (ADRs to architecture, diagrams to flows)

## File Locations

| File | Purpose |
|------|---------|
| `CLAUDE.md` | Main project context file |
| `docs/architecture.md` | Architecture overview |
| `docs/decisions/` | Architecture Decision Records |
| `docs/diagrams/` | Visual architecture diagrams |
| `docs/flows/` | Process flow diagrams |
| `docs/structure.md` | Auto-generated file tree |
