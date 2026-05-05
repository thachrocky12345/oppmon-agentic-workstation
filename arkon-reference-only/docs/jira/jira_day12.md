# TAG-12: E2E Smoke + Onboarding

## Description

**Suggested Points:** 3 (Low — integration testing and onboarding flow validation; primary risk is discovering blocking issues that require more than buffer time)

## Objective

Create comprehensive end-to-end smoke tests covering the full user journey, validate that new user onboarding completes in under 5 minutes, and document the critical path for first-time users.

## Requirements

### Full Loop Smoke Test
- Automated script testing entire Week 1+2 functionality
- `npm run smoke:full` or `tag doctor --full`
- Tests complete user journey from login to productive use
- Clear output showing pass/fail for each component

### Smoke Test Scenarios
1. **Authentication Loop**: Login → Status → Logout → Re-login
2. **Skills Loop**: Sync → Use skill in Claude Code → Verify output
3. **MCP Loop**: Sync MCP → Verify .mcp.json → Claude Code detects server
4. **RAG Loop**: Ingest docs → Search → Verify results
5. **Project Loop**: Init → Configure team → Sync → Verify scoping

### Onboarding Time Target: <5 minutes
- Measure: Fresh user from signup to first successful Claude Code enhancement
- Track individual steps:
  - Signup/login: target <30s
  - CLI install: target <60s
  - `tag login`: target <30s
  - `tag init`: target <60s
  - `tag sync`: target <60s
  - First Claude Code usage: target <60s

### Onboarding Flow Documentation
- Step-by-step quickstart guide
- Video script (for future recording)
- Troubleshooting for common issues
- "What to do next" guidance

### Friction Points Capture
- Log each step with timing
- Identify steps taking longer than target
- Note any errors or confusion points
- Capture for Day 13 and Week 4 improvements

## Implementation Notes
- Backend: Uses all existing APIs
- Frontend: N/A (Admin UI not yet built)
- CLI: Integration point for testing
- Database: Fresh test tenant for each run

## Unit Tests

### Required Unit Tests
| Test File | Test Case | Assertion |
|-----------|-----------|-----------|
| `scripts/__tests__/smoke-full.test.ts` | `all scenarios pass` | Exit code 0 |
| `scripts/__tests__/smoke-full.test.ts` | `failure details reported` | Failed step clearly identified |
| `scripts/__tests__/timing.test.ts` | `onboarding under 5 min` | Total time < 300s |
| `scripts/__tests__/timing.test.ts` | `individual steps under target` | Each step within threshold |

### Test Coverage Requirements
- All smoke scenarios automated
- Timing captured for onboarding steps
- Error paths documented (what happens when X fails)

## Integration Tests

### Required Integration Tests
| Test Scenario | Setup | Steps | Expected Result |
|---------------|-------|-------|-----------------|
| `full auth flow` | Fresh user | 1. Login 2. Status 3. Logout 4. Login | All succeed, tokens valid |
| `full skills flow` | Synced skills | 1. Start Claude Code 2. Invoke skill | Skill executes correctly |
| `full MCP flow` | Synced MCP | 1. Check .mcp.json 2. Claude Code lists MCP | Server available |
| `full RAG flow` | Ingested docs | 1. Search via Claude Code | Results returned |
| `full project flow` | Project initialized | 1. Sync 2. Verify scoping | Only project-scope resources |
| `onboarding <5 min` | New user | 1. Complete quickstart | Total time under 5 min |

### End-to-End Flows

```typescript
// scripts/smoke-full.ts

async function fullSmokeTest() {
  const results: TestResult[] = []
  const startTime = Date.now()

  console.log('=== Full E2E Smoke Test ===\n')

  // 1. Auth Flow
  console.log('1. Testing Authentication Flow...')
  results.push(await testLogin())
  results.push(await testStatus())
  results.push(await testLogout())
  results.push(await testRelogin())

  // 2. Skills Flow
  console.log('\n2. Testing Skills Flow...')
  results.push(await testSkillsSync())
  results.push(await testSkillsInClaudeCode())
  results.push(await testSkillExecution())

  // 3. MCP Flow
  console.log('\n3. Testing MCP Flow...')
  results.push(await testMCPSync())
  results.push(await testMCPJsonUpdated())
  results.push(await testMCPInClaudeCode())

  // 4. RAG Flow
  console.log('\n4. Testing RAG Flow...')
  results.push(await testRAGIngest())
  results.push(await testRAGSearch())
  results.push(await testRAGInClaudeCode())

  // 5. Project Flow
  console.log('\n5. Testing Project Flow...')
  results.push(await testProjectInit())
  results.push(await testProjectScoping())
  results.push(await testProjectSync())

  // Report
  const elapsed = Date.now() - startTime
  const passed = results.filter(r => r.passed).length
  const failed = results.filter(r => !r.passed).length

  console.log(`\n${'='.repeat(50)}`)
  console.log(`Full Smoke Test: ${passed}/${results.length} passed`)
  console.log(`Total time: ${(elapsed / 1000).toFixed(1)}s`)

  if (failed > 0) {
    console.log('\nFailures:')
    results.filter(r => !r.passed).forEach(r => {
      console.log(`  ❌ ${r.name}: ${r.error}`)
    })
    process.exit(1)
  }

  console.log('\n✅ All smoke tests passed!')
  process.exit(0)
}
```

## Onboarding Timer

```typescript
// scripts/onboarding-timer.ts

interface OnboardingStep {
  name: string
  targetSeconds: number
  command?: string
  manual?: boolean
}

const ONBOARDING_STEPS: OnboardingStep[] = [
  { name: 'Signup/Login', targetSeconds: 30, manual: true },
  { name: 'Install CLI', targetSeconds: 60, command: 'npm install -g @tag/cli' },
  { name: 'CLI Login', targetSeconds: 30, command: 'tag login' },
  { name: 'Project Init', targetSeconds: 60, command: 'tag init --yes' },
  { name: 'First Sync', targetSeconds: 60, command: 'tag sync' },
  { name: 'Claude Code Use', targetSeconds: 60, manual: true },
]

async function measureOnboarding() {
  let totalTime = 0
  const results: { step: string; actual: number; target: number; passed: boolean }[] = []

  for (const step of ONBOARDING_STEPS) {
    const start = Date.now()

    if (step.command) {
      await runCommand(step.command)
    } else {
      // Manual steps - wait for user confirmation
      await prompt(`Complete "${step.name}" and press Enter...`)
    }

    const elapsed = (Date.now() - start) / 1000
    totalTime += elapsed

    results.push({
      step: step.name,
      actual: elapsed,
      target: step.targetSeconds,
      passed: elapsed <= step.targetSeconds
    })
  }

  // Report
  console.log('\n=== Onboarding Timing Report ===\n')
  results.forEach(r => {
    const status = r.passed ? '✅' : '⚠️'
    console.log(`${status} ${r.step}: ${r.actual.toFixed(1)}s (target: ${r.target}s)`)
  })

  console.log(`\nTotal: ${totalTime.toFixed(1)}s (target: 300s)`)

  if (totalTime > 300) {
    console.log('\n⚠️ Onboarding exceeds 5 minute target!')
  } else {
    console.log('\n✅ Onboarding within target!')
  }
}
```

## Acceptance Criteria
1. Full smoke test script exists and passes
2. All five major flows (auth, skills, MCP, RAG, project) tested
3. Onboarding measurable with timing script
4. Onboarding completes in under 5 minutes
5. Quickstart documentation covers all steps
6. Friction points documented for improvement
7. Any blocking issues identified and logged

## Review Checklist
- [ ] Does the smoke test run in CI/CD?
- [ ] Are timing thresholds reasonable for real networks?
- [ ] Is the quickstart guide accurate and up-to-date?
- [ ] Are error messages during onboarding helpful?
- [ ] Can a non-developer complete the quickstart?
- [ ] Are browser/OS compatibility notes included?

## Dependencies
- Depends on: Days 1-11 (all previous functionality)
- Blocks: Day 22 (user onboarding validation)

## Risk Factors
- **Discovery of blocking bugs** — Mitigation: Day 13 buffer for critical fixes
- **Timing variance across machines** — Mitigation: Test on standard hardware, generous targets
- **Claude Code integration gaps** — Mitigation: Manual verification step included
- **Documentation drift** — Mitigation: Generate docs from actual commands
