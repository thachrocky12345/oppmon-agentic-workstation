# Daily Development Checklist

Quick reference checklist for daily development workflow.

---

## Before Starting

- [ ] Read jira ticket: `docs/jira/jira_day{NN}.md`
- [ ] Check dependencies: What days must be complete first?
- [ ] Check blockers: What does this day block?
- [ ] Create task list with TaskCreate

---

## During Development

### For Each Feature

- [ ] Read 2-3 existing files for patterns
- [ ] Implement the feature
- [ ] Write unit tests
- [ ] Run tests: `pnpm test`
- [ ] Build check: `pnpm build`
- [ ] Update TaskUpdate status

### Code Quality

- [ ] No `console.log` in production code
- [ ] Error messages are user-friendly
- [ ] TypeScript strict mode passes
- [ ] ESM imports include `.js` extension

---

## After Implementation

### Testing

```bash
# Run all tests
pnpm test

# Run specific package
pnpm --filter @arkon/cli test
pnpm --filter @arkon/api test

# Run single test file
pnpm test -- {filename}
```

### Build Verification

```bash
# TypeScript compile check
pnpm build

# CLI help verification
node packages/cli/dist/index.js --help
node packages/cli/dist/index.js {command} --help
```

---

## End of Week Checklist

### Smoke Tests

- [ ] Create `apps/api/scripts/smoke-week{N}.ts`
- [ ] Create `packages/cli/scripts/smoke-week{N}.ts`
- [ ] Add npm scripts to package.json
- [ ] Run smoke tests and verify all pass

### Documentation

- [ ] Update help text in CLI
- [ ] Verify examples work
- [ ] Check CLAUDE.md for updates needed

---

## Test Counts Tracker

| Package | Day Start | Day End | Delta |
|---------|-----------|---------|-------|
| CLI | | | |
| API | | | |
| Total | | | |

---

## Common Commands

```bash
# Development
pnpm dev                          # Start dev server
pnpm build                        # Build all packages
pnpm test                         # Run all tests
pnpm typecheck                    # TypeScript check only

# Package-specific
pnpm --filter @arkon/cli build    # Build CLI only
pnpm --filter @arkon/api test     # Test API only

# Docker
docker compose up -d db           # Start database
docker compose --profile dev up   # Start all dev services

# Smoke tests
pnpm --filter @arkon/api smoke:week1
pnpm --filter @arkon/api smoke:week2
pnpm --filter @arkon/cli smoke:week2
```

---

## Troubleshooting

### Tests Failing

1. Run single test: `pnpm test -- {file.test.ts}`
2. Check if expectations match implementation
3. Fix one thing at a time

### Build Failing

1. Check TypeScript errors: `pnpm build`
2. Verify ESM imports have `.js` extension
3. Check package.json dependencies

### Command Not Found

1. Rebuild: `pnpm build`
2. Check command registered in index.ts
3. Verify export in command file

### Auth Required Error

1. Check isAuthenticated() is called
2. Verify token is passed to API calls
3. Test with TAG_TOKEN env var
