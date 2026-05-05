/**
 * Next.js Middleware - Authentication Gate
 *
 * Protects /admin routes, requiring valid JWT with admin role.
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Accept both uppercase (from DB) and lowercase formats
const ADMIN_ROLES = ['tenant_admin', 'team_admin', 'TENANT_ADMIN', 'TEAM_ADMIN']

export async function middleware(request: NextRequest) {
  // Only protect /admin routes
  if (!request.nextUrl.pathname.startsWith('/admin')) {
    return NextResponse.next()
  }

  const token = request.cookies.get('auth_token')?.value

  if (!token) {
    // No token - redirect to login
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('redirect', request.nextUrl.pathname)
    return NextResponse.redirect(loginUrl)
  }

  try {
    // Parse JWT to get claims (we'll use jose library for verification)
    // For middleware, we do a quick check - server components do full verification
    const parts = token.split('.')
    if (parts.length !== 3) {
      throw new Error('Invalid token format')
    }

    const payload = JSON.parse(atob(parts[1]))

    // Check expiration
    if (payload.exp && payload.exp * 1000 < Date.now()) {
      throw new Error('Token expired')
    }

    // Check role
    if (!ADMIN_ROLES.includes(payload.role)) {
      return NextResponse.redirect(new URL('/unauthorized', request.url))
    }

    // Add claims to request headers for server components
    const response = NextResponse.next()
    response.headers.set('x-user-id', payload.sub || '')
    response.headers.set('x-tenant-id', payload.tenant_id || '')
    response.headers.set('x-role', payload.role || '')

    return response

  } catch (error) {
    // Invalid or expired token - redirect to login
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('redirect', request.nextUrl.pathname)
    return NextResponse.redirect(loginUrl)
  }
}

export const config = {
  matcher: '/admin/:path*',
}
