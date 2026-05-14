"""Shared reactive loop primitive.

Mirrors Arkon `apps/api/src/agent/oracle-loop.ts:227-400`:

    while iter < max_iter:
        resp = await llm.chat(messages, tools)
        if not resp.tool_calls:
            return resp  # done
        results = await registry.dispatch_many(resp.tool_calls, ctx)
        messages += [assistant(resp), tool_results(results)]
        iter += 1

Used by both PlannerAgent and SearcherAgent. Yields a structured event
each turn so callers can stream progress to SSE.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, AsyncIterator

from ..llm.base import ChatMessage, ChatResponse, LLMClient, ToolCall
from ..memory.conversational import ConversationalMemory
from ..memory.tool_log import ToolLog
from ..tools.registry import ToolContext, ToolRegistry, ToolResult


@dataclass
class LoopTurn:
    """One round of the reactive loop."""

    iteration: int
    response: ChatResponse
    tool_calls: list[ToolCall]
    tool_results: list[ToolResult]
    done: bool  # True if the loop terminated this turn


async def run_reactive_loop(
    *,
    llm: LLMClient,
    registry: ToolRegistry,
    memory: ConversationalMemory,
    tool_log: ToolLog,
    ctx: ToolContext,
    max_iterations: int,
    tool_filter: list[str] | None = None,
    terminate_on_tool: str | None = None,
) -> AsyncIterator[LoopTurn]:
    """Drive a reactive tool-use loop.

    - `tool_filter`: subset of registered tools the LLM is allowed to see this run.
    - `terminate_on_tool`: name of a tool whose invocation ends the loop
      (e.g. `finalize` for the planner, `answer` for the searcher).
      If None, the loop terminates when the LLM returns no tool calls.
    """
    tools = registry.schemas(only=tool_filter) if tool_filter else registry.schemas()

    for iteration in range(1, max_iterations + 1):
        response = await llm.chat(messages=memory.messages(), tools=tools)

        # Always record the assistant turn so the next turn sees it.
        memory.append(
            ChatMessage(
                role="assistant",
                content=response.text or "",
                tool_calls=list(response.tool_calls),
            )
        )

        if not response.tool_calls:
            yield LoopTurn(
                iteration=iteration,
                response=response,
                tool_calls=[],
                tool_results=[],
                done=True,
            )
            return

        # Run all tool calls this turn in parallel.
        results = await registry.dispatch_many(response.tool_calls, ctx)
        for args_call, r in zip(response.tool_calls, results):
            tool_log.record(
                iteration=iteration,
                arguments=args_call.arguments,
                result=r,
            )

        # Re-inject tool results into the next prompt.
        for r in results:
            memory.append(
                ChatMessage(
                    role="tool",
                    tool_call_id=r.tool_call_id,
                    name=r.name,
                    content=r.to_llm_message_content(),
                )
            )

        done = terminate_on_tool is not None and any(
            tc.name == terminate_on_tool
            for tc, r in zip(response.tool_calls, results)
            if r.status.value == "success"
        )

        yield LoopTurn(
            iteration=iteration,
            response=response,
            tool_calls=list(response.tool_calls),
            tool_results=list(results),
            done=done,
        )

        if done:
            return

    # Iteration cap hit without termination signal.
    yield LoopTurn(
        iteration=max_iterations,
        response=ChatResponse(text="(iteration cap reached)"),
        tool_calls=[],
        tool_results=[],
        done=True,
    )


__all__ = ["LoopTurn", "run_reactive_loop"]
