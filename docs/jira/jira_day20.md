# TAG-20: Buffer + Week 3 Retro

## Description

**Suggested Points:** 3 (Low — consolidation day for Week 3, fixing partials, and critical self-evaluation; scope depends on Week 3 progress)

## Objective

Address incomplete work from Week 3, fix any discovered issues, conduct the "would I use this?" evaluation, and prepare for Week 4's user onboarding focus.

## Requirements

### Fix Partials
- Complete TODO items from Days 15-19
- Fix failing tests from smoke testing
- Resolve any TypeScript errors
- Address code review feedback

### Week 3 Smoke Test
- Run all Admin UI flows
- Verify event collection pipeline
- Check dashboard accuracy
- Test mobile responsiveness

### "Would I Use This?" Check
- Self-evaluation questions:
  1. Would I trust this with my team's data?
  2. Is the Admin UI intuitive enough?
  3. Are error messages helpful?
  4. Would I recommend this to a colleague?
- Document honest answers
- Create improvement backlog

### Polish Items
- UI consistency review
- Loading state polish
- Error boundary implementation
- Accessibility audit (basic)
- Performance profiling

### Week 4 Preparation
- User onboarding plan
- Observation protocol
- Friction capture template
- tag doctor command design

## Implementation Notes
- Backend: Bug fixes and optimizations
- Frontend: Polish and accessibility
- CLI: Prepare doctor command scaffold
- Database: Query optimization if needed

## Unit Tests

### Required Unit Tests
| Test File | Test Case | Assertion |
|-----------|-----------|-----------|
| All Week 3 tests | `no skipped tests` | No it.skip |
| All Week 3 tests | `no TODO assertions` | No placeholders |
| `apps/web/src/__tests__/a11y.test.ts` | `admin pages pass axe` | No critical violations |
| `apps/web/src/__tests__/error-boundary.test.ts` | `errors caught gracefully` | Fallback UI shown |

### Test Coverage Requirements
- Maintain coverage from Week 3
- Add tests for any bug fixes
- Accessibility tests passing

## Integration Tests

### Required Integration Tests
| Test Scenario | Setup | Steps | Expected Result |
|---------------|-------|-------|-----------------|
| `admin UI full flow` | Valid admin | 1. Teams 2. Skills 3. MCP 4. Dashboard | All work |
| `event pipeline` | events_enabled=true | 1. Use CLI 2. Check dashboard | Events appear |
| `mobile admin` | Mobile viewport | 1. Navigate admin | Usable UI |
| `error recovery` | Force error | 1. Trigger error 2. Check UI | Error boundary shown |

### End-to-End Flows
- Full admin workflow
- Event collection to dashboard
- Mobile user journey

## "Would I Use This?" Evaluation

```markdown
## Week 3 Self-Evaluation

### Trust & Security
1. Would I trust this with my team's data?
   - [ ] Yes, without reservation
   - [ ] Yes, with some concerns: ________________
   - [ ] No, because: ________________

2. Does the RBAC feel robust?
   - [ ] Yes, I can't see how to bypass it
   - [ ] Mostly, but ________________
   - [ ] No, I noticed ________________

3. Is the audit log comprehensive?
   - [ ] Yes, every action is tracked
   - [ ] Missing: ________________

### Usability
4. Is the Admin UI intuitive?
   - [ ] Yes, I could explain it in 2 minutes
   - [ ] Somewhat, but ________________ is confusing
   - [ ] No, it needs ________________

5. Are error messages helpful?
   - [ ] Yes, I know what to do from the error
   - [ ] Sometimes, ________________ was unclear
   - [ ] No, most are confusing

6. Is mobile usable for quick tasks?
   - [ ] Yes, I could do admin tasks on my phone
   - [ ] Basic tasks only
   - [ ] No, needs ________________

### Recommendation
7. Would I recommend this to a colleague?
   - [ ] Yes, enthusiastically
   - [ ] Yes, with caveats: ________________
   - [ ] Not yet, because: ________________

### Top 3 Improvements Needed
1. ________________
2. ________________
3. ________________

### What's Working Well
1. ________________
2. ________________
3. ________________
```

## Week 3 Completion Checklist

```markdown
## Week 3 Completion Checklist

### Day 15: Admin UI Foundation
- [ ] Auth gate working
- [ ] Teams CRUD complete
- [ ] Members management working
- [ ] Form validation proper
- [ ] Audit log viewer functional

### Day 16: Skills + MCP UI
- [ ] Skills CRUD complete
- [ ] MCP CRUD complete
- [ ] Toggle propagation working
- [ ] Bundle upload working
- [ ] Version management working

### Day 17: Event Logging
- [ ] **NO user_id in schema (verified)**
- [ ] **events_enabled defaults false (verified)**
- [ ] Events stored when enabled
- [ ] Events discarded when disabled
- [ ] Privacy tests passing

### Day 18: Hook Integration
- [ ] Hooks installable
- [ ] Non-blocking (<1ms)
- [ ] Buffer management working
- [ ] Opt-out persistence working
- [ ] Network failures handled

### Day 19: Dashboard
- [ ] Time-series chart working
- [ ] Breakdown chart working
- [ ] Top resources working
- [ ] **No user data leak (verified)**
- [ ] Empty states implemented
- [ ] Mobile responsive

### Polish
- [ ] Loading states consistent
- [ ] Error boundaries implemented
- [ ] Basic accessibility passing
- [ ] No console errors
- [ ] No TypeScript errors
```

## Acceptance Criteria
1. All Week 3 TODO items resolved
2. Week 3 smoke test passes
3. "Would I use this?" evaluation completed honestly
4. Top improvements documented for backlog
5. No TypeScript errors
6. Basic accessibility audit passing
7. Error boundaries implemented throughout
8. Week 4 user onboarding plan ready

## Review Checklist
- [ ] Was the self-evaluation honest?
- [ ] Are the improvement items actionable?
- [ ] Is the user onboarding plan realistic?
- [ ] Are there any security concerns from Week 3?
- [ ] Is the Admin UI ready for user feedback?
- [ ] Is the tag doctor command designed?

## Dependencies
- Depends on: Days 15-19 (Week 3 work)
- Blocks: Week 4 (user onboarding requires stable platform)

## Risk Factors
- **More bugs than buffer allows** — Mitigation: Prioritize user-facing issues
- **Self-evaluation bias** — Mitigation: Involve another person if possible
- **Week 4 prep incomplete** — Mitigation: Minimum viable plan only
- **Accessibility debt** — Mitigation: Document for future sprint
