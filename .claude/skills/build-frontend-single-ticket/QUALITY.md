# Phase 4 — Quality Gates Playbook

The frontend equivalent of the backend's SonarCloud sweep. Goal: zero new
issues introduced by this ticket, no regressions in existing files.

## The five commands (in order)

```bash
cd RG-Frontend
yarn check-types          # tsc --noEmit
yarn lint                 # eslint
yarn format               # prettier --write
yarn test                 # jest
yarn build                # next build
```

All five must exit 0 before the test plan can claim "green". `yarn test-all`
runs format + lint + typecheck + build as a single composite gate
(CLAUDE.md §3 *MANDATORY: Pre-Push Testing Gate*).

## TypeScript (`yarn check-types`)

The strict-but-not-pedantic mode in `tsconfig.json` catches the common ones.
Fixes:

### `TS2322` Type 'X' is not assignable to type 'Y'

Usually a backend-contract mismatch. The fix is one of:

1. Update the local `interface` to match the actual payload (clone from the
   integration script).
2. Narrow with a discriminated union if the backend returns one of several
   shapes (e.g. `flags.showNarrowingLinks` toggles which arm of the union
   `narrowingLinks` lives in).
3. If the field is genuinely optional, mark it `?` and guard with `if (x)`.

Never reach for `as Y` — that suppresses the diagnostic without fixing it.

### `TS2339` Property 'X' does not exist on type 'Y'

Check whether you imported the right interface (e.g. `ProviderCard` vs
`GroupCard`). For union types, narrow first:

```ts
if ("organizer" in card) {
  // GroupCard branch — card.organizer is safe here
}
```

### `TS7006` Parameter 'x' implicitly has 'any' type

Annotate the parameter. For event handlers, use the React type:

```ts
const onClick = (e: React.MouseEvent<HTMLButtonElement>) => { ... };
```

For map callbacks, the inferred type from the array is usually enough — if
TS still complains, the array type is `any[]`; fix that one instead.

## ESLint (`yarn lint`)

The shared config covers `eslint:recommended`, `@typescript-eslint`,
`plugin:react/recommended`, `plugin:react-hooks/recommended`, and a
Next-specific layer (`next/core-web-vitals`).

### `@typescript-eslint/no-unused-vars`

Delete the import or variable. If it's a destructured prop you intentionally
ignore, prefix with `_`:

```ts
const { _unused, used } = props;
```

### `react/jsx-key`

Every element in a `.map(...)` must have a stable `key`. Don't use the array
index unless the list is truly static and never reorders. For provider cards,
key by `card.id` or `card.slug`.

### `react-hooks/exhaustive-deps`

Add the missing dependency. If adding it would cause an infinite loop, the
right fix is usually to:

1. Wrap the dep in `useCallback`/`useMemo` so its identity is stable.
2. Move the side-effect into an event handler instead of `useEffect`.
3. Read a fresh value via `useRef` and update the ref in a separate effect.

Disabling the rule is almost never correct. PR #1261 wraps `handleToggle` in
`useCallback` precisely to satisfy this rule for the parent `useMemo` deps.

### `@typescript-eslint/no-explicit-any`

Replace with a real type, or with `unknown` + a runtime narrow. For
third-party libs with no types, write the smallest interface you need:

```ts
interface MinimalRouter { push: (url: string) => void; }
```

### `react/no-unescaped-entities`

`'` → `&apos;`, `"` → `&quot;`, or wrap the text in a `{"..."}` expression.

### `@next/next/no-img-element`

Use `next/image` with explicit `width`/`height`. For decorative images, set
`alt=""` and `aria-hidden`. For provider headshots with unknown dimensions at
build time, use `fill` + a sized parent.

## Prettier (`yarn format`)

Re-run after every fix. Prettier mutates files; don't fight it. The settings
are baked in — don't pass `--no-semi` or similar flags.

## Tests (`yarn test`)

Phase 3 already covered the patterns. The only new failure modes that
typically surface in Phase 4:

- A change you made to satisfy ESLint changed a render output. Update the
  test assertion to match the new (intended) output. Never weaken the
  assertion to "pass" — that masks regressions.
- A `useEffect` dep change caused an extra render. Wrap interactions in
  `await user.click()` (auto-acts) or `await waitFor(() => ...)`.

## Build (`yarn build`)

`next build` runs type-check + lint + a production bundle. Failures here are
usually one of:

### "Module not found: Can't resolve '@/...'"

Path alias missing in `tsconfig.json` `paths`. PR #1261 uses **relative
imports**, not `@/*` — match that style unless the alias is already set up.

### "Error: Page X has invalid getStaticProps return value"

`getStaticProps` must return `{ props, revalidate? }` or `{ notFound: true }`
or `{ redirect: {...} }`. No other shape. Confirm the shape against
Next.js 13 docs (the version in `package.json`).

### "Image with src '...' has invalid width or height"

`next/image` needs explicit dimensions OR `fill` with a sized parent.

### "Hydration failed because the initial UI does not match"

A render branch produced different markup on server vs client. Common cause:
reading `window`/`localStorage`/`Date.now()` during initial render. Wrap in
`useEffect` so it only runs after hydration, or guard with `typeof window`.

## SonarCloud (post-PR)

`/sonarcloud-pr-audit` runs after the PR is opened. The recurring TSX
findings:

### Cognitive Complexity > 15

The `SerpPage` orchestrator can hit this if you put all branches inline.
Extract: one subcomponent per variant (`<StandardLayout>`,
`<NarrowingLayout>`, `<LowCountBanner>`) and let `SerpPage` switch on
`flags.showNarrowingLinks` / `flags.lowCount` at the top:

```tsx
if (flags.showNarrowingLinks) return <NarrowingLayout {...} />;
return <StandardLayout {...} />;
```

### Duplicate string literals (3+ uses)

Hoist to a constant in the same file:

```ts
const FILTER_BAR_HEIGHT = 56;
```

For UI labels, the i18n keys already de-duplicate. Don't extract
visually-similar literals like "Loading..." in three components — they're
likely distinct i18n keys (one per namespace), Sonar's heuristic
mis-flagging.

### `S6481` "Context provider values should be wrapped in `useMemo`"

If a component creates an object/array inline as a context value, wrap it:

```tsx
const value = useMemo(() => ({ a, b }), [a, b]);
return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
```

### `S6606` Prefer using nullish coalescing

`x || fallback` → `x ?? fallback` when `0` / `""` are valid values you don't
want to fall through.

## Definition of "done" for Phase 4

- [ ] `yarn check-types` — 0 errors
- [ ] `yarn lint` — 0 errors, 0 new warnings in changed files
- [ ] `yarn format` — clean (no diff after running)
- [ ] `yarn test` — green, no `act()` warnings
- [ ] `yarn build` — completes; no hydration warnings in build log
- [ ] `yarn test-all` — exits 0 (composite pre-push gate)
- [ ] SonarCloud (post-push) — no new BLOCKER/CRITICAL/MAJOR findings on
      changed files

If the composite gate fails after fixes, re-run Phase 3 once — the fix may
have regressed a test.
