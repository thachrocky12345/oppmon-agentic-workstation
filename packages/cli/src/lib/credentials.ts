// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

/**
 * Secure Credential Storage
 *
 * Primary: Platform keychain (macOS Keychain, Windows Credential Manager, libsecret)
 * Fallback: Encrypted file at ~/.tag/credentials.json with 0600 permissions
 */

import { homedir } from 'os'
import { join } from 'path'
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, chmodSync } from 'fs'
import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto'
import type { AuthTokens } from './types.js'

const SERVICE_NAME = 'tag-gateway'
const ACCOUNT_NAME = 'default'
const TAG_DIR = join(homedir(), '.tag')
const CREDENTIALS_FILE = join(TAG_DIR, 'credentials.json')

// For encryption fallback
const ALGORITHM = 'aes-256-gcm'
const KEY_LENGTH = 32
const IV_LENGTH = 16
const AUTH_TAG_LENGTH = 16

let keytar: typeof import('keytar') | null = null

/**
 * Try to load keytar for keychain access
 */
async function loadKeytar(): Promise<typeof import('keytar') | null> {
  if (keytar !== null) return keytar

  try {
    // Dynamic import to handle environments where keytar isn't available
    keytar = await import('keytar')
    return keytar
  } catch {
    // Keytar not available (e.g., missing native dependencies)
    return null
  }
}

/**
 * Generate encryption key from machine-specific identifier
 */
function getEncryptionKey(): Buffer {
  // Use machine-specific data for key derivation
  const machineId = `${homedir()}-${process.platform}-${process.arch}`
  return createHash('sha256').update(machineId).digest()
}

/**
 * Encrypt data for file storage
 */
function encrypt(data: string): string {
  const key = getEncryptionKey()
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv)

  let encrypted = cipher.update(data, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  const authTag = cipher.getAuthTag()

  // Format: iv:authTag:encryptedData
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`
}

/**
 * Decrypt data from file storage
 */
function decrypt(encryptedData: string): string {
  const key = getEncryptionKey()
  const parts = encryptedData.split(':')

  if (parts.length !== 3) {
    throw new Error('Invalid encrypted data format')
  }

  const iv = Buffer.from(parts[0], 'hex')
  const authTag = Buffer.from(parts[1], 'hex')
  const encrypted = parts[2]

  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)

  let decrypted = decipher.update(encrypted, 'hex', 'utf8')
  decrypted += decipher.final('utf8')

  return decrypted
}

/**
 * Ensure ~/.tag directory exists
 */
function ensureTagDir(): void {
  if (!existsSync(TAG_DIR)) {
    mkdirSync(TAG_DIR, { recursive: true, mode: 0o700 })
  }
}

/**
 * Store tokens using keychain (primary) or encrypted file (fallback)
 */
export async function storeTokens(tokens: AuthTokens): Promise<void> {
  const kt = await loadKeytar()
  const tokenData = JSON.stringify(tokens)

  if (kt) {
    try {
      await kt.setPassword(SERVICE_NAME, ACCOUNT_NAME, tokenData)
      return
    } catch {
      // Fall through to file-based storage
    }
  }

  // Fallback: encrypted file
  ensureTagDir()
  const encrypted = encrypt(tokenData)
  writeFileSync(CREDENTIALS_FILE, encrypted, { encoding: 'utf8', mode: 0o600 })

  // Ensure permissions on Unix
  if (process.platform !== 'win32') {
    chmodSync(CREDENTIALS_FILE, 0o600)
  }
}

/**
 * Retrieve tokens from keychain or encrypted file
 */
export async function getTokens(): Promise<AuthTokens | null> {
  const kt = await loadKeytar()

  if (kt) {
    try {
      const tokenData = await kt.getPassword(SERVICE_NAME, ACCOUNT_NAME)
      if (tokenData) {
        return JSON.parse(tokenData) as AuthTokens
      }
    } catch {
      // Fall through to file-based storage
    }
  }

  // Fallback: try encrypted file
  if (existsSync(CREDENTIALS_FILE)) {
    try {
      const encrypted = readFileSync(CREDENTIALS_FILE, 'utf8')
      const decrypted = decrypt(encrypted)
      return JSON.parse(decrypted) as AuthTokens
    } catch {
      // Corrupted file, remove it
      try {
        unlinkSync(CREDENTIALS_FILE)
      } catch {
        // Ignore
      }
      return null
    }
  }

  return null
}

/**
 * Clear all stored credentials
 */
export async function clearTokens(): Promise<void> {
  const kt = await loadKeytar()

  if (kt) {
    try {
      await kt.deletePassword(SERVICE_NAME, ACCOUNT_NAME)
    } catch {
      // Ignore
    }
  }

  // Also clear file if exists
  if (existsSync(CREDENTIALS_FILE)) {
    try {
      unlinkSync(CREDENTIALS_FILE)
    } catch {
      // Ignore
    }
  }
}

/**
 * Check if credentials are stored
 */
export async function hasCredentials(): Promise<boolean> {
  const tokens = await getTokens()
  return tokens !== null
}

/**
 * Check if tokens are expired
 */
export function isTokenExpired(tokens: AuthTokens): boolean {
  const now = Math.floor(Date.now() / 1000)
  // Add 5 minute buffer
  return tokens.expiresAt <= now + 300
}

/**
 * Check which storage method is being used
 */
export async function getStorageMethod(): Promise<'keychain' | 'file'> {
  const kt = await loadKeytar()
  if (kt) {
    try {
      // Test if keychain is accessible
      await kt.getPassword(SERVICE_NAME, 'test-access')
      return 'keychain'
    } catch {
      return 'file'
    }
  }
  return 'file'
}

// Cache for synchronous access
let cachedTokens: AuthTokens | null = null
let cacheLoaded = false

/**
 * Load tokens into cache (call this during init)
 */
export async function loadTokensCache(): Promise<void> {
  cachedTokens = await getTokens()
  cacheLoaded = true
}

/**
 * Synchronous check if authenticated (uses cache)
 */
export function isAuthenticated(): boolean {
  if (!cacheLoaded) {
    // Warn but don't block - cache should be loaded at startup
    console.warn('Warning: Token cache not loaded. Call loadTokensCache() first.')
    return false
  }
  return cachedTokens !== null && !isTokenExpired(cachedTokens)
}

/**
 * Get access token synchronously (uses cache)
 */
export function getAccessToken(): string | null {
  if (!cacheLoaded || !cachedTokens) {
    return null
  }
  if (isTokenExpired(cachedTokens)) {
    return null
  }
  return cachedTokens.accessToken
}

/**
 * Update the token cache after storing new tokens
 */
export async function updateTokenCache(tokens: AuthTokens): Promise<void> {
  await storeTokens(tokens)
  cachedTokens = tokens
  cacheLoaded = true
}

/**
 * Clear token cache when logging out
 */
export async function clearTokenCache(): Promise<void> {
  await clearTokens()
  cachedTokens = null
}
