# Frontend Troubleshooting: Providers Not Loading on /en

## Summary
Landing page at `/en` loaded UI but provider cards were missing or empty despite seeded data. Console showed many warnings and repeated GraphQL 400s.

## Symptoms
- Providers list not rendering on `/en`.
- Multiple GraphQL 400 responses from `/api/v1/graphql/`.
- Repeated console warnings/errors:
  - RTK warning: `createSlice.extraReducers` object notation deprecated.
  - Emotion: multiple instances loaded.
  - Selector warnings: non-memoized selectors returning new references.
  - MUI warnings: invalid DOM props (`stroke-width`, `clip-rule`, etc.).
  - MUI warnings: `fullWidth` prop type invalid, `onClick` on child of `IconButton`.
  - MUI `Select` out-of-range value warnings.
  - Controlled/uncontrolled input warnings.
  - Non-unique DOM id warnings.
  - Apollo: `No valid token` and repeated 400s.

## Primary Root Causes (Found)
- GraphQL schema mismatch between frontend queries and backend:
  - Frontend queried fields/args not present locally (e.g., `managePagesList`, `clientCountry`, `clientState`, `subSubCategory` in nested nav, `searchSuggestion.data` object shape).
- Landing list fetch was gated on geolocation; when geo failed, no fetch fired.
- Provider list results used a different backend shape than UI components expected.

## Fixes Applied (Described)
- **Query alignment**: updated GraphQL queries to match backend schema (no new fields invented).
- **Provider list mapping**: mapped `careProviders` response to the card UI shape expected by `ProviderCard`.
- **Geolocation gating removed**: first list fetch now executes without waiting on geo data.
- **Search suggestions normalization**: converted suggestion strings to the UI’s expected `{ suggestion }` shape.
- **Nested nav grouping**: normalized `subCategory` to the UI’s `subSubCategory` shape for grouping.

## Why Initial Assumptions Were Incorrect
- Assumed local backend implemented the same slug and manage page resolvers as production.
- Assumed geolocation was required to fetch providers (it was gating the first fetch).
- Assumed GraphQL schema matched frontend queries (it did not).

## Lessons Learned
- Always confirm the GraphQL schema actually available in the running backend.
- Avoid gating critical data fetches on optional data (e.g., geo).
- When UI expects a specific data shape, map server responses explicitly.
- Use DevTools to identify the exact failing GraphQL operation.
