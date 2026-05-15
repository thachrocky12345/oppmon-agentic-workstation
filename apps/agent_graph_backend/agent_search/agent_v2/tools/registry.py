"""Tool registry and dispatcher.

Port of Arkon's `apps/api/src/agent/toolbox.ts`:
- `register(...)` adds a tool (handler + JSON-Schema params).
- `schemas()` returns the schemas the LLM sees.
- `dispatch(tool_call)` runs one call.
- `dispatch_many(tool_calls)` runs N calls in parallel, bounded by a semaphore.

Each handler is an async callable: `async (args: dict, ctx: ToolContext) -> Any`.
Errors are caught and returned as `ToolResult(status='error', error=...)`;
nothing escapes the dispatcher except programming bugs.
"""

from __future__ import annotations

import asyncio
import inspect
import time
import traceback
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Awaitable, Callable

from pydantic import BaseModel

from ..llm.base import ToolCall, ToolDef


class ToolStatus(str, Enum):
    SUCCESS = "success"
    ERROR = "error"
    TIMEOUT = "timeout"


class ToolResult(BaseModel):
    """The outcome of one tool dispatch."""

    tool_call_id: str
    name: str
    status: ToolStatus
    duration_ms: int
    output: Any | None = None
    error: str | None = None

    def to_llm_message_content(self) -> str:
        """Serialize as a string the LLM can read in the next turn."""
        import json

        if self.status == ToolStatus.SUCCESS:
            try:
                return json.dumps(self.output, ensure_ascii=False, default=str)
            except (TypeError, ValueError):
                return str(self.output)
        return json.dumps(
            {"error": self.error or "unknown error", "status": self.status.value},
            ensure_ascii=False,
        )


@dataclass
class ToolContext:
    """Per-call context passed to every handler.

    Handlers can use this to reach shared state (graph, retriever, memory)
    without each tool taking its own ad-hoc kwargs.
    """

    data: dict[str, Any] = field(default_factory=dict)

    def get(self, key: str, default: Any = None) -> Any:
        return self.data.get(key, default)

    def require(self, key: str) -> Any:
        if key not in self.data:
            raise KeyError(f"ToolContext missing required key: {key!r}")
        return self.data[key]


ToolHandler = Callable[[dict[str, Any], ToolContext], Awaitable[Any]]


@dataclass
class _RegisteredTool:
    definition: ToolDef
    handler: ToolHandler


class ToolRegistry:
    """Holds tool definitions + handlers; dispatches with parallelism limit."""

    def __init__(
        self,
        *,
        max_parallel: int = 8,
        per_tool_timeout_s: float = 30.0,
    ):
        self._tools: dict[str, _RegisteredTool] = {}
        self._sem = asyncio.Semaphore(max_parallel)
        self._timeout_s = per_tool_timeout_s

    # ---- registration ----

    def register(
        self,
        *,
        name: str,
        description: str,
        parameters: dict[str, Any],
        handler: ToolHandler,
    ) -> None:
        if name in self._tools:
            raise ValueError(f"Tool already registered: {name!r}")
        if not inspect.iscoroutinefunction(handler):
            raise TypeError(
                f"Tool handler for {name!r} must be `async def` "
                f"(got {type(handler).__name__})"
            )
        self._tools[name] = _RegisteredTool(
            definition=ToolDef(
                name=name, description=description, parameters=parameters
            ),
            handler=handler,
        )

    def names(self) -> list[str]:
        return list(self._tools.keys())

    def schemas(self, *, only: list[str] | None = None) -> list[ToolDef]:
        """Return ToolDef list for the LLM. `only` filters by name."""
        if only is None:
            return [t.definition for t in self._tools.values()]
        return [self._tools[n].definition for n in only if n in self._tools]

    # ---- dispatch ----

    async def dispatch(self, call: ToolCall, ctx: ToolContext) -> ToolResult:
        async with self._sem:
            return await self._run_one(call, ctx)

    async def dispatch_many(
        self, calls: list[ToolCall], ctx: ToolContext
    ) -> list[ToolResult]:
        """Run N tool calls in parallel; preserves input order."""
        if not calls:
            return []
        tasks = [self.dispatch(c, ctx) for c in calls]
        return await asyncio.gather(*tasks)

    async def _run_one(self, call: ToolCall, ctx: ToolContext) -> ToolResult:
        tool = self._tools.get(call.name)
        if tool is None:
            return ToolResult(
                tool_call_id=call.id,
                name=call.name,
                status=ToolStatus.ERROR,
                duration_ms=0,
                error=f"Unknown tool: {call.name!r}. "
                f"Available: {sorted(self._tools.keys())}",
            )

        t0 = time.monotonic()
        try:
            output = await asyncio.wait_for(
                tool.handler(call.arguments, ctx),
                timeout=self._timeout_s,
            )
            return ToolResult(
                tool_call_id=call.id,
                name=call.name,
                status=ToolStatus.SUCCESS,
                duration_ms=int((time.monotonic() - t0) * 1000),
                output=output,
            )
        except asyncio.TimeoutError:
            return ToolResult(
                tool_call_id=call.id,
                name=call.name,
                status=ToolStatus.TIMEOUT,
                duration_ms=int((time.monotonic() - t0) * 1000),
                error=f"Tool {call.name!r} exceeded {self._timeout_s}s timeout",
            )
        except Exception as e:  # noqa: BLE001 — we want to catch everything
            return ToolResult(
                tool_call_id=call.id,
                name=call.name,
                status=ToolStatus.ERROR,
                duration_ms=int((time.monotonic() - t0) * 1000),
                error=f"{type(e).__name__}: {e}\n{traceback.format_exc(limit=5)}",
            )


__all__ = [
    "ToolContext",
    "ToolHandler",
    "ToolRegistry",
    "ToolResult",
    "ToolStatus",
]
