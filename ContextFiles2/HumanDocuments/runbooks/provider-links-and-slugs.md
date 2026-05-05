# Provider Slugs and Links: How It Should Work

## Intended Flow (Product)
1) Care Provider completes onboarding and creates a Manage Page.
2) Manage Page produces a slug or handle (e.g., `alinaflorea`).
3) Landing cards use that slug as the href.
4) Detail pages resolve the slug via a GraphQL resolver (e.g., `managePageBySlug`).

## Observed in Local Stack
- Local backend does not expose `managePageBySlug`.
- Local `ManagePages` model does not include a slug field.
- Frontend was still routing based on slugs, leading to `/en` being treated as a slug.

## Fixes Applied (Described)
- Routing logic made locale-aware so `/en/<slug>` is parsed correctly.
- Provider links now use the current locale prefix with the provider handle.
- Added fallback detail loading by id when slug resolution is missing.

## Why Initial Assumptions Were Incorrect
- Assumed slug-based resolver exists in local backend.
- Assumed slug field is persisted in local ManagePages.
- Assumed locale prefix handling was already correct in catch-all routing.

## Lessons Learned
- Slug and locale handling must be explicit in catch-all routes.
- Don’t assume slug-based detail resolution unless the backend provides it.
- If slug resolution is missing, provide a safe fallback (id-based lookup).
