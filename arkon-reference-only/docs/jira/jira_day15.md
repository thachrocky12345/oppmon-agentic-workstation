# TAG-15: Admin UI: Teams + Members

## Description

**Suggested Points:** 8 (High — authentication gate setup, form validation patterns, audit log query interface, and RBAC enforcement in UI; foundational for all admin features)

## Objective

Build the Admin UI foundation with team management and member management interfaces, implementing authentication gates, form validation, and audit log viewing. This establishes the patterns for all subsequent admin features.

## Requirements

### Authentication Gate
- Next.js middleware protecting all /admin routes
- Redirect to login if unauthenticated
- Check for tenant_admin or team_admin role
- Session management with refresh token rotation
- Logout clears all session data

### Teams Management
- `GET /admin/teams` — List all teams in tenant
- `GET /admin/teams/:id` — Team detail view
- `POST /admin/teams` — Create team (modal form)
- `PUT /admin/teams/:id` — Edit team (inline or modal)
- `DELETE /admin/teams/:id` — Archive team (soft delete, confirmation required)
- Table with pagination, search, and sort

### Members Management
- `GET /admin/teams/:id/members` — List team members
- `POST /admin/teams/:id/members` — Add member (invite by email)
- `PUT /admin/teams/:id/members/:userId` — Change member role
- `DELETE /admin/teams/:id/members/:userId` — Remove from team
- Role selector: admin, member
- Pending invites shown separately

### Form Validation
- Client-side validation with Zod or Yup
- Server-side validation matching client
- Inline error messages
- Disable submit during validation
- Loading states during submission

### Audit Log Query UI
- `GET /admin/audit` — Paginated audit log viewer
- Filters: resource_type, action, date_range, actor
- Detail view showing before/after JSON
- Export to CSV (optional)

## Implementation Notes
- Backend: Admin-specific API routes in apps/api/src/admin/
- Frontend: Next.js app router with server components where appropriate
- CLI: N/A
- Database: Uses existing audit_log table

## Unit Tests

### Required Unit Tests
| Test File | Test Case | Assertion |
|-----------|-----------|-----------|
| `apps/web/src/__tests__/auth-gate.test.ts` | `redirects unauthenticated users` | Redirect to /login |
| `apps/web/src/__tests__/auth-gate.test.ts` | `allows tenant_admin access` | Page renders |
| `apps/web/src/__tests__/auth-gate.test.ts` | `allows team_admin access` | Page renders |
| `apps/web/src/__tests__/auth-gate.test.ts` | `denies member role access` | Redirect to /unauthorized |
| `apps/web/src/__tests__/teams-form.test.ts` | `validates required fields` | Error shown for empty name |
| `apps/web/src/__tests__/teams-form.test.ts` | `submits valid form` | API called, success message |
| `apps/web/src/__tests__/teams-form.test.ts` | `shows server errors` | Error message displayed |
| `apps/web/src/__tests__/members-list.test.ts` | `displays team members` | Members rendered in table |
| `apps/web/src/__tests__/members-list.test.ts` | `role change updates UI` | New role shown after change |
| `apps/web/src/__tests__/audit-log.test.ts` | `renders audit entries` | Log entries displayed |
| `apps/web/src/__tests__/audit-log.test.ts` | `filters by resource type` | Only matching entries shown |

### Test Coverage Requirements
- 90% coverage on authentication gate logic
- 100% coverage on form validation schemas
- All RBAC scenarios tested (admin vs member)

## Integration Tests

### Required Integration Tests
| Test Scenario | Setup | Steps | Expected Result |
|---------------|-------|-------|-----------------|
| `auth gate redirect` | No session | 1. Visit /admin/teams | Redirected to /login |
| `auth gate allow` | Valid admin session | 1. Visit /admin/teams | Page renders |
| `create team` | Admin session | 1. Click Create 2. Fill form 3. Submit | Team created, appears in list |
| `edit team` | Existing team | 1. Click Edit 2. Change name 3. Save | Name updated |
| `delete team` | Existing team | 1. Click Delete 2. Confirm | Team archived |
| `add member` | Empty team | 1. Click Add 2. Enter email 3. Submit | Member added or invite sent |
| `change role` | Team with member | 1. Change role dropdown 2. Save | Role updated |
| `audit log query` | Mutations performed | 1. Open audit log 2. Filter by teams | Team mutations shown |
| `audit log detail` | Entry exists | 1. Click entry | Before/after JSON displayed |

### End-to-End Flows
- Admin login → View teams → Create team → Add members → View audit log
- Team admin login → Denied access to other team's members
- Member login → Redirected to unauthorized

## Authentication Gate Implementation

```typescript
// apps/web/src/middleware.ts

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { verifyJWT, extractClaims } from '@/lib/auth'

const ADMIN_ROLES = ['tenant_admin', 'team_admin']

export async function middleware(request: NextRequest) {
  // Only protect /admin routes
  if (!request.nextUrl.pathname.startsWith('/admin')) {
    return NextResponse.next()
  }

  const token = request.cookies.get('auth_token')?.value

  if (!token) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  try {
    const claims = await verifyJWT(token)

    if (!ADMIN_ROLES.includes(claims.role)) {
      return NextResponse.redirect(new URL('/unauthorized', request.url))
    }

    // Add claims to request headers for server components
    const response = NextResponse.next()
    response.headers.set('x-user-id', claims.sub)
    response.headers.set('x-tenant-id', claims.tenant_id)
    response.headers.set('x-role', claims.role)
    return response

  } catch (error) {
    // Invalid token
    return NextResponse.redirect(new URL('/login', request.url))
  }
}

export const config = {
  matcher: '/admin/:path*',
}
```

## Form Validation Schema

```typescript
// apps/web/src/schemas/team.ts

import { z } from 'zod'

export const createTeamSchema = z.object({
  name: z.string()
    .min(1, 'Team name is required')
    .max(100, 'Team name must be under 100 characters')
    .regex(/^[a-zA-Z0-9\s-]+$/, 'Only letters, numbers, spaces, and hyphens'),
  description: z.string().max(500).optional(),
})

export const addMemberSchema = z.object({
  email: z.string().email('Invalid email address'),
  role: z.enum(['admin', 'member'], {
    required_error: 'Please select a role',
  }),
})

export type CreateTeamInput = z.infer<typeof createTeamSchema>
export type AddMemberInput = z.infer<typeof addMemberSchema>
```

## Acceptance Criteria
1. All /admin routes protected by authentication gate
2. Unauthenticated users redirected to login
3. Non-admin users redirected to unauthorized page
4. Teams CRUD fully functional with validation
5. Members can be added, removed, and role-changed
6. Audit log viewer shows filtered mutations
7. Form validation provides clear error messages
8. All actions create audit log entries

## Review Checklist
- [ ] Does the auth gate check role from JWT, not from client state?
- [ ] Is form validation duplicated on client and server?
- [ ] Can team_admin only see/manage their own teams?
- [ ] Is soft delete used (no hard deletes)?
- [ ] Are audit log queries paginated (not loading all)?
- [ ] Is the session timeout reasonable (and refresh working)?

## Dependencies
- Depends on: Day 1 (auth), Day 2 (audit log)
- Blocks: Day 16 (Skills UI uses same patterns), Day 19 (dashboard uses same patterns)

## Risk Factors
- **Session management complexity** — Mitigation: Use established libraries, thorough testing
- **RBAC bypass via client manipulation** — Mitigation: All checks server-side
- **Large audit log performance** — Mitigation: Pagination, indexing, date range limits
- **Form state management** — Mitigation: Use react-hook-form or similar
