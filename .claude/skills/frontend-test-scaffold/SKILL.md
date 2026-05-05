---
name: frontend-test-scaffold
description: Bootstrap the missing frontend testing infrastructure for RG-Frontend with Jest, Testing Library, and MSW. Use when asked to "setup frontend tests", "add jest to frontend", "create test infrastructure", "bootstrap testing", or "frontend test setup".
argument-hint: [--step install|config|templates|scripts|ci|all] [--phi-tests]
frequency: on-demand
---

# Frontend Test Infrastructure Scaffold

## When to Use
- When setting up frontend testing for the first time (NO test infrastructure currently exists)
- When adding test coverage to existing components
- When implementing CI/CD test gates
- When PHI exposure tests are needed on the client side

## Prerequisites
- `RG-Frontend/` with `yarn` package manager
- Node.js environment (Docker or local)
- Understanding that `yarn test-all` currently = format + lint + typecheck + build (NO actual tests)

## Current State
- **NO jest, NO vitest, NO MSW, NO `__tests__/` directories**
- `yarn test-all` in `RG-Frontend/package.json` runs: format + lint + typecheck + build only
- No `@testing-library` packages installed
- No mock server for API calls
- No test coverage reporting configured

## Workflow

### Step 1: Install testing dependencies

```bash
cd RG-Frontend

# Core testing framework
yarn add -D jest @types/jest ts-jest jest-environment-jsdom

# React Testing Library
yarn add -D @testing-library/react @testing-library/jest-dom @testing-library/user-event

# MSW for API mocking
yarn add -D msw

# Additional utilities
yarn add -D identity-obj-proxy  # CSS module mocks
```

### Step 2: Create Jest configuration

**`RG-Frontend/jest.config.ts`:**

```typescript
import type { Config } from 'jest';
import nextJest from 'next/jest';

const createJestConfig = nextJest({
  dir: './',
});

const config: Config = {
  displayName: 'rg-frontend',
  testEnvironment: 'jsdom',
  setupFilesAfterSetup: ['<rootDir>/jest.setup.ts'],

  // Module aliases matching tsconfig.json paths
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@components/(.*)$': '<rootDir>/src/components/$1',
    '^@store/(.*)$': '<rootDir>/src/store/$1',
    '^@hooks/(.*)$': '<rootDir>/src/hooks/$1',
    '^@graphql/(.*)$': '<rootDir>/src/graphql/$1',
    '^@restapis/(.*)$': '<rootDir>/src/restapis/$1',
    '^@contexts/(.*)$': '<rootDir>/src/contexts/$1',
    '^@lib/(.*)$': '<rootDir>/src/lib/$1',
    // CSS modules
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
    // Static assets
    '\\.(jpg|jpeg|png|gif|webp|svg)$': '<rootDir>/src/__mocks__/fileMock.ts',
  },

  // Coverage configuration
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/*.stories.{ts,tsx}',
    '!src/pages/_app.tsx',
    '!src/pages/_document.tsx',
    '!src/mocks/**',
  ],
  coverageReporters: ['text', 'lcov', 'json-summary'],
  coverageDirectory: 'coverage',

  // Test file patterns
  testMatch: [
    '<rootDir>/src/**/__tests__/**/*.{ts,tsx}',
    '<rootDir>/src/**/*.{test,spec}.{ts,tsx}',
  ],

  // Ignore patterns
  testPathIgnorePatterns: ['/node_modules/', '/.next/'],
  transformIgnorePatterns: [
    '/node_modules/(?!(msw|@bundled-es-modules)/)',
  ],
};

export default createJestConfig(config);
```

**`RG-Frontend/jest.setup.ts`:**

```typescript
import '@testing-library/jest-dom';

// MSW server setup
import { server } from './src/mocks/server';

beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// Mock next/router
jest.mock('next/router', () => ({
  useRouter: () => ({
    route: '/',
    pathname: '/',
    query: {},
    asPath: '/',
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    prefetch: jest.fn().mockResolvedValue(undefined),
    beforePopState: jest.fn(),
    events: {
      on: jest.fn(),
      off: jest.fn(),
      emit: jest.fn(),
    },
    isFallback: false,
    isReady: true,
    isPreview: false,
    locale: 'en',
  }),
}));

// Mock next-intl
jest.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'en',
}));

// Suppress console.error for expected test warnings
const originalError = console.error;
beforeAll(() => {
  console.error = (...args: unknown[]) => {
    if (
      typeof args[0] === 'string' &&
      args[0].includes('Warning: ReactDOM.render is no longer supported')
    ) {
      return;
    }
    originalError.call(console, ...args);
  };
});
afterAll(() => {
  console.error = originalError;
});
```

**`RG-Frontend/src/__mocks__/fileMock.ts`:**

```typescript
export default 'test-file-stub';
```

### Step 3: Create MSW mock server

**`RG-Frontend/src/mocks/server.ts`:**

```typescript
import { setupServer } from 'msw/node';
import { handlers } from './handlers';

export const server = setupServer(...handlers);
```

**`RG-Frontend/src/mocks/browser.ts`:**

```typescript
import { setupWorker } from 'msw/browser';
import { handlers } from './handlers';

export const worker = setupWorker(...handlers);
```

**`RG-Frontend/src/mocks/handlers/index.ts`:**

```typescript
import { authHandlers } from './auth';
import { calendarHandlers } from './calendar';
import { graphqlHandlers } from './graphql';

export const handlers = [
  ...authHandlers,
  ...calendarHandlers,
  ...graphqlHandlers,
];
```

**`RG-Frontend/src/mocks/handlers/auth.ts`:**

```typescript
import { http, HttpResponse } from 'msw';

const BASE_URL = process.env.NEXT_APP_BACKEND_BASE_URL || 'http://127.0.0.1:8000';

export const authHandlers = [
  http.post(`${BASE_URL}/api/v1/auth/login/`, () => {
    return HttpResponse.json({
      access: 'mock.access.token.for.testing',
      refresh: 'mock.refresh.token.for.testing',
      user_type: 'CLIENT',
    });
  }),

  http.get(`${BASE_URL}/api/v1/auth/user/`, () => {
    return HttpResponse.json({
      id: '00000000-0000-0000-0000-000000000001',
      email: 'test@example.com',
      first_name: 'Test',
      last_name: 'User',
      user_type: 'CLIENT',
    });
  }),
];
```

**`RG-Frontend/src/mocks/handlers/calendar.ts`:**

```typescript
import { http, HttpResponse } from 'msw';

const BASE_URL = process.env.NEXT_APP_BACKEND_BASE_URL || 'http://127.0.0.1:8000';

export const calendarHandlers = [
  http.get(`${BASE_URL}/api/v1/calendar/appointments/`, () => {
    return HttpResponse.json({ results: [], count: 0 });
  }),

  http.get(`${BASE_URL}/api/v1/calendar/slots/`, () => {
    return HttpResponse.json({ results: [] });
  }),
];
```

**`RG-Frontend/src/mocks/handlers/graphql.ts`:**

```typescript
import { graphql, HttpResponse } from 'msw';

export const graphqlHandlers = [
  graphql.mutation('UserRefreshToken', () => {
    return HttpResponse.json({
      data: {
        refreshToken: {
          token: 'mock.refreshed.access.token',
          refreshToken: 'mock.new.refresh.token',
        },
      },
    });
  }),
];
```

### Step 4: Create test templates

**Component test -- `RG-Frontend/src/components/__tests__/example.test.tsx`:**

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Example: replace with actual component import
// import { MyComponent } from '../MyComponent';

describe('Component Test Template', () => {
  it('renders without crashing', () => {
    // render(<MyComponent />);
    // expect(screen.getByRole('heading')).toBeInTheDocument();
    expect(true).toBe(true); // placeholder
  });

  it('handles user interaction', async () => {
    const user = userEvent.setup();
    // render(<MyComponent />);
    // await user.click(screen.getByRole('button'));
    // expect(screen.getByText('Updated')).toBeInTheDocument();
    expect(true).toBe(true); // placeholder
  });
});
```

**Store test -- `RG-Frontend/src/store/__tests__/example.test.ts`:**

```typescript
// import { configureStore } from '@reduxjs/toolkit';
// import mySlice, { fetchSomething } from '../slices/mySlice';

describe('Redux Slice Test Template', () => {
  it('handles initial state', () => {
    // const store = configureStore({ reducer: { mySlice } });
    // expect(store.getState().mySlice).toEqual(initialState);
    expect(true).toBe(true); // placeholder
  });
});
```

**PHI exposure test -- `RG-Frontend/src/__tests__/phi-exposure.test.tsx`:**

```tsx
/**
 * PHI Exposure Test Template
 * Verifies that PHI fields are NOT rendered in DOM or stored in browser storage.
 */
import { render, screen } from '@testing-library/react';

describe('PHI Exposure Prevention', () => {
  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('should NOT render clinical notes in DOM', () => {
    // After rendering a component that fetches notes:
    // const { container } = render(<NotesComponent />);
    // await waitFor(() => {
    //   expect(container.innerHTML).not.toContain('clinical session note text');
    // });
    // Only the redacted/masked version should appear
    expect(true).toBe(true); // placeholder
  });

  it('should NOT store PHI in localStorage', () => {
    // After component interaction:
    const allKeys = Object.keys(localStorage);
    const phiKeys = allKeys.filter(k =>
      ['notes', 'final_keywords', 'is_severe', 'risk_score'].some(phi =>
        k.toLowerCase().includes(phi)
      )
    );
    expect(phiKeys).toHaveLength(0);
  });

  it('should NOT store PHI in sessionStorage', () => {
    const allKeys = Object.keys(sessionStorage);
    const phiKeys = allKeys.filter(k =>
      ['notes', 'final_keywords', 'is_severe', 'risk_score'].some(phi =>
        k.toLowerCase().includes(phi)
      )
    );
    expect(phiKeys).toHaveLength(0);
  });

  it('should only store auth tokens in localStorage', () => {
    // Verify only approved keys exist:
    const allowedKeys = ['access_token', 'refresh_token', 'user_type', 'locale'];
    const allKeys = Object.keys(localStorage);
    const unexpectedKeys = allKeys.filter(k => !allowedKeys.includes(k));
    expect(unexpectedKeys).toHaveLength(0);
  });
});
```

### Step 5: Update package.json scripts

Add to `RG-Frontend/package.json` scripts:

```json
{
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage --coverageReporters=lcov --coverageReporters=text-summary",
    "test-all": "yarn format && yarn lint && yarn check-types && yarn test && yarn build"
  }
}
```

Note: Update the existing `test-all` script to include `yarn test` before `yarn build`.

### Step 6: CI integration

Add to `.github/workflows/deploy.yml` (or create `test.yml`):

```yaml
  frontend-test:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: RG-Frontend
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 18
          cache: 'yarn'
          cache-dependency-path: RG-Frontend/yarn.lock
      - run: yarn install --frozen-lockfile
      - run: yarn test:coverage
      - name: SonarCloud Scan
        uses: SonarSource/sonarcloud-github-action@master
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          SONAR_TOKEN: ${{ secrets.SONAR_TOKEN }}
        with:
          projectBaseDir: RG-Frontend
```

## Known Patterns & Gotchas

1. **Next.js 13 pages router**: This project uses the pages router (not app router). Tests for pages should mock `next/router`, not `next/navigation`. The `jest.setup.ts` handles this.

2. **Module aliases in tsconfig.json**: Check `RG-Frontend/tsconfig.json` for `paths` configuration. The `moduleNameMapper` in `jest.config.ts` must mirror these exactly or imports will fail in tests.

3. **MUI + Emotion**: MUI components use Emotion for styling. Tests may need `@emotion/react` and `@emotion/styled` available. The `next/jest` configuration should handle this automatically.

4. **Apollo Client in tests**: Components using `useQuery`/`useMutation` need an `ApolloProvider` wrapper in tests. Create a test utility:
   ```tsx
   import { MockedProvider } from '@apollo/client/testing';
   const renderWithApollo = (ui, { mocks = [] } = {}) =>
     render(<MockedProvider mocks={mocks}>{ui}</MockedProvider>);
   ```

5. **Redux Provider in tests**: Components connected to Redux store need a `Provider` wrapper. Create a test utility:
   ```tsx
   import { configureStore } from '@reduxjs/toolkit';
   import { Provider } from 'react-redux';
   const renderWithRedux = (ui, { preloadedState = {} } = {}) => {
     const store = configureStore({ reducer: rootReducer, preloadedState });
     return render(<Provider store={store}>{ui}</Provider>);
   };
   ```

6. **MSW v2 API**: If installing MSW v2+, the handler API changed from `rest.get()` to `http.get()` and `graphql.query()` to `graphql.query()` (same name but different import). The templates above use MSW v2 syntax.

7. **Next.js Image component**: `next/image` needs mocking in tests. Add to `jest.setup.ts`:
   ```tsx
   jest.mock('next/image', () => ({
     __esModule: true,
     default: (props: any) => <img {...props} />,
   }));
   ```

8. **Environment variables**: Tests need `NEXT_APP_BACKEND_BASE_URL` defined. Set it in `jest.config.ts` via `globals` or in a `.env.test` file.

## Data Model & Accuracy Notes

1. **Next.js 13 with PAGES router, NOT app router**: This project uses `src/pages/` directory structure. Tests target page components in `src/pages/`, NOT `app/` directory. Route mocking uses `next/router` (not `next/navigation`).

2. **Dual state management**: The frontend uses BOTH Redux Toolkit (`src/store/slices/`) AND some Zustand stores. Test scaffolds need to provide both Redux `Provider` wrapper and any relevant Zustand store initialization.

3. **Two Apollo Client files**: Apollo Client is configured in BOTH `src/store/apollo_client.ts` AND `src/store/apolloClient.ts`. Test mocks must account for both import paths. Components may import from either location.

4. **Axios interceptor auto-refreshes on 401**: The interceptor at `src/store/axiosInstance.ts` automatically fires a GraphQL `userRefreshToken` mutation on 401 responses. Test mocks for Axios must either handle this refresh flow or mock `axiosInstance` entirely to prevent unexpected network calls.

5. **PHI-specific test patterns**: Beyond standard component tests, create tests that verify:
   - PHI (clinical notes, risk scores, keywords) is NOT rendered in raw form in the DOM
   - PHI is NOT stored in `localStorage` or `sessionStorage`
   - PHI is NOT logged to `console.log` or `console.error`
   - Apollo cache does not persist PHI between navigations (use `fetchPolicy: 'no-cache'`)

6. **MSW handler for Graphene-Django GraphQL**: The GraphQL endpoint is at `/api/v1/graphql/` (Graphene-Django, not Apollo Server). MSW handlers should use `graphql.mutation()` and `graphql.query()` with operation names matching the Graphene schema.

7. **Coordination with `mock-external-services` skill**: When creating MSW handlers for testing, align mock response shapes with the patterns defined in the `mock-external-services` skill to ensure consistency between backend unit tests and frontend integration tests.

## Example Invocations

```
/frontend-test-scaffold
/frontend-test-scaffold --step install
/frontend-test-scaffold --step config
/frontend-test-scaffold --step templates
/frontend-test-scaffold --phi-tests
/frontend-test-scaffold --step all
```
