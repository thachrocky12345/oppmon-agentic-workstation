# Lumy-Backend APIs (Breadcrumb)

Summary: REST base `/api/v1` exposes auth login, CRUD for clients and care providers, calendar (rates, session types, sessions, appointments, slots, lookups), and video conferencing (Twilio tokens, participants, notes, chat cleanup). GraphQL endpoint `/api/v1/graphql/` hosts broader schema (auth token refresh, payments, manage_pages, etc.). JWT Bearer required for most calls.

Links: [APIs - Lumy-Backend](../APIs-Lumy-Backend.md)

KeyQuestions
- Full payload schemas and permissions per endpoint?
- Which GraphQL mutations correspond to payments/manage_pages flows used by frontend?
- Are there rate limits or idempotency requirements for scheduling endpoints?

NextSteps
- Generate OpenAPI/GraphQL schema docs and add sample requests/responses.
- Add automated API tests per app to lock behavior.
- Review CORS/CSRF and auth on each endpoint before production exposure.
