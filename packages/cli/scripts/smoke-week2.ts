#!/usr/bin/env tsx
// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

/**
 * CLI Week 2 Smoke Test
 *
 * Tests CLI commands for Days 8-10:
 * - Day 8: tag sync skills (list, push, pull)
 * - Day 9: tag sync mcp (list, push, pull)
 * - Day 10: tag rag (ingest, search, list, stats)
 *
 * Usage:
 *   pnpm --filter @arkon/cli smoke:week2
 *   # or
 *   tsx packages/cli/scripts/smoke-week2.ts
 *
 * Prerequisites:
 *   - API server running at localhost:3001
 *   - TAG_TOKEN environment variable set (or run tag login first)
 *
 * Environment:
 *   TAG_API_URL - API endpoint (default: http://localhost:3001)
 *   TAG_TOKEN - Access token for headless auth
 */

import { execSync, spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  output?: string;
}

const results: TestResult[] = [];
const CLI_PATH = path.join(__dirname, '..', 'dist', 'index.js');

// ============================================================================
// Test Helpers
// ============================================================================

function runCli(args: string[], options: { expectError?: boolean } = {}): { stdout: string; stderr: string; code: number } {
  const result = spawnSync('node', [CLI_PATH, ...args], {
    encoding: 'utf-8',
    env: {
      ...process.env,
      FORCE_COLOR: '0', // Disable color for easier parsing
    },
  });

  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    code: result.status || 0,
  };
}

function runTest(name: string, fn: () => void): TestResult {
  try {
    fn();
    const result = { name, passed: true };
    results.push(result);
    console.log(`  ✅ ${name}`);
    return result;
  } catch (error) {
    const result = {
      name,
      passed: false,
      error: error instanceof Error ? error.message : String(error),
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

function assertExitCode(result: { code: number }, expected: number, message?: string): void {
  if (result.code !== expected) {
    throw new Error(message || `Expected exit code ${expected}, got ${result.code}`);
  }
}

// ============================================================================
// Test Context
// ============================================================================

let tempDir: string;
let mcpConfigPath: string;
let skillDir: string;

function setupTestDir(): void {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-smoke-'));
  mcpConfigPath = path.join(tempDir, '.mcp.json');
  skillDir = path.join(tempDir, '.claude', 'skills', 'test-skill');

  // Create .claude/skills directory structure
  fs.mkdirSync(skillDir, { recursive: true });
}

function cleanupTestDir(): void {
  if (tempDir && fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

// ============================================================================
// CLI Help Tests
// ============================================================================

function testCLIHelp(): void {
  const result = runCli(['--help']);
  assertExitCode(result, 0);
  assertContains(result.stdout, 'tag');
  assertContains(result.stdout, 'sync');
  assertContains(result.stdout, 'rag');
}

function testSyncHelp(): void {
  const result = runCli(['sync', '--help']);
  assertExitCode(result, 0);
  assertContains(result.stdout, 'skills');
  assertContains(result.stdout, 'mcp');
}

function testRagHelp(): void {
  const result = runCli(['rag', '--help']);
  assertExitCode(result, 0);
  assertContains(result.stdout, 'ingest');
  assertContains(result.stdout, 'search');
  assertContains(result.stdout, 'list');
  assertContains(result.stdout, 'stats');
  assertContains(result.stdout, 'query');
}

// ============================================================================
// Day 8: Skills Sync CLI Tests
// ============================================================================

function testSyncSkillsHelp(): void {
  const result = runCli(['sync', 'skills', '--help']);
  assertExitCode(result, 0);
  assertContains(result.stdout, 'list');
  assertContains(result.stdout, 'push');
  assertContains(result.stdout, 'pull');
}

function testSyncSkillsListNoAuth(): void {
  // Without auth, should return exit code 2
  const result = runCli(['sync', 'skills', 'list'], { expectError: true });
  // Exit code 2 = AUTH_REQUIRED
  if (result.code !== 2 && result.code !== 0) {
    // If authenticated, it should work; if not, it should be 2
    assertContains(
      result.stdout + result.stderr,
      'authenticated',
      'Should mention authentication'
    );
  }
}

// ============================================================================
// Day 9: MCP Sync CLI Tests
// ============================================================================

function testSyncMcpHelp(): void {
  const result = runCli(['sync', 'mcp', '--help']);
  assertExitCode(result, 0);
  assertContains(result.stdout, 'list');
  assertContains(result.stdout, 'push');
  assertContains(result.stdout, 'pull');
}

function testSyncMcpListNoAuth(): void {
  const result = runCli(['sync', 'mcp', 'list'], { expectError: true });
  if (result.code !== 2 && result.code !== 0) {
    assertContains(
      result.stdout + result.stderr,
      'authenticated',
      'Should mention authentication'
    );
  }
}

// ============================================================================
// Day 10: RAG CLI Tests
// ============================================================================

function testRagIngestHelp(): void {
  const result = runCli(['rag', 'ingest', '--help']);
  assertExitCode(result, 0);
  assertContains(result.stdout, 'source-type');
  assertContains(result.stdout, 'chunk-size');
  assertContains(result.stdout, 'dry-run');
}

function testRagIngestDirHelp(): void {
  const result = runCli(['rag', 'ingest-dir', '--help']);
  assertExitCode(result, 0);
  assertContains(result.stdout, 'recursive');
  assertContains(result.stdout, 'dry-run');
}

function testRagSearchHelp(): void {
  const result = runCli(['rag', 'search', '--help']);
  assertExitCode(result, 0);
  assertContains(result.stdout, 'source-type');
  assertContains(result.stdout, 'limit');
  assertContains(result.stdout, 'threshold');
}

function testRagQueryHelp(): void {
  const result = runCli(['rag', 'query', '--help']);
  assertExitCode(result, 0);
  assertContains(result.stdout, 'top-k');
  assertContains(result.stdout, 'llm-provider');
  assertContains(result.stdout, 'no-sources');
}

function testRagListHelp(): void {
  const result = runCli(['rag', 'list', '--help']);
  assertExitCode(result, 0);
  assertContains(result.stdout, 'source-type');
  assertContains(result.stdout, 'limit');
  assertContains(result.stdout, 'offset');
}

function testRagStatsHelp(): void {
  const result = runCli(['rag', 'stats', '--help']);
  assertExitCode(result, 0);
  assertContains(result.stdout, 'json');
}

function testRagReindexHelp(): void {
  const result = runCli(['rag', 'reindex', '--help']);
  assertExitCode(result, 0);
  assertContains(result.stdout, 'types');
  assertContains(result.stdout, 'dry-run');
}

function testRagStatusHelp(): void {
  const result = runCli(['rag', 'status', '--help']);
  assertExitCode(result, 0);
  assertContains(result.stdout, 'json');
}

// ============================================================================
// Document Processing Tests (local, no API needed)
// ============================================================================

function testRagIngestDryRun(): void {
  // Create a test file
  const testFile = path.join(tempDir, 'test-doc.txt');
  fs.writeFileSync(testFile, 'This is a test document for dry-run ingestion.');

  const result = runCli(['rag', 'ingest', testFile, '--dry-run']);

  // Should fail with auth error (exit 2) or show dry run info (exit 0)
  if (result.code === 0) {
    assertContains(result.stdout, 'Dry Run');
    assertContains(result.stdout, 'test-doc.txt');
  } else if (result.code === 2) {
    // Auth required - expected without TAG_TOKEN
    assertContains(result.stdout + result.stderr, 'authenticated');
  } else {
    throw new Error(`Unexpected exit code: ${result.code}`);
  }
}

function testRagIngestDirDryRun(): void {
  // Create test files in temp dir
  fs.writeFileSync(path.join(tempDir, 'file1.txt'), 'First file content');
  fs.writeFileSync(path.join(tempDir, 'file2.md'), '# Second file\n\nContent here');

  const result = runCli(['rag', 'ingest-dir', tempDir, '--dry-run']);

  if (result.code === 0) {
    assertContains(result.stdout, 'document');
  } else if (result.code === 2) {
    assertContains(result.stdout + result.stderr, 'authenticated');
  } else {
    throw new Error(`Unexpected exit code: ${result.code}`);
  }
}

// ============================================================================
// Main Runner
// ============================================================================

async function main(): Promise<void> {
  console.log('\n' + '='.repeat(60));
  console.log('CLI Week 2 Smoke Test (Days 8-10)');
  console.log('='.repeat(60) + '\n');

  // Check CLI is built
  if (!fs.existsSync(CLI_PATH)) {
    console.error(`CLI not built. Run 'pnpm build' in packages/cli first.`);
    console.error(`Expected: ${CLI_PATH}`);
    process.exit(1);
  }

  // Setup
  setupTestDir();

  try {
    // General CLI Tests
    console.log('General CLI:');
    runTest('CLI --help shows all commands', testCLIHelp);
    runTest('sync --help shows skills and mcp', testSyncHelp);
    runTest('rag --help shows all subcommands', testRagHelp);

    // Day 8: Skills Sync
    console.log('\nDay 8 - Skills Sync CLI:');
    runTest('sync skills --help shows commands', testSyncSkillsHelp);
    runTest('sync skills list handles auth', testSyncSkillsListNoAuth);

    // Day 9: MCP Sync
    console.log('\nDay 9 - MCP Sync CLI:');
    runTest('sync mcp --help shows commands', testSyncMcpHelp);
    runTest('sync mcp list handles auth', testSyncMcpListNoAuth);

    // Day 10: RAG Ingestion
    console.log('\nDay 10 - RAG CLI:');
    runTest('rag ingest --help shows options', testRagIngestHelp);
    runTest('rag ingest-dir --help shows options', testRagIngestDirHelp);
    runTest('rag search --help shows options', testRagSearchHelp);
    runTest('rag query --help shows options', testRagQueryHelp);
    runTest('rag list --help shows options', testRagListHelp);
    runTest('rag stats --help shows options', testRagStatsHelp);
    runTest('rag reindex --help shows options', testRagReindexHelp);
    runTest('rag status --help shows options', testRagStatusHelp);

    // Document Processing (local)
    console.log('\nDocument Processing (local):');
    runTest('rag ingest --dry-run processes file', testRagIngestDryRun);
    runTest('rag ingest-dir --dry-run scans directory', testRagIngestDirDryRun);

  } finally {
    cleanupTestDir();
  }

  // Summary
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  console.log('\n' + '='.repeat(60));
  console.log(`CLI Week 2 Smoke Test: ${passed}/${results.length} passed`);

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

  console.log('\n✅ All CLI Week 2 tests passed!\n');
  process.exit(0);
}

main().catch((error) => {
  console.error('Smoke test failed:', error);
  process.exit(1);
});
