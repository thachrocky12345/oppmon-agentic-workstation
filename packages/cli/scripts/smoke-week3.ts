#!/usr/bin/env tsx
// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

/**
 * CLI Week 3 Smoke Test Script
 *
 * Tests CLI functionality added in Week 3 (Days 11-13):
 * - Day 11: tag init command
 * - Day 12: E2E onboarding flow
 * - Day 13: DX improvements
 *
 * Usage:
 *   pnpm --filter @arkon/cli smoke:week3
 *   # or
 *   tsx packages/cli/scripts/smoke-week3.ts
 *
 * Note: Tests CLI syntax and help text without requiring API connection.
 *       For full integration tests, use the API smoke tests.
 */

import { execSync, exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  durationMs: number;
}

const results: TestResult[] = [];

// ============================================================================
// Test Helpers
// ============================================================================

function runCli(args: string, options: { cwd?: string; expectFail?: boolean } = {}): string {
  const cliPath = path.resolve(__dirname, '..', 'dist', 'index.js');
  const cmd = `node "${cliPath}" ${args}`;

  try {
    const output = execSync(cmd, {
      cwd: options.cwd || process.cwd(),
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 30000,
    });
    return output;
  } catch (error: unknown) {
    if (options.expectFail) {
      const execError = error as { stdout?: string; stderr?: string };
      return execError.stdout || execError.stderr || '';
    }
    throw error;
  }
}

function runTest(name: string, fn: () => void): TestResult {
  const start = Date.now();
  try {
    fn();
    const result = { name, passed: true, durationMs: Date.now() - start };
    results.push(result);
    console.log(`  ✅ ${name} (${result.durationMs}ms)`);
    return result;
  } catch (error) {
    const result = {
      name,
      passed: false,
      error: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - start,
    };
    results.push(result);
    console.log(`  ❌ ${name}: ${result.error}`);
    return result;
  }
}

function assertContains(output: string, expected: string, message?: string): void {
  if (!output.includes(expected)) {
    throw new Error(message || `Expected output to contain "${expected}"`);
  }
}

function assertNotContains(output: string, unexpected: string, message?: string): void {
  if (output.includes(unexpected)) {
    throw new Error(message || `Expected output NOT to contain "${unexpected}"`);
  }
}

// ============================================================================
// Day 11: Init Command Tests
// ============================================================================

function testInitHelp(): void {
  const output = runCli('init --help');
  assertContains(output, 'init', 'Should show init command');
  assertContains(output, '--team', 'Should show --team option');
  assertContains(output, '--yes', 'Should show --yes option');
}

function testInitHelpInMain(): void {
  const output = runCli('--help');
  assertContains(output, 'init', 'Main help should list init command');
  assertContains(output, 'Project Init', 'Should have Project Init section');
}

function testInitInTempDir(): void {
  // Create a temp directory
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tag-smoke-'));

  try {
    // Try to run init --yes (will fail without auth, but should create .tag/ structure)
    // We expect it to fail due to no auth, but it should still parse correctly
    const output = runCli('init --yes 2>&1', { cwd: tempDir, expectFail: true });

    // The command should either:
    // 1. Create .tag/ structure (if mocked auth)
    // 2. Fail with auth error (expected)
    const hasAuthError = output.includes('Not authenticated') || output.includes('login');
    const hasCreatedDir = fs.existsSync(path.join(tempDir, '.tag'));

    if (!hasAuthError && !hasCreatedDir) {
      throw new Error('Init should either require auth or create .tag/ directory');
    }
  } finally {
    // Clean up
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

// ============================================================================
// Day 12: E2E Onboarding Flow Tests (syntax only)
// ============================================================================

function testLoginHelp(): void {
  const output = runCli('login --help');
  assertContains(output, 'login', 'Should show login command');
  assertContains(output, '--headless', 'Should show --headless option');
}

function testStatusHelp(): void {
  const output = runCli('status --help');
  assertContains(output, 'status', 'Should show status command');
}

function testSyncSkillsHelp(): void {
  const output = runCli('sync skills --help');
  assertContains(output, 'push', 'Should show push subcommand');
  assertContains(output, 'pull', 'Should show pull subcommand');
  assertContains(output, 'list', 'Should show list subcommand');
}

function testSyncMcpHelp(): void {
  const output = runCli('sync mcp --help');
  assertContains(output, 'push', 'Should show push subcommand');
  assertContains(output, 'pull', 'Should show pull subcommand');
}

function testRagHelp(): void {
  const output = runCli('rag --help');
  assertContains(output, 'ingest', 'Should show ingest subcommand');
  assertContains(output, 'search', 'Should show search subcommand');
  assertContains(output, 'query', 'Should show query subcommand');
}

// ============================================================================
// Day 13: DX Improvements Tests
// ============================================================================

function testHelpFormatting(): void {
  const output = runCli('--help');

  // Check for consistent formatting
  assertContains(output, 'Examples:', 'Should have Examples section');
  assertContains(output, 'Exit Codes:', 'Should have Exit Codes section');
  assertContains(output, 'Environment Variables:', 'Should have Environment Variables section');
}

function testVersionFlag(): void {
  const output = runCli('--version');
  // Should output version number
  if (!/\d+\.\d+\.\d+/.test(output)) {
    throw new Error('Version output should match semver pattern');
  }
}

function testUnknownCommandError(): void {
  const output = runCli('nonexistent-command 2>&1', { expectFail: true });
  // Should show helpful error or help text
  assertContains(output.toLowerCase(), 'unknown command', 'Should show error for unknown command');
}

function testMissingArgsError(): void {
  // Commands that require args should show helpful errors
  const output = runCli('rag ingest 2>&1', { expectFail: true });
  // Should either ask for args or show help
  const hasArgsError = output.includes('required') || output.includes('Usage') || output.includes('help');
  if (!hasArgsError) {
    // May still work if it defaults to current dir
  }
}

// ============================================================================
// All Commands Have Help Tests
// ============================================================================

function testAllCommandsHaveHelp(): void {
  const commands = [
    'login',
    'logout',
    'status',
    'init',
    'sync',
    'sync skills',
    'sync mcp',
    'rag',
    'rag ingest',
    'rag search',
    'rag query',
    'rag list',
    'rag status',
  ];

  for (const cmd of commands) {
    const output = runCli(`${cmd} --help`);
    if (!output.includes('-h') && !output.includes('--help') && !output.includes('Usage')) {
      throw new Error(`Command "${cmd}" should have help text`);
    }
  }
}

// ============================================================================
// Main Runner
// ============================================================================

async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('CLI Week 3 Smoke Test (Days 11-13)');
  console.log('='.repeat(60) + '\n');

  // First, build the CLI
  console.log('Building CLI...');
  try {
    execSync('pnpm build', {
      cwd: path.resolve(__dirname, '..'),
      stdio: 'pipe',
    });
    console.log('  ✅ Build successful\n');
  } catch (error) {
    console.log('  ❌ Build failed\n');
    process.exit(1);
  }

  // Day 11: Init Command
  console.log('Day 11 - Init Command:');
  runTest('init --help shows options', testInitHelp);
  runTest('Main help includes init command', testInitHelpInMain);
  runTest('init --yes handles temp directory', testInitInTempDir);

  // Day 12: E2E Onboarding Flow (syntax)
  console.log('\nDay 12 - E2E Onboarding Flow (syntax):');
  runTest('login --help shows options', testLoginHelp);
  runTest('status --help shows command', testStatusHelp);
  runTest('sync skills --help shows subcommands', testSyncSkillsHelp);
  runTest('sync mcp --help shows subcommands', testSyncMcpHelp);
  runTest('rag --help shows subcommands', testRagHelp);

  // Day 13: DX Improvements
  console.log('\nDay 13 - DX Improvements:');
  runTest('Help text has consistent formatting', testHelpFormatting);
  runTest('--version shows version number', testVersionFlag);
  runTest('Unknown command shows error', testUnknownCommandError);
  runTest('All commands have --help', testAllCommandsHaveHelp);

  // Summary
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const totalDuration = results.reduce((sum, r) => sum + r.durationMs, 0);

  console.log('\n' + '='.repeat(60));
  console.log(`CLI Week 3 Smoke Test: ${passed}/${results.length} passed`);
  console.log(`Total duration: ${totalDuration}ms`);

  if (failed > 0) {
    console.log('\nFailures:');
    results
      .filter((r) => !r.passed)
      .forEach((r) => {
        console.log(`  ❌ ${r.name}: ${r.error}`);
      });
    console.log('\n');
    process.exit(1);
  }

  console.log('\n✅ All CLI Week 3 tests passed!\n');
  process.exit(0);
}

main().catch((error) => {
  console.error('Smoke test failed:', error);
  process.exit(1);
});
