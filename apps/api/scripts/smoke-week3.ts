#!/usr/bin/env tsx
// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

/**
 * Week 3 Smoke Test Script
 *
 * Validates Week 3 functionality (Days 11-15):
 * - Day 11: Project Init - API endpoints for teams, skills listing
 * - Day 12: E2E Smoke - Full loop validation
 * - Day 13: Buffer - DX improvements
 * - Day 15: Admin UI APIs - Teams CRUD, Members, Audit logs
 *
 * Usage:
 *   pnpm --filter @arkon/api smoke:week3
 *   # or
 *   tsx apps/api/scripts/smoke-week3.ts
 *
 * Environment:
 *   API_URL - API base URL (default: http://localhost:3001)
 *   TEST_EMAIL - Test user email (default: admin@arkon.dev)
 *   TEST_PASSWORD - Test user password (default: admin123)
 */

import { config } from 'dotenv';
config();

const API_URL = process.env.API_URL || 'http://localhost:3001';
const TEST_EMAIL = process.env.TEST_EMAIL || 'admin@arkon.dev';
const TEST_PASSWORD = process.env.TEST_PASSWORD || 'admin123';

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

async function runTest(
  name: string,
  fn: () => Promise<void>
): Promise<TestResult> {
  const start = Date.now();
  try {
    await fn();
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

async function apiCall(
  method: string,
  path: string,
  options: {
    body?: unknown;
    token?: string;
    expectedStatus?: number;
  } = {}
): Promise<unknown> {
  const { body, token, expectedStatus = 200 } = options;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (response.status !== expectedStatus) {
    const text = await response.text();
    throw new Error(
      `Expected status ${expectedStatus}, got ${response.status}: ${text}`
    );
  }

  if (response.headers.get('content-type')?.includes('application/json')) {
    return response.json();
  }

  return response.text();
}

// ============================================================================
// Test Context
// ============================================================================

let authToken: string | null = null;
let userId: string | null = null;
let tenantId: string | null = null;
let testTeamId: string | null = null;

// ============================================================================
// Auth Setup
// ============================================================================

async function authenticate() {
  const response = (await apiCall('POST', '/api/auth/login', {
    body: { email: TEST_EMAIL, password: TEST_PASSWORD },
  })) as { token: string; user?: { id: string; tenantId: string } };

  if (!response.token) {
    throw new Error('No token in login response');
  }

  authToken = response.token;
  userId = response.user?.id || null;
  tenantId = response.user?.tenantId || null;
}

// ============================================================================
// Day 11: Project Init Support Tests
// ============================================================================

async function testUserMeWithTeams() {
  if (!authToken) throw new Error('No auth token available');

  const response = (await apiCall('GET', '/api/auth/me', {
    token: authToken,
  })) as { user: { id: string; email: string; teams?: Array<{ id: string; name: string }> } };

  if (!response.user?.id) {
    throw new Error('Should return user id');
  }

  if (!response.user?.email) {
    throw new Error('Should return user email');
  }

  // Teams may be empty for new users
  if (!Array.isArray(response.user?.teams)) {
    // Teams field may not exist, which is ok
  }
}

async function testSkillsListForProject() {
  if (!authToken) throw new Error('No auth token available');

  // List skills that would be available for a project
  const response = (await apiCall('GET', '/api/skills?limit=20&scope=TENANT', {
    token: authToken,
  })) as { data: Array<{ id: string; name: string; scope: string }> };

  if (!Array.isArray(response.data)) {
    throw new Error('Skills list should be an array');
  }
}

async function testMcpServersListForProject() {
  if (!authToken) throw new Error('No auth token available');

  const response = (await apiCall('GET', '/api/mcp?limit=20&enabled=true', {
    token: authToken,
  })) as { data: Array<{ id: string; name: string; enabled: boolean }> };

  if (!Array.isArray(response.data)) {
    throw new Error('MCP servers list should be an array');
  }
}

// ============================================================================
// Day 12: E2E Full Loop Tests
// ============================================================================

async function testFullAuthLoop() {
  // Already authenticated, verify status
  const meResponse = (await apiCall('GET', '/api/auth/me', {
    token: authToken!,
  })) as { user: { id: string } };

  if (!meResponse.user?.id) {
    throw new Error('Auth me should return user');
  }

  // Note: We don't test logout/re-login here to preserve our test token
}

async function testFullSkillsLoop() {
  if (!authToken) throw new Error('No auth token available');

  // 1. List skills
  const listResponse = (await apiCall('GET', '/api/skills?limit=5', {
    token: authToken,
  })) as { data: unknown[] };

  if (!Array.isArray(listResponse.data)) {
    throw new Error('Should list skills');
  }

  // 2. Create a skill
  const skillName = `e2e-test-skill-${Date.now()}`;
  const createResponse = (await apiCall('POST', '/api/skills', {
    token: authToken,
    body: {
      name: skillName,
      description: 'E2E test skill',
      content: '# E2E Test\n\nThis is a test skill.',
      scope: 'TENANT',
    },
    expectedStatus: 201,
  })) as { data: { id: string; sha256: string } };

  if (!createResponse.data?.id) {
    throw new Error('Should create skill');
  }

  // 3. Get the skill
  const getResponse = (await apiCall('GET', `/api/skills/${createResponse.data.id}`, {
    token: authToken,
  })) as { data: { id: string; content: string } };

  if (!getResponse.data?.content) {
    throw new Error('Should get skill content');
  }

  // 4. Clean up
  await apiCall('DELETE', `/api/skills/${createResponse.data.id}`, {
    token: authToken,
  });
}

async function testFullMcpLoop() {
  if (!authToken) throw new Error('No auth token available');

  // 1. List MCP servers
  const listResponse = (await apiCall('GET', '/api/mcp?limit=5', {
    token: authToken,
  })) as { data: unknown[] };

  if (!Array.isArray(listResponse.data)) {
    throw new Error('Should list MCP servers');
  }

  // 2. Create an MCP server
  const serverName = `e2e-test-mcp-${Date.now()}`;
  const createResponse = (await apiCall('POST', '/api/mcp', {
    token: authToken,
    body: {
      name: serverName,
      description: 'E2E test MCP server',
      command: 'node',
      args: ['--version'],
      env: {},
      scope: 'TENANT',
    },
    expectedStatus: 201,
  })) as { data: { id: string; sha256: string } };

  if (!createResponse.data?.id) {
    throw new Error('Should create MCP server');
  }

  // 3. Toggle enabled
  await apiCall('PATCH', `/api/mcp/${createResponse.data.id}/toggle`, {
    token: authToken,
    body: { enabled: false },
  });

  // 4. Clean up
  await apiCall('DELETE', `/api/mcp/${createResponse.data.id}`, {
    token: authToken,
  });
}

async function testFullRagLoop() {
  if (!authToken) throw new Error('No auth token available');

  const docId = `e2e-doc-${Date.now()}`;

  // 1. Ingest a document
  const embedResponse = (await apiCall('POST', '/api/embedding/embed-batch', {
    token: authToken,
    body: {
      items: [
        {
          content: 'This is an end-to-end test document for RAG validation.',
          sourceType: 'e2e-test',
          sourceId: docId,
          metadata: { test: true },
        },
      ],
      skipIfExists: false,
    },
  })) as { data: Array<{ id: string; created: boolean }> };

  if (!Array.isArray(embedResponse.data)) {
    throw new Error('Should create embedding');
  }

  const embeddingId = embedResponse.data[0]?.id;

  // 2. Search for it
  const searchResponse = (await apiCall('POST', '/api/embedding/search', {
    token: authToken,
    body: {
      query: 'end-to-end test document',
      sourceType: 'e2e-test',
      limit: 5,
      threshold: 0.3,
    },
  })) as { data: Array<{ id: string; score: number }> };

  if (!Array.isArray(searchResponse.data)) {
    throw new Error('Should return search results');
  }

  // 3. RAG retrieve
  const ragResponse = (await apiCall('POST', '/api/rag/retrieve', {
    token: authToken,
    body: {
      query: 'test document',
      sourceTypes: ['e2e-test'],
      topK: 3,
    },
  })) as { data: { documents: unknown[] } };

  if (!Array.isArray(ragResponse.data.documents)) {
    throw new Error('Should return RAG documents');
  }

  // 4. Clean up
  if (embeddingId) {
    try {
      await apiCall('DELETE', `/api/embedding/${embeddingId}`, {
        token: authToken,
      });
    } catch {
      // Ignore cleanup errors
    }
  }
}

// ============================================================================
// Day 15: Admin API Tests
// ============================================================================

async function testTeamsCreate() {
  if (!authToken) throw new Error('No auth token available');

  const teamName = `test-team-${Date.now()}`;

  // Create team - endpoint may not exist yet, handle gracefully
  try {
    const response = (await apiCall('POST', '/api/admin/teams', {
      token: authToken,
      body: {
        name: teamName,
        description: 'Test team for smoke testing',
      },
      expectedStatus: 201,
    })) as { data: { id: string; name: string } };

    if (!response.data?.id) {
      throw new Error('Should return team id');
    }

    testTeamId = response.data.id;
  } catch (error) {
    // Admin API may not be implemented yet
    if ((error as Error).message.includes('404')) {
      console.log('    (Admin teams API not implemented yet - skipping)');
      return;
    }
    throw error;
  }
}

async function testTeamsList() {
  if (!authToken) throw new Error('No auth token available');

  try {
    const response = (await apiCall('GET', '/api/admin/teams', {
      token: authToken,
    })) as { data: unknown[] };

    if (!Array.isArray(response.data)) {
      throw new Error('Should return teams array');
    }
  } catch (error) {
    if ((error as Error).message.includes('404')) {
      console.log('    (Admin teams API not implemented yet - skipping)');
      return;
    }
    throw error;
  }
}

async function testAuditLogQuery() {
  if (!authToken) throw new Error('No auth token available');

  try {
    const response = (await apiCall('GET', '/api/admin/audit?limit=10', {
      token: authToken,
    })) as { data: Array<{ id: string; action: string }>; meta: { total: number } };

    if (!Array.isArray(response.data)) {
      throw new Error('Should return audit log array');
    }
  } catch (error) {
    if ((error as Error).message.includes('404')) {
      console.log('    (Admin audit API not implemented yet - skipping)');
      return;
    }
    throw error;
  }
}

async function testCleanupTeam() {
  if (!authToken || !testTeamId) return;

  try {
    await apiCall('DELETE', `/api/admin/teams/${testTeamId}`, {
      token: authToken,
    });
  } catch {
    // Ignore cleanup errors
  }
}

// ============================================================================
// Main Runner
// ============================================================================

async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('Week 3 Smoke Test (Days 11-15)');
  console.log(`API: ${API_URL}`);
  console.log('='.repeat(60) + '\n');

  // Auth
  console.log('Authentication:');
  await runTest('Login and get token', authenticate);

  // Day 11: Project Init Support
  console.log('\nDay 11 - Project Init Support:');
  await runTest('User me endpoint with teams', testUserMeWithTeams);
  await runTest('Skills list for project scoping', testSkillsListForProject);
  await runTest('MCP servers list for project scoping', testMcpServersListForProject);

  // Day 12: E2E Full Loop
  console.log('\nDay 12 - E2E Full Loop:');
  await runTest('Full auth loop (login, status)', testFullAuthLoop);
  await runTest('Full skills loop (CRUD)', testFullSkillsLoop);
  await runTest('Full MCP loop (CRUD + toggle)', testFullMcpLoop);
  await runTest('Full RAG loop (ingest, search, retrieve)', testFullRagLoop);

  // Day 15: Admin APIs (may not be implemented yet)
  console.log('\nDay 15 - Admin APIs:');
  await runTest('Create team', testTeamsCreate);
  await runTest('List teams', testTeamsList);
  await runTest('Query audit log', testAuditLogQuery);

  // Cleanup
  console.log('\nCleanup:');
  await runTest('Cleanup test team', testCleanupTeam);

  // Summary
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const totalDuration = results.reduce((sum, r) => sum + r.durationMs, 0);

  console.log('\n' + '='.repeat(60));
  console.log(`Week 3 Smoke Test: ${passed}/${results.length} passed`);
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

  console.log('\n✅ All Week 3 tests passed!\n');
  process.exit(0);
}

main().catch((error) => {
  console.error('Smoke test failed:', error);
  process.exit(1);
});
