# TAG-18: Claude Code Hook Integration

## Description

**Suggested Points:** 8 (High — non-blocking hook architecture, opt-out persistence, event buffer management, and Claude Code integration complexity; user experience critical)

## Objective

Implement Claude Code hook integration for capturing skill and MCP server usage events, ensuring non-blocking operation that never impacts Claude Code performance, user opt-out persistence, and buffered event transmission with cap limits.

## Requirements

### Claude Code Hooks
- Hook into Claude Code's extension/plugin system
- Capture: skill invocations, MCP server calls, RAG queries
- Non-blocking: Hook must never delay Claude Code operations
- Graceful degradation: Failures don't affect Claude Code

### Hook Installation
- `tag hooks install` — Install hooks into Claude Code
- `tag hooks uninstall` — Remove all hooks
- `tag hooks status` — Show current hook state
- Auto-install option during `tag init`
- Hooks stored in Claude Code's hooks directory

### Non-Blocking Architecture
- Hooks write to local buffer file, not network
- Background process reads buffer, sends to API
- Hook returns immediately (<1ms)
- Failed sends retry with exponential backoff
- Buffer persists across Claude Code restarts

### Event Buffer Management
- Buffer location: `~/.tag/events.buffer`
- Buffer cap: 10,000 events (oldest dropped)
- Flush interval: Every 30 seconds
- Flush on: Buffer 80% full, graceful shutdown
- Format: NDJSON (newline-delimited JSON)

### Opt-Out Persistence
- `tag events disable` — Stop collecting events locally
- `tag events enable` — Resume collection
- Setting stored in `~/.tag/config.json`
- Respects both local opt-out AND server events_enabled
- Clear feedback: "Events disabled locally" or "Events disabled by team admin"

### Event Payload
```typescript
interface UsageEvent {
  resource_type: 'skill' | 'mcp_server' | 'rag_query'
  resource_id: string
  action: string
  timestamp: string // ISO 8601
  // NO user identifiers
}
```

## Implementation Notes
- Backend: Uses Day 17 events API
- Frontend: N/A
- CLI: Hooks commands, event enable/disable
- Database: N/A (uses API)

## Unit Tests

### Required Unit Tests
| Test File | Test Case | Assertion |
|-----------|-----------|-----------|
| `packages/cli/src/__tests__/hooks.test.ts` | `hook returns in <1ms` | Timing under threshold |
| `packages/cli/src/__tests__/hooks.test.ts` | `hook writes to buffer file` | Buffer file updated |
| `packages/cli/src/__tests__/hooks.test.ts` | `hook never throws` | All errors caught |
| `packages/cli/src/__tests__/buffer.test.ts` | `buffer capped at 10k events` | Old events dropped |
| `packages/cli/src/__tests__/buffer.test.ts` | `flush sends to API` | API called with events |
| `packages/cli/src/__tests__/buffer.test.ts` | `failed flush retries` | Exponential backoff |
| `packages/cli/src/__tests__/buffer.test.ts` | `buffer persists on crash` | Events recovered |
| `packages/cli/src/__tests__/optout.test.ts` | `disable stops collection` | No events written |
| `packages/cli/src/__tests__/optout.test.ts` | `enable resumes collection` | Events written |
| `packages/cli/src/__tests__/optout.test.ts` | `opt-out persisted` | Setting in config |
| `packages/cli/src/__tests__/optout.test.ts` | `respects server events_enabled` | No send when server disabled |

### Test Coverage Requirements
- 100% coverage on hook timing (non-blocking)
- 100% coverage on buffer management
- All opt-out scenarios tested

## Integration Tests

### Required Integration Tests
| Test Scenario | Setup | Steps | Expected Result |
|---------------|-------|-------|-----------------|
| `hook installation` | Fresh Claude Code | 1. tag hooks install | Hooks in place |
| `hook uninstallation` | Installed hooks | 1. tag hooks uninstall | Hooks removed |
| `non-blocking hook` | Installed hooks | 1. Invoke skill 2. Measure time | <1ms added |
| `buffer flush` | Events in buffer | 1. Wait 30s or trigger flush | Events sent to API |
| `buffer cap` | 10k events in buffer | 1. Add 1 more | Oldest event dropped |
| `opt-out local` | Events enabled | 1. tag events disable 2. Invoke skill | No event in buffer |
| `opt-out server` | Server events_enabled=false | 1. Invoke skill 2. Flush | 204 from server, no retry |
| `crash recovery` | Kill during operation | 1. Kill process 2. Restart | Buffer events recovered |
| `network failure` | API unreachable | 1. Invoke skill 2. Flush | Events retained, retry later |

### End-to-End Flows
- Install hooks → Use Claude Code → Buffer fills → Auto-flush → Events in dashboard
- Opt-out locally → Use Claude Code → No events collected → Opt-in → Collection resumes
- Network down → Events buffered → Network up → Events flushed → No data loss

## Non-Blocking Hook Implementation

```typescript
// packages/cli/src/hooks/claude-code.ts

import { appendFileSync } from 'fs'
import { join } from 'path'

const BUFFER_PATH = join(process.env.HOME || '~', '.tag', 'events.buffer')
const MAX_HOOK_TIME_MS = 1

interface HookContext {
  resourceType: 'skill' | 'mcp_server' | 'rag_query'
  resourceId: string
  action: string
}

export function captureEvent(context: HookContext): void {
  const start = performance.now()

  try {
    // Check local opt-out (cached value, not file read)
    if (isOptedOut()) return

    const event = {
      resource_type: context.resourceType,
      resource_id: context.resourceId,
      action: context.action,
      timestamp: new Date().toISOString(),
    }

    // Synchronous append for speed (no await)
    appendFileSync(BUFFER_PATH, JSON.stringify(event) + '\n')

  } catch (error) {
    // Never throw - log and continue
    // Don't even log if it would be slow
  }

  // Timing assertion (for development/testing)
  const elapsed = performance.now() - start
  if (elapsed > MAX_HOOK_TIME_MS) {
    console.warn(`Hook took ${elapsed}ms, exceeds ${MAX_HOOK_TIME_MS}ms target`)
  }
}

// Cached opt-out check (file read once, then cached)
let optOutCached: boolean | null = null
function isOptedOut(): boolean {
  if (optOutCached === null) {
    try {
      const config = require(join(process.env.HOME || '~', '.tag', 'config.json'))
      optOutCached = config.events_enabled === false
    } catch {
      optOutCached = false
    }
  }
  return optOutCached
}
```

## Buffer Flush Service

```typescript
// packages/cli/src/services/event-flusher.ts

import { readFileSync, writeFileSync, unlinkSync } from 'fs'

const FLUSH_INTERVAL_MS = 30_000
const BUFFER_CAP = 10_000
const FLUSH_THRESHOLD = 0.8 // 80%

export class EventFlusher {
  private timer: NodeJS.Timeout | null = null

  start() {
    this.timer = setInterval(() => this.flush(), FLUSH_INTERVAL_MS)
    process.on('SIGTERM', () => this.flush())
    process.on('SIGINT', () => this.flush())
  }

  async flush() {
    const events = this.readBuffer()
    if (events.length === 0) return

    try {
      const response = await fetch('/api/events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${await getToken()}`
        },
        body: JSON.stringify({ events }),
      })

      if (response.status === 204) {
        // Success - clear buffer
        this.clearBuffer()
      } else {
        // Retry later
        console.warn('Event flush failed, will retry')
      }
    } catch (error) {
      // Network error - keep events for retry
      console.warn('Network error during flush, events retained')
    }
  }

  private readBuffer(): UsageEvent[] {
    try {
      const content = readFileSync(BUFFER_PATH, 'utf-8')
      const lines = content.trim().split('\n').filter(Boolean)

      // Cap at BUFFER_CAP (drop oldest)
      const events = lines.slice(-BUFFER_CAP).map(JSON.parse)

      // If over threshold, trigger immediate flush
      if (events.length > BUFFER_CAP * FLUSH_THRESHOLD) {
        this.flush()
      }

      return events
    } catch {
      return []
    }
  }

  private clearBuffer() {
    try {
      unlinkSync(BUFFER_PATH)
    } catch {}
  }
}
```

## Acceptance Criteria
1. Hooks capture skill/MCP/RAG usage in Claude Code
2. Hook execution adds <1ms to operations
3. Events buffered locally, flushed in background
4. Buffer capped at 10,000 events
5. `tag events disable` stops local collection
6. `tag events enable` resumes collection
7. Opt-out setting persists across sessions
8. Network failures don't lose events

## Review Checklist
- [ ] Does the hook truly return in <1ms?
- [ ] Can a slow network block Claude Code operations?
- [ ] Is the buffer file written atomically (crash-safe)?
- [ ] Does opt-out clear the existing buffer or just stop new events?
- [ ] Is the background flush process lightweight?
- [ ] Are events truly anonymous (no user_id, no device_id)?

## Dependencies
- Depends on: Day 17 (Events API), Claude Code hook system
- Blocks: Day 19 (Dashboard shows usage data)

## Risk Factors
- **Hook performance impact** — Mitigation: Aggressive timing, sync file writes, caching
- **Buffer growth unbounded** — Mitigation: Hard cap, FIFO eviction
- **Claude Code API changes** — Mitigation: Version detection, fallback behavior
- **Privacy leakage in events** — Mitigation: Strict event schema, no user identifiers
