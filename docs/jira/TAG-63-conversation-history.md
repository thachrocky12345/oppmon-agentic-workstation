# TAG-63: `messages[]` Conversation History Support

## Description

**Suggested Points:** 2
**Type:** Story
**Epic:** [TAG-50](./TAG-50-authenticated-solve-endpoint-epic.md)
**Status:** Open

Thread prior conversation turns into the planner so a follow-up question like
"and what about the 2024 numbers?" can be resolved against the prior turn's
subject. Keeps the existing `inputs: str` shape of `/solve_v2` while introducing
the new `messages[]` shape on `/solve`.

## Objective

`PlannerAgent.run(question=..., history=[...])` accepts an optional history list
and prepends it to the LLM call as additional context messages, before the
system prompt's `{question}`.

## Requirements

### Trim policy

`agent_v2/memory/history.py`:

```python
MAX_TURNS = 8
MAX_TURN_CHARS = 4_000

def trim_history(messages: list[ChatMessage]) -> list[ChatMessage]:
    # 1. Always keep the system message if first
    # 2. Keep the last MAX_TURNS user+assistant pairs
    # 3. Truncate any single message to MAX_TURN_CHARS chars (suffix "...")
    ...
```

If the trimmed history is still too long (>16k chars total), summarize the
oldest half with a one-shot call to the user's LLM:

```python
async def summarize_oldest_half(llm: LLMClient, msgs: list[ChatMessage]) -> ChatMessage:
    half = len(msgs) // 2
    older, newer = msgs[:half], msgs[half:]
    prompt = "Summarize the following conversation turns in <= 120 words. "
             "Preserve specific facts, numbers, and named entities."
    resp = await llm.chat(messages=[ChatMessage(role="user",
              content=prompt + "\n\n" + _to_text(older))])
    return ChatMessage(role="system",
                       content=f"[Earlier turns, summarized]\n{resp.content}")
```

Result: `[summary] + newer` replaces the input list.

### Planner integration

`PlannerAgent.run` signature change:

```python
async def run(self, *, question: str, history: list[ChatMessage] | None = None) -> AsyncIterator[SSEEvent]:
    history = trim_history(history or [])
    if _too_long(history):
        history = [await summarize_oldest_half(self._llm, history)] + history[len(history)//2:]
    # Compose into LLM messages: [system_prompt, *history, {role=user, content=question}]
    ...
```

`/solve_v2`'s `inputs: str` payload constructs `history=[]` so behavior is
identical to today.

`/solve` passes `req.messages[:-1]` as history and `req.messages[-1].content`
as `question`.

## Implementation Notes

- The summarizer call uses the SAME `LLMClient` the planner uses. This means a
  per-request user-scoped key is billed for the summary — by design.
- Keep summaries terse (≤120 words). Long summaries defeat the purpose.
- `system`-role messages in the inbound `messages[]` are RESPECTED (passed
  through) — TAG-50 schema validation already restricts roles to
  `{system,user,assistant}`. The web UI does not currently send `system`, but
  CLI callers might.

## Tests

| File | Test | Assertion |
|---|---|---|
| `tests/memory/test_history.py` | `trim_history` keeps last N turns | length cap |
| `tests/memory/test_history.py` | per-message char truncation | suffix `...` |
| `tests/memory/test_history.py` | no history → no-op | `trim_history([]) == []` |
| `tests/memory/test_history.py` | summarizer called when total too long | mock LLM hit once |
| `tests/orchestrator/test_planner_history.py` | follow-up question resolves prior context | end-to-end with fake LLM |
| `tests/api/test_solve_route.py` | `/solve_v2` regression | identical SSE output |

## Acceptance Criteria

- [ ] `/solve_v2` output unchanged on identical inputs (regression test).
- [ ] `/solve` resolves follow-up questions correctly (eval entry in TAG-64).
- [ ] History trimming bounded; no unbounded context growth.
- [ ] Summarizer uses tenant's LLM, not a hard-coded one.

## Dependencies

**Depends on:** TAG-58
**Blocks:** TAG-64

## Risk Factors

| Risk | Mitigation |
|---|---|
| Summarizer hallucinates and pollutes future turns | Marked `[Earlier turns, summarized]`; planner system prompt instructs to treat as best-effort. |
| Token cost growth from long histories | Hard turn cap + char cap. |
| Summarizer call fails (rate limit) | Fall back to raw trim; emit warn event. |
