#!/usr/bin/env tsx
// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

/**
 * Generate Master Encryption Key
 *
 * Generates a cryptographically secure 256-bit key for XChaCha20-Poly1305
 * encryption of model secrets.
 *
 * Usage:
 *   pnpm tsx scripts/gen-master-key.ts
 *
 * Output:
 *   A base64-encoded 32-byte key suitable for TAG_ENCRYPTION_MASTER_KEY
 */

import { randomBytes } from 'crypto';

const KEY_LENGTH = 32; // 256 bits

function generateMasterKey(): string {
  const key = randomBytes(KEY_LENGTH);
  return key.toString('base64');
}

function main(): void {
  const key = generateMasterKey();

  console.log('');
  console.log('='.repeat(70));
  console.log('  New Master Encryption Key (TAG_ENCRYPTION_MASTER_KEY)');
  console.log('='.repeat(70));
  console.log('');
  console.log(`  ${key}`);
  console.log('');
  console.log('-'.repeat(70));
  console.log('  IMPORTANT:');
  console.log('  1. Store this key securely (e.g., AWS Secrets Manager, Vault)');
  console.log('  2. Add to your .env file as:');
  console.log(`     TAG_ENCRYPTION_MASTER_KEY="${key}"`);
  console.log('  3. NEVER commit this key to version control');
  console.log('  4. For key rotation, move old key to TAG_ENCRYPTION_LEGACY_KEYS');
  console.log('-'.repeat(70));
  console.log('');

  // Also output in env format for easy copy-paste
  console.log('# Add this to your .env file:');
  console.log(`TAG_ENCRYPTION_MASTER_KEY="${key}"`);
  console.log('');
}

main();
