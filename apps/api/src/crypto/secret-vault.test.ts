/**
 * Secret Vault Tests
 * Tests for the encryption/decryption service
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { encrypt, decrypt, isEncryptionConfigured, validateEncryptionConfig } from './secret-vault.js';

describe('Secret Vault', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    // Set a valid 32-byte test key
    process.env.TAG_ENCRYPTION_MASTER_KEY = Buffer.alloc(32, 'testkey!').toString('base64');
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('encrypt', () => {
    it('encrypts data and returns a valid payload', () => {
      const data = { api_key: 'sk-test-123', secret: 'my-secret' };

      const encrypted = encrypt(data);

      expect(encrypted).toHaveProperty('ciphertext');
      expect(encrypted).toHaveProperty('nonce');
      expect(encrypted).toHaveProperty('version');
      expect(encrypted.ciphertext).toBeInstanceOf(Buffer);
      expect(encrypted.nonce).toBeInstanceOf(Buffer);
      expect(encrypted.nonce.length).toBe(24); // XChaCha20 nonce length
      expect(encrypted.version).toBe(1);
    });

    it('produces different ciphertexts for same plaintext (random nonce)', () => {
      const data = { api_key: 'sk-test-123' };

      const encrypted1 = encrypt(data);
      const encrypted2 = encrypt(data);

      // Nonces should be different
      expect(encrypted1.nonce.equals(encrypted2.nonce)).toBe(false);
      // Ciphertexts should be different
      expect(encrypted1.ciphertext.equals(encrypted2.ciphertext)).toBe(false);
    });

    it('throws when master key is not set', () => {
      delete process.env.TAG_ENCRYPTION_MASTER_KEY;

      expect(() => encrypt({ test: 'value' })).toThrow('TAG_ENCRYPTION_MASTER_KEY');
    });

    it('throws when master key is wrong length', () => {
      process.env.TAG_ENCRYPTION_MASTER_KEY = Buffer.alloc(16, 'short').toString('base64');

      expect(() => encrypt({ test: 'value' })).toThrow('must be 32 bytes');
    });
  });

  describe('decrypt', () => {
    it('decrypts data correctly', () => {
      const original = { api_key: 'sk-test-123', secret: 'my-secret' };
      const encrypted = encrypt(original);

      const decrypted = decrypt(encrypted);

      expect(decrypted).toEqual(original);
    });

    it('handles empty objects', () => {
      const original = {};
      const encrypted = encrypt(original);

      const decrypted = decrypt(encrypted);

      expect(decrypted).toEqual(original);
    });

    it('handles special characters in values', () => {
      const original = {
        api_key: 'sk-test-with-special-chars!@#$%^&*()',
        unicode: 'Hello \u2764 World',
        json: '{"nested": "value"}',
      };
      const encrypted = encrypt(original);

      const decrypted = decrypt(encrypted);

      expect(decrypted).toEqual(original);
    });

    it('throws on tampered ciphertext', () => {
      const encrypted = encrypt({ api_key: 'test' });

      // Tamper with ciphertext
      encrypted.ciphertext[0] ^= 0xff;

      expect(() => decrypt(encrypted)).toThrow('Decryption failed');
    });

    it('throws on tampered nonce', () => {
      const encrypted = encrypt({ api_key: 'test' });

      // Tamper with nonce
      encrypted.nonce[0] ^= 0xff;

      expect(() => decrypt(encrypted)).toThrow('Decryption failed');
    });

    it('throws with wrong key', () => {
      const encrypted = encrypt({ api_key: 'test' });

      // Change to different key
      process.env.TAG_ENCRYPTION_MASTER_KEY = Buffer.alloc(32, 'wrongkey').toString('base64');

      expect(() => decrypt(encrypted)).toThrow('Decryption failed');
    });
  });

  describe('key rotation', () => {
    it('decrypts with legacy key when current key fails', () => {
      const originalKey = Buffer.alloc(32, 'original').toString('base64');
      const newKey = Buffer.alloc(32, 'newkey!!').toString('base64');

      // Encrypt with original key
      process.env.TAG_ENCRYPTION_MASTER_KEY = originalKey;
      const encrypted = encrypt({ api_key: 'legacy-secret' });

      // Switch to new key with original as legacy
      process.env.TAG_ENCRYPTION_MASTER_KEY = newKey;
      process.env.TAG_ENCRYPTION_LEGACY_KEYS = originalKey;

      // Should still decrypt
      const decrypted = decrypt(encrypted);

      expect(decrypted).toEqual({ api_key: 'legacy-secret' });
    });

    it('supports multiple legacy keys', () => {
      const oldestKey = Buffer.alloc(32, 'oldest!!').toString('base64');
      const middleKey = Buffer.alloc(32, 'middle!!').toString('base64');
      const currentKey = Buffer.alloc(32, 'current!').toString('base64');

      // Encrypt with oldest key
      process.env.TAG_ENCRYPTION_MASTER_KEY = oldestKey;
      const encrypted = encrypt({ api_key: 'ancient-secret' });

      // Set up key chain
      process.env.TAG_ENCRYPTION_MASTER_KEY = currentKey;
      process.env.TAG_ENCRYPTION_LEGACY_KEYS = `${middleKey},${oldestKey}`;

      // Should still decrypt
      const decrypted = decrypt(encrypted);

      expect(decrypted).toEqual({ api_key: 'ancient-secret' });
    });
  });

  describe('isEncryptionConfigured', () => {
    it('returns true when key is set', () => {
      expect(isEncryptionConfigured()).toBe(true);
    });

    it('returns false when key is not set', () => {
      delete process.env.TAG_ENCRYPTION_MASTER_KEY;

      expect(isEncryptionConfigured()).toBe(false);
    });
  });

  describe('validateEncryptionConfig', () => {
    it('passes when configuration is valid', () => {
      expect(() => validateEncryptionConfig()).not.toThrow();
    });

    it('throws when key is missing', () => {
      delete process.env.TAG_ENCRYPTION_MASTER_KEY;

      expect(() => validateEncryptionConfig()).toThrow('TAG_ENCRYPTION_MASTER_KEY');
    });

    it('throws when legacy key has wrong length', () => {
      process.env.TAG_ENCRYPTION_LEGACY_KEYS = Buffer.alloc(16, 'short').toString('base64');

      expect(() => validateEncryptionConfig()).toThrow('Invalid legacy key length');
    });
  });
});
