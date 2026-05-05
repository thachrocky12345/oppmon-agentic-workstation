# TAG-11: `tag init` + Project Config

## Description

**Suggested Points:** 5 (Medium — project configuration design, team scoping logic, .gitignore awareness, and interactive setup wizard; user experience focus)

## Objective

Build the `tag init` command for initializing projects with team-specific configuration, implementing team scoping for project-level skills and MCP servers, intelligent .gitignore suggestions, and an interactive setup wizard for first-time users.

## Requirements

### Init Command
- `tag init` — Initialize current directory as a tag project
- `tag init --team <team-id>` — Associate project with specific team
- `tag init --yes` — Accept all defaults (non-interactive)
- Creates `.tag/` directory with project configuration
- Safe to run in already-initialized projects (idempotent)

### Project Configuration
- `.tag/config.json` — Project-level settings
  - `team_id`: Associated team (scopes visible skills/MCP)
  - `skills`: Array of pinned skill IDs/names for this project
  - `mcp_servers`: Array of pinned MCP server IDs for this project
  - `sync_on_cd`: Boolean to auto-sync when entering directory
- `.tag/state.json` — Local state (synced items, cache)

### Team Scoping
- If team specified, only show team-scoped + tenant-scoped resources
- `tag sync` respects project's team context
- Skills/MCP servers pinned to project override global defaults
- Team selection persisted in project config

### Interactive Setup Wizard
- Run when `tag init` with no flags
- Steps:
  1. Detect current team from user membership (or prompt if multiple)
  2. Show available skills for team, allow selection
  3. Show available MCP servers, allow selection
  4. Offer to set up .gitignore
  5. Offer to run initial sync
- Skip wizard with `--yes` (uses sensible defaults)

### .gitignore Awareness
- Check if `.tag/` is in .gitignore
- If not, suggest adding it
- Auto-add with `--yes` flag
- `.tag/state.json` should always be gitignored
- `.tag/config.json` may be committed (team decision)

### Claude Code Integration
- Create symlink or copy from project `.tag/skills/` to Claude Code location
- Support project-local MCP server configurations
- Document project-specific vs global behavior

## Implementation Notes
- Backend: Uses team membership API, skills list API
- Frontend: N/A
- CLI: New command in packages/cli/src/commands/init.ts
- Database: N/A

## Unit Tests

### Required Unit Tests
| Test File | Test Case | Assertion |
|-----------|-----------|-----------|
| `packages/cli/src/__tests__/init.test.ts` | `creates .tag directory` | Directory exists after init |
| `packages/cli/src/__tests__/init.test.ts` | `creates config.json with team_id` | Config has correct team |
| `packages/cli/src/__tests__/init.test.ts` | `--team sets team_id in config` | Specified team in config |
| `packages/cli/src/__tests__/init.test.ts` | `idempotent on re-init` | Running twice is safe |
| `packages/cli/src/__tests__/init.test.ts` | `--yes skips prompts` | No interactive prompts |
| `packages/cli/src/__tests__/init.test.ts` | `detects existing .gitignore` | Reads .gitignore if present |
| `packages/cli/src/__tests__/init.test.ts` | `suggests .tag/ addition to .gitignore` | Suggestion in output |
| `packages/cli/src/__tests__/wizard.test.ts` | `wizard shows team options` | Teams displayed for selection |
| `packages/cli/src/__tests__/wizard.test.ts` | `wizard shows skill options` | Skills for team displayed |
| `packages/cli/src/__tests__/wizard.test.ts` | `wizard persists selections` | Config reflects choices |
| `packages/cli/src/__tests__/scope.test.ts` | `team scoping filters skills` | Only team + tenant skills shown |
| `packages/cli/src/__tests__/scope.test.ts` | `team scoping filters MCP` | Only team + tenant MCP shown |

### Test Coverage Requirements
- 100% coverage on config file operations
- 100% coverage on .gitignore detection and modification
- All interactive paths tested (mock inquirer)

## Integration Tests

### Required Integration Tests
| Test Scenario | Setup | Steps | Expected Result |
|---------------|-------|-------|-----------------|
| `fresh init` | Empty directory | 1. tag init --team T1 --yes | .tag/ created with config |
| `re-init preserves config` | Already initialized | 1. Modify config 2. tag init | Config preserved |
| `team scoping` | User in Team A and B | 1. tag init --team A 2. tag sync | Only Team A + tenant skills |
| `.gitignore suggestion` | No .gitignore | 1. tag init | Suggestion to add .tag/ |
| `.gitignore auto-add` | Existing .gitignore | 1. tag init --yes | .tag/ added to .gitignore |
| `wizard team selection` | User in 2 teams | 1. tag init (interactive) | Team selection prompt shown |
| `wizard skill selection` | Team has 5 skills | 1. tag init (interactive) | Skills shown for selection |
| `sync respects project team` | Project has team_id | 1. tag sync | Only team-scoped resources synced |

### End-to-End Flows
- New project: init → wizard selects team → wizard selects skills → sync → Claude Code ready
- Existing project: init (idempotent) → update config → sync → New skills available
- Multi-team user: init → select team → project scoped correctly

## Team Scoping Logic

```typescript
// packages/cli/src/__tests__/scope.integration.test.ts

describe('team scoping', () => {
  beforeAll(async () => {
    // Setup: User is member of Team A and Team B
    // Skill X is team-scoped to Team A
    // Skill Y is team-scoped to Team B
    // Skill Z is tenant-scoped (visible to all)
  })

  it('project in Team A sees A + tenant skills', async () => {
    // Init with Team A
    await runCommand(['init', '--team', 'team-a', '--yes'])

    // Sync should only get A + tenant
    const result = await runCommand(['sync', '--dry-run'])

    expect(result.stdout).toContain('skill-x')   // Team A skill
    expect(result.stdout).toContain('skill-z')   // Tenant skill
    expect(result.stdout).not.toContain('skill-y') // Team B skill - not visible
  })

  it('project in Team B sees B + tenant skills', async () => {
    await runCommand(['init', '--team', 'team-b', '--yes'])
    const result = await runCommand(['sync', '--dry-run'])

    expect(result.stdout).not.toContain('skill-x') // Team A skill
    expect(result.stdout).toContain('skill-y')     // Team B skill
    expect(result.stdout).toContain('skill-z')     // Tenant skill
  })

  it('no team sees only tenant skills', async () => {
    await runCommand(['init', '--yes']) // No team specified
    const result = await runCommand(['sync', '--dry-run'])

    expect(result.stdout).not.toContain('skill-x')
    expect(result.stdout).not.toContain('skill-y')
    expect(result.stdout).toContain('skill-z')
  })
})
```

## Acceptance Criteria
1. `tag init` creates .tag/ directory with configuration
2. Team can be specified via `--team` flag or interactive selection
3. Project config persists team_id and pinned resources
4. Re-running init is safe (idempotent)
5. .gitignore suggestion/auto-add works correctly
6. Interactive wizard guides first-time users
7. Team scoping correctly filters visible resources
8. `tag sync` respects project-level team context

## Review Checklist
- [ ] Is .tag/state.json always excluded from git (even if .tag/ committed)?
- [ ] Does re-init merge new fields without overwriting user changes?
- [ ] Can users change team_id after init (and what happens to synced items)?
- [ ] Is the wizard skippable for CI/automation use cases?
- [ ] Does team selection validate user is actually a member?
- [ ] Are error messages helpful when team doesn't exist?

## Dependencies
- Depends on: Day 5 (CLI auth), Day 8-9 (sync patterns), Team membership API
- Blocks: Day 12 (onboarding uses init)

## Risk Factors
- **Config file conflicts** — Mitigation: Smart merging, backup on modify
- **Team membership changes** — Mitigation: Re-validate on sync, clear error on denied
- **Multi-repo scenarios** — Mitigation: Document monorepo vs single repo patterns
- **Wizard UX complexity** — Mitigation: Simple defaults, skip option
