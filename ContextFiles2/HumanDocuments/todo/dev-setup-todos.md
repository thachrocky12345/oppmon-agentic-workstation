# Dev Setup TODOs

## Frontend
- Memoize selectors that return new references to stop unnecessary rerenders.
- Fix duplicate DOM IDs in forms (e.g., `email`, `firstName`, `city`, etc.).
- Fix invalid SVG prop casing (`strokeWidth`, `strokeLinejoin`, `fillRule`, `clipRule`, `strokeLinecap`).
- Fix controlled/uncontrolled input warnings (inputs and RadioGroup).
- Convert `createSlice.extraReducers` object notation to builder callback syntax.
- Investigate duplicate `@emotion/react` instance warning (resolve dependency/alias).
- Fix MUI `IconButton` child onClick warning in `landing-screen/profile-settings`.
- Fix `TopHeader` list key warning.

## Backend
- Add proper fixtures for issuing organizations + related models so certificate levels can load.
- Decide if GraphQL should allow anonymous in non-dev; document policy.

## Integration
- Determine why `/api/v1/manage/pages/*` endpoints are missing in prod and decide on long-term source for currencies/exchange rates.
