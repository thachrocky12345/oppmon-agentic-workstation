# TAG-49: Provider Integration Audit — Verification Report

**Type:** Audit Verification (Phase 6 only — audit-only ticket)
**Status:** Findings re-verified
**Author:** Claude (build-fastapi-single-ticket skill, audit-only branch)
**Date:** 2026-05-13
**Ticket:** [TAG-49-provider-integration-audit.md](../TAG-49-provider-integration-audit.md)
**Branch:** `dev`
**Skill:** `.claude/skills/build-fastapi-single-ticket/`

---

## Why this report exists

TAG-49 is an audit/spike ticket whose status was already
`Done (findings captured)`. Per the audit-only branch in
[`build-fastapi-single-ticket/CONTEXT.md`](../../../.claude/skills/build-fastapi-single-ticket/CONTEXT.md),
audit tickets skip Phases 2–5 and instead produce a verification report
that confirms the original findings still hold against current `main`.

This is also the pilot run for the new `build-fastapi-single-ticket` skill
— a FastAPI/Python adaptation of `build-backend-single-ticket` (which
targets Django/DRF). The skill was rebuilt because TAG-* tickets land in
`apps/agent_graph_backend/` (async FastAPI) and the Django-shaped pipeline
doesn't apply.

## Verification method

For each claim in the TAG-49 *Findings Summary* table, confirm:

1. The named Python module exists at the claimed path.
2. The named UI template exists at the claimed path.
3. The named factory function still wires the provider as described.

No code was modified during verification.

## Findings re-verified

| Claim | Method | Result |
|---|---|---|
| `agent_v2/llm/anthropic_client.py` exists | `Glob` | ✅ present |
| `agent_v2/llm/openai_client.py` exists | `Glob` | ✅ present |
| `agent_v2/llm/cerebras_client.py` exists (new in TAG-49) | `Glob` | ✅ present |
| `agent_v2/llm/fake_client.py` exists | `Glob` | ✅ present |
| `agent_v2/llm/base.py` exists (Protocol) | `Glob` | ✅ present |
| `agent_v2/llm/factory.py` exists | `Glob` | ✅ present |
| `create_llm_client` defined in factory | `Grep` line 35 | ✅ present |
| `create_llm_client_from_spec` defined in factory | `Grep` line 83 | ✅ present |
| `create_llm_client_from_spec` handles `anthropic` | `Read` line 110 | ✅ present |
| `create_llm_client_from_spec` handles `cerebras` | `Read` line 117 | ✅ present |
| `create_llm_client_from_spec` handles `openai` / `openai_compatible` | `Read` line 132 | ✅ present (also `groq`, `together`, `litellm`) |
| `create_llm_client_from_spec` handles `fake` | `Read` line 145 | ✅ present |
| `create_llm_client_from_spec` does NOT handle `azure` | `Read` lines 108–150 | ✅ absent (matches ⚠️ Small work entry) |
| `create_llm_client_from_spec` does NOT handle `bedrock` | `Read` lines 108–150 | ✅ absent (matches ❌ Medium work entry) |
| `create_llm_client_from_spec` does NOT handle `ollama` | `Read` lines 108–150 | ✅ absent (matches ❌ Small work entry — but reachable through `openai_compatible` per the audit's recommendation) |
| `packages/shared/src/providers/templates/anthropic.ts` exists | `Glob` | ✅ present |
| `packages/shared/src/providers/templates/openai.ts` exists | `Glob` | ✅ present |
| `packages/shared/src/providers/templates/cerebras.ts` exists | `Glob` | ✅ present |
| `packages/shared/src/providers/templates/azure-openai.ts` exists | `Glob` | ✅ present |
| `packages/shared/src/providers/templates/bedrock.ts` exists | `Glob` | ✅ present |
| `packages/shared/src/providers/templates/ollama.ts` exists | `Glob` | ✅ present |
| `packages/shared/src/providers/templates/openai-compatible.ts` exists | `Glob` | ✅ present |

**Drift count:** 0. The TAG-49 findings table still accurately describes
current `main`.

## New observations (not in the original audit)

These don't invalidate the audit; they're context that came up while verifying.

1. **`create_llm_client_from_spec` now also accepts `groq`, `together`,
   and `litellm` as explicit `provider` values** (lines 132 in factory.py),
   in addition to `openai` and `openai_compatible`. The audit's "OpenAI-Compatible
   ✅ Done" row still holds; these are convenience aliases for the same code path.
2. **`api_base` is a first-class parameter** on `create_llm_client_from_spec`
   (line 88) and is wired into both the OpenAI-compatible branch (line 140)
   and the Cerebras branch (line 125). This aligns with the audit's
   architectural recommendation #2 about routing through gateways without
   code changes.
3. **No `azure`, `bedrock`, or `ollama` branches were silently added.**
   The audit's "small/medium work" effort estimates are still accurate.

## Acceptance criteria status

Mirrored from the ticket:

- [x] All 7 OppMon UI providers inventoried — **verified**, all templates present.
- [x] Cerebras client implemented and 4 models verified end-to-end — **verified**, file present + factory wired. (End-to-end model verification not re-run; relies on original audit's empirical record.)
- [x] Integration effort scored per provider — **verified**, scores still match code state.
- [x] Architectural recommendations captured — **verified**, content unchanged in the ticket.

## Decisions

- **Skill choice:** Built and used `build-fastapi-single-ticket` (new) instead
  of `build-backend-single-ticket` (Django). The latter assumes
  `apps/<name>/tests/`, `manage.py check`, `scripts/sonar_precheck.py`, and
  `Docs/RGDEV-*/` — none of which apply to this repo.
- **No re-run of Cerebras 4-model verification.** That would require live
  Cerebras API access and is a paid-tier operation. The audit's recorded
  results stand; if a regression is suspected, file a fresh ticket and
  budget for the API spend.
- **No code modification.** Per the audit-only branch in the skill, even
  when minor improvements suggest themselves (e.g. consolidating the
  OpenAI-compatible aliases into a tuple constant), they're out of scope
  for a verification run. File a follow-up if desired.

## Files Touched

None in `apps/`. Only verification documentation:

```
.claude/skills/build-fastapi-single-ticket/SKILL.md                (new)
.claude/skills/build-fastapi-single-ticket/CONTEXT.md              (new)
.claude/skills/build-fastapi-single-ticket/TESTING.md              (new)
.claude/skills/build-fastapi-single-ticket/QUALITY.md              (new)
.claude/skills/build-fastapi-single-ticket/TESTPLAN_TEMPLATE.md    (new)
docs/jira/TAG-49/TAG_49_verification.md                            (this file)
```

## Known Limitations

- This verification is **structural only** (files exist, factory branches
  exist). It does not re-run any Cerebras / Anthropic / OpenAI API calls
  to confirm the providers still function. Those happen as part of TAG-50
  (the authenticated `/solve` endpoint), which depends on TAG-49.
- The audit's "Files Touched" section in TAG-49 doesn't include the dated
  history of when the cerebras_client landed. If audit replay timestamps
  matter to compliance, add `git log -- <path>` output to future audits.

## Recommended next step

The TAG-50 epic (TAG-51..TAG-65) is now unblocked. The audit's three
architectural recommendations directly inform multiple sub-tickets:

| Audit recommendation | Lands in |
|---|---|
| Typed `LLMSpec` Pydantic schema before wiring more providers | TAG-56 |
| Don't have `agent_search` hold tenant keys at rest | TAG-54 (vault) + TAG-57 (resolver) |
| Route Bedrock + Azure through LiteLLM (`apps/router`) | TAG-65 deploy doc |

Start TAG-51 (asyncpg pool) next — it's the foundation for TAG-52..65.

## Rollback

Not applicable — no code changes. To unstage this verification:

```bash
rm -rf docs/jira/TAG-49/
rm -rf .claude/skills/build-fastapi-single-ticket/
```

## Sign-off

- [x] Findings re-verified against current `main`
- [x] No drift detected
- [x] Follow-up next-step recommendation captured
- [ ] Reviewer: <name>
