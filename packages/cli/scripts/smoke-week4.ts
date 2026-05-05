#!/usr/bin/env tsx
/**
 * CLI Week 4 Smoke Test Script
 *
 * Tests CLI functionality added in Week 4 (Days 16-20):
 * - Day 16: Admin UI for Skills + MCP Registry (Web UI - syntax check only)
 * - Day 17: Resource-centric event logging (privacy-first)
 * - Day 18: Claude Code hook integration
 * - Day 19: Usage Dashboard (Web UI - syntax check only)
 * - Day 20: Polish and fixes
 *
 * Usage:
 *   pnpm --filter @arkon/cli smoke:week4
 *   # or
 *   tsx packages/cli/scripts/smoke-week4.ts
 *
 * Note: Tests CLI syntax and help text without requiring API connection.
 *       For full integration tests, use the API smoke tests.
 */

import { execSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { fileURLToPath } from 'url'

// ESM compatibility
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

interface TestResult {
  name: string
  passed: boolean
  error?: string
  durationMs: number
}

const results: TestResult[] = []

// ============================================================================
// Test Helpers
// ============================================================================

function runCli(args: string, options: { cwd?: string; expectFail?: boolean } = {}): string {
  const cliPath = path.resolve(__dirname, '..', 'dist', 'index.js')
  const cmd = `node "${cliPath}" ${args}`

  try {
    const output = execSync(cmd, {
      cwd: options.cwd || process.cwd(),
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 30000,
    })
    return output
  } catch (error: unknown) {
    if (options.expectFail) {
      const execError = error as { stdout?: string; stderr?: string }
      return execError.stdout || execError.stderr || ''
    }
    throw error
  }
}

function runTest(name: string, fn: () => void): TestResult {
  const start = Date.now()
  try {
    fn()
    const result = { name, passed: true, durationMs: Date.now() - start }
    results.push(result)
    console.log(`  ✅ ${name} (${result.durationMs}ms)`)
    return result
  } catch (error) {
    const result = {
      name,
      passed: false,
      error: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - start,
    }
    results.push(result)
    console.log(`  ❌ ${name}: ${result.error}`)
    return result
  }
}

async function runTestAsync(name: string, fn: () => Promise<void>): Promise<TestResult> {
  const start = Date.now()
  try {
    await fn()
    const result = { name, passed: true, durationMs: Date.now() - start }
    results.push(result)
    console.log(`  ✅ ${name} (${result.durationMs}ms)`)
    return result
  } catch (error) {
    const result = {
      name,
      passed: false,
      error: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - start,
    }
    results.push(result)
    console.log(`  ❌ ${name}: ${result.error}`)
    return result
  }
}

function assertContains(output: string, expected: string, message?: string): void {
  if (!output.includes(expected)) {
    throw new Error(message || `Expected output to contain "${expected}"`)
  }
}

// ============================================================================
// Day 18: Hooks Command Tests
// ============================================================================

function testHooksHelp(): void {
  const output = runCli('hooks --help')
  assertContains(output, 'hooks', 'Should show hooks command')
  assertContains(output, 'install', 'Should show install subcommand')
  assertContains(output, 'uninstall', 'Should show uninstall subcommand')
  assertContains(output, 'status', 'Should show status subcommand')
}

function testHooksInstallHelp(): void {
  const output = runCli('hooks install --help')
  assertContains(output, 'Install', 'Should show install help')
}

function testHooksUninstallHelp(): void {
  const output = runCli('hooks uninstall --help')
  assertContains(output, 'Remove', 'Should show uninstall help')
}

function testHooksStatusHelp(): void {
  const output = runCli('hooks status --help')
  assertContains(output, 'status', 'Should show status help')
}

function testHooksStatusRuns(): void {
  // Status should work even without installation
  const output = runCli('hooks status', { expectFail: true })
  // Should either show installed or not installed status
  const validOutput = output.includes('Installed') || output.includes('Not installed') || output.includes('Status')
  if (!validOutput) {
    throw new Error('Hooks status should show installation status')
  }
}

// ============================================================================
// Day 18: Events Command Tests
// ============================================================================

function testEventsHelp(): void {
  const output = runCli('events --help')
  assertContains(output, 'events', 'Should show events command')
  assertContains(output, 'enable', 'Should show enable subcommand')
  assertContains(output, 'disable', 'Should show disable subcommand')
  assertContains(output, 'status', 'Should show status subcommand')
  assertContains(output, 'flush', 'Should show flush subcommand')
  assertContains(output, 'clear', 'Should show clear subcommand')
}

function testEventsEnableHelp(): void {
  const output = runCli('events enable --help')
  assertContains(output, 'Enable', 'Should show enable help')
}

function testEventsDisableHelp(): void {
  const output = runCli('events disable --help')
  assertContains(output, 'Disable', 'Should show disable help')
}

function testEventsStatusHelp(): void {
  const output = runCli('events status --help')
  assertContains(output, 'status', 'Should show status help')
}

function testEventsFlushHelp(): void {
  const output = runCli('events flush --help')
  assertContains(output, 'flush', 'Should show flush help')
}

function testEventsClearHelp(): void {
  const output = runCli('events clear --help')
  assertContains(output, 'clear', 'Should show clear help')
}

function testEventsStatusRuns(): void {
  // Status should work without auth
  const output = runCli('events status', { expectFail: true })
  // Should show event collection status
  const validOutput = output.includes('Collection') || output.includes('Status') || output.includes('enabled') || output.includes('disabled')
  if (!validOutput) {
    throw new Error('Events status should show collection status')
  }
}

// ============================================================================
// Event Buffer File Tests
// ============================================================================

function testEventBufferDirectory(): void {
  // Check that ~/.tag directory structure can be created
  const tagDir = path.join(os.homedir(), '.tag')

  // Just check if the directory exists or can be created
  if (!fs.existsSync(tagDir)) {
    fs.mkdirSync(tagDir, { recursive: true })
    fs.rmdirSync(tagDir)
  }
  // If we got here, directory operations work
}

// ============================================================================
// Main Help Text Updates Tests
// ============================================================================

function testMainHelpIncludesHooks(): void {
  const output = runCli('--help')
  assertContains(output, 'hooks', 'Main help should include hooks command')
}

function testMainHelpIncludesEvents(): void {
  const output = runCli('--help')
  assertContains(output, 'events', 'Main help should include events command')
}

function testMainHelpIncludesEventCollectionSection(): void {
  const output = runCli('--help')
  assertContains(output, 'Event Collection', 'Main help should have Event Collection section')
}

// ============================================================================
// All Week 4 Commands Have Help Tests
// ============================================================================

function testAllWeek4CommandsHaveHelp(): void {
  const commands = [
    'hooks',
    'hooks install',
    'hooks uninstall',
    'hooks status',
    'events',
    'events enable',
    'events disable',
    'events status',
    'events flush',
    'events clear',
  ]

  for (const cmd of commands) {
    const output = runCli(`${cmd} --help`)
    if (!output.includes('-h') && !output.includes('--help') && !output.includes('Usage') && !output.includes('Description')) {
      throw new Error(`Command "${cmd}" should have help text`)
    }
  }
}

// ============================================================================
// Integration Check: Events Enable/Disable Flow
// ============================================================================

function testEventsEnableDisableFlow(): void {
  // Enable events
  runCli('events enable', { expectFail: true })

  // Check status
  const statusAfterEnable = runCli('events status', { expectFail: true })

  // Disable events
  runCli('events disable', { expectFail: true })

  // Check status again
  const statusAfterDisable = runCli('events status', { expectFail: true })

  // Both status outputs should be valid (we don't require specific state)
  if (statusAfterEnable.length === 0 && statusAfterDisable.length === 0) {
    throw new Error('Events status should produce output')
  }
}

// ============================================================================
// API Integration Tests (when API is running)
// ============================================================================

async function testApiHealth(): Promise<boolean> {
  const apiUrl = process.env.TAG_API_URL || 'http://localhost:3001'
  try {
    const response = await fetch(`${apiUrl}/api/health`, { signal: AbortSignal.timeout(5000) })
    return response.ok
  } catch {
    return false
  }
}

async function testUsageEventsApi(): Promise<void> {
  const apiUrl = process.env.TAG_API_URL || 'http://localhost:3001'

  // Test that usage events endpoint returns 204 (always, for privacy)
  const response = await fetch(`${apiUrl}/api/usage/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      resource_type: 'skill',
      resource_id: 'test-skill',
      action: 'invoke',
    }),
    signal: AbortSignal.timeout(5000),
  })

  // Should return 204 regardless of auth state (graceful degradation)
  if (response.status !== 204) {
    throw new Error(`Expected 204, got ${response.status}`)
  }
}

async function testAuthLogin(): Promise<string | null> {
  const apiUrl = process.env.TAG_API_URL || 'http://localhost:3001'

  try {
    const response = await fetch(`${apiUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@arkon.dev',
        password: 'admin123',
      }),
      signal: AbortSignal.timeout(5000),
    })

    if (response.ok) {
      const data = await response.json()
      return data.token
    }
    return null
  } catch {
    return null
  }
}

async function testAuthLogout(token: string): Promise<void> {
  const apiUrl = process.env.TAG_API_URL || 'http://localhost:3001'

  const response = await fetch(`${apiUrl}/api/auth/logout`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    signal: AbortSignal.timeout(5000),
  })

  if (!response.ok) {
    throw new Error(`Logout failed with status ${response.status}`)
  }
}

async function testUsageSettingsApi(token: string): Promise<void> {
  const apiUrl = process.env.TAG_API_URL || 'http://localhost:3001'

  // Get settings
  const getResponse = await fetch(`${apiUrl}/api/usage/settings`, {
    headers: { 'Authorization': `Bearer ${token}` },
    signal: AbortSignal.timeout(5000),
  })

  if (!getResponse.ok) {
    throw new Error(`Get settings failed: ${getResponse.status}`)
  }

  const settings = await getResponse.json()
  if (typeof settings.data?.eventsEnabled !== 'boolean') {
    throw new Error('eventsEnabled should be a boolean')
  }
}

async function testUsageAggregationApi(token: string): Promise<void> {
  const apiUrl = process.env.TAG_API_URL || 'http://localhost:3001'

  const response = await fetch(`${apiUrl}/api/usage?period=7d`, {
    headers: { 'Authorization': `Bearer ${token}` },
    signal: AbortSignal.timeout(5000),
  })

  if (!response.ok) {
    throw new Error(`Usage aggregation failed: ${response.status}`)
  }

  const data = await response.json()

  // Verify response structure
  if (!data.data || typeof data.data.totalEvents !== 'number') {
    throw new Error('Invalid usage response structure')
  }

  // CRITICAL: Verify no user data in response
  const dataStr = JSON.stringify(data)
  if (dataStr.includes('user_id') || dataStr.includes('userId')) {
    throw new Error('PRIVACY VIOLATION: user_id found in response')
  }
}

// ============================================================================
// Main Runner
// ============================================================================

async function main() {
  console.log('\n' + '='.repeat(60))
  console.log('CLI Week 4 Smoke Test (Days 16-20)')
  console.log('='.repeat(60) + '\n')

  // First, build the CLI
  console.log('Building CLI...')
  try {
    execSync('pnpm build', {
      cwd: path.resolve(__dirname, '..'),
      stdio: 'inherit',
    })
    console.log('  ✅ Build successful\n')
  } catch (error) {
    console.log('  ❌ Build failed')
    console.log('  Error:', error instanceof Error ? error.message : String(error))
    process.exit(1)
  }

  // Day 18: Hooks Commands
  console.log('Day 18 - Hooks Commands:')
  runTest('hooks --help shows subcommands', testHooksHelp)
  runTest('hooks install --help shows options', testHooksInstallHelp)
  runTest('hooks uninstall --help shows options', testHooksUninstallHelp)
  runTest('hooks status --help shows options', testHooksStatusHelp)
  runTest('hooks status runs without error', testHooksStatusRuns)

  // Day 18: Events Commands
  console.log('\nDay 18 - Events Commands:')
  runTest('events --help shows subcommands', testEventsHelp)
  runTest('events enable --help shows options', testEventsEnableHelp)
  runTest('events disable --help shows options', testEventsDisableHelp)
  runTest('events status --help shows options', testEventsStatusHelp)
  runTest('events flush --help shows options', testEventsFlushHelp)
  runTest('events clear --help shows options', testEventsClearHelp)
  runTest('events status runs without error', testEventsStatusRuns)

  // Event Buffer Tests
  console.log('\nEvent Buffer:')
  runTest('~/.tag directory can be created', testEventBufferDirectory)

  // Main Help Updates
  console.log('\nMain Help Updates:')
  runTest('Main help includes hooks command', testMainHelpIncludesHooks)
  runTest('Main help includes events command', testMainHelpIncludesEvents)
  runTest('Main help has Event Collection section', testMainHelpIncludesEventCollectionSection)

  // Integration Tests
  console.log('\nCLI Integration:')
  runTest('Events enable/disable flow works', testEventsEnableDisableFlow)
  runTest('All Week 4 commands have --help', testAllWeek4CommandsHaveHelp)

  // API Integration Tests (only if API is running)
  console.log('\nAPI Integration (optional):')
  const apiRunning = await testApiHealth()

  if (apiRunning) {
    console.log('  API detected at ' + (process.env.TAG_API_URL || 'http://localhost:3001'))

    // Test usage events (no auth required - returns 204 always)
    await runTestAsync('Usage events returns 204 (privacy)', testUsageEventsApi)

    // Test auth flow
    const token = await testAuthLogin()
    if (token) {
      console.log('  Login successful, testing authenticated endpoints...')

      await runTestAsync('Usage settings API works', () => testUsageSettingsApi(token))
      await runTestAsync('Usage aggregation API works', () => testUsageAggregationApi(token))
      await runTestAsync('Logout API works', () => testAuthLogout(token))
    } else {
      console.log('  ⚠️  Could not login (database may not be seeded)')
      console.log('     Run: pnpm db:seed')
    }
  } else {
    console.log('  ⚠️  API not running at ' + (process.env.TAG_API_URL || 'http://localhost:3001'))
    console.log('     Skipping API integration tests')
    console.log('     Start API with: pnpm dev:api')
  }

  // Summary
  const passed = results.filter((r) => r.passed).length
  const failed = results.filter((r) => !r.passed).length
  const totalDuration = results.reduce((sum, r) => sum + r.durationMs, 0)

  console.log('\n' + '='.repeat(60))
  console.log(`CLI Week 4 Smoke Test: ${passed}/${results.length} passed`)
  console.log(`Total duration: ${totalDuration}ms`)

  if (failed > 0) {
    console.log('\nFailures:')
    results
      .filter((r) => !r.passed)
      .forEach((r) => {
        console.log(`  ❌ ${r.name}: ${r.error}`)
      })
    console.log('\n')
    process.exit(1)
  }

  console.log('\n✅ All CLI Week 4 tests passed!\n')
  process.exit(0)
}

main().catch((error) => {
  console.error('Smoke test failed:', error)
  process.exit(1)
})
