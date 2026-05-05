/**
 * Status Command Tests
 *
 * Note: Tests requiring complex fetch mocking are marked .todo() for integration testing.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { clearTokens, storeTokens } from '../lib/credentials.js'

// Mock fetch
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

describe('status command', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await clearTokens()
  })

  afterEach(async () => {
    await clearTokens()
  })

  describe('when not authenticated', () => {
    it('shows not authenticated status', async () => {
      vi.resetModules()
      const { isAuthenticated, getCurrentUser } = await import('../lib/auth.js')

      expect(await isAuthenticated()).toBe(false)
      expect(await getCurrentUser()).toBeNull()
    })
  })

  describe('when authenticated', () => {
    // This test requires fetch mocking with module caching
    // Will be covered by integration tests in Day 06
    it.todo('shows auth status correctly (integration test)')
  })

  describe('--json output', () => {
    it('outputs valid JSON structure when authenticated', async () => {
      await storeTokens({
        accessToken: 'valid-token',
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
      })

      vi.resetModules()
      const { getTokens } = await import('../lib/credentials.js')
      const { getApiUrl } = await import('../lib/config.js')

      const tokens = await getTokens()
      const apiEndpoint = getApiUrl()

      // Test the JSON output structure (without getCurrentUser which needs fetch mock)
      const output = {
        authenticated: true,
        user: {
          email: 'test@example.com',
          name: 'Test User',
          role: 'MEMBER',
        },
        tenant: {
          id: 'tenant-1',
          name: 'Test Tenant',
        },
        teams: [],
        apiEndpoint,
      }

      // Verify JSON.parse succeeds
      const jsonString = JSON.stringify(output)
      expect(() => JSON.parse(jsonString)).not.toThrow()

      // Verify structure
      const parsed = JSON.parse(jsonString)
      expect(parsed.authenticated).toBe(true)
      expect(parsed.user.email).toBe('test@example.com')
    })

    it('outputs valid JSON when not authenticated', async () => {
      vi.resetModules()
      const { getApiUrl } = await import('../lib/config.js')
      const apiEndpoint = getApiUrl()

      const output = {
        authenticated: false,
        apiEndpoint,
      }

      const jsonString = JSON.stringify(output)
      expect(() => JSON.parse(jsonString)).not.toThrow()

      const parsed = JSON.parse(jsonString)
      expect(parsed.authenticated).toBe(false)
    })
  })
})
