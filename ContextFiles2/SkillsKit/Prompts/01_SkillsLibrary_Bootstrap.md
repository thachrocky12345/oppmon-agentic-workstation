# Prompt: Skills Library Bootstrap (Portable)

You are an agent in a repository that contains an application and supporting documentation. Your goal is to bootstrap a reusable **skills library** and a set of **focused doc indexes** so future agents can navigate quickly without loading the entire repo.

## Hard rules

1) Do not commit secrets (connection strings, API keys, license keys).
2) Do not edit user-owned environment config files unless explicitly instructed.
3) Prefer short docs that **link** to sources, not long duplicated prose.
4) Every “done” claim must have repo evidence (file exists; referenced paths resolve).

## Target structure (create if missing)

- `ContextFiles/Library/` — project-specific docs, prompts, runbooks, QA artifacts.
- `ContextFiles/Skills/` — reusable agent workflows (“skills”).

If the target repo already has a different conventions folder, adapt the paths but keep the same *concepts*:
- **Library** (domain docs) vs **Skills** (agent workflows).

## Inputs (read first)

1) The repo’s agent instructions file (e.g., `AGENTS.md`, `CLAUDE.md`, etc.).
2) Scan `ContextFiles/Library/` (or the repo’s docs folder) for domain documentation.
3) Read the meta-instructions series in `ContextFiles/Portable/SkillsKit/Prompts/meta_instructions/`.

## Deliverables (create/update)

### A) Skills

Create one folder per skill under `ContextFiles/Skills/<skill-name>/` with:
- `SKILL.md` (YAML frontmatter: `name`, `description`)
- optional `references/*.md` (indexes / short reference notes)

Minimum recommended skill set (rename if needed):
- `repo-orientation-and-reference-docs`
- `build-run-migrate-and-test`
- `language-style-and-architecture` (or language-specific, e.g., `csharp-style-and-architecture`)
- `testing-guidelines`
- `commit-and-pr-hygiene`
- `security-config-and-generated-assets`
- `truthfulness-and-evidence`
- `session-greeting-and-todo-flow`

Use templates from:
- `ContextFiles/Portable/SkillsKit/Templates/template_skill.md`
- `ContextFiles/Portable/SkillsKit/Templates/template_index.md`
- `ContextFiles/Portable/SkillsKit/Templates/template_audit.md`

### B) Focused indexes (to reduce context size)

Under `ContextFiles/Skills/repo-orientation-and-reference-docs/references/`, create indexes that point to the repo’s existing docs (grouped by purpose):
- `knowledge-links.md` (high-level jump table)
- `domain-docs-index.md`
- `modeling-and-schema.md`
- `ux-and-field-maps.md`
- `formulas-and-computation.md`
- `qa-and-verification.md`
- `runbooks-and-stabilization.md`
- `architecture-and-gaps.md`
- `prompts-index.md`
- `session-and-todos.md`
- `skills-index.md` (inventory of skills + key refs)
- `meta-instructions.md` (points to the meta-instructions series used to generate skills)

Each index should:
- contain only file links (short bullets)
- avoid duplicating doc content
- prefer “where/when to use” guidance in 1–2 lines max

### C) Inventory + audit (anti-drift)

Create:
- `ContextFiles/Skills/repo-orientation-and-reference-docs/references/all-contextfiles-md.md` (inventory of `ContextFiles/**/*.md`)
- `ContextFiles/Skills/repo-orientation-and-reference-docs/references/focused-index-audit.md` (mapping: every `.md` appears in exactly one focused index, or is explicitly exempt)

## Self-checks (required)

1) Verify there are no broken references:
   - sample-open at least 5 random links from each index.
2) Verify no domain-specific terms in skills/tactics:
   - search for company/product names and remove them from `ContextFiles/Skills/**`.
3) Verify skills are procedural and portable:
   - each `SKILL.md` should be executable as a checklist.

## Output

At the end, report:
- which skills were created
- which indexes were created
- where the audit mapping is recorded

