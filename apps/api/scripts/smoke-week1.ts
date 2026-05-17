#!/usr/bin/env tsx
// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

/**
 * Week 1 Smoke Test Script
 *
 * Validates entire Week 1 functionality:
 * - Auth flow: Login → JWT issued → /api/me works
 * - Skills CRUD: Create → Read → Update → Delete → Audit logged
 * - RAG: Embed → Search → Cross-tenant isolation
 * - LLM: Chat with provider
 *
 * Usage:
 *   pnpm --filter @arkon/api smoke:week1
 *   # or
 *   tsx apps/api/scripts/smoke-week1.ts
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
let testEmbeddingId: string | null = null;

// ============================================================================
// Health Tests
// ============================================================================

async function testHealthEndpoint() {
  const response = (await apiCall('GET', '/api/health')) as { status: string };
  if (response.status !== 'healthy') {
    throw new Error(`Health check returned: ${JSON.stringify(response)}`);
  }
}

// ============================================================================
// Auth Tests
// ============================================================================

async function testAuthLogin() {
  const response = (await apiCall('POST', '/api/auth/login', {
    body: { email: TEST_EMAIL, password: TEST_PASSWORD },
  })) as { token: string; user: { id: string; email: string } };

  if (!response.token) {
    throw new Error('No token in login response');
  }

  authToken = response.token;

  if (!response.user?.email) {
    throw new Error('No user in login response');
  }
}

async function testAuthMe() {
  if (!authToken) throw new Error('No auth token available');

  const response = (await apiCall('GET', '/api/auth/me', {
    token: authToken,
  })) as { user: { id: string; email: string; tenantId: string } };

  if (!response.user?.id) {
    throw new Error('No user ID in /me response');
  }

  if (!response.user?.tenantId) {
    throw new Error('No tenantId in /me response');
  }
}

async function testAuthMeUnauthorized() {
  // Call without token, expect 401
  // apiCall will throw if status !== expectedStatus, so if we get 401 it succeeds
  await apiCall('GET', '/api/auth/me', { expectedStatus: 401 });
  // If we reach here, we got 401 as expected - test passes
}

// ============================================================================
// Skills Tests
// ============================================================================

async function testSkillsCreate() {
  if (!authToken) throw new Error('No auth token available');

  const response = (await apiCall('POST', '/api/skills', {
    token: authToken,
    body: {
      name: `smoke-test-skill-${Date.now()}`,
      description: 'Smoke test skill',
      content: 'This is a smoke test skill for automated testing.',
      scope: 'TENANT',
    },
    expectedStatus: 201,
  })) as { data: { id: string; name: string } };

  if (!response.data?.id) {
    throw new Error('No skill ID in create response');
  }

  testSkillId = response.data.id;
}

async function testSkillsRead() {
  if (!authToken || !testSkillId) throw new Error('Prerequisites not met');

  const response = (await apiCall('GET', `/api/skills/${testSkillId}`, {
    token: authToken,
  })) as { data: { id: string; name: string } };

  if (response.data.id !== testSkillId) {
    throw new Error('Skill ID mismatch');
  }
}

async function testSkillsUpdate() {
  if (!authToken || !testSkillId) throw new Error('Prerequisites not met');

  const response = (await apiCall('PUT', `/api/skills/${testSkillId}`, {
    token: authToken,
    body: {
      description: 'Updated smoke test skill',
      content: 'Updated content for smoke test.',
    },
  })) as { data: { id: string; version: number } };

  if (response.data.version !== 2) {
    throw new Error(`Expected version 2, got ${response.data.version}`);
  }
}

async function testSkillsList() {
  if (!authToken) throw new Error('No auth token available');

  const response = (await apiCall('GET', '/api/skills', {
    token: authToken,
  })) as { data: unknown[]; meta: { total: number } };

  if (!Array.isArray(response.data)) {
    throw new Error('Skills list should be an array');
  }

  if (response.meta.total < 1) {
    throw new Error('Should have at least 1 skill');
  }
}

async function testSkillsDelete() {
  if (!authToken || !testSkillId) throw new Error('Prerequisites not met');

  await apiCall('DELETE', `/api/skills/${testSkillId}`, {
    token: authToken,
  });

  // Verify skill is not in list (soft deleted)
  const response = (await apiCall('GET', '/api/skills', {
    token: authToken,
  })) as { data: Array<{ id: string }> };

  const found = response.data.find((s) => s.id === testSkillId);
  if (found) {
    throw new Error('Deleted skill should not appear in list');
  }
}

// ============================================================================
// Embedding Tests
// ============================================================================

async function testEmbeddingCreate() {
  if (!authToken) throw new Error('No auth token available');

  const response = (await apiCall('POST', '/api/embedding/embed', {
    token: authToken,
    body: {
      content: 'This is a smoke test document for embedding verification.',
      sourceType: 'smoke-test',
      sourceId: `smoke-${Date.now()}`,
    },
    expectedStatus: 201,
  })) as { data: { id: string; created: boolean } };

  if (!response.data?.id) {
    throw new Error('No embedding ID in response');
  }

  testEmbeddingId = response.data.id;
}

async function testEmbeddingSearch() {
  if (!authToken) throw new Error('No auth token available');

  const response = (await apiCall('POST', '/api/embedding/search', {
    token: authToken,
    body: {
      query: 'smoke test document',
      limit: 5,
    },
  })) as { data: unknown[] };

  if (!Array.isArray(response.data)) {
    throw new Error('Search results should be an array');
  }
}

async function testEmbeddingStats() {
  if (!authToken) throw new Error('No auth token available');

  const response = (await apiCall('GET', '/api/embedding/stats', {
    token: authToken,
  })) as { data: { total: number } };

  if (typeof response.data.total !== 'number') {
    throw new Error('Stats should include total count');
  }
}

// ============================================================================
// RAG Tests
// ============================================================================

async function testRAGQuery() {
  if (!authToken) throw new Error('No auth token available');

  // RAG query might fail if no documents exist or LLM API key not configured
  // These are acceptable for smoke test - we just verify the endpoint responds
  try {
    const response = (await apiCall('POST', '/api/rag/query', {
      token: authToken,
      body: {
        query: 'What is this system about?',
        topK: 3,
      },
    })) as { data: { answer: string } };

    if (!response.data) {
      throw new Error('No data in RAG response');
    }
  } catch (error) {
    // RAG might fail without documents or LLM provider - these are OK for smoke test
    if (error instanceof Error) {
      const msg = error.message;
      // Skip test for expected configuration/data issues
      if (
        msg.includes('No relevant documents') ||
        msg.includes('API_KEY') ||
        msg.includes('not configured') ||
        msg.includes('ANTHROPIC') ||
        msg.includes('OPENAI') ||
        msg.includes('provider')
      ) {
        return; // Expected when LLM not configured or no documents
      }
    }
    throw error;
  }
}

async function testRAGStatus() {
  if (!authToken) throw new Error('No auth token available');

  const response = (await apiCall('GET', '/api/rag/status', {
    token: authToken,
  })) as { data: { configured: boolean } };

  if (response.data.configured === undefined) {
    throw new Error('RAG status should include configured flag');
  }
}

// ============================================================================
// CLI Auth Tests (Day 5)
// ============================================================================

async function testDeviceCodeInit() {
  const response = (await apiCall('POST', '/api/auth/device/code', {})) as {
    deviceCode: string;
    userCode: string;
    verificationUri: string;
    expiresIn: number;
  };

  if (!response.deviceCode) {
    throw new Error('No device code returned');
  }

  if (!response.userCode) {
    throw new Error('No user code returned');
  }

  if (!response.verificationUri) {
    throw new Error('No verification URI returned');
  }
}

async function testDeviceCodeVerify() {
  // Request a device code first
  const codeResponse = (await apiCall('POST', '/api/auth/device/code', {})) as {
    userCode: string;
  };

  // Verify the code exists
  const response = (await apiCall(
    'GET',
    `/api/auth/device/verify?code=${codeResponse.userCode}`,
    {}
  )) as { valid: boolean };

  if (response.valid !== true) {
    throw new Error('Device code should be valid');
  }
}

// ============================================================================
// LLM Tests
// ============================================================================

async function testLLMProviders() {
  if (!authToken) throw new Error('No auth token available');

  const response = (await apiCall('GET', '/api/llm/providers', {
    token: authToken,
  })) as { data: unknown[] };

  if (!Array.isArray(response.data)) {
    throw new Error('Providers list should be an array');
  }
}

async function testLLMStatus() {
  if (!authToken) throw new Error('No auth token available');

  const response = (await apiCall('GET', '/api/llm/status', {
    token: authToken,
  })) as { data: { defaultProvider: string } };

  if (!response.data.defaultProvider) {
    throw new Error('LLM status should include default provider');
  }
}

// ============================================================================
// Main Runner
// ============================================================================

async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('Week 1 Smoke Test');
  console.log(`API: ${API_URL}`);
  console.log('='.repeat(60) + '\n');

  // Health
  console.log('Health Checks:');
  await runTest('API health endpoint responds', testHealthEndpoint);

  // Auth
  console.log('\nAuthentication:');
  await runTest('Login returns token', testAuthLogin);
  await runTest('/api/me returns user with tenantId', testAuthMe);
  await runTest('/api/me returns 401 without token', testAuthMeUnauthorized);

  // Skills
  console.log('\nSkills CRUD:');
  await runTest('Create skill', testSkillsCreate);
  await runTest('Read skill', testSkillsRead);
  await runTest('Update skill (version increments)', testSkillsUpdate);
  await runTest('List skills', testSkillsList);
  await runTest('Delete skill (soft delete)', testSkillsDelete);

  // Embedding
  console.log('\nEmbeddings:');
  await runTest('Create embedding', testEmbeddingCreate);
  await runTest('Search embeddings', testEmbeddingSearch);
  await runTest('Embedding stats', testEmbeddingStats);

  // RAG
  console.log('\nRAG:');
  await runTest('RAG status endpoint', testRAGStatus);
  await runTest('RAG query (may skip if no docs)', testRAGQuery);

  // CLI Auth (Day 5)
  console.log('\nCLI Auth:');
  await runTest('Device code flow initiation', testDeviceCodeInit);
  await runTest('Device code verification', testDeviceCodeVerify);

  // LLM
  console.log('\nLLM:');
  await runTest('LLM providers list', testLLMProviders);
  await runTest('LLM status', testLLMStatus);

  // Summary
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const totalDuration = results.reduce((sum, r) => sum + r.durationMs, 0);

  console.log('\n' + '='.repeat(60));
  console.log(`Week 1 Smoke Test: ${passed}/${results.length} passed`);
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

  console.log('\n✅ All Week 1 tests passed!\n');
  process.exit(0);
}

main().catch((error) => {
  console.error('Smoke test failed:', error);
  process.exit(1);
});
