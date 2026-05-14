Base directory for this skill: C:\Users\thach\Documents\workstation\ReallyGlobal-Workspace\.claude\skills\build-frontend-single-ticket

# Build Frontend Single Ticket

The canonical pipeline for shipping one frontend ticket in `RG-Frontend/`,
modeled on PR #1261 (Attribution portal) — the most recent green example of
end-to-end frontend work in this repo.

## The Six Phases (in order)

```
1. Context  →  2. Build  →  3. Unit tests  →  4. Quality gates  →  5. Lighthouse/QA  →  6. Test plan doc
```

Do not skip phases. Do not reorder. Each phase has a green-light gate before
moving to the next.

## Fresh-Agent Bootstrap (read this first if context was just cleared)

When invoked on a ticket like `RGDEV-319`, do these four discovery steps
**before** Phase 1. They take a few seconds and prevent 90 % of foot-guns:

1. **Read the canonical workspace map**: `CLAUDE.md` (root) — confirms the
   pre-push gate, env conventions, and the `RG-Frontend/` scope.
2. **Confirm test infrastructure is present** (PR #1261 introduced it; if
   the branch is older this may not be there yet):
   ```bash
   ls RG-Frontend/jest.config.js RG-Frontend/jest.setup.ts
   ```
   If missing → escalate; do NOT bootstrap test infra inside a feature
   ticket. Test-infra-bootstrap is `FE-INFRA-1` in `future_build_frontend.md`.
3. **Confirm or create a feature branch** in `RG-Frontend/`:
   ```bash
   git -C RG-Frontend status --short
   git -C RG-Frontend rev-parse --abbrev-ref HEAD
   ```
   If on `main`, branch off: `git -C RG-Frontend checkout -b RGDEV-<NUM>_<slug>`.
4. **Locate the reference deliverables** so you can clone their shape later:
   - PR #1261 — `https://github.com/reallyhq/RG-Frontend/pull/1261` — canonical
     pattern for components + page entries + Jest tests + restapis + i18n.
   - `RG-Frontend/src/components/CareProvider/Attribution/` — folder layout +
     `__tests__/` sibling.
   - `RG-Frontend/src/pages/care-provider/attribution.tsx` — `NextPage`
     orchestrator pattern with `Head`, dynamic `Layout`, hooks for state.

Then proceed to Phase 1. The five reference files in this skill folder
(SKILL.md + CONTEXT.md + TESTING.md + QUALITY.md + TESTPLAN_TEMPLATE.md)
contain everything the agent needs — no other skill is required for the
happy path.

## Phase 1 — Load Context

Before writing any code, read the inputs that constrain the design.
See [CONTEXT.md](CONTEXT.md) for the ranked checklist.

Minimum: ticket BRD/spec, the backend props contract (this codebase consumes
backend payloads — read `Docs/RGDEV_310_nav_bar_serp_backend.md` or the
ticket's stated dependency), the prior frontend ticket's test-plan doc
(`Docs/RGDEV-<prev>/...`) for tone, and the relevant `src/components/`
sibling for house style.

Stop and ask only if a hard contradiction exists between the ticket text
and the backend contract. Otherwise apply the most reasonable senior-engineer
assumption and proceed.

## Phase 2 — Build

Scope is `RG-Frontend/` only. Touch the minimum surface area:

- New feature folder under `src/components/<Domain>/<Feature>/` for components
  (see PR #1261 `src/components/CareProvider/Attribution/` as canonical).
- One file per component, PascalCase, `default export`. Skeletons + error
  states in the same file as the component they belong to.
- Page entries in `src/pages/...` are **thin orchestrators**: they fetch via
  `getStaticProps`/`getServerSideProps`, hold top-level state, and compose
  subcomponents. They do not contain layout primitives.
- REST helpers in `src/restapis/<feature>.ts` — typed `interface` exports +
  thin functions calling `api.get/post/patch` from `../store/axiosInstance`.
  GraphQL queries in `src/graphql/`.
- i18n: add keys to `src/i18n/en.json` (and `de.json` if present in the
  ticket). Consume via `useTranslations("Namespace")`.
- Styling: MUI `sx` prop. Brand palette: `#469BA7` (teal primary), `#1C4961`
  (dark blue text), `#6C727F` (muted), `Poppins` font family.
- Defensive coding: guard `typeof navigator !== "undefined"`, `typeof window
  !== "undefined"` — Next.js SSR will run this code on Node.
- Loading states: `Skeleton` from MUI for tile/table; never blank.
- Optimistic UI for toggles: update state, fire request, revert on failure.

Green-light gate: `yarn check-types` clean for the changed files.

## Phase 3 — Unit Tests (Jest + React Testing Library)

Location: `src/components/<Domain>/<Feature>/__tests__/<Component>.test.tsx`
OR a sibling `<Component>.test.tsx`. Aim for >85 % coverage of new logic.

Jest patterns this codebase uses (and pitfalls to avoid) live in
[TESTING.md](TESTING.md). Highlights:

- Configuration is `jest.config.js` at repo root (uses `next/jest` to inherit
  Next.js compilation). Do not duplicate it per-folder.
- `setupFilesAfterEach: ['<rootDir>/jest.setup.ts']` imports
  `@testing-library/jest-dom` matchers globally.
- Test names: `describe("<Component>", () => { it("does X", ...) })`.
- For pure helpers (date formatting, slug parsing): test the helper directly,
  no React tree needed — see `formatDate.test.ts` in PR #1261.
- For components consuming `next-intl`, wrap in `<NextIntlClientProvider
  locale="en" messages={...}>`. Or stub the hook for unit isolation.
- For components consuming Redux: wrap in `<Provider store={mockStore}>`.
- For routing: stub `useRouter` via `jest.mock("next/router", ...)` returning
  a controlled router object.
- For network: MSW handlers if present; otherwise `jest.spyOn` on the
  `restapis/<feature>.ts` function.

Green-light gate: `yarn test <path>` is green for the new tests. Existing
tests in the same area still pass (no regressions).

## Phase 4 — Quality Gates

Run before considering anything "done":

```bash
cd RG-Frontend
yarn check-types          # tsc --noEmit — must be 0 errors
yarn lint                 # ESLint — must be clean for changed files
yarn format               # prettier write
yarn test                 # Jest — full suite green
yarn build                # next build — must complete with no type/build errors
```

CLAUDE.md §3 *MANDATORY: Pre-Push Testing Gate* — `yarn test-all` (format
+ lint + typecheck + build) MUST be clean before pushing.

Fix every issue in the new/changed code; do not touch unrelated existing
violations. Common rules and their copy-paste fixes are in
[QUALITY.md](QUALITY.md): unused imports, missing keys in lists, `any`
escape hatches, exhaustive-deps warnings.

After fixing, re-run Phase 3 — the fixes must not regress tests.

Green-light gate: `yarn test-all` exits 0, plus `yarn test` is green.

## Phase 5 — Lighthouse / Manual QA Spot-Check (if user-visible)

For any user-visible UI changes, run a localhost smoke pass before opening
the PR:

```bash
cd RG-Frontend
yarn dev
# then in another shell:
yarn lighthouse-ci or `npx lighthouse http://localhost:3000/<route>` if installed
```

For SERP / SEO pages: confirm View Source contains H1, intro paragraph,
JSON-LD script blocks, meta description, canonical, hreflang BEFORE
hydration. Use `curl -s http://localhost:3000/<route> | head -200` to
verify SSR output is complete.

For accessibility: run axe via Storybook OR the dev tools axe extension on
the rendered page. Zero serious/critical violations.

This phase is **skippable** for non-visual tickets (REST helper only, store
slice only, util-only). Skip explicitly in the test plan if you skip it.

Green-light gate: no obvious LCP/JS regressions; SSR output complete.

## Phase 6 — Test Plan Doc

Path: `Docs/RGDEV-<NUM>/RGDEV_<NUM>_test.md`. Use
[TESTPLAN_TEMPLATE.md](TESTPLAN_TEMPLATE.md). Fill in the unit-test summary
with the actual run output, mark every `- [ ]` AC that passed as `- [x]`,
append a quality-gates section, and finish with Known Limitations and
Rollback.

Final deliverable: code + unit tests + `yarn test-all` green + test plan
markdown. That is "done".

## Anti-patterns

- Pushing without running `yarn test-all` first (CI is a safety net, not the
  first gate — see CLAUDE.md §3).
- Adding `// eslint-disable-next-line` to silence rules instead of refactoring.
- Implementing stubs for downstream tickets — leave the seam (e.g. a typed
  prop with a stubbed default) and let the next ticket fill it in.
- Touching files outside `RG-Frontend/` unless the test-plan markdown lives
  in `Docs/` (which is the only sanctioned exception for this pipeline).
- Writing component CSS in standalone `.css` files. Use MUI `sx` or
  `@emotion/styled` — the codebase has no convention for `.module.css`.
- Importing from `@mui/material/Button` instead of `@mui/material`. The
  tree-shaking on the latter is fine and PR #1261 uses the named-import form.

## User Kickoff Prompt (paste this after `/clear`)

The user can paste this verbatim with the ticket number filled in to start
a fresh session:

```
Use the build-frontend-single-ticket skill to ship RGDEV-<NUM>.

Run the Fresh-Agent Bootstrap (verify test infra, branch, reference PR
#1261), then walk Phases 1–6 in order. The ticket spec is at
<paste Jira URL or path to BRD>.

Final deliverable: code in RG-Frontend/, Jest tests in
src/components/<Domain>/<Feature>/__tests__/, yarn test-all green, and test
plan at Docs/RGDEV-<NUM>/RGDEV_<NUM>_test.md.
```

If the user just says *"ship RGDEV-<NUM>"* without pasting the prompt, treat
that as equivalent to the above and start the bootstrap immediately.

## See Also

- [CONTEXT.md](CONTEXT.md) — what to read before coding
- [TESTING.md](TESTING.md) — Jest + RTL invocation, mocking patterns
- [QUALITY.md](QUALITY.md) — common lint/type rules and refactor recipes
- [TESTPLAN_TEMPLATE.md](TESTPLAN_TEMPLATE.md) — test-plan markdown skeleton
- PR #1261 — canonical reference: `https://github.com/reallyhq/RG-Frontend/pull/1261`
- `RG-Frontend/src/components/CareProvider/Attribution/` — reference folder
- `RG-Frontend/src/pages/care-provider/attribution.tsx` — reference page
