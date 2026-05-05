# GraphQL Schema Drift: Frontend vs Backend

## Summary
Frontend queries were written for a schema that did not exist in the local backend, causing 400 errors and breaking provider rendering.

## What the Frontend Expected
- `managePagesList` query for landing providers.
- `managePageBySlug` resolver for provider detail pages.
- `cardProfileHandle` for provider href generation.
- Nested navigation structure with `subSubCategory` and `hasData` fields.
- `searchSuggestion.data` objects with `{ suggestion, slugUrl }`.

## What the Local Backend Provided
- `careProviders` (not `managePagesList`).
- No `managePageBySlug` resolver found locally.
- `ManagePages` model lacked a slug field.
- Navigation sub-sub query returned `subCategory` (not `subSubCategory`).
- `searchSuggestion` returned a list of strings, not objects.

## Consequences
- Provider list queries failed or returned unexpected data shape.
- Detail page routing could not resolve slug-based URLs locally.
- UI components rendered empty or with missing fields.

## Fixes Applied (Described)
- Queries rewritten to match local backend schema (fields/args removed or renamed).
- Provider data mapped to the UI’s expected card shape.
- Suggestion strings normalized to expected UI format.
- Navigation grouping updated to align with backend response shape.

## Why Initial Assumptions Were Incorrect
- Assumed production schema existed in local repo.
- Assumed slug-based manage page lookup was available locally.
- Assumed schema parity between production and local Docker stack.

## Lessons Learned
- Treat GraphQL schema as a contract: validate against the running backend.
- Avoid relying on undocumented fields (e.g., slugs) without confirming backend support.
- If production and local diverge, document the delta explicitly.
