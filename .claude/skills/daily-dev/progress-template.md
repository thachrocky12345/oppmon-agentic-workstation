# Day Progress Template

Use this template to track daily progress. Copy and update as you work.

---

## Day {N}: {Title}

**Jira Ticket:** `docs/jira/jira_day{NN}.md`
**Status:** 🔵 In Progress | ✅ Complete | ⏸️ Blocked

### Tasks

| # | Task | Status | Notes |
|---|------|--------|-------|
| 1 | Read existing patterns | ⬜ | |
| 2 | Implement [feature] | ⬜ | |
| 3 | Write unit tests | ⬜ | |
| 4 | Run tests | ⬜ | |
| 5 | Update docs/help | ⬜ | |

Status: ⬜ Pending | 🔄 In Progress | ✅ Done | ❌ Failed | ⏭️ Skipped

### Files Created/Modified

```
packages/cli/src/commands/{name}.ts       # Created
packages/cli/src/lib/{name}.ts            # Created
packages/cli/src/__tests__/{name}.test.ts # Created
packages/cli/src/index.ts                 # Modified
```

### Test Results

```
✓ {package} tests: {passed}/{total} passed
```

### Blockers/Issues

- None

### Next Steps

- [ ] Continue to Day {N+1}
- [ ] Create smoke tests (if end of week)

---

## Weekly Summary Template

### Week {N} Summary (Days {X}-{Y})

**Dates:** {start} - {end}
**Status:** ✅ Complete

### Completed

| Day | Feature | Tests |
|-----|---------|-------|
| {X} | {feature} | ✓ {count} |
| {Y} | {feature} | ✓ {count} |

### Test Results

```
API Tests:     {passed}/{total} passed
CLI Tests:     {passed}/{total} passed
Smoke Tests:   {passed}/{total} passed
```

### Files Created

| Package | Count | Key Files |
|---------|-------|-----------|
| CLI | {n} | commands/{x}.ts, lib/{y}.ts |
| API | {n} | routes/{x}.ts, services/{y}.ts |

### Smoke Tests Added

- `apps/api/scripts/smoke-week{N}.ts` - {count} tests
- `packages/cli/scripts/smoke-week{N}.ts` - {count} tests

### Notes for Next Week

- {any carry-over items}
- {technical debt noted}
- {patterns established}
