# Phase 3 — Testing Playbook (Jest + React Testing Library)

## Layout

```
src/components/<Domain>/<Feature>/
├── <Component>.tsx
├── <Component>.test.tsx              # OR
└── __tests__/
    └── <Component>.test.tsx
    └── <helper>.test.ts              # pure-function tests
```

PR #1261 uses both forms. `__tests__/` is preferred for helpers extracted
from a parent component (e.g. `formatDate.test.ts` testing a function
exported from `AttributedClientsList.tsx`). Sibling `.test.tsx` is fine for
full-component tests.

## Config

`jest.config.js` at repo root (added by PR #1261):

```js
const nextJest = require('next/jest');
const createJestConfig = nextJest({ dir: './' });

module.exports = createJestConfig({
  setupFilesAfterEach: ['<rootDir>/jest.setup.ts'],
  testEnvironment: 'jest-environment-jsdom',
  testMatch: [
    '**/__tests__/**/*.ts',
    '**/__tests__/**/*.tsx',
    '**/*.test.ts',
    '**/*.test.tsx',
  ],
});
```

`jest.setup.ts`:

```ts
import '@testing-library/jest-dom';
```

Do not modify these files inside a feature ticket. If a ticket genuinely
needs new global setup (MSW server, global fetch polyfill), escalate — the
ticket is bigger than one feature.

## Commands

```bash
yarn test                                  # full suite, watch mode-able
yarn test src/components/SerpPage          # one folder
yarn test -- --testNamePattern="lowCount"  # one test by name
yarn test:ci                               # CI mode + coverage
```

Single file:

```bash
yarn test src/components/SerpPage/SerpPage.test.tsx
```

## Pattern 1 — Pure helper (no React tree)

`formatDate.test.ts` from PR #1261 is the model:

```ts
import { formatDate } from "../AttributedClientsList";

describe("formatDate", () => {
  it("returns em-dash for empty string", () => {
    expect(formatDate("")).toBe("\u2014");
  });

  it("returns em-dash for null", () => {
    expect(formatDate(null as unknown as string)).toBe("\u2014");
  });
});
```

Rule: if a helper is testable as a function, export it from the component
file and test it directly. Don't render the whole component just to assert
a date format.

## Pattern 2 — Component render with default props

```tsx
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../i18n/en.json";
import SerpPage from "../SerpPage";

const mockProps = { /* … minimum required props … */ };

const renderPage = (overrides = {}) =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <SerpPage {...mockProps} {...overrides} />
    </NextIntlClientProvider>
  );

describe("SerpPage", () => {
  it("renders the H1 verbatim from props", () => {
    renderPage({ content: { ...mockProps.content, final_h1: "Test heading" } });
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Test heading"
    );
  });
});
```

## Pattern 3 — Mocking `next/router`

```ts
jest.mock("next/router", () => ({
  useRouter: () => ({
    locale: "en",
    pathname: "/en/coaches/anxiety",
    query: {},
    push: jest.fn(),
    replace: jest.fn(),
  }),
}));
```

For tests that exercise navigation, hoist the mock into a `beforeEach` so
each test can override `query` or assert `push` was called.

## Pattern 4 — Mocking Redux store

```tsx
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import careProviderSliceV1 from "../../../store/slices/careProviderSliceV1";

const mockStore = (state = {}) =>
  configureStore({
    reducer: { careProviderSliceV1: careProviderSliceV1.reducer },
    preloadedState: state,
  });

const renderWithStore = (ui: React.ReactElement, state = {}) =>
  render(<Provider store={mockStore(state)}>{ui}</Provider>);
```

## Pattern 5 — Mocking REST helpers

```ts
import * as attribution from "../../../restapis/attribution";

beforeEach(() => {
  jest
    .spyOn(attribution, "getAttributionSummary")
    .mockResolvedValue({ data: { this_month_savings: 0, ... } });
});

afterEach(() => {
  jest.restoreAllMocks();
});
```

Do not call the real `axios` instance in unit tests. Either mock the
restapis function or use MSW (if added to the project later).

## Pattern 6 — Asserting absence

```tsx
it("hides count number when lowCount is true", () => {
  renderPage({ flags: { lowCount: true, showNarrowingLinks: false }, totalEligibleCount: 3 });
  expect(screen.queryByText(/3 providers/i)).not.toBeInTheDocument();
});
```

`queryByX` returns `null` when absent (no throw); use it with
`.not.toBeInTheDocument()`. Never use `getByX` for absence — it throws.

## Pattern 7 — User interaction

```tsx
import userEvent from "@testing-library/user-event";

it("expands FAQ on click", async () => {
  const user = userEvent.setup();
  renderPage();
  const trigger = screen.getByRole("button", { name: /first faq question/i });
  expect(trigger).toHaveAttribute("aria-expanded", "false");
  await user.click(trigger);
  expect(trigger).toHaveAttribute("aria-expanded", "true");
});
```

## Pattern 8 — Server-rendered content (SEO assertions)

For SEO-bearing components (JSON-LD, meta tags), assert against the
rendered HTML markup, not just the React tree:

```tsx
it("emits FAQPage JSON-LD in initial render", () => {
  const { container } = renderPage();
  const ldScripts = container.querySelectorAll(
    'script[type="application/ld+json"]'
  );
  const types = Array.from(ldScripts).map((s) => JSON.parse(s.textContent!)["@type"]);
  expect(types).toContain("FAQPage");
});
```

This is the closest unit-level proxy for "is it in the SSR HTML" — true
SSR-output verification belongs in Phase 5 (`curl` + `view-source:`).

## Anti-patterns

- `act()` warnings ignored. They almost always mean a state update
  happened after the test asserted. Wrap user interactions in `await
  user.click(...)` (the `setup()` form auto-acts) or `await
  waitFor(...)`.
- `setTimeout` in tests. Use `jest.useFakeTimers()` and
  `jest.advanceTimersByTime()` for timer-driven UI (e.g. the 2-second copy
  feedback in PR #1261).
- Asserting on MUI's internal class names. They change between versions.
  Assert on `role`, `text`, `aria-*`, `data-testid`.
- `data-testid` everywhere. Prefer role-based queries; reserve testid for
  elements with no accessible name.
- One test asserting 12 things. Split into one `it()` per assertion.

## Pre-push gate (CLAUDE.md §3)

```bash
yarn test-all
```

Must report **all green** before any `git push`. CI is a safety net, not the
first line of defense.

## Definition of "done" for Phase 3

- [ ] All new component/helper Jest tests pass
- [ ] Existing tests in the same area still pass
- [ ] Tests are deterministic — re-run the suite once and confirm
- [ ] No `act()` warnings in output
- [ ] Coverage of new code ≥ 85% on `yarn test:ci`
