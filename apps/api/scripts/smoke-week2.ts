#!/usr/bin/env tsx
/**
 * Week 2 Smoke Test Script
 *
 * Validates Week 2 functionality (Days 8-10):
 * - Day 8: Skills Sync - Skills API for sync operations
 * - Day 9: MCP Sync - MCP Server CRUD and toggle
 * - Day 10: RAG Ingestion - Batch embedding, search, reindex
 *
 * Usage:
 *   pnpm --filter @arkon/api smoke:week2
 *   # or
 *   tsx apps/api/scripts/smoke-week2.ts
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
let testSkillId: string | null = null;
let testMcpServerId: string | null = null;
let testEmbeddingIds: string[] = [];

// ============================================================================
// Auth Setup
// ============================================================================

async function authenticate() {
  const response = (await apiCall('POST', '/api/auth/login', {
    body: { email: TEST_EMAIL, password: TEST_PASSWORD },
  })) as { token: string };

  if (!response.token) {
    throw new Error('No token in login response');
  }

  authToken = response.token;
}

// ============================================================================
// Day 8: Skills Sync Tests
// ============================================================================

async function testSkillsListWithPagination() {
  if (!authToken) throw new Error('No auth token available');

  const response = (await apiCall('GET', '/api/skills?limit=5&offset=0', {
    token: authToken,
  })) as { data: unknown[]; meta: { total: number; limit: number; offset: number } };

  if (!Array.isArray(response.data)) {
    throw new Error('Skills list should be an array');
  }

  if (typeof response.meta.total !== 'number') {
    throw new Error('Meta should include total count');
  }

  if (response.meta.limit !== 5) {
    throw new Error(`Limit should be 5, got ${response.meta.limit}`);
  }
}

async function testSkillsCreateForSync() {
  if (!authToken) throw new Error('No auth token available');

  const skillName = `sync-test-skill-${Date.now()}`;

  const response = (await apiCall('POST', '/api/skills', {
    token: authToken,
    body: {
      name: skillName,
      description: 'Skill for sync testing',
      content: `---
description: Sync test skill
scope: TENANT
---

# Sync Test Skill

This skill is created for testing sync operations.
`,
      scope: 'TENANT',
    },
    expectedStatus: 201,
  })) as { data: { id: string; name: string; sha256: string; version: number } };

  if (!response.data?.id) {
    throw new Error('No skill ID in create response');
  }

  if (!response.data?.sha256) {
    throw new Error('No SHA256 hash in response');
  }

  if (response.data.name !== skillName) {
    throw new Error('Skill name mismatch');
  }

  testSkillId = response.data.id;
}

async function testSkillsGetWithHash() {
  if (!authToken || !testSkillId) throw new Error('Prerequisites not met');

  const response = (await apiCall('GET', `/api/skills/${testSkillId}`, {
    token: authToken,
  })) as { data: { id: string; sha256: string; version: number; content: string } };

  if (!response.data.sha256) {
    throw new Error('Skill should have SHA256 hash');
  }

  if (response.data.sha256.length !== 64) {
    throw new Error('SHA256 should be 64 characters');
  }

  if (!response.data.content) {
    throw new Error('Skill should have content');
  }
}

async function testSkillsSearchByName() {
  if (!authToken || !testSkillId) throw new Error('Prerequisites not met');

  const response = (await apiCall('GET', '/api/skills?search=sync-test', {
    token: authToken,
  })) as { data: Array<{ id: string; name: string }> };

  if (!Array.isArray(response.data)) {
    throw new Error('Search results should be an array');
  }

  const found = response.data.find((s) => s.id === testSkillId);
  if (!found) {
    throw new Error('Created skill should appear in search results');
  }
}

async function testSkillsUpdateContent() {
  if (!authToken || !testSkillId) throw new Error('Prerequisites not met');

  const newContent = `---
description: Updated sync test skill
scope: TENANT
---

# Updated Sync Test Skill

Content updated at ${new Date().toISOString()}
`;

  const response = (await apiCall('PUT', `/api/skills/${testSkillId}`, {
    token: authToken,
    body: {
      content: newContent,
      description: 'Updated for sync testing',
    },
  })) as { data: { id: string; version: number; sha256: string } };

  if (response.data.version !== 2) {
    throw new Error(`Version should be 2, got ${response.data.version}`);
  }

  if (!response.data.sha256) {
    throw new Error('Updated skill should have new SHA256');
  }
}

// ============================================================================
// Day 9: MCP Server Sync Tests
// ============================================================================

async function testMcpServerCreate() {
  if (!authToken) throw new Error('No auth token available');

  const serverName = `mcp-test-server-${Date.now()}`;

  const response = (await apiCall('POST', '/api/mcp', {
    token: authToken,
    body: {
      name: serverName,
      description: 'Test MCP server for smoke testing',
      command: 'npx',
      args: ['-y', '@test/mcp-server'],
      env: { API_KEY: 'test-key', DEBUG: 'true' },
      scope: 'TENANT',
      enabled: true,
    },
    expectedStatus: 201,
  })) as { data: { id: string; name: string; sha256: string; enabled: boolean } };

  if (!response.data?.id) {
    throw new Error('No MCP server ID in response');
  }

  if (!response.data?.sha256) {
    throw new Error('No SHA256 hash in response');
  }

  if (response.data.enabled !== true) {
    throw new Error('Server should be enabled');
  }

  testMcpServerId = response.data.id;
}

async function testMcpServerList() {
  if (!authToken) throw new Error('No auth token available');

  const response = (await apiCall('GET', '/api/mcp?limit=10', {
    token: authToken,
  })) as { data: unknown[]; meta: { total: number } };

  if (!Array.isArray(response.data)) {
    throw new Error('MCP server list should be an array');
  }

  if (response.meta.total < 1) {
    throw new Error('Should have at least 1 MCP server');
  }
}

async function testMcpServerGet() {
  if (!authToken || !testMcpServerId) throw new Error('Prerequisites not met');

  const response = (await apiCall('GET', `/api/mcp/${testMcpServerId}`, {
    token: authToken,
  })) as { data: { id: string; command: string; args: string[]; env: Record<string, string> } };

  if (response.data.id !== testMcpServerId) {
    throw new Error('MCP server ID mismatch');
  }

  if (response.data.command !== 'npx') {
    throw new Error('Command should be npx');
  }

  if (!Array.isArray(response.data.args)) {
    throw new Error('Args should be an array');
  }

  if (typeof response.data.env !== 'object') {
    throw new Error('Env should be an object');
  }
}

async function testMcpServerUpdate() {
  if (!authToken || !testMcpServerId) throw new Error('Prerequisites not met');

  const response = (await apiCall('PUT', `/api/mcp/${testMcpServerId}`, {
    token: authToken,
    body: {
      description: 'Updated MCP server description',
      args: ['-y', '@test/mcp-server', '--port', '3000'],
      env: { API_KEY: 'updated-key', PORT: '3000' },
    },
  })) as { data: { id: string; args: string[]; sha256: string } };

  if (response.data.args.length !== 4) {
    throw new Error(`Args should have 4 items, got ${response.data.args.length}`);
  }

  if (!response.data.sha256) {
    throw new Error('Updated server should have new SHA256');
  }
}

async function testMcpServerToggle() {
  if (!authToken || !testMcpServerId) throw new Error('Prerequisites not met');

  // Toggle off
  const offResponse = (await apiCall('PATCH', `/api/mcp/${testMcpServerId}/toggle`, {
    token: authToken,
    body: { enabled: false },
  })) as { data: { enabled: boolean } };

  if (offResponse.data.enabled !== false) {
    throw new Error('Server should be disabled');
  }

  // Toggle back on
  const onResponse = (await apiCall('PATCH', `/api/mcp/${testMcpServerId}/toggle`, {
    token: authToken,
    body: { enabled: true },
  })) as { data: { enabled: boolean } };

  if (onResponse.data.enabled !== true) {
    throw new Error('Server should be enabled');
  }
}

async function testMcpServerSearchByName() {
  if (!authToken || !testMcpServerId) throw new Error('Prerequisites not met');

  const response = (await apiCall('GET', '/api/mcp?search=mcp-test', {
    token: authToken,
  })) as { data: Array<{ id: string; name: string }> };

  const found = response.data.find((s) => s.id === testMcpServerId);
  if (!found) {
    throw new Error('Created MCP server should appear in search results');
  }
}

// ============================================================================
// Day 10: RAG Ingestion Tests
// ============================================================================

async function testEmbeddingBatch() {
  if (!authToken) throw new Error('No auth token available');

  const response = (await apiCall('POST', '/api/embedding/embed-batch', {
    token: authToken,
    body: {
      items: [
        {
          content: 'This is the first test document for batch embedding.',
          sourceType: 'smoke-test',
          sourceId: `doc-1-${Date.now()}`,
          metadata: { chunkIndex: 0 },
        },
        {
          content: 'This is the second test document for batch embedding.',
          sourceType: 'smoke-test',
          sourceId: `doc-2-${Date.now()}`,
          metadata: { chunkIndex: 0 },
        },
        {
          content: 'This is the third test document about authentication.',
          sourceType: 'smoke-test',
          sourceId: `doc-3-${Date.now()}`,
          metadata: { chunkIndex: 0 },
        },
      ],
      skipIfExists: true,
    },
    expectedStatus: 200,
  })) as { data: Array<{ id: string; created: boolean }>; meta: { total: number; created: number; skipped: number } };

  if (response.meta.total !== 3) {
    throw new Error(`Should have 3 items, got ${response.meta.total}`);
  }

  if (response.meta.created < 1) {
    throw new Error('Should have created at least 1 embedding');
  }

  testEmbeddingIds = response.data.filter((e) => e.created).map((e) => e.id);
}

async function testEmbeddingSearchSemantic() {
  if (!authToken) throw new Error('No auth token available');

  // Search for documents related to "test document"
  const response = (await apiCall('POST', '/api/embedding/search', {
    token: authToken,
    body: {
      query: 'batch embedding test',
      sourceType: 'smoke-test',
      limit: 5,
      threshold: 0.5,
      includeContent: true,
      includeMetadata: true,
    },
  })) as { data: Array<{ id: string; score: number; content?: string; metadata?: unknown }> };

  if (!Array.isArray(response.data)) {
    throw new Error('Search results should be an array');
  }

  // Should find at least one of our test documents
  if (response.data.length < 1) {
    throw new Error('Should find at least 1 matching document');
  }

  // Check that scores are in valid range
  for (const result of response.data) {
    if (result.score < 0 || result.score > 1) {
      throw new Error(`Score should be between 0 and 1, got ${result.score}`);
    }
  }
}

async function testEmbeddingListWithFilters() {
  if (!authToken) throw new Error('No auth token available');

  const response = (await apiCall('GET', '/api/embedding?sourceType=smoke-test&limit=10', {
    token: authToken,
  })) as { data: Array<{ sourceType: string }>; meta: { total: number } };

  if (!Array.isArray(response.data)) {
    throw new Error('Embedding list should be an array');
  }

  // All results should have sourceType = smoke-test
  for (const emb of response.data) {
    if (emb.sourceType !== 'smoke-test') {
      throw new Error(`Expected sourceType smoke-test, got ${emb.sourceType}`);
    }
  }
}

async function testEmbeddingStats() {
  if (!authToken) throw new Error('No auth token available');

  const response = (await apiCall('GET', '/api/embedding/stats', {
    token: authToken,
  })) as { data: { total: number; bySourceType: Record<string, number>; byProvider: Record<string, number> } };

  if (typeof response.data.total !== 'number') {
    throw new Error('Stats should include total count');
  }

  if (typeof response.data.bySourceType !== 'object') {
    throw new Error('Stats should include bySourceType');
  }

  if (typeof response.data.byProvider !== 'object') {
    throw new Error('Stats should include byProvider');
  }
}

async function testEmbeddingCoverage() {
  if (!authToken) throw new Error('No auth token available');

  const response = (await apiCall('GET', '/api/embedding/coverage', {
    token: authToken,
  })) as { data: Record<string, { total: number; embedded: number; coverage: number }> };

  if (typeof response.data !== 'object') {
    throw new Error('Coverage should be an object');
  }

  // Check coverage structure
  for (const [type, stats] of Object.entries(response.data)) {
    if (typeof stats.total !== 'number') {
      throw new Error(`Coverage for ${type} should have total`);
    }
    if (typeof stats.embedded !== 'number') {
      throw new Error(`Coverage for ${type} should have embedded`);
    }
    if (typeof stats.coverage !== 'number') {
      throw new Error(`Coverage for ${type} should have coverage`);
    }
  }
}

async function testEmbeddingReindexDryRun() {
  if (!authToken) throw new Error('No auth token available');

  const response = (await apiCall('POST', '/api/embedding/reindex', {
    token: authToken,
    body: {
      dryRun: true,
    },
  })) as { data: { dryRun: boolean; totals: { total: number; processed: number } } };

  if (response.data.dryRun !== true) {
    throw new Error('Should be a dry run');
  }

  if (typeof response.data.totals.total !== 'number') {
    throw new Error('Should have totals');
  }
}

async function testRAGRetrieve() {
  if (!authToken) throw new Error('No auth token available');

  const response = (await apiCall('POST', '/api/rag/retrieve', {
    token: authToken,
    body: {
      query: 'authentication document',
      sourceTypes: ['smoke-test'],
      topK: 3,
    },
  })) as { data: { documents: unknown[]; retrievalTimeMs: number } };

  if (!Array.isArray(response.data.documents)) {
    throw new Error('Should return documents array');
  }

  if (typeof response.data.retrievalTimeMs !== 'number') {
    throw new Error('Should return retrieval time');
  }
}

async function testRAGStatusConfig() {
  if (!authToken) throw new Error('No auth token available');

  const response = (await apiCall('GET', '/api/rag/status', {
    token: authToken,
  })) as {
    data: {
      llmAvailable: boolean;
      embeddingAvailable: boolean;
      config: { defaultTopK: number; defaultThreshold: number };
    };
  };

  if (typeof response.data.llmAvailable !== 'boolean') {
    throw new Error('Should have llmAvailable');
  }

  if (typeof response.data.embeddingAvailable !== 'boolean') {
    throw new Error('Should have embeddingAvailable');
  }

  if (typeof response.data.config.defaultTopK !== 'number') {
    throw new Error('Should have config.defaultTopK');
  }
}

// ============================================================================
// Cleanup Tests
// ============================================================================

async function testCleanupSkill() {
  if (!authToken || !testSkillId) return;

  await apiCall('DELETE', `/api/skills/${testSkillId}`, {
    token: authToken,
  });
}

async function testCleanupMcpServer() {
  if (!authToken || !testMcpServerId) return;

  await apiCall('DELETE', `/api/mcp/${testMcpServerId}`, {
    token: authToken,
  });
}

async function testCleanupEmbeddings() {
  if (!authToken || testEmbeddingIds.length === 0) return;

  for (const id of testEmbeddingIds) {
    try {
      await apiCall('DELETE', `/api/embedding/${id}`, {
        token: authToken,
      });
    } catch {
      // Ignore cleanup errors
    }
  }
}

// ============================================================================
// Main Runner
// ============================================================================

async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('Week 2 Smoke Test (Days 8-10)');
  console.log(`API: ${API_URL}`);
  console.log('='.repeat(60) + '\n');

  // Auth
  console.log('Authentication:');
  await runTest('Login and get token', authenticate);

  // Day 8: Skills Sync
  console.log('\nDay 8 - Skills Sync:');
  await runTest('Skills list with pagination', testSkillsListWithPagination);
  await runTest('Create skill for sync testing', testSkillsCreateForSync);
  await runTest('Get skill with SHA256 hash', testSkillsGetWithHash);
  await runTest('Search skills by name', testSkillsSearchByName);
  await runTest('Update skill content (version increments)', testSkillsUpdateContent);

  // Day 9: MCP Server Sync
  console.log('\nDay 9 - MCP Server Sync:');
  await runTest('Create MCP server', testMcpServerCreate);
  await runTest('List MCP servers', testMcpServerList);
  await runTest('Get MCP server details', testMcpServerGet);
  await runTest('Update MCP server config', testMcpServerUpdate);
  await runTest('Toggle MCP server enabled state', testMcpServerToggle);
  await runTest('Search MCP servers by name', testMcpServerSearchByName);

  // Day 10: RAG Ingestion
  console.log('\nDay 10 - RAG Ingestion:');
  await runTest('Batch embedding creation', testEmbeddingBatch);
  await runTest('Semantic search with filters', testEmbeddingSearchSemantic);
  await runTest('List embeddings with source type filter', testEmbeddingListWithFilters);
  await runTest('Embedding statistics', testEmbeddingStats);
  await runTest('Embedding coverage report', testEmbeddingCoverage);
  await runTest('Reindex dry run', testEmbeddingReindexDryRun);
  await runTest('RAG retrieve (no LLM)', testRAGRetrieve);
  await runTest('RAG status and config', testRAGStatusConfig);

  // Cleanup
  console.log('\nCleanup:');
  await runTest('Cleanup test skill', testCleanupSkill);
  await runTest('Cleanup test MCP server', testCleanupMcpServer);
  await runTest('Cleanup test embeddings', testCleanupEmbeddings);

  // Summary
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const totalDuration = results.reduce((sum, r) => sum + r.durationMs, 0);

  console.log('\n' + '='.repeat(60));
  console.log(`Week 2 Smoke Test: ${passed}/${results.length} passed`);
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

  console.log('\n✅ All Week 2 tests passed!\n');
  process.exit(0);
}

main().catch((error) => {
  console.error('Smoke test failed:', error);
  process.exit(1);
});
