#!/usr/bin/env node
/**
 * TAG-54 cross-language fixture generator.
 *
 * Encrypts a payload using the exact same `tweetnacl.secretbox` call
 * apps/api/src/crypto/secret-vault.ts uses, and prints
 * `{ciphertext, nonce, plaintext}` as JSON on stdout.
 *
 * The Python integration script then b64-decodes ciphertext/nonce,
 * feeds them to `decrypt_secret`, and asserts the result matches
 * the round-trip plaintext.
 *
 * Usage:
 *   TAG_ENCRYPTION_MASTER_KEY=<base64-32> node encrypt_fixture.mjs '{"api_key":"sk-xyz"}'
 *
 * The Python script invokes this via subprocess; it sets the key
 * env var and the payload arg. No external deps beyond tweetnacl,
 * which apps/api already has installed.
 */
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createRequire } from "node:module";

// Resolve tweetnacl from apps/api/node_modules so we don't need a
// separate install. The path is relative to this file:
//   apps/agent_graph_backend/scripts/encrypt_fixture.mjs
//   -> ../../../apps/api/node_modules/tweetnacl
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const apiNodeModules = resolve(__dirname, "..", "..", "api", "node_modules");
const require = createRequire(`${apiNodeModules}/`);
const nacl = require("tweetnacl");

const payloadArg = process.argv[2];
if (!payloadArg) {
  console.error("usage: node encrypt_fixture.mjs '<json-payload>'");
  process.exit(2);
}

const keyB64 = process.env.TAG_ENCRYPTION_MASTER_KEY;
if (!keyB64) {
  console.error("TAG_ENCRYPTION_MASTER_KEY env var is required");
  process.exit(2);
}

const key = Buffer.from(keyB64, "base64");
if (key.length !== nacl.secretbox.keyLength) {
  console.error(
    `TAG_ENCRYPTION_MASTER_KEY must decode to ${nacl.secretbox.keyLength} bytes`
  );
  process.exit(2);
}

const payload = JSON.parse(payloadArg);
const plaintext = Buffer.from(JSON.stringify(payload), "utf-8");
const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
const ciphertext = nacl.secretbox(
  new Uint8Array(plaintext),
  nonce,
  new Uint8Array(key)
);
if (!ciphertext) {
  console.error("encryption failed");
  process.exit(1);
}

process.stdout.write(
  JSON.stringify({
    ciphertext: Buffer.from(ciphertext).toString("base64"),
    nonce: Buffer.from(nonce).toString("base64"),
    plaintext: payload,
  })
);
