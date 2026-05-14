# TAG-77: Prompt Observability + ADR

## Description

**Suggested Points:** 3
**Type:** Story
**Epic:** [TAG-70](./TAG-70-prompt-storage-notion-epic.md)
**Status:** Open

Make every `/solve` and `/solve_v2` trace carry the `prompt_slug` and
`prompt_version` it ran under. Without this, debugging "the answer changed
yesterday and we don't know why" is guesswork. Closes the epic with an ADR
covering the eight locked-in decisions.

## Required Reading

- TAG-72 loader, specifically `get_prompt_meta()`.
- TAG-73 instrumentation hooks (slug already plumbed into `PlannerAgent`).
- TAG-50 epic SSE event schema (event names: `step`, `node_added`, `final`).
- `docs/decisions/` index — ADR numbering and template.

## Open Questions (raise before coding)

1. Where do we ship the structured logs — stdout (picked up by the existing
   Docker logger) or a dedicated sink (e.g. Loki, Honeycomb)? **Default:** stdout
   in structured JSON; existing infra picks it up. Anything fancier is a separate
   epic.
2. Should the SSE `step` event include `prompt_version`, or only the internal
   trace log? Exposing version on the wire helps the web UI show "running with
   v3 of the planner prompt" but adds a tiny info-disclosure surface.
   **Default:** include — the web UI is authenticated; not a real risk.

## Objective

After this ticket:

- Every `LLMClient.chat()` call in `agent_search` emits a structured log line
  with `{prompt_slug, prompt_version, provider, model, tenant_id}`.
- Every SSE `step` event sent to the client carries `prompt_slug` and
  `prompt_version`.
- A daily digest in the engineering channel reports counts per slug/version.
- An ADR captures TAG-70's eight locked-in decisions.

## Requirements

### Structured logging

`agent_v2/observability/prompt_log.py`:

```python
import logging, json
from ..prompts import get_prompt_meta

_log = logging.getLogger("agent_v2.prompt")

def log_prompt_use(slug: str, *, tenant_id: str | None, provider: str, model: str) -> None:
    meta = get_prompt_meta(slug)
    _log.info(json.dumps({
        "event":          "prompt.use",
        "prompt_slug":    slug,
        "prompt_version": meta.version,
        "prompt_updated": meta.updated_at,
        "provider":       provider,
        "model":          model,
        "tenant_id":      tenant_id,         # null for /solve_v2
    }))
```

Call sites: every `PlannerAgent.run()` system-prompt application, every
`SearcherAgent` call, every summarizer call. TAG-73 plumbed the slugs into the
agent classes; this ticket adds the log call.

### SSE event extension

The existing `step` SSE event payload gains two fields:

```json
{
  "type": "step",
  "iteration": 1,
  "prompt_slug": "system.rag_planner",
  "prompt_version": 3,
  "...": "..."
}
```

The web app's `AgentGraphPanel` is forward-compatible (unknown fields ignored).
A follow-up frontend ticket (out of scope here) can surface the version in the UI.

### Daily digest

`scripts/prompt_usage_digest.py` — a GitHub Actions workflow runs daily and
posts to Slack:

```
📈 Prompt usage digest — 2026-04-12

By slug (last 24h):
- system.web_planner v5          1,234 calls
- system.rag_planner v3            456 calls
- system.history_summarizer v1     789 calls
- tool.search_corpus_node.desc v2  456 calls (same as planner)

Anomalies:
- system.rag_planner v3 refusal rate 0.04 (yesterday 0.02) — +100% — check
- 12 calls used system.web_planner v4 (deprecated) — investigate node z800-2
```

Implementation reads stdout logs via the existing log aggregator (likely Loki
or CloudWatch — confirm in TAG-65's deploy doc). The digest itself is small
(~50 LOC); the wiring to wherever logs land is the real work.

If the org has no log aggregator yet, this ticket scopes down to: log to
stdout in the right shape, capture metrics in a placeholder, ship the digest
in a follow-up. Mark TODO in the script.

### Anomaly detection

Three signals worth alerting on:

1. A prompt slug appears in logs that isn't in `_schema.yaml` (impossible
   under the loader, but check anyway).
2. Refusal rate (corpus mode) shifts > 2x day-over-day for an `active` prompt.
3. Multiple versions of the same slug active in production simultaneously
   (indicates partial deploy — e.g. one swarm node still on old image).

Alerts are Slack DMs to the prompt owner (`Owner` from frontmatter).

### ADR

`docs/decisions/ADR-NNNN-notion-prompt-storage.md`:

- **Status:** Accepted.
- **Context:** Prompts were inline in Python; non-engineers couldn't iterate.
- **Decision:** Notion-as-author, Git-as-runtime, PR-based sync.
- **The eight locked-in decisions from TAG-70 epic, restated with rationale.**
- **Consequences:** lists alternatives rejected, ongoing costs (5-min sync
  latency, integration token rotation), wins (audit trail = git log, rollback
  = git revert).

Place file, increment index, link from TAG-70.

## Edge Cases

- Same prompt used twice in one `/solve` (e.g. planner + summarizer share the
  history summarizer prompt). Emit two log lines; the digest dedupes per request
  if a `request_id` is present.
- Prompt version bumped mid-request (deploy lands between SSE events). The
  request continues with the version it started with — never re-resolve mid-flight.
  Log the resolved version once at request start.
- Logging adds latency. Keep it strictly to `logger.info` with a fast handler —
  no synchronous network call.
- `tenant_id` is null on `/solve_v2`. Don't error; log `null`.
- A request fails before any prompt is used (e.g. auth 401). No prompt log line.

## Tests

| File | Test | Assertion |
|---|---|---|
| `tests/observability/test_prompt_log.py` | every chat emits one log line | mock logger |
| `tests/observability/test_prompt_log.py` | log line is valid JSON | |
| `tests/observability/test_prompt_log.py` | log line includes required keys | schema check |
| `tests/observability/test_prompt_log.py` | tenant_id null for /solve_v2 path | |
| `tests/api/test_sse_events.py` | step event carries prompt_slug + version | inspect frame |
| `tests/api/test_sse_events.py` | unknown-field tolerance test (forward compat) | web schema |
| `scripts/tests/test_digest.py` | digest renders from synthetic log set | byte match |

## Acceptance Criteria

- [ ] Every chat call writes one prompt-use log line.
- [ ] SSE `step` events carry `prompt_slug` and `prompt_version`.
- [ ] Daily digest workflow lands (even if its sink is "stdout for now").
- [ ] ADR merged and linked from `docs/decisions/index.md`.
- [ ] All 7 tests pass.

## Story Points Justification

3 pts: log call sites are tiny but the SSE schema change touches the web UI's
schema, the digest needs at least a skeleton, and the ADR is real writing.

## Dependencies

**Depends on:** TAG-72, TAG-73 (slugs plumbed into agents).
**Blocks:** none — closes the epic.

## Risk Factors

| Risk | Mitigation |
|---|---|
| Log volume explosion | One line per LLM call; existing infra handles `/solve_v2` volume already. |
| Daily digest noisy / ignored | First two weeks: human reviews and tunes thresholds; alerts only if anomaly. |
| SSE schema change breaks the web app | Unknown-field tolerance test; the frontend already ignores unknown event fields. |
| ADR drifts from actual implementation | Link from the ADR to TAG-70 and to this ticket; review at six-month mark. |
