---
name: visual-pr-audit
description: Screenshot capture, visual diff, and code bug audit for frontend PRs. Spins up the feature branch in Docker, captures before/after Playwright screenshots, audits the diff for code bugs (slug mismatches, undeclared variables, test selector drift, viewport overflow), and implements all fixes. Use when asked to "visual audit", "screenshot audit", "audit and fix PR", or "capture and verify PR screenshots".
argument-hint: [branch-name] [jira-ticket-id]
---

# Visual PR Audit + Fix Skill

## Purpose

Automates the full visual verification loop for a frontend PR:

1. Capture baseline screenshots on `main`
2. Capture feature branch screenshots
3. Diff visually (describe what changed)
4. Audit the branch diff for bugs introduced during implementation
5. Fix all bugs found
6. Verify fixes pass build and tests

This is distinct from `audit-pipeline` (which audits a plan before implementation) — this skill audits **after** a PR is already open, from the live running app.

---

## Prerequisites

- Docker stack running (`docker compose up -d`)
- Playwright available in `RG-Frontend/node_modules/.bin/playwright`
- Both `main` and the feature branch exist locally
- `C:\Temp\screenshots\` writable

---

## Phase 1 — Baseline capture (main branch)

```
git stash (if dirty)
git checkout main
docker compose up -d --build frontend
Wait for HTTP 200 on localhost:3000
Run Playwright capture script (see Capture Script below)
Save: C:\Temp\screenshots\main-full-page.png
Save: C:\Temp\screenshots\main-<feature>-menu.png (or relevant UI area)
```

**Known gotchas:**
- `waitUntil: 'networkidle'` completes before Redux nav data loads — use `waitUntil: 'domcontentloaded'` + 8s `waitForTimeout` instead
- Nav category buttons are loaded from backend API asynchronously — always wait for them before clicking
- `headless: false` on Windows can show "Show collapsed frames" browser UI as a button — use `headless: true` for button enumeration
- If page body is empty after 8s, check for runtime JS errors via `page.on('pageerror', ...)` — look for `ReferenceError` from undeclared variables in hooks

---

## Phase 2 — Feature branch capture

```
git checkout <feature-branch>
Apply any known local fixes (see Bug Patterns below)
docker compose up -d --build frontend
Wait for HTTP 200 on localhost:3000
Run Playwright capture script with mode='feature'
Save: C:\Temp\screenshots\rgdev6-*.png
```

**Menu interaction gotchas:**
- Menus with `onMouseLeave={() => close()}` will close when Playwright moves the mouse — keep mouse inside the menu container between interactions
- After opening a menu, move mouse to the tablist bounding box immediately and hold it there between tab clicks
- For tabs that time out on `locator.click()`, use `page.evaluate(() => tab.click())` to bypass Playwright pointer events
- `locator.isVisible()` returning `true` then `locator.click()` timing out = element was detached between checks (menu closed)
- Horizontally scrolled tab bars: use `element.scrollIntoView()` inside `page.evaluate` before clicking

---

## Phase 3 — Code audit of the diff

Run this audit against `git diff main -- <changed-files>`. Check for each of these bug patterns:

### Bug Pattern 1: Slug / name string mismatch
The component conditionally renders based on `category.slug === "X"` or `category.name === "X"`. Cross-check the string literal against the actual DB fixture.

```bash
# Check DB value
docker exec <backend-container> python manage.py shell -c "
from apps.care_provider.models import NavigationCategory
for c in NavigationCategory.objects.all():
    print(f'id={c.id} name={c.name!r} slug={c.slug!r}')
"
# Check code
grep -n 'slug ===\|name ===' src/containers/landing-screen/sub-header/index.tsx
```

If code says `"therapists"` but DB has `slug="therapy"` → the new component NEVER renders.

### Bug Pattern 2: Undeclared variable in hook dependency array
Check all `useEffect`, `useMemo`, `useCallback` dependency arrays for variables that are referenced inside but not declared in scope. Common cause: destructuring a mutation/query result but omitting a field (`error`, `called`, etc.) that is used downstream.

```bash
grep -n 'useEffect\|useMemo\|useCallback' <file> | head -30
# For each dep array, verify every dep is declared in the component scope
```

If `error` is in `useEffect([error, ...])` but not in the `useMutation` destructuring → `ReferenceError` crashes the page.

### Bug Pattern 3: E2E test selector drift
After renaming or rewiring a component, the Playwright test selectors may look for text/roles that no longer match the live app.

```bash
# Check what the nav button ACTUALLY says
docker exec <backend-container> python manage.py shell -c "
from apps.care_provider.models import NavigationCategory
for c in NavigationCategory.objects.all(): print(c.name)
"
# Check what the e2e spec expects
grep -n 'getByRole\|getByText\|hasText\|name:' e2e/<spec>.spec.ts
```

If spec says `getByRole("button", { name: /^Therapists$/i })` but the button text is `"Therapy"` → all tests skip silently.

### Bug Pattern 4: Viewport overflow without scroll indicator
Tab bars with `overflowX: 'auto'` + `scrollbarWidth: 'none'` are invisible on overflow. Check whether all tabs fit at 1440px wide. If not, count tabs and measure widths.

```bash
# Count tabs in DB
docker exec <backend-container> python manage.py shell -c "
from apps.care_provider.models import NavigationSubCategory
FOOTER = ['Medication Management', 'Testing & Evaluation', 'Crisis Counseling & Education']
tabs = NavigationSubCategory.objects.filter(category_id=1).exclude(name__in=FOOTER)
print(f'{tabs.count()} tabs')
for t in tabs: print(f'  {t.name}')
"
```

If 11+ tabs, the last few require scroll. Add a visual affordance (fade gradient or arrow button).

### Bug Pattern 5: Footer strip not in viewport
`data-testid="therapists-footer-strip"` exists in the DOM but below the fold at standard viewport. Playwright `isVisible()` returns false. Check:
- Is the footer inside a scrollable container with fixed height?
- Is the footer below the provider card grid which also renders below the menu?

---

## Phase 4 — Fix implementation

Fix in this order (structural fixes first):

1. **Slug/name mismatch** — `sub-header/index.tsx`
   - Change `category.slug === "therapists"` → `category.slug === "therapy"` (or whatever the DB slug is)

2. **Undeclared variable in hook** — the affected component file
   - Add the missing field to the `useMutation`/`useQuery` destructuring: `{ data, loading, error }`

3. **E2E test selectors** — `e2e/<spec>.spec.ts`
   - Change button name matcher to match actual DB category name
   - Change `data-testid` references if needed

4. **Tab overflow affordance** — the mega menu component
   - Add a right-fade gradient overlay on the tablist when it overflows
   - OR add `scrollLeft` arrow buttons

After fixes:

```bash
# Backend tests (if any backend files changed)
docker compose run --rm backend python manage.py test apps.<app>

# Frontend quality gate
cd RG-Frontend && yarn test-all

# Run the Playwright spec in isolation
npx playwright test e2e/<spec>.spec.ts --headed
```

---

## Capture Script Template

Save as `C:\Temp\capture-<feature>.js`, copy into `RG-Frontend/` before running.

```javascript
const { chromium } = require('./node_modules/playwright');
const path = require('path');
const fs = require('fs');

const mode = process.argv[2] || 'main'; // 'main' or 'feature'
const outDir = 'C:\\Temp\\screenshots';
fs.mkdirSync(outDir, { recursive: true });
const prefix = mode === 'feature' ? 'feature' : 'main';

async function findVisibleButton(page, label) {
  const allBtns = await page.locator('button').all();
  for (const btn of allBtns) {
    const text = (await btn.textContent().catch(() => '')).trim();
    const visible = await btn.isVisible().catch(() => false);
    if (visible && text === label) return btn;
  }
  return null;
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });

  // Use domcontentloaded + long wait — networkidle resolves before Redux nav data arrives
  await page.goto('http://localhost:3000/en', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(8000);

  await page.screenshot({ path: path.join(outDir, `${prefix}-full-page.png`) });
  console.log(`Saved ${prefix}-full-page.png`);

  // Find the target nav button by exact text match
  const navBtn = await findVisibleButton(page, 'TARGET_BUTTON_TEXT');
  if (!navBtn) {
    const visible = [];
    for (const btn of await page.locator('button').all()) {
      const t = (await btn.textContent().catch(() => '')).trim();
      const v = await btn.isVisible().catch(() => false);
      if (v && t) visible.push(t);
    }
    console.error('Button not found. Visible:', visible.join(', '));
    await browser.close(); return;
  }

  await navBtn.click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(outDir, `${prefix}-menu-open.png`) });
  console.log(`Saved ${prefix}-menu-open.png`);

  // Tab captures — use JS click to bypass onMouseLeave
  const TABS = ['Tab One', 'Tab Two']; // fill from component PANE_COLUMN_SPANS or DB
  for (const tab of TABS) {
    const tabName = tab.toLowerCase().replace(/[\s&/]+/g, '-').replace(/-+/g, '-');
    await navBtn.click();
    await page.waitForTimeout(1200);
    const clicked = await page.evaluate((text) => {
      const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
      const t = tabs.find(el => el.textContent?.trim() === text);
      if (t) { t.scrollIntoView({ inline: 'nearest' }); t.click(); return true; }
      return false;
    }, tab);
    if (clicked) {
      await page.waitForTimeout(700);
      await page.screenshot({ path: path.join(outDir, `${prefix}-tab-${tabName}.png`) });
      console.log(`Saved ${prefix}-tab-${tabName}.png`);
    } else {
      console.log(`Tab not found: "${tab}"`);
    }
  }

  await browser.close();
  console.log('Done.');
})();
```

---

## Output

At the end of the skill, produce:

1. **Screenshot file list** — all paths captured
2. **Visual diff summary** — what changed between main and feature branch
3. **Bug report** — each bug with: description, file:line, severity, fix applied
4. **Fix verification** — `yarn test-all` output, Playwright spec result
5. **Remaining issues** — anything not auto-fixed (requires design decision, backend change, etc.)

---

## Related skills

- `audit-pipeline` — pre-implementation audit (plan → implement → audit → fix)
- `pr-review-fix` — fix PR review comments from GitHub
- `sonarcloud-pr-audit` — static analysis after push
- `build-check` — CI status after push
