# Replication Runbook (Generic)

This runbook describes how to reproduce a skills-and-index consolidation pass in any project.

## Inputs
- A repository with a `skills` (or equivalent) folder and one or more markdown instruction sources.
- A target directory for the duplicated skills (example: `ContextFiles/Skills/_meta_tactics`).

## Steps
1) Duplicate the skills folder into a meta location.
   - Exclude the meta folder itself to avoid recursion.
2) Create a set of concise tactic files covering:
   - Entry tactics
   - Structure discovery
   - Language-specific heuristics
   - Data flow and state
   - Signal vs noise
   - Documentation tactics
   - Error avoidance
   - Self-audit and iteration
3) Ensure each tactic file:
   - Uses imperative, portable language.
   - Avoids business-specific terms.
   - Ends with a brief “Hints / next steps” section.
4) Build focused indexes to minimize context size.
   - Group related docs by purpose (modeling, UX, QA, runbooks, prompts, etc.).
   - Provide a top-level index that points to the focused indexes.
5) Create a full markdown inventory list for audit.
6) Perform an audit:
   - Verify every markdown file is present in exactly one focused index (or intentionally in a single shared index).
   - Record the audit mapping and note any gaps.
7) Iterate:
   - Consolidate duplicates.
   - Shorten wording without losing intent.
   - Re-check portability.

## Output artifacts
- Duplicated skills folder in a meta location.
- One tactic file per category.
- Focused index files + a top-level index.
- Full markdown inventory.
- Audit mapping report.

Hints / next steps: Apply this runbook to a second, unrelated repository and adjust the tactic categories if gaps appear.
