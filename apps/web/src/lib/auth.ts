/**
 * Authentication utilities for Admin UI
 *
 * Handles JWT verification and session management.
 */

import { jwtVerify, SignJWT } from 'jose'

// JWT secret - should match backend
const JWT_SECRET = process.env.JWT_SECRET || 'arkon-dev-secret-change-in-production'

export interface JWTClaims {
  sub: string        // user ID
  email: string
  tenant_id: string
  role: 'tenant_admin' | 'team_admin' | 'member'
  teams?: Array<{
    id: string
    role: 'admin' | 'member'
  }>
  iat: number
  exp: number
}

/**
 * Verify JWT token and extract claims
 */
export async function verifyJWT(token: string): Promise<JWTClaims> {
  const secretKey = new TextEncoder().encode(JWT_SECRET)

  const { payload } = await jwtVerify(token, secretKey, {
    algorithms: ['HS256'],
  })

  return payload as unknown as JWTClaims
}

/**
 * Extract claims without verification (for client-side display only)
 * DO NOT use for authorization - use verifyJWT instead
 */
export function extractClaims(token: string): JWTClaims | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null

    const payload = JSON.parse(atob(parts[1]))
    return payload as JWTClaims
  } catch {
    return null
  }
}

/**
 * Check if claims represent an admin user
 */
export function isAdmin(claims: JWTClaims): boolean {
  return claims.role === 'tenant_admin' || claims.role === 'team_admin'
}

/**
 * Check if claims represent a tenant admin
 */
export function isTenantAdmin(claims: JWTClaims): boolean {
  return claims.role === 'tenant_admin'
}

/**
 * Check if user is admin for a specific team
 */
export function isTeamAdmin(claims: JWTClaims, teamId: string): boolean {
  if (claims.role === 'tenant_admin') return true
  if (!claims.teams) return false
  return claims.teams.some(t => t.id === teamId && t.role === 'admin')
}

/**
 * Get auth token from cookies (client-side)
 */
export function getAuthToken(): string | null {
  if (typeof document === 'undefined') return null

  const cookies = document.cookie.split(';')
  for (const cookie of cookies) {
    const [name, value] = cookie.trim().split('=')
    if (name === 'auth_token') {
      return decodeURIComponent(value)
    }
  }
  return null
}

/**
 * Set auth token in cookie
 */
export function setAuthToken(token: string, expiresAt: Date): void {
  if (typeof document === 'undefined') return

  document.cookie = `auth_token=${encodeURIComponent(token)}; expires=${expiresAt.toUTCString()}; path=/; SameSite=Lax`
}

/**
 * Clear auth token cookie
 */
export function clearAuthToken(): void {
  if (typeof document === 'undefined') return

  document.cookie = 'auth_token=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'
}
