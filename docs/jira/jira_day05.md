# TAG-05: CLI Scaffold: Login + Status

## Description

**Suggested Points:** 5 (Medium — OAuth device flow complexity, secure credential storage with platform-specific keychains, and CLI UX design; moderate risk due to cross-platform compatibility requirements)

## Objective

Build the CLI scaffold with authentication flow (OAuth device code flow), secure credential storage using platform keychains with file-based fallback, and a status command showing current authentication and team context.

## Requirements

### CLI Framework
- Command structure: `tag <command> [options]`
- Commands: `login`, `logout`, `status`, `--help`, `--version`
- Built with Commander.js or similar
- Colored output with chalk, spinners with ora
- Exit codes: 0=success, 1=error, 2=auth required

### OAuth Device Code Flow
- `tag login` initiates device code flow
- Display: "Visit https://gateway.example.com/device and enter code: ABCD-1234"
- Poll for completion with exponential backoff
- On success, store tokens securely
- On timeout (5 min), exit with clear error message
- Support `--headless` flag for CI environments (expects TOKEN env var)

### Secure Credential Storage
- Primary: Platform keychain (macOS Keychain, Windows Credential Manager, libsecret on Linux)
- Fallback: Encrypted file at `~/.tag/credentials.json` with user-only permissions (0600)
- Encryption: AES-256-GCM with key derived from machine-specific identifier
- Token refresh: Automatic before expiration
- `tag logout`: Clear all stored credentials

### Status Command
- `tag status` shows:
  - Authenticated: Yes/No
  - User: email
  - Tenant: name
  - Teams: list of team names
  - Token expires: relative time ("in 2 hours")
  - API endpoint: current server URL
- JSON output with `--json` flag for scripting

### Help Output
- `tag --help` shows all commands with descriptions
- `tag <command> --help` shows command-specific options
- Include examples in help text

## Implementation Notes
- Backend: N/A (uses existing auth API)
- Frontend: N/A
- CLI: packages/cli with TypeScript, compile to single binary with pkg or similar
- Database: N/A

## Unit Tests

### Required Unit Tests
| Test File | Test Case | Assertion |
|-----------|-----------|-----------|
| `packages/cli/src/__tests__/auth.test.ts` | `initiates device code flow correctly` | API called with correct params |
| `packages/cli/src/__tests__/auth.test.ts` | `polls with exponential backoff` | Delay increases between polls |
| `packages/cli/src/__tests__/auth.test.ts` | `times out after 5 minutes` | Exit code 1, error message shown |
| `packages/cli/src/__tests__/auth.test.ts` | `stores token on success` | Credential storage called |
| `packages/cli/src/__tests__/credentials.test.ts` | `uses keychain when available` | Keychain API called |
| `packages/cli/src/__tests__/credentials.test.ts` | `falls back to file when keychain unavailable` | File created at ~/.tag/credentials.json |
| `packages/cli/src/__tests__/credentials.test.ts` | `file has 0600 permissions` | Only user can read/write |
| `packages/cli/src/__tests__/credentials.test.ts` | `encrypts credentials in file` | File content is not plaintext |
| `packages/cli/src/__tests__/credentials.test.ts` | `logout clears all credentials` | Storage is empty after logout |
| `packages/cli/src/__tests__/status.test.ts` | `shows auth status correctly` | Output includes all required fields |
| `packages/cli/src/__tests__/status.test.ts` | `--json outputs valid JSON` | JSON.parse succeeds |
| `packages/cli/src/__tests__/help.test.ts` | `--help shows all commands` | All command names in output |
| `packages/cli/src/__tests__/help.test.ts` | `command --help shows options` | Options listed correctly |

### Test Coverage Requirements
- 90% line coverage on authentication flow
- 100% coverage on credential storage (keychain and fallback)
- All error paths tested (timeout, network failure, invalid response)

## Integration Tests

### Required Integration Tests
| Test Scenario | Setup | Steps | Expected Result |
|---------------|-------|-------|-----------------|
| `keychain fallback` | Mock keychain as unavailable | 1. tag login 2. Complete OAuth | Credentials in ~/.tag/credentials.json |
| `full login flow` | Valid OAuth server | 1. tag login 2. Enter code at URL 3. tag status | Status shows authenticated |
| `logout clears state` | Authenticated user | 1. tag logout 2. tag status | Status shows not authenticated |
| `token refresh` | Nearly expired token | 1. tag status | Token refreshed automatically |
| `--headless mode` | TOKEN env var set | 1. tag login --headless | Uses env var, no device flow |
| `help output format` | None | 1. tag --help | Output includes all commands |
| `error handling: network` | API unreachable | 1. tag login | Clear error message, exit 1 |
| `error handling: timeout` | OAuth never completes | 1. tag login (wait 5 min) | Timeout message, exit 1 |

### End-to-End Flows
- Fresh install → Login → Status → Logout → Status (not authenticated)
- Login on macOS (uses Keychain) → Login on Linux (uses libsecret or fallback)
- CI mode: Set TOKEN env var → Login --headless → Status → Operations

## Acceptance Criteria
1. `tag login` completes OAuth device code flow successfully
2. Credentials stored in platform keychain when available
3. Fallback to encrypted file works when keychain unavailable
4. `tag logout` clears all stored credentials
5. `tag status` shows authentication state and user context
6. `tag --help` displays all commands with descriptions
7. Exit codes are consistent (0=success, 1=error, 2=auth required)
8. Token refresh happens automatically before expiration

## Review Checklist
- [ ] Are refresh tokens stored securely, not just access tokens?
- [ ] Does the file fallback use proper encryption (AES-256-GCM)?
- [ ] Are file permissions set correctly (0600) on Unix systems?
- [ ] Is the device code displayed clearly for copy-paste?
- [ ] Does --headless mode work in CI environments?
- [ ] Are API endpoints configurable via environment variable?

## Dependencies
- Depends on: Day 1 (auth API with device code support)
- Blocks: Day 8 (sync uses auth), Day 10 (RAG CLI uses auth), Day 11 (init uses auth)

## Risk Factors
- **Keychain API differences across platforms** — Mitigation: Use keytar library with fallback, test on all platforms
- **File fallback security** — Mitigation: Strong encryption, proper permissions, security review
- **Device code flow UX** — Mitigation: Clear instructions, polling feedback, timeout handling
- **CI/CD integration** — Mitigation: --headless mode, environment variable support
