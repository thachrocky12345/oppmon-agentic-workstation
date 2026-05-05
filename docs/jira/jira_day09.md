# TAG-09: `tag sync` MCP + .mcp.json

## Description

**Suggested Points:** 8 (High — .mcp.json merging complexity, preserving user customizations, idempotent sync operations, and diff preview feature; user experience critical for adoption)

## Objective

Extend `tag sync` to include MCP server configurations, implement intelligent .mcp.json merging that preserves user-added entries, ensure idempotent sync operations, and provide a diff preview command for reviewing changes before applying.

## Requirements

### MCP Server Sync
- `tag sync` syncs both skills and MCP servers (default)
- `tag sync mcp` — Sync only MCP servers
- Downloads MCP server bundles to `~/.tag/mcp-servers/{name}/`
- Updates .mcp.json with server configurations

### .mcp.json Merging Strategy
- Claude Code reads `~/.mcp.json` or project `.mcp.json`
- Preserve user-added entries (not managed by tag)
- Managed entries marked with `"_managed": "tag-gateway"`
- Update only managed entries during sync
- Never remove user entries

### .mcp.json Structure
```json
{
  "mcpServers": {
    "user-custom-server": {
      "command": "node",
      "args": ["~/my-server/index.js"]
    },
    "team-rag-server": {
      "command": "node",
      "args": ["~/.tag/mcp-servers/rag/index.js"],
      "env": {
        "API_URL": "https://gateway.example.com"
      },
      "_managed": "tag-gateway"
    }
  }
}
```

### Idempotent Sync
- Running sync twice produces same result
- No duplicate entries in .mcp.json
- Unchanged servers not re-downloaded
- State tracking for MCP servers (similar to skills)

### Diff Command
- `tag diff` — Show changes since last sync
- `tag diff --mcp` — Show only MCP changes
- Output: Added servers, Updated servers, Removed servers
- Color-coded diff output (green=add, yellow=update, red=remove)

### Server Removal
- Managed servers removed from registry → removed from .mcp.json
- Server files deleted from ~/.tag/mcp-servers/
- User entries never removed automatically

## Implementation Notes
- Backend: Uses Day 3 MCP Server API
- Frontend: N/A
- CLI: Extend sync command, add diff command
- Database: N/A

## Unit Tests

### Required Unit Tests
| Test File | Test Case | Assertion |
|-----------|-----------|-----------|
| `packages/cli/src/__tests__/mcp-sync.test.ts` | `preserves user entries in .mcp.json` | User entries unchanged after sync |
| `packages/cli/src/__tests__/mcp-sync.test.ts` | `adds _managed marker to synced entries` | All synced entries have _managed field |
| `packages/cli/src/__tests__/mcp-sync.test.ts` | `updates only managed entries` | User entries with same name untouched |
| `packages/cli/src/__tests__/mcp-sync.test.ts` | `idempotent sync produces same result` | Two syncs produce identical output |
| `packages/cli/src/__tests__/mcp-sync.test.ts` | `removes managed servers deleted from registry` | Server removed from .mcp.json |
| `packages/cli/src/__tests__/mcp-sync.test.ts` | `never removes user entries` | Non-managed entries always preserved |
| `packages/cli/src/__tests__/diff.test.ts` | `shows added servers` | New servers in green |
| `packages/cli/src/__tests__/diff.test.ts` | `shows updated servers` | Changed servers in yellow |
| `packages/cli/src/__tests__/diff.test.ts` | `shows removed servers` | Deleted managed servers in red |
| `packages/cli/src/__tests__/diff.test.ts` | `diff returns exit 0 when no changes` | Clean exit for scripts |

### Test Coverage Requirements
- 100% coverage on .mcp.json merge logic
- 100% coverage on user entry preservation
- All diff scenarios tested (add, update, remove, no change)

## Integration Tests

### Required Integration Tests
| Test Scenario | Setup | Steps | Expected Result |
|---------------|-------|-------|-----------------|
| `preserve user entries` | .mcp.json with user server | 1. tag sync | User server still in .mcp.json |
| `add managed server` | Empty .mcp.json, server in registry | 1. tag sync | Server added with _managed |
| `update managed server` | Synced server, changed on registry | 1. tag sync | Server updated, _managed preserved |
| `remove managed server` | Synced server, deleted from registry | 1. tag sync | Server removed from .mcp.json |
| `idempotent sync` | Synced state | 1. tag sync 2. tag sync | No file changes on second sync |
| `diff shows changes` | Outdated sync | 1. Add server to registry 2. tag diff | Shows new server as added |
| `conflict: user and managed same name` | User server "rag" exists | 1. Add managed "rag" to registry 2. tag sync | User entry preserved, warning shown |

### End-to-End Flows
- Fresh .mcp.json → Sync → Servers added with _managed → Sync again → No changes
- User has custom servers → Sync → User servers preserved → Registry update → Managed servers updated
- Preview changes: tag diff → Review → tag sync → Changes applied

## User Entry Preservation Test

```typescript
// packages/cli/src/__tests__/mcp-sync.integration.test.ts

describe('user entry preservation', () => {
  it('preserves user entries in .mcp.json', async () => {
    // Setup: User has custom MCP server
    const userConfig = {
      mcpServers: {
        'my-custom-server': {
          command: 'python',
          args: ['/path/to/my/server.py']
        }
      }
    }
    await writeMcpJson(userConfig)

    // Sync registry servers
    await runSync()

    // User entry preserved
    const result = await readMcpJson()
    expect(result.mcpServers['my-custom-server']).toEqual(userConfig.mcpServers['my-custom-server'])
    expect(result.mcpServers['my-custom-server']._managed).toBeUndefined()
  })

  it('adds managed marker to synced entries', async () => {
    // Registry has a server
    await createRegistryServer('team-rag', { command: 'node', args: ['rag.js'] })

    // Sync
    await runSync()

    // Managed marker present
    const result = await readMcpJson()
    expect(result.mcpServers['team-rag']._managed).toBe('tag-gateway')
  })

  it('handles name conflict gracefully', async () => {
    // User has server named 'rag'
    await writeMcpJson({
      mcpServers: {
        rag: { command: 'custom', args: [] }
      }
    })

    // Registry also has 'rag'
    await createRegistryServer('rag', { command: 'official', args: ['index.js'] })

    // Sync should warn but preserve user entry
    const result = await runSync()
    expect(result.warnings).toContain('Name conflict: rag')

    const config = await readMcpJson()
    expect(config.mcpServers.rag.command).toBe('custom') // User preserved
  })
})
```

## Acceptance Criteria
1. `tag sync` syncs MCP servers to ~/.tag/mcp-servers/
2. .mcp.json updated with managed server configurations
3. User entries (without _managed) never modified or removed
4. Managed entries marked with `"_managed": "tag-gateway"`
5. Sync is idempotent (running twice produces same result)
6. `tag diff` shows pending changes before sync
7. Name conflicts warn user but preserve their entry
8. Removed registry servers removed from .mcp.json

## Review Checklist
- [ ] Is .mcp.json read and written atomically?
- [ ] Does the merge algorithm handle edge cases (empty file, malformed JSON)?
- [ ] Are user entries truly never modified during sync?
- [ ] Does the diff command use exit codes suitable for scripting?
- [ ] Is the _managed marker documented for users?
- [ ] Does sync handle missing ~/.tag/mcp-servers/ directory?

## Dependencies
- Depends on: Day 3 (MCP API), Day 5 (CLI auth), Day 8 (sync patterns)
- Blocks: Day 10 (RAG CLI may add entries), Day 11 (init may bootstrap MCP)

## Risk Factors
- **User config corruption** — Mitigation: Backup before write, atomic operations
- **Merge conflicts** — Mitigation: Clear conflict resolution rules, warnings
- **Claude Code .mcp.json format changes** — Mitigation: Version detection, migration
- **Large number of MCP servers** — Mitigation: Pagination, progress indicators
