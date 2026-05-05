# Prompt: Meta Tactics Aggregation (Portable)

You are an agent that has already produced a first-pass skills library under `ContextFiles/Skills/**`.

Your goal in this step is to create a *second*, more portable set of tactic files under `ContextFiles/Skills/_meta_tactics/**` that captures **how** you worked (heuristics and workflows) without any domain/business terms.

## Inputs

Read the meta-instructions series:
- `ContextFiles/Portable/SkillsKit/Prompts/meta_instructions/00_overview.md`
- `ContextFiles/Portable/SkillsKit/Prompts/meta_instructions/01_entry_tactics.md`
- `ContextFiles/Portable/SkillsKit/Prompts/meta_instructions/02_structure_tactics.md`
- `ContextFiles/Portable/SkillsKit/Prompts/meta_instructions/03_language_tactics.md`
- `ContextFiles/Portable/SkillsKit/Prompts/meta_instructions/04_data_flow.md`
- `ContextFiles/Portable/SkillsKit/Prompts/meta_instructions/05_signal_vs_noise.md`
- `ContextFiles/Portable/SkillsKit/Prompts/meta_instructions/06_documentation.md`
- `ContextFiles/Portable/SkillsKit/Prompts/meta_instructions/07_error_avoidance.md`
- `ContextFiles/Portable/SkillsKit/Prompts/meta_instructions/08_meta_tactics.md`

Optional runbook:
- `ContextFiles/Portable/SkillsKit/Runbooks/replication_runbook.md`

## Deliverables

1) Duplicate the skills folder:
   - source: `ContextFiles/Skills/`
   - destination: `ContextFiles/Skills/_meta_tactics/`
   - exclude the destination folder to avoid recursion

2) In `ContextFiles/Skills/_meta_tactics/`, create concise tactic files (portable, imperative):
- `entry_tactics.md`
- `structure_tactics.md`
- `language_tactics.md`
- `data_flow_tactics.md`
- `signal_vs_noise.md`
- `documentation_tactics.md`
- `error_avoidance.md`
- `feature_execution_tactics.md`
- `meta_tactics.md` (self-audit checklist)

3) Create/refresh:
- `ContextFiles/Skills/_meta_tactics/README.md` (what this folder is, how to use it)

## Non-domain constraint (strict)

Remove or generalize anything that reveals the business domain:
- company/product/project names
- entity names (tables, endpoints, screens) that are unique to this repo
- internal acronyms unless they are universal (e.g., “ORM”, “CI”, “PR”)

Use placeholders instead:
- `<APP_PROJECT>`
- `<DB_PROVIDER>`
- `<PRIMARY_ENTRYPOINT>`
- `<DOMAIN_MODEL>`

## Self-audit (required)

1) Search for project-specific strings and remove them:
   - product name, company name, repo name, etc.
2) Ensure each tactic file ends with “Hints / next steps”.
3) Ensure no tactic file exceeds ~1 page; link out instead of expanding.

