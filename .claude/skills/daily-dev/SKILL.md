# Daily Development Workflow

Implements a day's work from the jira ticket plan. Reads the ticket, creates tasks, implements code, writes tests, runs tests, and marks completion. Use when user says "start day N", "continue day N", "work on day N", or "/daily-dev N".

---

## Quick Reference

```
/daily-dev 11        # Start Day 11
/daily-dev 11-13     # Start Days 11-13 (multi-day)
/daily-dev continue  # Resume current day's tasks
```

---

## Step 1 — Parse Day Number

Extract the day number(s) from the user request:
- Single day: `11` → Work on Day 11
- Range: `11-13` → Work on Days 11, 12, 13 sequentially
- "continue" → Check existing TaskList and resume

---

## Step 2 — Read Jira Ticket

Read the jira ticket file for context:

```
docs/jira/jira_day{NN}.md
```

Extract from the ticket:
- **Title** (TAG-NN: Description)
- **Objective** statement
- **Requirements** organized by category
- **Implementation Notes** (Backend/Frontend/CLI/Database layers)
- **Unit Tests** table with test files and assertions
- **Integration Tests** table with scenarios
- **Acceptance Criteria** for completion validation
- **Dependencies** (what this day depends on, what it blocks)

---

## Step 3 — Create Task List

Create tasks using TaskCreate based on ticket requirements:

```typescript
// Example task structure
{
  subject: "Implement [feature name]",
  description: "Full description from ticket requirements...",
  activeForm: "Implementing [feature name]"
}
```

**Task naming conventions:**
- Use imperative form: "Create", "Implement", "Add", "Write"
- Include the layer: "[CLI] Add rag command", "[API] Create embedding endpoint"
- Keep activeForm in present continuous: "Creating", "Implementing", "Adding"

**Standard task sequence for each day:**
1. Read existing code patterns (exploration)
2. Implement core features
3. Write unit tests
4. Run tests and fix failures
5. Update documentation/help text
6. Final verification

---

## Step 4 — Implementation Workflow

For each task, follow this workflow:

### 4.1 — Mark Task In Progress
```
TaskUpdate(taskId, status: "in_progress")
```

### 4.2 — Read Existing Patterns First
Before writing any code:
- Read 2-3 similar existing files for patterns
- Check imports, naming conventions, error handling
- Note test file structure if writing tests

### 4.3 — Implement Code
Follow these rules:
- **Prefer editing over creating** — Extend existing files when possible
- **No stubs** — Implement fully, no TODO comments
- **Match patterns** — Follow existing code conventions exactly
- **Build incrementally** — Run `pnpm build` after major changes

### 4.4 — Write Tests
For each implementation:
- **Unit tests** in `__tests__/*.test.ts` colocated with source
- **Smoke tests** in `scripts/smoke-*.ts` for end-to-end validation
- Test both happy path and error cases
- Mock external dependencies

### 4.5 — Run Tests
```bash
pnpm test                    # Run all tests
pnpm --filter @arkon/cli test  # Run specific package
pnpm --filter @arkon/api test  # Run API tests
```

### 4.6 — Mark Task Complete
```
TaskUpdate(taskId, status: "completed")
```

---

## Step 5 — Verification Checklist

Before marking day complete:

### Code Quality
- [ ] TypeScript compiles without errors (`pnpm build`)
- [ ] All tests pass (`pnpm test`)
- [ ] No console.log statements in production code
- [ ] Error messages are user-friendly

### Documentation
- [ ] Help text updated for new commands
- [ ] Package.json scripts added if needed
- [ ] CLAUDE.md updated if architecture changed

### Integration
- [ ] New features work with existing code
- [ ] No breaking changes to existing APIs
- [ ] Dependencies declared in package.json

---

## Step 6 — End of Week: Create Smoke Tests

At the end of each week (Days 6, 13, 20, 27, etc.), create smoke tests:

### API Smoke Tests
Location: `apps/api/scripts/smoke-week{N}.ts`

Structure:
```typescript
#!/usr/bin/env tsx
/**
 * Week N Smoke Test
 * Tests Days X-Y functionality
 */

// Test helpers: runTest(), apiCall()
// Test context: authToken, testIds
// Test groups organized by day
// Cleanup at end
// Summary with pass/fail counts
```

### CLI Smoke Tests
Location: `packages/cli/scripts/smoke-week{N}.ts`

Structure:
```typescript
#!/usr/bin/env tsx
/**
 * CLI Week N Smoke Test
 */

// Test helpers: runCli(), assertContains()
// Test CLI commands work (--help, auth handling)
// Test dry-run modes for destructive operations
// No API required for help/syntax tests
```

### Add npm Scripts
```json
{
  "smoke:weekN": "tsx scripts/smoke-weekN.ts",
  "smoke": "tsx scripts/smoke-week1.ts && tsx scripts/smoke-weekN.ts"
}
```

---

## Step 7 — Day Completion

After all tasks complete:

1. **Run full test suite:**
   ```bash
   pnpm test
   ```

2. **Run smoke tests (if end of week):**
   ```bash
   pnpm --filter @arkon/api smoke:weekN
   pnpm --filter @arkon/cli smoke:weekN
   ```

3. **Update task status:**
   ```
   TaskUpdate(taskId, status: "completed")
   ```

4. **Report completion:**
   ```
   Day N complete:
   - [list of features implemented]
   - [test counts]
   - [any notes for next day]
   ```

---

## Multi-Day Workflow

When working on multiple days (e.g., "start day 11-13"):

1. Create tasks for ALL days upfront
2. Mark dependencies between days
3. Work sequentially: complete Day 11 before Day 12
4. At end of range, run combined smoke tests

---

## Common Patterns

### Adding a New CLI Command

1. Create command file: `packages/cli/src/commands/{name}.ts`
2. Export `create{Name}Command()` function
3. Register in `packages/cli/src/index.ts`
4. Add help examples to index.ts
5. Write tests in `packages/cli/src/__tests__/{name}.test.ts`
6. Build and verify: `pnpm build && node dist/index.js {name} --help`

### Adding a New API Endpoint

1. Create route file: `apps/api/src/routes/{name}.ts`
2. Export router with CRUD operations
3. Register in `apps/api/src/index.ts`
4. Create service if complex logic: `apps/api/src/services/{name}.ts`
5. Write tests in `apps/api/src/routes/{name}.test.ts`
6. Add to smoke tests if critical path

### Adding a New Library

1. Create lib file: `packages/cli/src/lib/{name}.ts` or `apps/api/src/lib/{name}/`
2. Export types and functions
3. Write tests colocated: `__tests__/{name}.test.ts`
4. Import in commands/routes as needed

---

## Error Recovery

### Tests Failing
1. Read the error message carefully
2. Check if test expectations match implementation
3. Fix implementation OR fix test (don't do both at once)
4. Re-run single test file first: `pnpm test -- {file}`

### Build Failing
1. Run `pnpm build` to see TypeScript errors
2. Fix one error at a time
3. Check imports are correct (ESM: add `.js` extension)
4. Verify dependencies in package.json

### Context Lost
1. Run `TaskList` to see current tasks
2. Read the jira ticket again: `docs/jira/jira_day{NN}.md`
3. Check git status for uncommitted work
4. Resume from last completed task

---

## File Locations Reference

| Type | Location |
|------|----------|
| Jira tickets | `docs/jira/jira_day{NN}.md` |
| CLI commands | `packages/cli/src/commands/` |
| CLI libs | `packages/cli/src/lib/` |
| CLI tests | `packages/cli/src/__tests__/` |
| CLI smoke | `packages/cli/scripts/smoke-*.ts` |
| API routes | `apps/api/src/routes/` |
| API services | `apps/api/src/services/` |
| API libs | `apps/api/src/lib/` |
| API tests | `apps/api/src/**/*.test.ts` |
| API smoke | `apps/api/scripts/smoke-*.ts` |
| Database | `packages/database/prisma/schema.prisma` |

---

## Rules

1. **Always read the jira ticket first** — Contains requirements, tests, acceptance criteria
2. **Create tasks before coding** — Track progress, enable resume
3. **Read existing code before writing** — Match patterns exactly
4. **Test as you go** — Write tests immediately after implementation
5. **Run tests before marking complete** — All tests must pass
6. **End of week = smoke tests** — Create comprehensive smoke tests
7. **Update activeForm** — Keep user informed of current work
8. **No half-done tasks** — Either complete fully or note what's missing
