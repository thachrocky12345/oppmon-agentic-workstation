# TAG-08-RUST: `tag sync` Skills with Rust Verification

## Description

**Suggested Points:** 8 (High — skill synchronization with Rust-based SHA256 verification, interrupt recovery, atomic state management)

**Track:** Rust Early

## Objective

Implement the `tag sync` command for synchronizing team skills to the local Claude Code skills directory, using Rust for SHA256 verification to ensure supply chain security with consistent, high-performance hashing.

## Requirements

### Sync Command Structure

```typescript
// packages/cli/src/commands/sync.ts
import { Command } from 'commander'
import { syncSkills } from '../sync/skills'
import { syncMcpServers } from '../sync/mcp'

export function registerSyncCommand(program: Command): void {
  const sync = program
    .command('sync')
    .description('Synchronize team resources to local machine')

  sync
    .command('skills')
    .description('Sync skills from team registry')
    .option('--dry-run', 'Show what would be synced without making changes')
    .option('--force', 'Re-download all skills even if hashes match')
    .action(syncSkills)

  sync
    .command('mcp')
    .description('Sync MCP servers from team registry')
    .option('--dry-run', 'Show what would be synced')
    .action(syncMcpServers)

  sync
    .command('all')
    .description('Sync all resources (skills + MCP servers)')
    .option('--dry-run', 'Show what would be synced')
    .action(async (options) => {
      await syncSkills(options)
      await syncMcpServers(options)
    })
}
```

### State Management

```typescript
// packages/cli/src/sync/state.ts
import { join } from 'path'
import { readFile, writeFile } from 'fs/promises'
import { sha256Hex } from '../engine'

interface SyncState {
  version: 1
  lastSync: string
  skills: Record<string, SkillState>
  mcp: Record<string, McpState>
}

interface SkillState {
  id: string
  name: string
  version: string
  sha256: string
  syncedAt: string
  path: string
}

interface McpState {
  id: string
  name: string
  version: string
  bundleSha256: string
  syncedAt: string
  path: string
}

export class StateManager {
  private statePath: string
  private state: SyncState

  constructor(configDir: string) {
    this.statePath = join(configDir, 'sync-state.json')
    this.state = { version: 1, lastSync: '', skills: {}, mcp: {} }
  }

  async load(): Promise<void> {
    try {
      const json = await readFile(this.statePath, 'utf-8')
      this.state = JSON.parse(json)
    } catch {
      // No state file, start fresh
    }
  }

  async save(): Promise<void> {
    this.state.lastSync = new Date().toISOString()
    await writeFile(this.statePath, JSON.stringify(this.state, null, 2))
  }

  getSkill(id: string): SkillState | undefined {
    return this.state.skills[id]
  }

  setSkill(skill: SkillState): void {
    this.state.skills[skill.id] = skill
  }

  removeSkill(id: string): void {
    delete this.state.skills[id]
  }

  getAllSkills(): SkillState[] {
    return Object.values(this.state.skills)
  }
}
```

### Skill Sync with Rust Verification

```typescript
// packages/cli/src/sync/skills.ts
import { mkdir, writeFile, rm } from 'fs/promises'
import { join } from 'path'
import ora from 'ora'
import chalk from 'chalk'
import { verifySha256, sha256Hex } from '../engine'
import { StateManager } from './state'
import { ApiClient } from '../api/client'
import { getClaudeSkillsDir } from '../config/paths'

interface SyncOptions {
  dryRun?: boolean
  force?: boolean
}

export async function syncSkills(options: SyncOptions = {}): Promise<void> {
  const spinner = ora('Fetching skill registry...').start()

  try {
    const api = await ApiClient.create()
    const state = new StateManager(await getConfigDir())
    await state.load()

    // Fetch skills from API
    const remoteSkills = await api.getSkills()
    spinner.text = `Found ${remoteSkills.length} skills`

    // Track what we've seen (for deletion detection)
    const seenIds = new Set<string>()

    // Sync each skill
    let added = 0
    let updated = 0
    let unchanged = 0
    let failed = 0

    for (const remote of remoteSkills) {
      seenIds.add(remote.id)
      const local = state.getSkill(remote.id)

      // Check if update needed
      if (local && local.sha256 === remote.sha256 && !options.force) {
        unchanged++
        continue
      }

      if (options.dryRun) {
        console.log(chalk.blue(local ? 'UPDATE' : 'ADD'), remote.name, remote.version)
        continue
      }

      spinner.text = `Syncing ${remote.name}...`

      try {
        // Download skill bundle
        const bundle = await api.downloadSkillBundle(remote.id)

        // CRITICAL: Verify SHA256 with Rust
        if (!verifySha256(bundle, remote.sha256)) {
          throw new Error(
            `SHA256 mismatch for ${remote.name}. ` +
            `Expected: ${remote.sha256}, Got: ${sha256Hex(bundle)}`
          )
        }

        // Extract to skills directory
        const skillDir = join(await getClaudeSkillsDir(), remote.name)
        await extractBundle(bundle, skillDir)

        // Update state
        state.setSkill({
          id: remote.id,
          name: remote.name,
          version: remote.version,
          sha256: remote.sha256,
          syncedAt: new Date().toISOString(),
          path: skillDir,
        })

        if (local) {
          updated++
        } else {
          added++
        }

      } catch (error) {
        spinner.warn(`Failed to sync ${remote.name}: ${error}`)
        failed++
      }
    }

    // Remove skills that are no longer in registry
    const localSkills = state.getAllSkills()
    let removed = 0

    for (const local of localSkills) {
      if (!seenIds.has(local.id)) {
        if (options.dryRun) {
          console.log(chalk.red('REMOVE'), local.name)
        } else {
          spinner.text = `Removing ${local.name}...`
          await rm(local.path, { recursive: true, force: true })
          state.removeSkill(local.id)
          removed++
        }
      }
    }

    // Save state
    if (!options.dryRun) {
      await state.save()
    }

    spinner.succeed('Sync complete')

    // Summary
    console.log()
    console.log(chalk.bold('Summary:'))
    console.log(`  Added:     ${added}`)
    console.log(`  Updated:   ${updated}`)
    console.log(`  Unchanged: ${unchanged}`)
    console.log(`  Removed:   ${removed}`)
    if (failed > 0) {
      console.log(`  Failed:    ${chalk.red(failed)}`)
    }

  } catch (error) {
    spinner.fail(`Sync failed: ${error}`)
    process.exit(1)
  }
}

async function extractBundle(bundle: Buffer, targetDir: string): Promise<void> {
  const AdmZip = (await import('adm-zip')).default
  const zip = new AdmZip(bundle)

  await mkdir(targetDir, { recursive: true })
  zip.extractAllTo(targetDir, true)
}
```

### Interrupt Recovery

```typescript
// packages/cli/src/sync/recovery.ts
import { join } from 'path'
import { readdir, rm, stat } from 'fs/promises'

/**
 * Clean up any partial downloads from interrupted syncs.
 * Called at the start of sync to ensure clean state.
 */
export async function cleanupPartials(dir: string): Promise<void> {
  try {
    const entries = await readdir(dir)

    for (const entry of entries) {
      // Partial downloads have .partial suffix
      if (entry.endsWith('.partial')) {
        const fullPath = join(dir, entry)
        await rm(fullPath, { recursive: true, force: true })
      }
    }
  } catch {
    // Directory might not exist yet
  }
}

/**
 * Write a file atomically by writing to .partial first,
 * then renaming on success.
 */
export async function atomicWrite(
  path: string,
  data: Buffer | string,
): Promise<void> {
  const partialPath = `${path}.partial`
  const { writeFile, rename, rm } = await import('fs/promises')

  try {
    await writeFile(partialPath, data)
    await rename(partialPath, path)
  } catch (error) {
    // Clean up partial on failure
    await rm(partialPath, { force: true })
    throw error
  }
}

/**
 * Verify state file integrity after load.
 * If corrupted, start fresh.
 */
export function validateState(state: unknown): state is SyncState {
  if (!state || typeof state !== 'object') return false
  if (!('version' in state) || state.version !== 1) return false
  if (!('skills' in state) || typeof state.skills !== 'object') return false
  return true
}
```

### Diff Command

```typescript
// packages/cli/src/commands/diff.ts
import { Command } from 'commander'
import chalk from 'chalk'
import { StateManager } from '../sync/state'
import { ApiClient } from '../api/client'

export function registerDiffCommand(program: Command): void {
  program
    .command('diff')
    .description('Show differences between local and remote')
    .option('--skills', 'Show skill differences')
    .option('--mcp', 'Show MCP server differences')
    .action(async (options) => {
      const api = await ApiClient.create()
      const state = new StateManager(await getConfigDir())
      await state.load()

      if (options.skills !== false) {
        console.log(chalk.bold('\nSkills:'))
        const remote = await api.getSkills()
        const local = state.getAllSkills()

        const remoteMap = new Map(remote.map(s => [s.id, s]))
        const localMap = new Map(local.map(s => [s.id, s]))

        // Added (in remote, not in local)
        for (const [id, r] of remoteMap) {
          if (!localMap.has(id)) {
            console.log(chalk.green(`  + ${r.name} (${r.version})`))
          }
        }

        // Updated (hash mismatch)
        for (const [id, l] of localMap) {
          const r = remoteMap.get(id)
          if (r && r.sha256 !== l.sha256) {
            console.log(chalk.yellow(`  ~ ${l.name} (${l.version} -> ${r.version})`))
          }
        }

        // Removed (in local, not in remote)
        for (const [id, l] of localMap) {
          if (!remoteMap.has(id)) {
            console.log(chalk.red(`  - ${l.name}`))
          }
        }
      }
    })
}
```

## Implementation Notes

- **Backend:** N/A (CLI talks to API)
- **Rust:** SHA256 verification via NAPI
- **CLI:** Sync commands with state management
- **Database:** N/A

## Unit Tests

### Required Unit Tests

| Test File | Test Case | Assertion |
|-----------|-----------|-----------|
| `packages/cli/src/__tests__/sync/verify.test.ts` | `accepts valid hash` | Returns true |
| `packages/cli/src/__tests__/sync/verify.test.ts` | `rejects tampered data` | Returns false |
| `packages/cli/src/__tests__/sync/verify.test.ts` | `rejects wrong hash` | Returns false |
| `packages/cli/src/__tests__/sync/state.test.ts` | `save and load roundtrip` | Data preserved |
| `packages/cli/src/__tests__/sync/state.test.ts` | `handles missing file` | Starts fresh |
| `packages/cli/src/__tests__/sync/recovery.test.ts` | `cleans partial files` | .partial removed |
| `packages/cli/src/__tests__/sync/recovery.test.ts` | `atomic write succeeds` | File created |
| `packages/cli/src/__tests__/sync/recovery.test.ts` | `atomic write cleans on fail` | No partial left |

### Test Coverage Requirements

- 100% on verification logic
- State management edge cases
- Interrupt recovery scenarios

## Integration Tests

### Required Integration Tests

| Test Scenario | Setup | Steps | Expected Result |
|---------------|-------|-------|-----------------|
| `sync new skills` | Empty local | 1. sync | Skills downloaded |
| `sync update` | Old version local | 1. sync | Updated to new |
| `hash mismatch abort` | Tampered server | 1. sync | Error, no extract |
| `interrupt recovery` | Kill mid-sync | 1. Start 2. Kill 3. Restart | Clean state |
| `remove deleted skills` | Skill removed from registry | 1. sync | Local deleted |
| `dry run` | Any state | 1. sync --dry-run | No changes |

### End-to-End Flows

- `tag sync skills` → Fetch registry → Download bundles → Verify (Rust) → Extract → Update state
- Interrupted sync → Restart → Clean partials → Resume from state

## Acceptance Criteria

1. `tag sync skills` downloads and extracts skills
2. **Rust SHA256 verification on every bundle**
3. Atomic state updates (no partial state on interrupt)
4. Skills no longer in registry are removed
5. `--dry-run` shows changes without applying
6. `--force` re-downloads even if hash matches
7. `tag diff` shows local vs remote differences
8. Skills appear in `~/.claude/skills/`

## Review Checklist

- [ ] Does verification use Rust SHA256?
- [ ] Is state updated atomically?
- [ ] Are partial files cleaned on restart?
- [ ] Does hash mismatch abort the sync?
- [ ] Is the skills directory correct for Claude Code?
- [ ] Does removal require confirmation?

## Dependencies

- Depends on: Day 5 (CLI + NAPI), Day 3 (hash functions)
- Blocks: Day 9 (MCP sync), Day 12 (E2E smoke)

## Risk Factors

- **Large bundles** — Mitigation: Progress bar, streaming download
- **Disk space** — Mitigation: Check before download
- **Permission errors** — Mitigation: Clear error message, suggest fix
- **Concurrent syncs** — Mitigation: Lock file
