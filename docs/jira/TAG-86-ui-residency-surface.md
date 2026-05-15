# TAG-86: UI Residency Surface (Badge + In-Product Docs)

## Description

**Suggested Points:** 3
**Type:** Story
**Epic:** [TAG-78](./TAG-78-residency-governance-hardening-epic.md)
**Status:** Open

The architecture, ADRs, and runbooks make the residency story defensible
to a procurement reviewer reading docs. But end users running queries in
the chat UI today have no visual indication that:

- their data is region-pinned,
- their LLM provider is the one their tenant configured,
- raw content does not leave the boundary.

This story ships the UI surface that maps the architecture to a thing
the user can see and click on. It is what makes the residency story feel
real in the product, not just in markdown.

## Objective

Ship:

1. `apps/web/src/components/ResidencyBadge.tsx` — a compact badge shown in
   the chat header and on admin pages.
2. An in-product documentation page at
   `apps/web/src/app/docs/features/residency/page.tsx`.

```tsx
// expected props shape
<ResidencyBadge
  deploymentMode="saas" | "single-tenant" | "byo-vpc"
  storageRegion="us-east-1"
  llmEndpointRegions={["us-east-1", "eu-west-1"]}
  contentLeavesBoundary={false}
  onClickThrough={() => router.push("/docs/features/residency")}
/>
```

## Requirements

### Badge component

Visible in:

- The chat header (`apps/web/src/app/(dashboard)/chat/page.tsx` and any
  child layout component).
- The admin pages (`apps/web/src/app/(dashboard)/admin/...`).
- The new collections page from TAG-82.

Content (compact mode):

```
[ Residency: SaaS · us-east-1 · content stays in boundary ]
```

Content (expanded on hover/click):

```
Deployment: SaaS (Arkon-operated)
Storage region: us-east-1
LLM endpoints: us-east-1 (Anthropic), eu-west-1 (Azure OpenAI)
Embedding endpoint: api.openai.com (us-east-1 inferred)
Raw content leaves boundary: NO
Telemetry redaction: allowlist-enforced (TAG-84)

→ Click for full residency configuration
```

Click-through opens `/docs/features/residency` with the current
deployment's config pre-loaded.

### Backing API endpoint

The badge gets its values from a new endpoint:

```
GET /api/health/residency
```

Returns:

```jsonc
{
  "deployment_mode": "saas",
  "storage": { "backend": "s3", "region": "us-east-1" },
  "llm_endpoints": [
    { "provider": "anthropic", "region": "us-east-1" },
    { "provider": "azure-openai", "region": "eu-west-1" }
  ],
  "embedding": { "base_url": "api.openai.com", "dim": 1536 },
  "content_leaves_boundary": false,
  "telemetry_redaction": "enforced"
}
```

The endpoint is **read-only** and surfaces values from env + config.
It does NOT echo secret values, only their structural shape.

### In-product docs page

`apps/web/src/app/docs/features/residency/page.tsx` mirrors the highlights
from `docs/residency/architecture.md` but in user-facing language. It
shows:

- The same four procurement questions (where, who else, BYO-VPC, what
  leaves) with the deployment's actual answers.
- Click-through links to the full `docs/residency/` documentation.
- A "report a concern" link to the existing support contact.

### Accessibility

- Badge MUST have a non-color indicator (icon + text) so colorblind users
  see the state.
- Click target ≥ 44×44 px (mobile-friendly).
- `aria-label` matches the expanded content.
- Tested with `@axe-core/playwright` (the repo already has this).

## Implementation Notes

- The badge is a leaf component — wire it into existing layouts rather
  than creating new ones.
- Use the existing `lucide-react` icons (`ShieldCheck` for boundary
  enforced, `Globe` for region).
- The `/api/health/residency` endpoint sits alongside existing health
  endpoints in `apps/api/src/routes/health.ts`.
- Cache the residency-config response client-side for the session
  (`useResidency()` hook with React context). It doesn't change at
  runtime.

## Tests

| File | Test | Assertion |
|---|---|---|
| `apps/web/src/components/ResidencyBadge.test.tsx` | renders SaaS mode | text matches |
| `apps/web/src/components/ResidencyBadge.test.tsx` | renders BYO-VPC mode | text + icon match |
| `apps/web/src/components/ResidencyBadge.test.tsx` | click-through fires callback | callback called |
| `apps/web/src/components/ResidencyBadge.test.tsx` | aria-label correct | matches expanded text |
| `apps/api/src/routes/health.test.ts` | `/api/health/residency` returns expected shape | schema matches |
| `apps/api/src/routes/health.test.ts` | no secret VALUES in response | grep assertion |
| `apps/web/e2e/residency.spec.ts` (Playwright) | badge visible on chat page | element present |
| `apps/web/e2e/residency.spec.ts` | axe scan clean | no violations |

## Acceptance Criteria

- [ ] `ResidencyBadge` rendered in chat header, admin pages, and the
      collections page from TAG-82.
- [ ] `GET /api/health/residency` returns deployment-accurate values with
      no secret values.
- [ ] In-product docs page lives at `/docs/features/residency` with the
      four procurement questions answered against live config.
- [ ] All four unit/integration tests pass plus the two Playwright tests
      (one functional, one a11y).
- [ ] `docs/residency/architecture.md` "UI residency surface" row flipped
      to ✅ with the merged commit SHA.

## Dependencies

**Depends on:**
- [TAG-79](./TAG-79-region-pinned-storage.md) (storage region values to display)
- [TAG-83](./TAG-83-azure-bedrock-llm-clients.md) (LLM provider list to display)
- [TAG-85](./TAG-85-byo-vpc-deployment-package.md) (deployment_mode value)

**Blocks:** — (last visible piece of the epic)

## Risk Factors

| Risk | Mitigation |
|---|---|
| Badge clutters chat header | Compact mode shows one line; expanded only on click/hover. |
| Residency info confuses non-technical users | In-product docs page translates to plain language; the "report a concern" link gives a path forward. |
| `/api/health/residency` accidentally leaks secret values | Tests assert no secret value appears; schema is explicit about what's returned. |
| Badge values drift from real config (e.g. someone changes env without redeploy) | Endpoint reads from process env at request time — there is no cache on the server. |
| a11y violations slip in | `@axe-core/playwright` test is part of the AC. |
