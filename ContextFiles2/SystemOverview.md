# System Overview

## High-Level Context
- Lumy Global pairs clients with care providers, supporting scheduling, video sessions, and payments. Frontend (RG-Frontend) delivers the UX; backend (Lumy-Backend) provides REST/GraphQL APIs, auth, and integrations.

## Architecture Diagram (text)
- Users → RG-Frontend (Next.js, SSR) → REST/GraphQL over HTTPS → Lumy-Backend (Django + DRF/Graphene) → PostgreSQL
- Lumy-Backend ↔ Twilio (video/chat/verify)
- Lumy-Backend ↔ Stripe (payments)
- Lumy-Backend ↔ SendGrid (email)
- Lumy-Backend ↔ Azure Cognitive Search (search/index)
- Static/media assets served from Django `static/` and `media/`.

## Major Components
- RG-Frontend: React UI, Redux store, Axios + Apollo clients, Twilio/Stripe SDKs, Mixpanel analytics.
- Lumy-Backend: Django apps for auth, clients, care providers, calendar, video_conferencing, payments (stripe_integration), manage_pages CMS, GraphQL API, admin site.
- Database: PostgreSQL for persistent data; fixtures provide seed lookups.

## Data Flow
1) Auth: Users authenticate via `/api/v1/authentication/login/` (JWT). Frontend stores tokens and refreshes via GraphQL mutation when needed.
2) Scheduling: Frontend calls calendar endpoints (slots, appointments, rates/session types) to manage availability and bookings; data stored in Postgres.
3) Sessions: Video calls initiated from frontend request Twilio access tokens from `/api/v1/video/conferencing/videocall/accesstoken/`; participants managed via video endpoints; notes persisted via REST.
4) Payments: Stripe keys configured in backend; frontend uses Stripe SDK and backend endpoints/mutations (under stripe_integration) to create customers, intents, and attach cards.
5) Content/Pages: Manage Pages and CMS-like features handled via GraphQL and REST helpers, storing media via Django.

## Environments & Config
- Backend env via `.env` (DB, Twilio, Stripe, SendGrid, Azure, size limits). Frontend env via `.env.local` (backend base URL, OAuth keys, Mixpanel, MailModo, Certn).
- CORS allows all origins by default; adjust for production.

## Risks & Recommendations
- Security: Secret key and DEBUG=true in settings; tighten for production, restrict CORS/CSRF, remove wildcard hosts.
- Observability: No structured logging/metrics; add Sentry or similar plus request/DB logging.
- Testing: Backend has app-level tests but coverage unknown; frontend lacks tests—add Jest/RTL for critical flows.
- Deployment: No CI/CD or container config visible; define reproducible builds (Docker) and pipelines with lint/test gates.
