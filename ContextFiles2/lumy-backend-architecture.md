# Lumy-Backend Architecture (Breadcrumb)

Summary: Django 4.2 with DRF and Graphene-Django; JWT auth via SimpleJWT and GraphQL JWT; Postgres DB; apps for auth, clients, care providers, calendar (rates/slots/appointments), video_conferencing (Twilio), stripe_integration (payments), manage_pages (CMS), graphqlapp (schema). Config in `lumy_global/settings.py`; REST routes under `/api/v1/*`; GraphQL at `/api/v1/graphql/`.

Links: [Architecture - Lumy-Backend](../Architecture-Lumy-Backend.md)

KeyQuestions
- Which endpoints are GraphQL-only (payments/manage_pages) versus REST?
- How are permissions enforced across apps (per-view auth classes/permissions)?
- What is the deployment/hosting model and logging/monitoring strategy?

NextSteps
- Tighten prod settings (DEBUG false, restrict CORS/hosts, rotate SECRET_KEY).
- Add permission classes and rate limiting where missing.
- Document GraphQL schema fields and mutations per domain.
