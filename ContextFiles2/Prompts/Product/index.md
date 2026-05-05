# Index: Product Prompts

- ContextFiles/Prompts/Product/feature-docs-generation.md
- ContextFiles/Prompts/Product/principal_engineering_due_diligence_prompt.md

## Healthcare / Compliance Prompts

- ContextFiles2/Prompts/Healthcare/build-phi-data-lineage-audit-skill.md — Principal Engineer prompt to build the `phi-data-lineage-audit` skill: traces every PHI field from model → serializer → endpoint → frontend cache, audits API responses for over-fetching, scores breach surface per endpoint, checks Mixpanel for PII leakage, and verifies consent lifecycle.
- ContextFiles2/Prompts/Healthcare/healthcare-skills-generation.md — Bulk healthcare skill generation prompt
