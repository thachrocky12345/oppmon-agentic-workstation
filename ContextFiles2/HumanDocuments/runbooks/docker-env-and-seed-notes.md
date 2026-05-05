# Docker/Env/Seed Notes: Why Prod vs Local Behaves Differently

## Summary
The local Docker stack and production API are not schema-identical. This caused confusion when comparing working production links to local failures.

## Key Findings
- Local stack uses `docker-compose.yml` with services: `db`, `backend`, `frontend`.
- Frontend environment values can point either to local or production GraphQL endpoints.
- Production API calls were visible in DevTools in a separate context, which can mask local schema issues.

## Common Pitfalls
- Assuming local backend is identical to production.
- Debugging frontend issues against production logs instead of local traffic.
- Seeded provider data exists, but frontend queries fail if schema mismatches.

## Fixes/Actions Taken (Described)
- Verified which GraphQL endpoint the frontend is actually using.
- Aligned frontend queries to the local backend schema to avoid 400s.
- Removed geolocation gating so seeded providers appear even if geo fails.

## Why Initial Assumptions Were Incorrect
- Assumed schema parity between prod and local.
- Assumed seeded data guarantees frontend visibility without query compatibility.

## Lessons Learned
- Always verify GraphQL endpoint in DevTools before debugging.
- Seeded data is only useful if queries match the backend schema.
- Document schema differences between prod and local environments.
- Docker restarts may require elevated permissions; if a container restart is necessary to validate changes, request escalation promptly.
