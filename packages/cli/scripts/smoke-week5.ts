#!/usr/bin/env tsx
// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

/**
 * CLI Week 5 Smoke Test (Days 21-33)
 *
 * Tests the following features:
 * - tag doctor command (all checks)
 * - tag --help output
 * - Command existence and help text
 * - Error handling and suggestions
 *
 * Note: These tests don't require API connection for basic command tests.
 * They test CLI behavior, argument parsing, and help output.
 */

import { execSync, spawn } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// ESM compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Path to the CLI
const CLI_PATH = join(__dirname, '..', 'dist', 'index.js');

// Test results
const results: { name: string; passed: boolean; error?: string }[] = [];

// Helper to run CLI command
function runCli(
  args: string[],
  options: { timeout?: number; env?: Record<string, string> } = {}
): { stdout: string; stderr: string; exitCode: number } {
  const { timeout = 10000, env = {} } = options;

  try {
    const stdout = execSync(`node "${CLI_PATH}" ${args.join(' ')}`, {
      timeout,
      encoding: 'utf-8',
      env: { ...process.env, ...env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    return { stdout, stderr: '', exitCode: 0 };
  } catch (error: unknown) {
    const execError = error as { stdout?: string; stderr?: string; status?: number };
    return {
      stdout: execError.stdout || '',
      stderr: execError.stderr || '',
      exitCode: execError.status || 1,
    };
  }
}

function runTest(name: string, fn: () => void): void {
  try {
    fn();
    results.push({ name, passed: true });
    console.log(`  ✓ ${name}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    results.push({ name, passed: false, error: message });
    console.log(`  ✗ ${name}`);
    console.log(`    Error: ${message}`);
  }
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function assertContains(haystack: string, needle: string, message?: string): void {
  if (!haystack.includes(needle)) {
    throw new Error(message || `Expected "${haystack}" to contain "${needle}"`);
  }
}

// ============================================================================
// Test Groups
// ============================================================================

function testHelpOutput(): void {
  console.log('\n📋 Help Output Tests');

  runTest('tag --help shows usage', () => {
    const { stdout, exitCode } = runCli(['--help']);
    assert(exitCode === 0, `Expected exit code 0, got ${exitCode}`);
    assertContains(stdout, 'Usage:', 'Should show usage');
    assertContains(stdout, 'Arkon CLI', 'Should mention Arkon CLI');
  });

  runTest('tag --help shows all commands', () => {
    const { stdout } = runCli(['--help']);
    assertContains(stdout, 'login', 'Should show login command');
    assertContains(stdout, 'logout', 'Should show logout command');
    assertContains(stdout, 'status', 'Should show status command');
    assertContains(stdout, 'sync', 'Should show sync command');
    assertContains(stdout, 'doctor', 'Should show doctor command');
    assertContains(stdout, 'init', 'Should show init command');
  });

  runTest('tag --help shows examples', () => {
    const { stdout } = runCli(['--help']);
    assertContains(stdout, 'Examples:', 'Should show examples section');
    assertContains(stdout, 'tag login', 'Should show login example');
  });

  runTest('tag --version shows version', () => {
    const { stdout, exitCode } = runCli(['--version']);
    assert(exitCode === 0, `Expected exit code 0, got ${exitCode}`);
    assertContains(stdout, '0.1.0', 'Should show version 0.1.0');
  });
}

function testDoctorCommand(): void {
  console.log('\n🩺 Doctor Command Tests (Day 24)');

  runTest('tag doctor --help shows usage', () => {
    const { stdout, exitCode } = runCli(['doctor', '--help']);
    assert(exitCode === 0, `Expected exit code 0, got ${exitCode}`);
    assertContains(stdout, 'doctor', 'Should show doctor command');
    assertContains(stdout, '--fix', 'Should show --fix option');
    assertContains(stdout, '--json', 'Should show --json option');
  });

  runTest('tag doctor runs without crashing', () => {
    // Doctor command may fail (no auth, etc.) but should not crash
    const { stdout, stderr, exitCode } = runCli(['doctor'], {
      env: { TAG_API_URL: 'http://localhost:9999' }, // Unreachable API
    });

    // Should have some output
    const output = stdout + stderr;
    assert(output.length > 0, 'Should produce output');

    // Should contain diagnostic info
    const hasOutput =
      output.includes('Authentication') ||
      output.includes('Network') ||
      output.includes('Diagnostics') ||
      output.includes('error');
    assert(hasOutput, 'Should show diagnostic output');
  });

  runTest('tag doctor --json outputs valid JSON', () => {
    const { stdout, stderr } = runCli(['doctor', '--json'], {
      env: { TAG_API_URL: 'http://localhost:9999' },
    });

    // Find JSON in output
    const output = stdout || stderr;
    const jsonMatch = output.match(/\{[\s\S]*\}/);
    assert(jsonMatch !== null, 'Should output JSON');

    // Parse JSON
    try {
      const data = JSON.parse(jsonMatch[0]);
      assert(data.checks !== undefined || data.error !== undefined, 'Should have checks or error');
    } catch {
      throw new Error('Invalid JSON output');
    }
  });

  runTest('tag doctor auth checks authentication', () => {
    const { stdout, stderr } = runCli(['doctor', 'auth']);
    const output = stdout + stderr;
    assertContains(output.toLowerCase(), 'auth', 'Should check authentication');
  });

  runTest('tag doctor network checks connectivity', () => {
    const { stdout, stderr } = runCli(['doctor', 'network'], {
      env: { TAG_API_URL: 'http://localhost:9999' },
    });
    const output = stdout + stderr;
    // Should mention network or API
    const hasNetworkInfo =
      output.toLowerCase().includes('network') ||
      output.toLowerCase().includes('api') ||
      output.toLowerCase().includes('connect');
    assert(hasNetworkInfo, 'Should check network');
  });
}

function testLoginCommand(): void {
  console.log('\n🔐 Login Command Tests');

  runTest('tag login --help shows usage', () => {
    const { stdout, exitCode } = runCli(['login', '--help']);
    assert(exitCode === 0, `Expected exit code 0, got ${exitCode}`);
    assertContains(stdout, 'login', 'Should show login command');
    assertContains(stdout, '--headless', 'Should show --headless option');
  });
}

function testStatusCommand(): void {
  console.log('\n📊 Status Command Tests');

  runTest('tag status --help shows usage', () => {
    const { stdout, exitCode } = runCli(['status', '--help']);
    assert(exitCode === 0, `Expected exit code 0, got ${exitCode}`);
    assertContains(stdout, 'status', 'Should show status command');
    assertContains(stdout, '--json', 'Should show --json option');
  });

  runTest('tag status without auth shows not authenticated', () => {
    const { stdout, stderr, exitCode } = runCli(['status']);
    const output = stdout + stderr;

    // Should indicate not authenticated
    const notAuth =
      output.toLowerCase().includes('not authenticated') ||
      output.toLowerCase().includes('authenticated: no') ||
      output.toLowerCase().includes('run `tag login`') ||
      exitCode === 2; // AUTH_REQUIRED exit code

    assert(notAuth, 'Should indicate not authenticated');
  });
}

function testSyncCommand(): void {
  console.log('\n🔄 Sync Command Tests');

  runTest('tag sync --help shows usage', () => {
    const { stdout, exitCode } = runCli(['sync', '--help']);
    assert(exitCode === 0, `Expected exit code 0, got ${exitCode}`);
    assertContains(stdout, 'sync', 'Should show sync command');
  });

  runTest('tag sync skills --help shows subcommand', () => {
    const { stdout, exitCode } = runCli(['sync', 'skills', '--help']);
    assert(exitCode === 0, `Expected exit code 0, got ${exitCode}`);
    assertContains(stdout, 'skills', 'Should show skills subcommand');
  });

  runTest('tag sync mcp --help shows subcommand', () => {
    const { stdout, exitCode } = runCli(['sync', 'mcp', '--help']);
    assert(exitCode === 0, `Expected exit code 0, got ${exitCode}`);
    assertContains(stdout, 'mcp', 'Should show mcp subcommand');
  });
}

function testRagCommand(): void {
  console.log('\n🔍 RAG Command Tests');

  runTest('tag rag --help shows usage', () => {
    const { stdout, exitCode } = runCli(['rag', '--help']);
    assert(exitCode === 0, `Expected exit code 0, got ${exitCode}`);
    assertContains(stdout, 'rag', 'Should show rag command');
    assertContains(stdout, 'ingest', 'Should show ingest subcommand');
    assertContains(stdout, 'search', 'Should show search subcommand');
  });
}

function testHooksCommand(): void {
  console.log('\n🪝 Hooks Command Tests');

  runTest('tag hooks --help shows usage', () => {
    const { stdout, exitCode } = runCli(['hooks', '--help']);
    assert(exitCode === 0, `Expected exit code 0, got ${exitCode}`);
    assertContains(stdout, 'hooks', 'Should show hooks command');
    assertContains(stdout, 'install', 'Should show install subcommand');
    assertContains(stdout, 'status', 'Should show status subcommand');
  });
}

function testEventsCommand(): void {
  console.log('\n📡 Events Command Tests');

  runTest('tag events --help shows usage', () => {
    const { stdout, exitCode } = runCli(['events', '--help']);
    assert(exitCode === 0, `Expected exit code 0, got ${exitCode}`);
    assertContains(stdout, 'events', 'Should show events command');
    assertContains(stdout, 'enable', 'Should show enable subcommand');
    assertContains(stdout, 'disable', 'Should show disable subcommand');
  });
}

function testInitCommand(): void {
  console.log('\n🚀 Init Command Tests');

  runTest('tag init --help shows usage', () => {
    const { stdout, exitCode } = runCli(['init', '--help']);
    assert(exitCode === 0, `Expected exit code 0, got ${exitCode}`);
    assertContains(stdout, 'init', 'Should show init command');
    assertContains(stdout, '--team', 'Should show --team option');
    assertContains(stdout, '--yes', 'Should show --yes option');
  });
}

function testUnknownCommand(): void {
  console.log('\n❓ Unknown Command Tests');

  runTest('Unknown command shows error', () => {
    const { stderr, exitCode } = runCli(['unknowncommand']);
    assert(exitCode !== 0, 'Should exit with error');
    assertContains(stderr.toLowerCase(), 'unknown', 'Should mention unknown command');
  });

  runTest('Unknown command suggests alternatives', () => {
    const { stderr } = runCli(['logi']); // Typo of 'login'
    // Should either suggest 'login' or show help
    const output = stderr.toLowerCase();
    const hasSuggestion =
      output.includes('did you mean') ||
      output.includes('login') ||
      output.includes('help');
    assert(hasSuggestion, 'Should suggest alternatives or help');
  });
}

function testEnvironmentVariables(): void {
  console.log('\n🌍 Environment Variables Tests');

  runTest('tag doctor respects TAG_API_URL', () => {
    const customUrl = 'http://custom-api:8080';
    const { stdout, stderr } = runCli(['doctor', 'network'], {
      env: { TAG_API_URL: customUrl },
    });
    const output = stdout + stderr;
    // Should either show the custom URL or try to connect to it
    const usesCustomUrl =
      output.includes(customUrl) ||
      output.includes('custom-api') ||
      output.includes('8080');
    // If it doesn't show the URL, at least check it didn't use default
    assert(
      usesCustomUrl || !output.includes('localhost:3001'),
      'Should respect TAG_API_URL environment variable'
    );
  });
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║         CLI Week 5 Smoke Tests (Days 21-33)                 ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log(`\nCLI Path: ${CLI_PATH}`);
  console.log(`Started: ${new Date().toISOString()}`);

  // Check if CLI is built
  try {
    execSync(`node "${CLI_PATH}" --version`, { stdio: 'pipe' });
  } catch {
    console.error('\n❌ CLI not built. Run `pnpm build` first.');
    process.exit(1);
  }

  // Run test groups
  testHelpOutput();
  testDoctorCommand();
  testLoginCommand();
  testStatusCommand();
  testSyncCommand();
  testRagCommand();
  testHooksCommand();
  testEventsCommand();
  testInitCommand();
  testUnknownCommand();
  testEnvironmentVariables();

  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const total = results.length;

  console.log(`\n  Total:  ${total}`);
  console.log(`  Passed: ${passed} ✓`);
  console.log(`  Failed: ${failed} ✗`);
  console.log(`\n  Success Rate: ${((passed / total) * 100).toFixed(1)}%`);

  if (failed > 0) {
    console.log('\nFailed Tests:');
    results.filter(r => !r.passed).forEach(r => {
      console.log(`  - ${r.name}`);
      if (r.error) {
        console.log(`    ${r.error}`);
      }
    });
  }

  console.log(`\nFinished: ${new Date().toISOString()}`);

  // Exit with appropriate code
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(console.error);
