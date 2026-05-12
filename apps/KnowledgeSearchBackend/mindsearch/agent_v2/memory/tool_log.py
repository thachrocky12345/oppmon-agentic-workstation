"""Per-request tool-call log.

Every dispatch through `ToolRegistry` is recorded here with input, output,
duration, and status. Lets us debug runs, build traces, and surface failures
that the legacy code's broad try/except (mindsearch_agent.py:381-385)
swallowed silently.

Mirrors Arkon `apps/api/src/agent/memory-manager.ts:438-472` (tool_log table)
without the cross-session persistence.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any

from ..tools.registry import ToolResult


@dataclass
class ToolLogEntry:
    seq: int
    iteration: int
    tool_call_id: str
    name: str
    arguments: dict[str, Any]
    status: str
    duration_ms: int
    output: Any | None = None
    error: str | None = None
    ts: float = field(default_factory=time.time)

    def is_error(self) -> bool:
        return self.status != "success"


class ToolLog:
    """In-memory append-only log scoped to a single request."""

    def __init__(self) -> None:
        self._entries: list[ToolLogEntry] = []

    def record(
        self,
        *,
        iteration: int,
        arguments: dict[str, Any],
        result: ToolResult,
    ) -> ToolLogEntry:
        entry = ToolLogEntry(
            seq=len(self._entries),
            iteration=iteration,
            tool_call_id=result.tool_call_id,
            name=result.name,
            arguments=arguments,
            status=result.status.value,
            duration_ms=result.duration_ms,
            output=result.output,
            error=result.error,
        )
        self._entries.append(entry)
        return entry

    def entries(self) -> list[ToolLogEntry]:
        return list(self._entries)

    def errors(self) -> list[ToolLogEntry]:
        return [e for e in self._entries if e.is_error()]

    def __len__(self) -> int:
        return len(self._entries)


__all__ = ["ToolLog", "ToolLogEntry"]
