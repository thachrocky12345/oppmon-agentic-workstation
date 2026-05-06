/**
 * Secret Vault
 * Secure encryption/decryption service for model credentials
 * Uses XChaCha20-Poly1305 via tweetnacl for authenticated encryption
 */

import nacl from 'tweetnacl';
import { prisma } from '@oppmon/database';
import { createId } from '@paralleldrive/cuid2';

// ============================================================================
// Types
// ============================================================================

export interface EncryptedPayload {
  ciphertext: Buffer;
  nonce: Buffer;
  version: number;
}

export interface SecretData {
  [key: string]: string;
}

export interface RotationResult {
  rotated: number;
  failed: number;
  errors: Array<{ id: string; error: string }>;
}

// ============================================================================
// Configuration
// ============================================================================

const KEY_VERSION = 1;

/**
 * Get the master encryption key from environment
 * Must be 32 bytes (256 bits) base64-encoded
 */
function getMasterKey(): Uint8Array {
  const keyBase64 = process.env.TAG_ENCRYPTION_MASTER_KEY;

  if (!keyBase64) {
    throw new Error(
      'TAG_ENCRYPTION_MASTER_KEY environment variable is not set. ' +
      'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"'
    );
  }

  const key = Buffer.from(keyBase64, 'base64');

  if (key.length !== nacl.secretbox.keyLength) {
    throw new Error(
      `TAG_ENCRYPTION_MASTER_KEY must be ${nacl.secretbox.keyLength} bytes (${nacl.secretbox.keyLength * 8} bits). ` +
      `Got ${key.length} bytes. Generate a new key with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
    );
  }

  return new Uint8Array(key);
}

/**
 * Get legacy keys for rotation (comma-separated base64 keys)
 * Oldest first, newest last
 */
function getLegacyKeys(): Uint8Array[] {
  const legacyKeysStr = process.env.TAG_ENCRYPTION_LEGACY_KEYS;

  if (!legacyKeysStr) {
    return [];
  }

  return legacyKeysStr
    .split(',')
    .map((k) => k.trim())
    .filter((k) => k.length > 0)
    .map((keyBase64) => {
      const key = Buffer.from(keyBase64, 'base64');
      if (key.length !== nacl.secretbox.keyLength) {
        throw new Error(`Invalid legacy key length: ${key.length} bytes`);
      }
      return new Uint8Array(key);
    });
}

// ============================================================================
// Core Encryption Functions
// ============================================================================

/**
 * Encrypt secret data using XChaCha20-Poly1305
 * @param data - Object containing secret key-value pairs
 * @returns Encrypted payload with ciphertext, nonce, and version
 */
export function encrypt(data: SecretData): EncryptedPayload {
  const masterKey = getMasterKey();

  // Serialize data to JSON
  const plaintext = Buffer.from(JSON.stringify(data), 'utf-8');

  // Generate random nonce (24 bytes for XChaCha20-Poly1305)
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);

  // Encrypt
  const ciphertext = nacl.secretbox(new Uint8Array(plaintext), nonce, masterKey);

  if (!ciphertext) {
    throw new Error('Encryption failed');
  }

  return {
    ciphertext: Buffer.from(ciphertext),
    nonce: Buffer.from(nonce),
    version: KEY_VERSION,
  };
}

/**
 * Decrypt secret data
 * Tries current key first, then legacy keys for rotation support
 * @param encrypted - Encrypted payload
 * @returns Decrypted secret data
 */
export function decrypt(encrypted: EncryptedPayload): SecretData {
  const keysToTry = [getMasterKey(), ...getLegacyKeys()];

  for (const key of keysToTry) {
    try {
      const plaintext = nacl.secretbox.open(
        new Uint8Array(encrypted.ciphertext),
        new Uint8Array(encrypted.nonce),
        key
      );

      if (plaintext) {
        const json = Buffer.from(plaintext).toString('utf-8');
        return JSON.parse(json) as SecretData;
      }
    } catch {
      // Try next key
      continue;
    }
  }

  throw new Error('Decryption failed: no valid key found');
}

// ============================================================================
// Database Operations
// ============================================================================

/**
 * Store encrypted secrets in database
 * @param tenantId - Tenant ID
 * @param secrets - Secret data to encrypt and store
 * @returns Model secret ID (reference)
 */
export async function storeSecret(
  tenantId: string,
  secrets: SecretData
): Promise<string> {
  const encrypted = encrypt(secrets);

  const modelSecret = await prisma.modelSecret.create({
    data: {
      id: createId(),
      tenantId,
      encryptedPayload: encrypted.ciphertext,
      nonce: encrypted.nonce,
      version: encrypted.version,
    },
  });

  return modelSecret.id;
}

/**
 * Retrieve and decrypt secrets from database
 * @param secretRef - Model secret ID
 * @returns Decrypted secret data
 */
export async function retrieveSecret(secretRef: string): Promise<SecretData> {
  const modelSecret = await prisma.modelSecret.findUnique({
    where: { id: secretRef },
  });

  if (!modelSecret) {
    throw new Error(`Secret not found: ${secretRef}`);
  }

  return decrypt({
    ciphertext: modelSecret.encryptedPayload,
    nonce: modelSecret.nonce,
    version: modelSecret.version,
  });
}

/**
 * Update existing secret with new data
 * @param secretRef - Model secret ID
 * @param secrets - New secret data
 */
export async function updateSecret(
  secretRef: string,
  secrets: SecretData
): Promise<void> {
  const encrypted = encrypt(secrets);

  await prisma.modelSecret.update({
    where: { id: secretRef },
    data: {
      encryptedPayload: encrypted.ciphertext,
      nonce: encrypted.nonce,
      version: encrypted.version,
    },
  });
}

/**
 * Delete a secret from database
 * @param secretRef - Model secret ID
 */
export async function deleteSecret(secretRef: string): Promise<void> {
  // First check if any models reference this secret
  const referencingModels = await prisma.model.count({
    where: { secretRef },
  });

  if (referencingModels > 0) {
    throw new Error(
      `Cannot delete secret ${secretRef}: still referenced by ${referencingModels} model(s)`
    );
  }

  await prisma.modelSecret.delete({
    where: { id: secretRef },
  });
}

// ============================================================================
// Key Rotation
// ============================================================================

/**
 * Rotate all secrets to use the current master key
 * Should be run after updating TAG_ENCRYPTION_MASTER_KEY
 * and moving the old key to TAG_ENCRYPTION_LEGACY_KEYS
 *
 * @returns Rotation result with counts and any errors
 */
export async function rotateMasterKey(): Promise<RotationResult> {
  const result: RotationResult = {
    rotated: 0,
    failed: 0,
    errors: [],
  };

  // Get all secrets
  const allSecrets = await prisma.modelSecret.findMany();

  for (const secret of allSecrets) {
    try {
      // Decrypt with any valid key (current or legacy)
      const decrypted = decrypt({
        ciphertext: secret.encryptedPayload,
        nonce: secret.nonce,
        version: secret.version,
      });

      // Re-encrypt with current master key
      const reEncrypted = encrypt(decrypted);

      // Update in database
      await prisma.modelSecret.update({
        where: { id: secret.id },
        data: {
          encryptedPayload: reEncrypted.ciphertext,
          nonce: reEncrypted.nonce,
          version: reEncrypted.version,
        },
      });

      result.rotated++;
    } catch (error) {
      result.failed++;
      result.errors.push({
        id: secret.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  return result;
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Validate that the encryption configuration is correct
 * Throws if there are any issues
 */
export function validateEncryptionConfig(): void {
  // Try to get master key
  getMasterKey();

  // Try to get legacy keys (if any)
  getLegacyKeys();

  // Test encrypt/decrypt roundtrip
  const testData: SecretData = { test: 'value' };
  const encrypted = encrypt(testData);
  const decrypted = decrypt(encrypted);

  if (decrypted.test !== testData.test) {
    throw new Error('Encryption roundtrip test failed');
  }
}

/**
 * Check if encryption is configured
 * Returns false if master key is not set (doesn't throw)
 */
export function isEncryptionConfigured(): boolean {
  try {
    getMasterKey();
    return true;
  } catch {
    return false;
  }
}
