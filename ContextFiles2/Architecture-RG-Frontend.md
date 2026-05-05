# Architecture - RG-Frontend

## Framework & Runtime
- Next.js 13 (pages router) on React 18 with TypeScript; SSR/SSG supported via `src/pages`.
- Styling via MUI + Emotion; localization via Next-Intl; analytics via Mixpanel.
- State: Redux Toolkit slices in `src/store/slices` and legacy `src/store/slicess`; Redux Thunk middleware; some Zustand usage possible but primary store is Redux.
- Data: Apollo Client for GraphQL, Axios wrappers for REST (`src/store/axiosInstance.ts`) with JWT interceptors and refresh via GraphQL mutation.

## Folder Structure (selected)
- `src/pages/` route entries and API routes; `_app.tsx` composes providers.
- `src/components/`, `src/containers/` reusable UI and page-level assemblies.
- `src/store/` Redux store config, slices, Axios/Apollo clients, token helpers.
- `src/graphql/` queries/mutations; `src/restapis/` imperative REST helpers.
- `src/hooks/`, `src/contexts/` custom hooks and React context providers.
- `src/styles/`, `src/assets/` shared styles and static assets.
- `src/lib/constants.ts` shared constants including backend URLs and endpoint fragments.

## Data Flow & Auth
- JWTs stored client-side; Axios request interceptor injects Bearer token and auto-refreshes using GraphQL `userRefreshToken` mutation. 401 responses trigger refresh and retry.
- REST calls use `BASE_API_URL` (`NEXT_APP_BACKEND_BASE_URL` + `/api/v1`). GraphQL uses `API_URL` pointing to `/api/v1/graphql/`.
- Video and chat rely on Twilio SDKs; payments integrate Stripe via client SDKs.

## Routing & UI Composition
- Page components import containers/components; data fetched in hooks or effectful components via Axios or Apollo.
- Global providers (Redux store, Intl) wired in `_app.tsx`; theming via MUI/Emotion caches.
- Form handling with React Hook Form + Yup; some legacy Formik usage may appear.

## Error Handling & Observability
- Axios interceptors standardize auth errors; components typically handle loading/errors locally. Extend with toasts from `react-toastify`.
- Mixpanel events configured under `src/mixPanelEvents/`; ensure PII is scrubbed before emitting.

## Build & Quality
- Scripts: `yarn dev`, `yarn build`, `yarn start`, `yarn lint`, `yarn format`, `yarn check-types`, `yarn test-all`.
- ESLint (`eslint-config-next`, `eslint-config-prettier`) and Prettier format code; TypeScript config in `tsconfig.json`.

## Integration Points
- Talks to Lumy-Backend REST endpoints defined in `src/lib/constants.ts` and `src/restapis/api.js` for manage pages, consent, payments, and calendar/video flows.
- GraphQL queries/mutations live in `src/graphql`; Apollo client setup in `src/store/apollo_client.ts` and `src/store/apolloClient.ts` for SSR compatibility.
