# TAG-25: Fix Annoying Friction + Polish

## Description

**Suggested Points:** 5 (Medium — addressing Major friction from Day 22, error message audit, README freshness check, and general polish items)

## Objective

Address Major (annoying but not blocking) friction points from Day 22 observations, conduct systematic error message audit, ensure README accuracy, and implement final polish items before stability pass.

## Requirements

### Major Friction Fixes
- Review Day 22 friction logs for Major items
- Prioritize by user impact
- Implement fixes with tests
- Focus on user experience improvements

### Error Message Audit
- Catalog all error messages in codebase
- Evaluate each for:
  - Clarity: Does user understand what went wrong?
  - Actionability: Does user know what to do?
  - Tone: Is it helpful, not blaming?
- Improve messages that fail evaluation
- Standardize error format

### README Freshness Check
- Walk through README.md as new user
- Verify all commands work exactly as documented
- Update any outdated instructions
- Add missing common scenarios
- Verify links work

### Polish Items
- Loading states refined
- Animation timing tuned
- Console output consistent
- Progress indicators smooth
- Confirmation messages clear
- Help text comprehensive

### Minor Friction (Time Permitting)
- Address Minor items from Day 22 if time allows
- Quick wins only (< 30 min each)
- Document deferred items

## Implementation Notes
- Backend: Error response improvements
- Frontend: UX polish
- CLI: Output formatting, error messages
- Database: N/A

## Unit Tests

### Required Unit Tests
| Test File | Test Case | Assertion |
|-----------|-----------|-----------|
| Various | `[major friction] fixed` | Issue resolved |
| `apps/api/src/__tests__/errors.test.ts` | `error format consistent` | Standard structure |
| `apps/api/src/__tests__/errors.test.ts` | `errors include action` | Suggestion present |
| `packages/cli/src/__tests__/output.test.ts` | `success messages consistent` | Standard format |
| `packages/cli/src/__tests__/output.test.ts` | `error messages helpful` | Action suggested |

### Test Coverage Requirements
- All major friction fixes tested
- Error message format validated
- Output consistency verified

## Integration Tests

### Required Integration Tests
| Test Scenario | Setup | Steps | Expected Result |
|---------------|-------|-------|-----------------|
| `major friction fixes verified` | Various | 1. Reproduce scenarios | All improved |
| `README walkthrough` | Fresh environment | 1. Follow README | All steps work |
| `error recovery` | Various error states | 1. Trigger errors | Clear guidance |

### End-to-End Flows
- Complete README walkthrough
- Error → Recovery → Success for common scenarios

## Error Message Audit Template

```markdown
# Error Message Audit

## Format Standard

### Good Error Message
```
Error: Cannot sync skills

The server returned an authentication error (401).

To fix this:
1. Run `tag login` to re-authenticate
2. Then retry `tag sync`

If this persists, check if your account has access to this team.
```

### Bad Error Message
```
Error: 401 Unauthorized
```

## Audit Results

### CLI Errors

| Location | Current Message | Issues | Improved Message |
|----------|-----------------|--------|------------------|
| `sync.ts:45` | "Network error" | Vague, no action | "Network error: Cannot reach server at {url}. Check your connection and try again." |
| `login.ts:78` | "Token invalid" | No action | "Your session has expired. Run `tag login` to continue." |

### API Errors

| Endpoint | Current Message | Issues | Improved Message |
|----------|-----------------|--------|------------------|
| `POST /skills` | `{"error": "forbidden"}` | No context | `{"error": "forbidden", "message": "You don't have permission to create skills", "suggestion": "Contact your team admin for access"}` |

### UI Errors

| Component | Current Message | Issues | Improved Message |
|-----------|-----------------|--------|------------------|
| `SkillForm` | "Save failed" | Vague | "Could not save skill: {reason}. Your changes are preserved - try again." |
```

## README Verification Checklist

```markdown
# README Verification

## Prerequisites Section
- [ ] Node.js version accurate
- [ ] npm/pnpm/yarn instructions work
- [ ] OS requirements listed

## Quick Start
- [ ] `npm install -g @tag/cli` works
- [ ] `tag login` instructions accurate
- [ ] `tag init` instructions accurate
- [ ] `tag sync` instructions accurate
- [ ] First skill usage works

## Commands Reference
- [ ] All commands listed
- [ ] All flags documented
- [ ] Examples work as written

## Troubleshooting
- [ ] Common errors covered
- [ ] Solutions accurate
- [ ] Links work

## Links
- [ ] No broken links
- [ ] All external links valid
- [ ] Internal links work
```

## Acceptance Criteria
1. All Major friction from Day 22 addressed
2. Error message audit completed
3. All audited errors improved
4. README verified end-to-end
5. README commands work exactly as documented
6. Polish items completed
7. Output formatting consistent
8. All tests passing

## Review Checklist
- [ ] Are error messages helpful without being verbose?
- [ ] Does README match actual behavior?
- [ ] Are polish changes consistent across the product?
- [ ] Were any major friction items deferred?
- [ ] Is the tone of messages appropriate?
- [ ] Do loading states feel responsive?

## Dependencies
- Depends on: Day 22 (friction observations), Day 23 (critical fixes), Day 24 (doctor command)
- Blocks: Day 26 (stability pass needs polish complete)

## Risk Factors
- **Too many Major items** — Mitigation: Prioritize highest impact
- **README divergence** — Mitigation: Generate docs from code where possible
- **Polish scope creep** — Mitigation: Time-box polish items
- **Inconsistent changes** — Mitigation: Review all changes together
