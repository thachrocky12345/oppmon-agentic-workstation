# TAG-24: Async Onboarding + `tag doctor`

## Description

**Suggested Points:** 5 (Medium — diagnostic command architecture, health check system, self-healing suggestions, and async onboarding flow improvements)

## Objective

Implement the `tag doctor` diagnostic command for self-service troubleshooting, improve onboarding to support asynchronous/self-paced completion, and add health checks that help users resolve issues independently.

## Requirements

### `tag doctor` Command
- `tag doctor` — Run full diagnostic check
- `tag doctor --fix` — Attempt automatic fixes for detected issues
- `tag doctor auth` — Check authentication only
- `tag doctor network` — Check connectivity only
- `tag doctor claude` — Check Claude Code integration only

### Diagnostic Checks
1. **Authentication**
   - Token exists and not expired
   - Token can reach API
   - User has valid tenant/team membership

2. **Network**
   - API endpoint reachable
   - Response time acceptable (<2s)
   - SSL/TLS validation

3. **CLI Installation**
   - Correct version installed
   - PATH configured correctly
   - Required dependencies present

4. **Claude Code Integration**
   - Claude Code detected
   - Hooks installed (if applicable)
   - Skills directory accessible
   - .mcp.json valid

5. **Sync State**
   - state.json valid
   - Local skills match expected
   - No orphaned files

### Output Format
```
tag doctor

✅ Authentication
   Token valid, expires in 23 hours

✅ Network
   API reachable (145ms)

⚠️  Claude Code Integration
   Hooks not installed
   → Run `tag hooks install` to fix

❌ Sync State
   state.json corrupted
   → Run `tag doctor --fix` to repair

Summary: 2 passed, 1 warning, 1 error
```

### Auto-Fix Capabilities
- `--fix` attempts safe automatic repairs
- Only fixes that cannot lose data
- Examples:
  - Regenerate corrupted state.json
  - Reinstall hooks
  - Clear expired tokens
  - Fix file permissions

### Async Onboarding Improvements
- Each step can be completed independently
- Clear "next step" guidance after each command
- Resume from any point (no required sequence)
- Timeout recovery for OAuth
- Background sync option

## Implementation Notes
- Backend: Health check endpoints (/api/health)
- Frontend: N/A
- CLI: New doctor command with modular checks
- Database: N/A

## Unit Tests

### Required Unit Tests
| Test File | Test Case | Assertion |
|-----------|-----------|-----------|
| `packages/cli/src/__tests__/doctor.test.ts` | `auth check detects valid token` | ✅ shown |
| `packages/cli/src/__tests__/doctor.test.ts` | `auth check detects expired token` | ❌ shown with suggestion |
| `packages/cli/src/__tests__/doctor.test.ts` | `network check detects API` | ✅ shown with latency |
| `packages/cli/src/__tests__/doctor.test.ts` | `network check detects failure` | ❌ shown with suggestion |
| `packages/cli/src/__tests__/doctor.test.ts` | `claude check detects installation` | Status correctly reported |
| `packages/cli/src/__tests__/doctor.test.ts` | `sync check detects corruption` | ❌ shown |
| `packages/cli/src/__tests__/doctor.test.ts` | `--fix repairs state.json` | File repaired |
| `packages/cli/src/__tests__/doctor.test.ts` | `--fix reinstalls hooks` | Hooks present after |
| `packages/cli/src/__tests__/doctor.test.ts` | `summary counts correct` | Pass/warn/error counts |

### Test Coverage Requirements
- 100% coverage on diagnostic checks
- All auto-fix scenarios tested
- Error reporting verified

## Integration Tests

### Required Integration Tests
| Test Scenario | Setup | Steps | Expected Result |
|---------------|-------|-------|-----------------|
| `full doctor healthy` | Everything configured | 1. tag doctor | All green |
| `doctor detects expired auth` | Expired token | 1. tag doctor auth | Auth error reported |
| `doctor detects network issue` | API unreachable | 1. tag doctor network | Network error |
| `doctor fix state.json` | Corrupted state | 1. tag doctor --fix | State repaired |
| `async onboarding resume` | Partial onboarding | 1. Complete remaining steps | Success |
| `onboarding step independence` | Fresh install | 1. Run steps out of order | Each step works |

### End-to-End Flows
- User has issue → Run tag doctor → See problem → Run tag doctor --fix → Problem resolved
- Partial onboarding → tag doctor → See what's missing → Complete those steps

## Doctor Command Implementation

```typescript
// packages/cli/src/commands/doctor.ts

interface CheckResult {
  name: string
  status: 'pass' | 'warn' | 'fail'
  message: string
  suggestion?: string
  fixable?: boolean
  fix?: () => Promise<void>
}

const checks: Record<string, () => Promise<CheckResult>> = {
  auth: async () => {
    const token = await getStoredToken()
    if (!token) {
      return {
        name: 'Authentication',
        status: 'fail',
        message: 'No authentication token found',
        suggestion: 'Run `tag login` to authenticate',
        fixable: false,
      }
    }

    const claims = decodeToken(token)
    if (claims.exp < Date.now() / 1000) {
      return {
        name: 'Authentication',
        status: 'fail',
        message: 'Token expired',
        suggestion: 'Run `tag login` to re-authenticate',
        fixable: false,
      }
    }

    const expiresIn = formatRelativeTime(claims.exp * 1000)
    return {
      name: 'Authentication',
      status: 'pass',
      message: `Token valid, expires ${expiresIn}`,
    }
  },

  network: async () => {
    const start = Date.now()
    try {
      await fetch(`${API_URL}/health`, { timeout: 5000 })
      const latency = Date.now() - start
      return {
        name: 'Network',
        status: latency > 2000 ? 'warn' : 'pass',
        message: `API reachable (${latency}ms)`,
        suggestion: latency > 2000 ? 'Network seems slow' : undefined,
      }
    } catch (error) {
      return {
        name: 'Network',
        status: 'fail',
        message: `Cannot reach API: ${error.message}`,
        suggestion: 'Check your network connection and API_URL setting',
      }
    }
  },

  claude: async () => {
    const claudeDir = join(homedir(), '.claude')
    if (!existsSync(claudeDir)) {
      return {
        name: 'Claude Code',
        status: 'fail',
        message: 'Claude Code not detected',
        suggestion: 'Install Claude Code to use skills',
      }
    }

    const hooksInstalled = await checkHooksInstalled()
    if (!hooksInstalled) {
      return {
        name: 'Claude Code',
        status: 'warn',
        message: 'Hooks not installed',
        suggestion: 'Run `tag hooks install` to enable usage tracking',
        fixable: true,
        fix: installHooks,
      }
    }

    return {
      name: 'Claude Code',
      status: 'pass',
      message: 'Claude Code configured correctly',
    }
  },

  sync: async () => {
    const stateFile = join(homedir(), '.tag', 'state.json')
    if (!existsSync(stateFile)) {
      return {
        name: 'Sync State',
        status: 'warn',
        message: 'No sync state (first sync not run)',
        suggestion: 'Run `tag sync` to sync skills',
      }
    }

    try {
      JSON.parse(readFileSync(stateFile, 'utf-8'))
      return {
        name: 'Sync State',
        status: 'pass',
        message: 'Sync state valid',
      }
    } catch {
      return {
        name: 'Sync State',
        status: 'fail',
        message: 'Sync state corrupted',
        suggestion: 'Run `tag doctor --fix` to repair',
        fixable: true,
        fix: repairStateFile,
      }
    }
  },
}
```

## Acceptance Criteria
1. `tag doctor` runs all diagnostic checks
2. Clear visual output (✅/⚠️/❌) for each check
3. Helpful suggestions for failures
4. `--fix` repairs fixable issues
5. Individual check commands work (auth, network, etc.)
6. Onboarding steps are independent
7. "Next step" guidance after each command
8. All diagnostic tests passing

## Review Checklist
- [ ] Does --fix only attempt safe repairs?
- [ ] Are suggestions actionable (not just "something is wrong")?
- [ ] Does doctor work offline (network check fails gracefully)?
- [ ] Is the output readable in terminals without color?
- [ ] Can each check be run independently?
- [ ] Is the summary accurate?

## Dependencies
- Depends on: Day 23 (critical friction fixed)
- Blocks: Day 25 (polish uses doctor for verification)

## Risk Factors
- **Over-aggressive auto-fix** — Mitigation: Only safe, reversible fixes
- **Diagnostic scope creep** — Mitigation: Focus on onboarding-related checks
- **Inconsistent output** — Mitigation: Shared output formatting
- **Slow diagnostics** — Mitigation: Parallel checks where possible
