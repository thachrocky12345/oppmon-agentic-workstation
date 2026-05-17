// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

/**
 * Credentials Storage Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { homedir } from 'os'
import { join } from 'path'
import { existsSync, unlinkSync, mkdirSync, statSync } from 'fs'
import {
  storeTokens,
  getTokens,
  clearTokens,
  hasCredentials,
  isTokenExpired,
} from '../lib/credentials.js'
import type { AuthTokens } from '../lib/types.js'

const TAG_DIR = join(homedir(), '.tag')
const CREDENTIALS_FILE = join(TAG_DIR, 'credentials.json')

describe('credentials', () => {
  beforeEach(async () => {
    // Clear any existing credentials
    await clearTokens()
  })

  afterEach(async () => {
    await clearTokens()
  })

  describe('storeTokens', () => {
    it('stores tokens successfully', async () => {
      const tokens: AuthTokens = {
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
      }

      await storeTokens(tokens)

      const retrieved = await getTokens()
      expect(retrieved).not.toBeNull()
      expect(retrieved?.accessToken).toBe(tokens.accessToken)
      expect(retrieved?.refreshToken).toBe(tokens.refreshToken)
      expect(retrieved?.expiresAt).toBe(tokens.expiresAt)
    })
  })

  describe('getTokens', () => {
    it('returns null when no tokens stored', async () => {
      const tokens = await getTokens()
      expect(tokens).toBeNull()
    })

    it('returns stored tokens', async () => {
      const tokens: AuthTokens = {
        accessToken: 'my-token',
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
      }

      await storeTokens(tokens)
      const retrieved = await getTokens()

      expect(retrieved).not.toBeNull()
      expect(retrieved?.accessToken).toBe('my-token')
    })
  })

  describe('clearTokens', () => {
    it('clears stored tokens', async () => {
      const tokens: AuthTokens = {
        accessToken: 'test-token',
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
      }

      await storeTokens(tokens)
      expect(await hasCredentials()).toBe(true)

      await clearTokens()
      expect(await hasCredentials()).toBe(false)
    })
  })

  describe('hasCredentials', () => {
    it('returns false when no credentials', async () => {
      expect(await hasCredentials()).toBe(false)
    })

    it('returns true when credentials exist', async () => {
      await storeTokens({
        accessToken: 'test',
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
      })
      expect(await hasCredentials()).toBe(true)
    })
  })

  describe('isTokenExpired', () => {
    it('returns false for valid token', () => {
      const tokens: AuthTokens = {
        accessToken: 'test',
        expiresAt: Math.floor(Date.now() / 1000) + 3600, // Expires in 1 hour
      }
      expect(isTokenExpired(tokens)).toBe(false)
    })

    it('returns true for expired token', () => {
      const tokens: AuthTokens = {
        accessToken: 'test',
        expiresAt: Math.floor(Date.now() / 1000) - 3600, // Expired 1 hour ago
      }
      expect(isTokenExpired(tokens)).toBe(true)
    })

    it('returns true for token expiring within 5 minutes', () => {
      const tokens: AuthTokens = {
        accessToken: 'test',
        expiresAt: Math.floor(Date.now() / 1000) + 60, // Expires in 1 minute
      }
      expect(isTokenExpired(tokens)).toBe(true)
    })
  })

  describe('file fallback', () => {
    it('encrypts credentials in file', async () => {
      // This test verifies the file fallback path when keychain is unavailable
      // The credentials should be encrypted, not plaintext

      const tokens: AuthTokens = {
        accessToken: 'secret-token-12345',
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
      }

      await storeTokens(tokens)

      // If file exists (fallback was used), check it's encrypted
      if (existsSync(CREDENTIALS_FILE)) {
        const { readFileSync } = await import('fs')
        const content = readFileSync(CREDENTIALS_FILE, 'utf8')

        // Content should not contain plaintext token
        expect(content).not.toContain('secret-token-12345')

        // Content should be in encrypted format (iv:authTag:encrypted)
        expect(content.split(':').length).toBe(3)
      }
    })

    it('file has 0600 permissions on Unix', async () => {
      if (process.platform === 'win32') {
        // Skip on Windows
        return
      }

      const tokens: AuthTokens = {
        accessToken: 'test',
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
      }

      await storeTokens(tokens)

      // If file exists (fallback was used), check permissions
      if (existsSync(CREDENTIALS_FILE)) {
        const stats = statSync(CREDENTIALS_FILE)
        const mode = stats.mode & 0o777
        expect(mode).toBe(0o600)
      }
    })
  })
})
