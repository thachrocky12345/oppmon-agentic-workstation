---
name: audit-pipeline
description: Multi-agent pipeline that implements a plan, runs dual audits, creates fix plans, merges into a corrected plan, and executes it. Use when asked to "run the audit pipeline", "layers of audits", "implement and audit", or "build and verify".
argument-hint: [path-to-plan-document]
---

# Multi-Agent Audit Pipeline

## Architecture: 9 agents, 5 phases

Full specification: `ContextFiles/Skills/multi-agent-audit-pipeline/SKILL.md`

## Quick Reference

When the user invokes `/audit-pipeline [plan-path]`, execute this pipeline:

### Phase 1 (parallel -- 3 agents)
1. **IMPLEMENT** (opus, worktree isolation): Read the plan at `$ARGUMENTS`, read existing code patterns, implement. Verify build passes with `dotnet build`.
2. **AUDIT PROMPT A** (sonnet): Create a data model / technical audit prompt. Save to `ContextFiles/Library/Prompts/Audit_[topic]_DataModel_Prompt.md`.
3. **AUDIT PROMPT B** (sonnet): Create a UX / scenario / commercial audit prompt. Save to `ContextFiles/Library/Prompts/Audit_[topic]_UXScenario_Prompt.md`.

### Phase 2 (parallel -- 2 agents, as Phase 1 audit prompts complete)
4. **AUDITOR A** (opus): Execute data model audit against codebase using the prompt from Agent 2. Save findings to `ContextFiles/Library/Sessions/Audit_[topic]_DataModel_Results_[date].md`.
5. **AUDITOR B** (opus): Execute UX/scenario audit using the prompt from Agent 3. Save findings to `ContextFiles/Library/Sessions/Audit_[topic]_UXScenario_Results_[date].md`.

### Phase 3 (parallel -- 2 agents, as audits complete)
6. **FIX PLAN A** (opus): Create fix implementation plan from Audit A findings. Save to `ContextFiles/Library/Sessions/FixPlan_DataModel_[date].md`.
7. **FIX PLAN B** (opus): Create fix implementation plan from Audit B findings. Save to `ContextFiles/Library/Sessions/FixPlan_UXScenario_[date].md`.

### Phase 4 (sequential -- 1 agent, after both fix plans complete)
8. **PRINCIPAL MERGE** (opus): Synthesize both fix plans + implementation results into a final corrected plan. Save to `ContextFiles/Library/Sessions/[topic]_FinalPlan_[date].md`.

### Phase 5 (sequential -- 1 agent, after merge)
9. **EXECUTE FINAL** (opus, worktree): Implement the corrected plan. Verify `dotnet build` passes.

## Timing Rules
- Launch Agents 1, 2, 3 simultaneously
- Launch Agent 4 as soon as Agent 2 completes (don't wait for Agent 3)
- Launch Agent 5 as soon as Agent 3 completes (don't wait for Agent 2)
- Launch Agent 6 as soon as Agent 4 completes
- Launch Agent 7 as soon as Agent 5 completes
- Agent 8 launches only after BOTH 6 and 7 complete
- Agent 9 launches only after Agent 8 completes

## Status Reporting
Maintain a status table after each agent completion:

```
| # | Agent | Role | Status | Duration |
|---|-------|------|--------|----------|
| 1 | IMPLEMENTER | Implement plan in worktree | Pending | -- |
| 2 | AUDIT PROMPT A | Create data model audit prompt | Pending | -- |
| 3 | AUDIT PROMPT B | Create UX/scenario audit prompt | Pending | -- |
| 4 | AUDITOR A | Execute data model audit | Pending | -- |
| 5 | AUDITOR B | Execute UX/scenario audit | Pending | -- |
| 6 | FIX PLAN A | Create fix plan from Audit A | Pending | -- |
| 7 | FIX PLAN B | Create fix plan from Audit B | Pending | -- |
| 8 | PRINCIPAL MERGE | Synthesize corrected plan | Pending | -- |
| 9 | EXECUTE FINAL | Implement corrected plan | Pending | -- |
```

## Key Constraints
- **CockroachDB:** Batch `SaveChangesAsync`, keep migrations under ~35 tables
- **Syncfusion:** Fully qualify ambiguous enums, use async grid APIs
- **Models.cs:** Read first, understand patterns before editing
- **Build gate:** Implementation agents must verify `dotnet build` passes
- **OrgsureDataObject:** All org-scoped entities must inherit `OrgsureDataObject` and implement `IOrganizationLinkedEntity`

## Customization
Replace `[topic]` with the domain being worked on (e.g., OrgDesign, Reports, QM, Import).
Replace `[date]` with today's date in YYYY-MM-DD format.
