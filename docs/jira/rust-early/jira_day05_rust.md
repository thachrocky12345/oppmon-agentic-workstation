# TAG-05-RUST: CLI Scaffold + NAPI Integration

## Description

**Suggested Points:** 8 (High — CLI scaffold with OAuth device flow, keychain storage, and NAPI integration for Rust engine access)

**Track:** Rust Early

## Objective

Build the `tag` CLI scaffold with OAuth device flow authentication, secure credential storage, status commands, and full NAPI integration to use Rust engine functions for hashing and vector operations.

## Requirements

### NAPI Package Setup

```json
// packages/engine-core/package.json
{
  "name": "@tag/engine-napi",
  "version": "0.1.0",
  "main": "index.js",
  "types": "index.d.ts",
  "napi": {
    "name": "engine",
    "triples": {
      "defaults": true,
      "additional": [
        "aarch64-apple-darwin",
        "aarch64-unknown-linux-gnu",
        "x86_64-unknown-linux-musl"
      ]
    }
  },
  "scripts": {
    "build": "napi build --platform --release",
    "build:debug": "napi build --platform",
    "prepublishOnly": "napi prepublish -t npm"
  },
  "devDependencies": {
    "@napi-rs/cli": "^2.18.0"
  }
}
```

### TypeScript Type Definitions

```typescript
// packages/engine-core/index.d.ts (auto-generated, but here for reference)

/**
 * Compute SHA256 hash of data and return as lowercase hex string
 */
export function sha256Hex(data: Buffer): string

/**
 * Compute BLAKE3 hash of data and return as lowercase hex string
 */
export function blake3Hex(data: Buffer): string

/**
 * Verify SHA256 hash matches expected value
 */
export function verifySha256(data: Buffer, expected: string): boolean

/**
 * Verify BLAKE3 hash matches expected value
 */
export function verifyBlake3(data: Buffer, expected: string): boolean

/**
 * Compute SHA256 hash of a file (streaming, memory efficient)
 */
export function sha256File(path: string): string

/**
 * Compute cosine similarity between two vectors
 */
export function cosineSimilarity(a: number[], b: number[]): number

/**
 * Compute cosine similarity of query against all candidates in parallel
 */
export function batchCosine(query: number[], candidates: number[][]): number[]

/**
 * MMR candidate for diversity selection
 */
export interface MmrCandidate {
  id: number
  embedding: number[]
}

/**
 * Maximal Marginal Relevance selection for diversity
 * @param lambda - Balance between relevance (1.0) and diversity (0.0)
 */
export function mmrSelect(
  query: number[],
  candidates: MmrCandidate[],
  nResults: number,
  lambda: number
): number[]
```

### CLI Structure

```
packages/cli/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts              # Entry point
│   ├── cli.ts                # Commander setup
│   ├── commands/
│   │   ├── login.ts          # OAuth device flow
│   │   ├── logout.ts
│   │   ├── status.ts
│   │   ├── sync.ts           # Day 8-9
│   │   ├── init.ts           # Day 11
│   │   └── doctor.ts         # Day 24
│   ├── auth/
│   │   ├── oauth.ts          # Device flow
│   │   ├── keychain.ts       # Secure storage
│   │   └── token.ts          # JWT management
│   ├── config/
│   │   ├── config.ts         # Config file management
│   │   └── paths.ts          # Platform paths
│   ├── engine/
│   │   └── index.ts          # NAPI wrapper
│   └── utils/
│       ├── logger.ts
│       └── spinner.ts
└── bin/
    └── tag                   # Shebang entry
```

### NAPI Wrapper

```typescript
// packages/cli/src/engine/index.ts
import {
  sha256Hex,
  verifySha256,
  sha256File,
  blake3Hex,
  cosineSimilarity,
  batchCosine,
  mmrSelect,
  type MmrCandidate,
} from '@tag/engine-napi'

// Re-export all Rust functions with proper typing
export {
  sha256Hex,
  verifySha256,
  sha256File,
  blake3Hex,
  cosineSimilarity,
  batchCosine,
  mmrSelect,
  type MmrCandidate,
}

// Convenience wrappers

/**
 * Hash a file and verify against expected hash
 */
export async function verifyFile(path: string, expectedHash: string): Promise<boolean> {
  try {
    const actualHash = sha256File(path)
    return actualHash.toLowerCase() === expectedHash.toLowerCase()
  } catch (error) {
    throw new Error(`Failed to hash file ${path}: ${error}`)
  }
}

/**
 * Hash data and return result
 */
export function hashData(data: Buffer, algorithm: 'sha256' | 'blake3' = 'sha256'): string {
  return algorithm === 'sha256' ? sha256Hex(data) : blake3Hex(data)
}
```

### OAuth Device Flow

```typescript
// packages/cli/src/auth/oauth.ts
import open from 'open'

interface DeviceCodeResponse {
  device_code: string
  user_code: string
  verification_uri: string
  verification_uri_complete: string
  expires_in: number
  interval: number
}

interface TokenResponse {
  access_token: string
  refresh_token: string
  expires_in: number
  token_type: string
}

export class OAuthClient {
  constructor(
    private clientId: string,
    private authServerUrl: string,
  ) {}

  async startDeviceFlow(): Promise<DeviceCodeResponse> {
    const response = await fetch(`${this.authServerUrl}/oauth/device/code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.clientId,
        scope: 'openid profile email',
      }),
    })

    if (!response.ok) {
      throw new Error(`Device code request failed: ${response.status}`)
    }

    return response.json()
  }

  async pollForToken(deviceCode: string, interval: number): Promise<TokenResponse> {
    while (true) {
      await sleep(interval * 1000)

      const response = await fetch(`${this.authServerUrl}/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: this.clientId,
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
          device_code: deviceCode,
        }),
      })

      const data = await response.json()

      if (data.error === 'authorization_pending') {
        continue
      }

      if (data.error === 'slow_down') {
        interval += 5
        continue
      }

      if (data.error) {
        throw new Error(`Token request failed: ${data.error}`)
      }

      return data as TokenResponse
    }
  }

  async openBrowser(uri: string): Promise<void> {
    await open(uri)
  }
}
```

### Keychain Storage (Cross-Platform)

```typescript
// packages/cli/src/auth/keychain.ts
import keytar from 'keytar'
import { homedir } from 'os'
import { join } from 'path'
import { readFile, writeFile, mkdir } from 'fs/promises'

const SERVICE_NAME = 'team-ai-gateway'
const ACCOUNT_NAME = 'default'

interface StoredCredentials {
  accessToken: string
  refreshToken: string
  expiresAt: number
  tenantId: string
  userId: string
}

export class CredentialStore {
  private fallbackPath: string

  constructor() {
    this.fallbackPath = join(homedir(), '.tag', 'credentials.json')
  }

  async save(credentials: StoredCredentials): Promise<void> {
    const json = JSON.stringify(credentials)

    try {
      // Try keychain first
      await keytar.setPassword(SERVICE_NAME, ACCOUNT_NAME, json)
    } catch {
      // Fallback to file (with warning)
      console.warn('Keychain unavailable, using file storage (less secure)')
      await mkdir(join(homedir(), '.tag'), { recursive: true })
      await writeFile(this.fallbackPath, json, { mode: 0o600 })
    }
  }

  async load(): Promise<StoredCredentials | null> {
    try {
      // Try keychain first
      const json = await keytar.getPassword(SERVICE_NAME, ACCOUNT_NAME)
      if (json) {
        return JSON.parse(json)
      }
    } catch {
      // Fallback to file
      try {
        const json = await readFile(this.fallbackPath, 'utf-8')
        return JSON.parse(json)
      } catch {
        return null
      }
    }

    return null
  }

  async clear(): Promise<void> {
    try {
      await keytar.deletePassword(SERVICE_NAME, ACCOUNT_NAME)
    } catch {
      // Ignore keychain errors
    }

    try {
      const { unlink } = await import('fs/promises')
      await unlink(this.fallbackPath)
    } catch {
      // Ignore file errors
    }
  }
}
```

### Status Command

```typescript
// packages/cli/src/commands/status.ts
import { Command } from 'commander'
import chalk from 'chalk'
import { CredentialStore } from '../auth/keychain'
import { sha256Hex } from '../engine'

export function registerStatusCommand(program: Command): void {
  program
    .command('status')
    .description('Show current authentication and sync status')
    .action(async () => {
      const credentials = await new CredentialStore().load()

      if (!credentials) {
        console.log(chalk.yellow('Not logged in'))
        console.log('Run `tag login` to authenticate')
        return
      }

      const isExpired = credentials.expiresAt < Date.now()

      console.log(chalk.bold('Authentication Status'))
      console.log(`  Tenant:     ${credentials.tenantId}`)
      console.log(`  User:       ${credentials.userId}`)
      console.log(`  Token:      ${isExpired ? chalk.red('Expired') : chalk.green('Valid')}`)
      console.log(`  Expires:    ${new Date(credentials.expiresAt).toLocaleString()}`)

      // Test Rust engine
      console.log()
      console.log(chalk.bold('Engine Status'))
      try {
        const testHash = sha256Hex(Buffer.from('test'))
        console.log(`  Rust NAPI:  ${chalk.green('Working')}`)
        console.log(`  Test hash:  ${testHash.slice(0, 16)}...`)
      } catch (error) {
        console.log(`  Rust NAPI:  ${chalk.red('Error')} - ${error}`)
      }
    })
}
```

### Login Command

```typescript
// packages/cli/src/commands/login.ts
import { Command } from 'commander'
import chalk from 'chalk'
import ora from 'ora'
import { OAuthClient } from '../auth/oauth'
import { CredentialStore } from '../auth/keychain'
import { getConfig } from '../config/config'

export function registerLoginCommand(program: Command): void {
  program
    .command('login')
    .description('Authenticate with Team AI Gateway')
    .option('--no-browser', 'Do not open browser automatically')
    .action(async (options) => {
      const config = await getConfig()
      const oauth = new OAuthClient(config.clientId, config.authServerUrl)
      const store = new CredentialStore()

      // Start device flow
      const spinner = ora('Starting authentication...').start()

      try {
        const deviceCode = await oauth.startDeviceFlow()
        spinner.stop()

        console.log()
        console.log(chalk.bold('To authenticate, visit:'))
        console.log(chalk.cyan(deviceCode.verification_uri_complete))
        console.log()
        console.log(`Or enter code: ${chalk.bold(deviceCode.user_code)}`)
        console.log()

        if (options.browser !== false) {
          await oauth.openBrowser(deviceCode.verification_uri_complete)
        }

        const pollSpinner = ora('Waiting for authentication...').start()

        const token = await oauth.pollForToken(
          deviceCode.device_code,
          deviceCode.interval,
        )

        pollSpinner.succeed('Authenticated successfully')

        // Decode JWT to get user info
        const payload = JSON.parse(
          Buffer.from(token.access_token.split('.')[1], 'base64').toString()
        )

        await store.save({
          accessToken: token.access_token,
          refreshToken: token.refresh_token,
          expiresAt: Date.now() + token.expires_in * 1000,
          tenantId: payload.tenant_id,
          userId: payload.sub,
        })

        console.log()
        console.log(chalk.green('✓'), 'Logged in as', chalk.bold(payload.email || payload.sub))
        console.log(chalk.green('✓'), 'Tenant:', chalk.bold(payload.tenant_id))

      } catch (error) {
        spinner.fail(`Authentication failed: ${error}`)
        process.exit(1)
      }
    })
}
```

## Implementation Notes

- **Backend:** N/A for CLI
- **Rust:** NAPI bindings built and published
- **CLI:** Commander.js with TypeScript
- **Database:** N/A (CLI talks to API)

## Unit Tests

### Required Unit Tests

| Test File | Test Case | Assertion |
|-----------|-----------|-----------|
| `packages/cli/src/__tests__/engine.test.ts` | `sha256Hex works` | Matches expected |
| `packages/cli/src/__tests__/engine.test.ts` | `verifyFile correct` | Returns true |
| `packages/cli/src/__tests__/engine.test.ts` | `verifyFile tampered` | Returns false |
| `packages/cli/src/__tests__/keychain.test.ts` | `save and load` | Roundtrip |
| `packages/cli/src/__tests__/keychain.test.ts` | `fallback to file` | Works without keytar |
| `packages/cli/src/__tests__/oauth.test.ts` | `device flow parsing` | Correct fields |
| `packages/cli/src/__tests__/status.test.ts` | `shows logged out` | Correct message |

### Test Coverage Requirements

- NAPI wrapper functions tested
- Keychain fallback tested
- OAuth flow mocked and tested

## Integration Tests

### Required Integration Tests

| Test Scenario | Setup | Steps | Expected Result |
|---------------|-------|-------|-----------------|
| `login flow` | Mock OAuth server | 1. Login 2. Check stored | Credentials saved |
| `status logged in` | Saved credentials | 1. Run status | Shows tenant/user |
| `status logged out` | No credentials | 1. Run status | Shows not logged in |
| `NAPI from CLI` | Built NAPI | 1. Import 2. Call | Functions work |

### End-to-End Flows

- `tag login` → Device flow → Browser → Poll → Credentials stored
- `tag status` → Load credentials → Show info + engine status

## Acceptance Criteria

1. CLI scaffold with Commander.js
2. OAuth device flow working
3. Keychain storage with file fallback
4. NAPI integration for Rust functions
5. `tag login` command functional
6. `tag logout` command functional
7. `tag status` shows auth + engine status
8. Cross-platform (macOS, Linux, Windows)

## Review Checklist

- [ ] Does NAPI build for all platforms?
- [ ] Is keychain fallback secure (0600 permissions)?
- [ ] Does OAuth handle slow_down correctly?
- [ ] Are credentials encrypted at rest?
- [ ] Is the CLI help text clear?
- [ ] Does status test the Rust engine?

## Dependencies

- Depends on: Day 1 (Rust workspace), Day 3 (NAPI hash functions)
- Blocks: Day 8 (sync uses verification), Day 10 (RAG CLI)

## Risk Factors

- **NAPI build failures** — Mitigation: CI builds for all platforms, prebuild binaries
- **Keytar compatibility** — Mitigation: File fallback with secure permissions
- **OAuth timeout** — Mitigation: Clear error messages, retry option
