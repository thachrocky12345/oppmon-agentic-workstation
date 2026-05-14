# Phase 1 — Context Loading Checklist

Read these in order. Stop reading once the design is unambiguous; you do
not need to read everything.

## 1. The Ticket Itself

- Jira/ticket description and acceptance criteria
- Linked BRD section (the BRD is the source of truth when ticket and BRD
  disagree on rules — flag the conflict, then follow the BRD)
- Linked design docs (`Docs/...`) and any Figma references

## 2. The Backend Props Contract (CRITICAL)

The frontend in this codebase is a thin renderer over backend payloads. For
any data-bearing component, read the contract first:

- Frontend implementation plan: `Docs/RGDEV_310_nav_bar_serp_frontend.md`
  (or the equivalent for the feature family)
- Backend implementation plan: `Docs/RGDEV_310_nav_bar_serp_backend.md`
- Backend integration script for the dependency ticket (e.g. `scripts/RGDEV_<dep>.py`)
  — confirms the actual payload shape, not just the planned one
- Backend test-plan doc (`Docs/RGDEV-<dep>/RGDEV_<dep>_test.md`) — confirms
  what's actually shipped

If the ticket consumes a backend endpoint, **clone the TypeScript interface
from the integration script's assertions**, not the planning doc — planning
docs drift, scripts are executable truth.

## 3. Repo Conventions (one-time per session)

- `CLAUDE.md` (root) — pre-push gate, coding conventions, security notes
- `RG-Frontend/package.json` — confirm Next.js version (13.x), React (18.x),
  MUI version, `next-intl` presence, `yarn test` script presence
- `RG-Frontend/jest.config.js` + `jest.setup.ts` — confirm Jest is bootstrapped
  (post PR #1261)
- `RG-Frontend/tsconfig.json` — path aliases (`@/*` → `src/*`?)

## 4. Related Code

For an existing feature area (extending behavior):

- `src/components/<Domain>/<Feature>/` — current components, conventions,
  styling palette in use
- `src/components/<Domain>/<Feature>/__tests__/` — fixture conventions, mock
  patterns
- `src/pages/<area>/<name>.tsx` — the page entry that hosts the feature
- `src/restapis/<area>.ts` — typed function pattern + interface shape

For a net-new feature:

- The closest sibling feature — copy its structure
- `src/components/CareProvider/Attribution/` (PR #1261) is the clean
  reference for: domain/feature folder, sibling `__tests__/`, page entry as
  thin orchestrator, restapis with typed interfaces, i18n keys
- `src/pages/care-provider/attribution.tsx` for `NextPage`, `Head`, dynamic
  Layout import, Redux hooks via `src/store/hooks.ts`

## 5. The Prior Ticket's Test Plan

Open `Docs/RGDEV-<prev>/RGDEV_<prev>_test.md` (or the most recent one in
`Docs/`) to:

- Match tone and section ordering
- Reuse the unit-test summary table format
- Carry forward any "Known Limitations" the next ticket inherits

## 6. The Reference PR

PR #1261 (Attribution portal) is the canonical recent example:
`https://github.com/reallyhq/RG-Frontend/pull/1261`

Specifically lift from it:

- **Folder layout:** `src/components/CareProvider/Attribution/<File>.tsx` +
  `__tests__/<helper>.test.ts`
- **Page entry pattern:** `src/pages/care-provider/attribution.tsx` — uses
  `dynamic` for Layout (SSR off), `useTranslations`, `useAppSelector`,
  `useCallback`/`useMemo` for handler stability
- **REST helper pattern:** `src/restapis/attribution.ts` — exports
  `interface`s + thin functions calling `api.<verb>(path, params)`
- **Redux hooks:** `src/store/hooks.ts` — typed `useAppSelector` and
  `useAppDispatch`
- **Styling:** MUI `sx` with brand palette inline
- **Loading/error states:** MUI `Skeleton`, `Alert` with retry, optimistic
  toggle pattern
- **Test pattern:** helper extracted from component, tested directly with
  Jest, no React tree when not needed

## 7. External Spec Hooks

If the ticket links to a backend BRD (e.g. "backend `getStaticPaths` returns
2,688 paths"), respect those contracts in the props consumed. The backend
team will not file a follow-up — they'll just break.

## What NOT to read

- The full `ContextFiles2/` archive — it is too broad. Use
  `Docs/ContextIndex.md` only if a specific concept (auth, payments) is
  mentioned in the ticket and you don't already know where it lives.
- Other unrelated feature folders — they pollute the cache and tempt
  cross-cutting refactors.
- The Storybook stories of every component — only the one being extended.

## Output of Phase 1

Before starting Phase 2, you should be able to state in one paragraph:

1. The components / pages being added or modified
2. The props contract they consume (with TypeScript shape)
3. The acceptance criteria as a numbered list
4. The "out of scope" boundary (what this ticket does *not* do — e.g.
   "Design tokens are RGDEV-326, not this ticket")

If you can't, you have not read enough.
