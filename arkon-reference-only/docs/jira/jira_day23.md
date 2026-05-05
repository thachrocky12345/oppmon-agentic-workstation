# TAG-23: Fix Critical Friction

## Description

**Suggested Points:** 5 (Medium — targeted fixes for critical friction points identified in Day 22; scope depends on observation findings but capped to critical issues only)

## Objective

Address all critical (blocking) friction points identified during Day 22 onboarding observations, implementing fixes with corresponding regression tests to prevent reintroduction of these issues.

## Requirements

### Critical Friction Analysis
- Review Day 22 friction logs
- Identify all Critical severity items
- Prioritize by frequency (multiple users hit same issue)
- Create fix plan for each

### Fix Categories (Expected)
Based on common patterns, likely fixes include:
- Error message improvements
- Missing feedback/confirmation
- Unclear next steps
- Failed recovery paths
- Installation issues
- Authentication edge cases

### Regression Tests
- Every fix MUST have accompanying test
- Test reproduces the original friction scenario
- Test verifies the fix works
- Test guards against regression

### Fix Documentation
- Update quickstart guide if steps changed
- Update troubleshooting guide with new issues
- Add FAQ entries for common confusions
- Update error message documentation

### Fix Validation
- Replay friction scenario manually
- Verify user can complete task
- Measure time to completion (should decrease)
- Document before/after

## Implementation Notes
- Backend: Error handling improvements, validation messages
- Frontend: UX improvements, feedback additions
- CLI: Error messages, help text, recovery options
- Database: N/A likely

## Unit Tests

### Required Unit Tests
| Test File | Test Case | Assertion |
|-----------|-----------|-----------|
| Varies by fix | `[friction scenario] now works` | Issue resolved |
| Varies by fix | `[error case] shows helpful message` | Clear message |
| Varies by fix | `[recovery case] succeeds` | User can recover |

### Test Coverage Requirements
- 100% coverage on fixed code paths
- All critical friction scenarios have regression tests
- Tests named to reflect user scenario

## Integration Tests

### Required Integration Tests
| Test Scenario | Setup | Steps | Expected Result |
|---------------|-------|-------|-----------------|
| `[friction 1] reproduced and fixed` | Original scenario | 1. Follow original steps | No longer blocked |
| `[friction 2] reproduced and fixed` | Original scenario | 1. Follow original steps | No longer blocked |
| `[friction N] reproduced and fixed` | Original scenario | 1. Follow original steps | No longer blocked |

### End-to-End Flows
- Full onboarding flow with fixes applied
- Verify <5 minute completion maintained

## Fix Planning Template

```markdown
# Critical Friction Fix Plan

## Friction: [Brief description]

### From Observation
- Session(s): [P1, P3, P5]
- Checkpoint: [e.g., tag login]
- Verbalization: "[What user said]"
- Impact: [What happened - blocked, gave up, etc.]

### Root Cause Analysis
- What happened: [Technical description]
- Why it happened: [Code path, missing check, etc.]
- Why it wasn't caught: [Testing gap, edge case, etc.]

### Fix Plan
- File(s) to change: [paths]
- Change description: [What to do]
- Risk assessment: [Low/Medium/High]

### Test Plan
- Unit test: `test/path/file.test.ts`
  - Scenario: [describe]
  - Assertion: [what to check]
- Integration test: `test/path/integration.test.ts`
  - Scenario: [describe]
  - Assertion: [what to check]

### Validation
- [ ] Manual reproduction of original issue
- [ ] Fix implemented
- [ ] Unit test written and passing
- [ ] Integration test written and passing
- [ ] Manual verification fix works
- [ ] Documentation updated if needed

### Before/After
- Before: [Time to complete / Outcome]
- After: [Time to complete / Outcome]
```

## Regression Test Pattern

```typescript
// Example regression test for friction point

describe('Onboarding Regression: tag login OAuth timeout', () => {
  // This test exists because:
  // - Users P1, P3, P5 experienced OAuth timeout with no recovery message
  // - Root cause: 5 minute timeout with silent failure
  // - Fix: Clear timeout message with retry instructions

  it('shows clear message when OAuth times out', async () => {
    // Arrange: Mock OAuth server to never respond
    mockOAuthServer.setDelay(Infinity)

    // Act: Attempt login (will timeout)
    const result = await runCLI(['login'], { timeout: 35000 }) // Wait past 30s internal timeout

    // Assert: Clear error message shown
    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain('OAuth timed out after 30 seconds')
    expect(result.stderr).toContain('Please try again')
    expect(result.stderr).toContain('If this persists, check your network connection')
  })

  it('user can retry after timeout', async () => {
    // First attempt times out
    mockOAuthServer.setDelay(Infinity)
    await runCLI(['login'], { timeout: 35000 })

    // Second attempt succeeds
    mockOAuthServer.setDelay(0)
    const result = await runCLI(['login'])

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('Successfully logged in')
  })
})
```

## Acceptance Criteria
1. All Critical friction points from Day 22 addressed
2. Each fix has corresponding regression test
3. Regression tests reproduce original scenario
4. Manual verification confirms fixes work
5. Documentation updated where relevant
6. Onboarding time still under 5 minutes
7. No new Critical issues introduced
8. All tests passing

## Review Checklist
- [ ] Are all Critical (not just Major/Minor) items addressed?
- [ ] Does each fix have a regression test?
- [ ] Do the tests actually reproduce the original friction?
- [ ] Were the fixes validated with manual testing?
- [ ] Is documentation updated?
- [ ] Could the fixes introduce new issues?

## Dependencies
- Depends on: Day 22 (friction observations)
- Blocks: Day 24 (builds on stable onboarding)

## Risk Factors
- **Too many critical items** — Mitigation: Prioritize most frequent, defer rare cases
- **Fixes break other things** — Mitigation: Comprehensive testing, careful changes
- **Scope creep to Major items** — Mitigation: Strict Critical-only today
- **Insufficient reproduction info** — Mitigation: May need follow-up observation
