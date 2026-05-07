/**
 * Next.js Middleware — Authentication Gate
 *
 * Protects /admin routes by verifying the JWT *signature* (not just decoding
 * the payload). The previous implementation used `atob` to read claims
 * without any verification, meaning a forged token with a valid `exp` and
 * `role` would have been accepted. We now use `jose.jwtVerify` with the
 * shared HS256 secret.
 *
 * The secret MUST match the API's JWT_SECRET. In dev both fall back to
 * `development-secret-change-in-production`; in prod the secret must be
 * provided via JWT_SECRET (server-only — Next reads process.env directly
 * inside the edge runtime middleware).
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { jwtVerify } from 'jose'

// Accept both uppercase (current) and lowercase (legacy) role formats.
const ADMIN_ROLES = new Set([
  'SYSTEM_ADMIN',
  'TENANT_ADMIN',
  'TEAM_ADMIN',
  // Legacy / lowercase variants kept for backwards compatibility during
  // rollout. Remove once all clients have re-authenticated.
  'tenant_admin',
  'team_admin',
])

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'development-secret-change-in-production',
)

export async function middleware(request: NextRequest) {
  // Only protect /admin routes
  if (!request.nextUrl.pathname.startsWith('/admin')) {
    return NextResponse.next()
  }

  const token = request.cookies.get('auth_token')?.value

  if (!token) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('redirect', request.nextUrl.pathname)
    return NextResponse.redirect(loginUrl)
  }

  try {
    // jose verifies signature, exp, and nbf in one call. Throws on any
    // failure — the catch below redirects to login.
    const { payload } = await jwtVerify(token, JWT_SECRET, {
      // Issuer is set by the API at sign time; require it here to prevent
      // tokens minted by other services on the same secret from being
      // accepted.
      issuer: 'oppmon',
    })

    const role = typeof payload.role === 'string' ? payload.role : ''
    if (!ADMIN_ROLES.has(role)) {
      return NextResponse.redirect(new URL('/unauthorized', request.url))
    }

    // Forward verified claims to server components via headers.
    const response = NextResponse.next()
    response.headers.set('x-user-id', String(payload.sub ?? ''))
    response.headers.set(
      'x-tenant-id',
      typeof payload.tenantId === 'string' ? payload.tenantId : '',
    )
    response.headers.set('x-role', role)
    if (payload.isSystem === true) {
      response.headers.set('x-is-system', '1')
    }
    return response
  } catch {
    // Bad signature / expired / malformed — back to login.
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('redirect', request.nextUrl.pathname)
    return NextResponse.redirect(loginUrl)
  }
}

export const config = {
  matcher: '/admin/:path*',
}
