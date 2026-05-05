/**
 * OAuth Device Code Flow Authentication
 *
 * Implements RFC 8628 Device Authorization Grant for CLI authentication.
 */

import { getApiUrl } from './config.js'
import { storeTokens, getTokens, clearTokens, isTokenExpired } from './credentials.js'
import type { AuthTokens, DeviceCodeResponse, TokenResponse, UserInfo } from './types.js'

const DEVICE_CODE_TIMEOUT_MS = 5 * 60 * 1000 // 5 minutes
const MAX_POLL_INTERVAL_MS = 10 * 1000 // 10 seconds

/**
 * Initiate device code flow
 */
export async function initiateDeviceCodeFlow(): Promise<DeviceCodeResponse> {
  const apiUrl = getApiUrl()
  const response = await fetch(`${apiUrl}/api/auth/device/code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  })

  if (!response.ok) {
    throw new Error(`Failed to initiate device code flow: ${response.statusText}`)
  }

  return response.json() as Promise<DeviceCodeResponse>
}

/**
 * Poll for token after user authorizes
 */
export async function pollForToken(
  deviceCode: string,
  interval: number,
  onPoll?: () => void
): Promise<TokenResponse> {
  const apiUrl = getApiUrl()
  const startTime = Date.now()
  let pollInterval = Math.max(interval * 1000, 5000) // At least 5 seconds

  while (Date.now() - startTime < DEVICE_CODE_TIMEOUT_MS) {
    if (onPoll) onPoll()

    const response = await fetch(`${apiUrl}/api/auth/device/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceCode }),
    })

    if (response.ok) {
      return response.json() as Promise<TokenResponse>
    }

    const error = await response.json().catch(() => ({ error: 'unknown' }))

    if (error.error === 'authorization_pending') {
      // User hasn't authorized yet, continue polling
      await sleep(pollInterval)
      // Exponential backoff, max 10 seconds
      pollInterval = Math.min(pollInterval * 1.5, MAX_POLL_INTERVAL_MS)
      continue
    }

    if (error.error === 'slow_down') {
      // Server says slow down
      pollInterval = Math.min(pollInterval * 2, MAX_POLL_INTERVAL_MS)
      await sleep(pollInterval)
      continue
    }

    if (error.error === 'expired_token') {
      throw new Error('Device code expired. Please try again.')
    }

    if (error.error === 'access_denied') {
      throw new Error('Authorization denied by user.')
    }

    throw new Error(`Token request failed: ${error.error || response.statusText}`)
  }

  throw new Error('Device code flow timed out after 5 minutes.')
}

/**
 * Complete the login flow and store tokens
 */
export async function completeLogin(tokenResponse: TokenResponse): Promise<void> {
  const expiresAt = Math.floor(Date.now() / 1000) + tokenResponse.expiresIn

  const tokens: AuthTokens = {
    accessToken: tokenResponse.accessToken,
    refreshToken: tokenResponse.refreshToken,
    expiresAt,
  }

  await storeTokens(tokens)
}

/**
 * Login using headless mode (for CI environments)
 */
export async function loginHeadless(): Promise<void> {
  const token = process.env.TAG_TOKEN || process.env.TOKEN

  if (!token) {
    throw new Error('No token found in environment. Set TAG_TOKEN or TOKEN.')
  }

  // Validate the token by calling /api/auth/me
  const apiUrl = getApiUrl()
  const response = await fetch(`${apiUrl}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!response.ok) {
    throw new Error('Invalid token. Please check your TAG_TOKEN or TOKEN environment variable.')
  }

  // Store with a long expiration (assume CI tokens are long-lived)
  const tokens: AuthTokens = {
    accessToken: token,
    expiresAt: Math.floor(Date.now() / 1000) + 86400 * 365, // 1 year
  }

  await storeTokens(tokens)
}

/**
 * Backend /api/auth/me response format
 */
interface MeResponse {
  user: {
    id: string
    email: string
    name: string | null
    role: string
    tenantId: string
  }
  tenant: {
    id: string
    name: string
    slug: string
  } | null
  teams: Array<{ teamId: string; teamName: string; role: string }>
  createdAt: string
}

/**
 * Get current user info
 */
export async function getCurrentUser(): Promise<UserInfo | null> {
  const tokens = await getTokens()
  if (!tokens) return null

  if (isTokenExpired(tokens)) {
    // Try to refresh if we have a refresh token
    if (tokens.refreshToken) {
      const refreshed = await refreshAccessToken(tokens.refreshToken)
      if (!refreshed) {
        await clearTokens()
        return null
      }
    } else {
      return null
    }
  }

  // Re-get tokens in case they were refreshed
  const currentTokens = await getTokens()
  if (!currentTokens) return null

  const apiUrl = getApiUrl()
  const response = await fetch(`${apiUrl}/api/auth/me`, {
    headers: { Authorization: `Bearer ${currentTokens.accessToken}` },
  })

  if (!response.ok) {
    if (response.status === 401) {
      await clearTokens()
      return null
    }
    throw new Error(`Failed to get user info: ${response.statusText}`)
  }

  const data = (await response.json()) as MeResponse

  // Map backend response to CLI UserInfo format
  return {
    userId: data.user.id,
    email: data.user.email,
    name: data.user.name || '',
    tenantId: data.user.tenantId,
    tenantName: data.tenant?.name || '',
    role: data.user.role,
    teams: data.teams.map(t => ({
      id: t.teamId,
      name: t.teamName,
      role: t.role,
    })),
  }
}

/**
 * Refresh access token
 */
export async function refreshAccessToken(refreshToken: string): Promise<boolean> {
  const apiUrl = getApiUrl()

  try {
    const response = await fetch(`${apiUrl}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    })

    if (!response.ok) {
      return false
    }

    const tokenResponse = (await response.json()) as TokenResponse
    await completeLogin(tokenResponse)
    return true
  } catch {
    return false
  }
}

/**
 * Logout - clear all credentials
 */
export async function logout(): Promise<void> {
  await clearTokens()
}

/**
 * Check if user is authenticated
 */
export async function isAuthenticated(): Promise<boolean> {
  const tokens = await getTokens()
  if (!tokens) return false

  if (isTokenExpired(tokens)) {
    if (tokens.refreshToken) {
      return await refreshAccessToken(tokens.refreshToken)
    }
    return false
  }

  return true
}

/**
 * Get access token for API calls
 */
export async function getAccessToken(): Promise<string | null> {
  const tokens = await getTokens()
  if (!tokens) return null

  if (isTokenExpired(tokens)) {
    if (tokens.refreshToken) {
      const refreshed = await refreshAccessToken(tokens.refreshToken)
      if (!refreshed) return null
      const newTokens = await getTokens()
      return newTokens?.accessToken ?? null
    }
    return null
  }

  return tokens.accessToken
}

/**
 * Sleep helper
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
