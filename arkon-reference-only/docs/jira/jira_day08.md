# TAG-08: `tag sync` Skills

## Description

**Suggested Points:** 8 (High — sha256 verification pipeline, atomic state management, interrupt recovery logic, and Claude Code compatibility; supply chain security is critical)

## Objective

Implement the `tag sync` command for skills synchronization, including sha256 verification before extraction, atomic state management with state.json, interrupt recovery that leaves no partial files, and compatibility with Claude Code's ~/.claude/skills/ directory.

## Requirements

### Sync Command
- `tag sync` — Sync all skills from registry to local machine
- `tag sync --dry-run` — Show what would be synced without writing files
- `tag sync --force` — Re-sync even if sha256 matches
- `tag sync skills` — Sync only skills (not MCP servers)
- Default target: `~/.claude/skills/` (Claude Code compatible)

### sha256 Verification Pipeline
- Download skill bundle from API
- Compute sha256 of downloaded content
- Compare against server-provided sha256 (from X-Content-SHA256 header)
- **Abort entire sync if any sha256 mismatch** (supply chain attack vector)
- Log mismatch details for investigation

### Atomic State Management
- `~/.tag/state.json` tracks: last_sync, synced_skills (id, version, sha256)
- State file written atomically (write to temp, rename)
- Only update state after successful write of all files
- State enables incremental sync (skip unchanged skills)

### Interrupt Recovery
- Ctrl+C during sync leaves state.json with only completed items
- No partial skill files on disk
- Write skills to temp directory, move on completion
- Interrupted sync → next sync resumes correctly

### Skill Removal
- Skills removed from registry are removed locally
- Removal logged clearly ("Removing skill X (no longer in registry)")
- Backup old skills to `~/.tag/backup/` before removal (optional flag)

### Claude Code Compatibility
- Skills placed in `~/.claude/skills/{skill-name}/`
- Skill files match Claude Code expected format
- SKILL.md at root of skill directory
- Any additional resources in subdirectories

## Implementation Notes
- Backend: Uses Day 2 Skills API, Day 3 Bundle download API
- Frontend: N/A
- CLI: Main implementation in packages/cli/src/commands/sync.ts
- Database: N/A (uses API)

## Unit Tests

### Required Unit Tests
| Test File | Test Case | Assertion |
|-----------|-----------|-----------|
| `packages/cli/src/__tests__/sync.test.ts` | `verifies sha256 before extraction` | sha256 check happens before file write |
| `packages/cli/src/__tests__/sync.test.ts` | `aborts entire sync on sha256 mismatch` | No files written when mismatch detected |
| `packages/cli/src/__tests__/sync.test.ts` | `leaves no partial files on abort` | Temp directory cleaned up |
| `packages/cli/src/__tests__/sync.test.ts` | `removes skills no longer in registry` | Local skill deleted when removed from API |
| `packages/cli/src/__tests__/sync.test.ts` | `updates state.json atomically` | Atomic write via temp file + rename |
| `packages/cli/src/__tests__/sync.test.ts` | `skips unchanged skills` | No download when sha256 matches state |
| `packages/cli/src/__tests__/sync.test.ts` | `--dry-run writes no files` | Filesystem unchanged after dry run |
| `packages/cli/src/__tests__/sync.test.ts` | `--force re-syncs everything` | All skills downloaded regardless of state |
| `packages/cli/src/__tests__/state.test.ts` | `state.json survives interrupt` | Incomplete sync doesn't corrupt state |
| `packages/cli/src/__tests__/state.test.ts` | `state.json recovery works` | Next sync resumes from valid state |

### Test Coverage Requirements
- 100% coverage on sha256 verification logic
- 100% coverage on atomic write operations
- All interrupt scenarios tested (Ctrl+C at various points)

## Integration Tests

### Required Integration Tests
| Test Scenario | Setup | Steps | Expected Result |
|---------------|-------|-------|-----------------|
| `sha256 verification success` | Server returns valid sha256 | 1. tag sync | Skills synced, sha256 in state.json |
| `sha256 mismatch abort` | Server returns corrupted bundle | 1. tag sync | Sync aborted, error logged, no files |
| `Ctrl+C during bundle 2/5` | 5 skills to sync | 1. tag sync 2. Ctrl+C after 1st | state.json has only bundle 1 |
| `--dry-run network only` | Skills to sync | 1. tag sync --dry-run 2. Check filesystem | No new files written |
| `incremental sync` | Previous sync completed | 1. Change 1 skill on server 2. tag sync | Only changed skill downloaded |
| `skill removal` | Skill deleted from registry | 1. Previous sync 2. Delete on server 3. tag sync | Local skill removed |
| `Claude Code compatibility` | Synced skills | 1. Check ~/.claude/skills/ | Skills parseable by Claude Code |

### End-to-End Flows
- Fresh sync: No local state → Full download → State created → All skills in ~/.claude/skills/
- Incremental sync: State exists → Only changed skills downloaded → State updated
- Recovery: Interrupted sync → State has partial → Resume → Full state after completion

## Interrupt Recovery Test

```typescript
// packages/cli/src/__tests__/sync.integration.test.ts

describe('sync interrupt recovery', () => {
  it('Ctrl+C during bundle 2/5 leaves state.json with only bundle 1', async () => {
    // Setup: 5 skills on server
    const skills = await createSkills(5)

    // Start sync, abort after first skill
    const syncProcess = spawn('tag', ['sync'])
    await waitForOutput(syncProcess, 'Syncing skill 2')
    syncProcess.kill('SIGINT')
    await syncProcess.exit

    // Verify state
    const state = readStateJson()
    expect(state.synced_skills).toHaveLength(1)
    expect(state.synced_skills[0].id).toBe(skills[0].id)

    // Verify only first skill on disk
    const localSkills = listLocalSkills()
    expect(localSkills).toHaveLength(1)
  })

  it('corrupted server bundle triggers full abort', async () => {
    // Setup: Corrupt one skill bundle
    mockCorruptedBundle('skill-3')

    // Sync should abort entirely
    const result = await runSync()

    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain('sha256 mismatch')
    expect(result.stderr).toContain('skill-3')

    // No skills should be synced
    const state = readStateJson()
    expect(state.synced_skills).toHaveLength(0)
  })

  it('--dry-run hits network but writes no files', async () => {
    const beforeFiles = listLocalSkills()
    const beforeState = readStateJson()

    await runSync(['--dry-run'])

    const afterFiles = listLocalSkills()
    const afterState = readStateJson()

    expect(afterFiles).toEqual(beforeFiles)
    expect(afterState).toEqual(beforeState)
  })
})
```

## Acceptance Criteria
1. `tag sync` downloads all skills from registry
2. sha256 verified for every download before extraction
3. sha256 mismatch aborts entire sync with clear error
4. state.json updated atomically after successful sync
5. Interrupted sync leaves valid state (no partial writes)
6. Skills placed in Claude Code compatible directory structure
7. Removed skills deleted from local filesystem
8. `--dry-run` shows plan without writing files

## Review Checklist
- [ ] Is sha256 computed from the downloaded bytes, not trusted from metadata?
- [ ] Does abort cleanup temp files completely?
- [ ] Is state.json write truly atomic (temp + rename)?
- [ ] Are file permissions correct on synced skills?
- [ ] Does --dry-run still verify sha256 (catch issues without sync)?
- [ ] Is the backup feature opt-in, not default?

## Dependencies
- Depends on: Day 1 (auth), Day 2 (skills API), Day 3 (bundles), Day 5 (CLI auth)
- Blocks: Day 9 (MCP sync uses similar patterns), Day 11 (init uses sync)

## Risk Factors
- **Supply chain attack via corrupted bundle** — Mitigation: sha256 verification mandatory, abort on mismatch
- **Interrupted sync corruption** — Mitigation: Atomic writes, temp directories, robust state management
- **Large skill bundles** — Mitigation: Streaming download, progress indicators
- **Claude Code format changes** — Mitigation: Version detection, format migration support
