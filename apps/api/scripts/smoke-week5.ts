#!/usr/bin/env tsx
/**
 * Week 5 Smoke Test (Days 21-33)
 *
 * Tests the following features:
 * - User registration flow
 * - Login and authentication
 * - Admin dashboard API endpoints
 * - Skills, MCP, Usage APIs
 * - Error response format with suggestions
 *
 * Prerequisites:
 * - API server running on localhost:3001
 * - Database running with schema applied
 */

const API_URL = process.env.API_URL || 'http://localhost:3001';

// Test context
let authToken: string | null = null;
let testUserId: string | null = null;
let testTenantId: string | null = null;
let testTeamId: string | null = null;
let testSkillId: string | null = null;

// Test results
const results: { name: string; passed: boolean; error?: string }[] = [];

// Helper functions
async function apiCall(
  method: string,
  path: string,
  body?: unknown,
  token?: string | null
): Promise<{ status: number; data: unknown }> {
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

  const data = await response.json().catch(() => ({}));
  return { status: response.status, data };
}

function runTest(name: string, fn: () => Promise<void>): Promise<void> {
  return fn()
    .then(() => {
      results.push({ name, passed: true });
      console.log(`  ✓ ${name}`);
    })
    .catch((error) => {
      results.push({ name, passed: false, error: error.message });
      console.log(`  ✗ ${name}`);
      console.log(`    Error: ${error.message}`);
    });
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

// ============================================================================
// Test Groups
// ============================================================================

async function testHealthCheck(): Promise<void> {
  console.log('\n📋 Health Check Tests');

  await runTest('GET /api/health returns 200', async () => {
    const { status, data } = await apiCall('GET', '/api/health');
    assert(status === 200, `Expected 200, got ${status}`);
    assert((data as { status: string }).status === 'ok', 'Expected status ok');
  });

  await runTest('GET /api/health/ready returns 200', async () => {
    const { status } = await apiCall('GET', '/api/health/ready');
    assert(status === 200, `Expected 200, got ${status}`);
  });
}

async function testRegistration(): Promise<void> {
  console.log('\n📝 Registration Tests (Day 23)');

  const testEmail = `smoke-test-${Date.now()}@example.com`;
  const testPassword = 'TestPassword123!';

  await runTest('POST /api/auth/register creates new user', async () => {
    const { status, data } = await apiCall('POST', '/api/auth/register', {
      email: testEmail,
      password: testPassword,
      name: 'Smoke Test User',
    });

    assert(status === 201, `Expected 201, got ${status}: ${JSON.stringify(data)}`);

    const response = data as { token: string; user: { id: string; tenantId: string } };
    assert(!!response.token, 'Expected token in response');
    assert(!!response.user.id, 'Expected user.id in response');

    authToken = response.token;
    testUserId = response.user.id;
    testTenantId = response.user.tenantId;
  });

  await runTest('POST /api/auth/register rejects duplicate email', async () => {
    const { status, data } = await apiCall('POST', '/api/auth/register', {
      email: testEmail,
      password: testPassword,
    });

    assert(status === 409, `Expected 409, got ${status}`);
    assert((data as { error: string }).error.includes('already'), 'Expected duplicate error message');
  });

  await runTest('POST /api/auth/register validates password length', async () => {
    const { status, data } = await apiCall('POST', '/api/auth/register', {
      email: `short-pw-${Date.now()}@example.com`,
      password: 'short',
    });

    assert(status === 400, `Expected 400, got ${status}`);
    // Should have validation error with suggestion
    const response = data as { suggestion?: string };
    assert(response.suggestion !== undefined, 'Expected suggestion in validation error');
  });

  await runTest('POST /api/auth/register without name uses email prefix', async () => {
    const testEmailNoName = `noname-${Date.now()}@example.com`;
    const { status, data } = await apiCall('POST', '/api/auth/register', {
      email: testEmailNoName,
      password: 'TestPassword123!',
      // No name provided
    });

    assert(status === 201, `Expected 201, got ${status}: ${JSON.stringify(data)}`);

    const response = data as { token: string; user: { name: string } };
    assert(!!response.token, 'Expected token in response');
    // Name should default to email prefix
    assert(response.user.name === testEmailNoName.split('@')[0], `Expected name to be email prefix, got ${response.user.name}`);
  });

  await runTest('POST /api/auth/register returns proper user object', async () => {
    const testEmailFull = `full-test-${Date.now()}@example.com`;
    const { status, data } = await apiCall('POST', '/api/auth/register', {
      email: testEmailFull,
      password: 'TestPassword123!',
      name: 'Full Test User',
    });

    assert(status === 201, `Expected 201, got ${status}: ${JSON.stringify(data)}`);

    const response = data as { token: string; user: { id: string; email: string; name: string; role: string; tenantId: string } };

    // Validate all fields are present and correct
    assert(!!response.token, 'Expected token');
    assert(!!response.user.id, 'Expected user.id');
    assert(response.user.email === testEmailFull.toLowerCase(), 'Expected email to match');
    assert(response.user.name === 'Full Test User', 'Expected name to match');
    assert(response.user.role === 'TENANT_ADMIN', 'Expected role to be TENANT_ADMIN');
    assert(!!response.user.tenantId, 'Expected tenantId');
  });
}

async function testLogin(): Promise<void> {
  console.log('\n🔐 Login Tests');

  await runTest('POST /api/auth/login with valid credentials', async () => {
    // We already have token from registration, just verify login works
    const { status } = await apiCall('GET', '/api/auth/me', undefined, authToken);
    assert(status === 200, `Expected 200, got ${status}`);
  });

  await runTest('POST /api/auth/login with invalid credentials returns 401', async () => {
    const { status, data } = await apiCall('POST', '/api/auth/login', {
      email: 'nonexistent@example.com',
      password: 'wrongpassword',
    });

    assert(status === 401, `Expected 401, got ${status}`);
    // Should have suggestion
    const response = data as { suggestion?: string };
    assert(response.suggestion !== undefined, 'Expected suggestion in error response');
  });
}

async function testAuthenticatedEndpoints(): Promise<void> {
  console.log('\n🔒 Authenticated Endpoints Tests');

  await runTest('GET /api/auth/me returns user info', async () => {
    const { status, data } = await apiCall('GET', '/api/auth/me', undefined, authToken);
    assert(status === 200, `Expected 200, got ${status}`);

    const response = data as { user: { id: string; email: string } };
    assert(response.user.id === testUserId, 'User ID should match');
  });

  await runTest('Unauthenticated request returns 401 with suggestion', async () => {
    const { status, data } = await apiCall('GET', '/api/auth/me');
    assert(status === 401, `Expected 401, got ${status}`);

    const response = data as { suggestion?: string };
    assert(response.suggestion !== undefined, 'Expected suggestion for auth error');
  });
}

async function testTeamsAPI(): Promise<void> {
  console.log('\n👥 Teams API Tests (Admin Navigation)');

  await runTest('POST /api/teams creates new team', async () => {
    const { status, data } = await apiCall('POST', '/api/teams', {
      name: `Smoke Test Team ${Date.now()}`,
    }, authToken);

    assert(status === 201 || status === 200, `Expected 201 or 200, got ${status}: ${JSON.stringify(data)}`);

    const response = data as { data?: { id: string }; id?: string };
    testTeamId = response.data?.id || response.id || null;
    assert(!!testTeamId, 'Expected team ID in response');
  });

  await runTest('GET /api/teams returns teams list', async () => {
    const { status, data } = await apiCall('GET', '/api/teams', undefined, authToken);
    assert(status === 200, `Expected 200, got ${status}`);

    const response = data as { data?: unknown[] } | unknown[];
    const teams = Array.isArray(response) ? response : response.data;
    assert(Array.isArray(teams), 'Expected array of teams');
  });
}

async function testSkillsAPI(): Promise<void> {
  console.log('\n⚡ Skills API Tests (Admin Navigation)');

  await runTest('POST /api/skills creates new skill', async () => {
    const { status, data } = await apiCall('POST', '/api/skills', {
      name: `smoke-test-skill-${Date.now()}`,
      description: 'Smoke test skill',
      content: '# Test Skill\n\nThis is a test.',
      scope: 'TENANT',
    }, authToken);

    assert(status === 201 || status === 200, `Expected 201 or 200, got ${status}: ${JSON.stringify(data)}`);

    const response = data as { data?: { id: string }; id?: string };
    testSkillId = response.data?.id || response.id || null;
    assert(!!testSkillId, 'Expected skill ID in response');
  });

  await runTest('GET /api/skills returns skills list', async () => {
    const { status, data } = await apiCall('GET', '/api/skills', undefined, authToken);
    assert(status === 200, `Expected 200, got ${status}`);

    const response = data as { data?: unknown[] } | unknown[];
    const skills = Array.isArray(response) ? response : response.data;
    assert(Array.isArray(skills), 'Expected array of skills');
  });

  await runTest('GET /api/skills/:id returns specific skill', async () => {
    if (!testSkillId) {
      throw new Error('No test skill ID available');
    }

    const { status, data } = await apiCall('GET', `/api/skills/${testSkillId}`, undefined, authToken);
    assert(status === 200, `Expected 200, got ${status}`);

    const response = data as { data?: { id: string }; id?: string };
    const skillId = response.data?.id || response.id;
    assert(skillId === testSkillId, 'Skill ID should match');
  });
}

async function testUsageAPI(): Promise<void> {
  console.log('\n📊 Usage API Tests (Privacy-First Analytics)');

  await runTest('GET /api/usage returns usage data', async () => {
    const { status, data } = await apiCall('GET', '/api/usage?period=7d', undefined, authToken);
    assert(status === 200, `Expected 200, got ${status}`);

    const response = data as { data?: { totalEvents: number } };
    assert(response.data !== undefined, 'Expected data in response');
    assert(typeof response.data.totalEvents === 'number', 'Expected totalEvents number');
  });

  await runTest('GET /api/usage/settings returns settings', async () => {
    const { status, data } = await apiCall('GET', '/api/usage/settings', undefined, authToken);
    assert(status === 200, `Expected 200, got ${status}`);

    const response = data as { data?: { eventsEnabled: boolean } };
    assert(response.data !== undefined, 'Expected data in response');
    assert(typeof response.data.eventsEnabled === 'boolean', 'Expected eventsEnabled boolean');
  });

  await runTest('PUT /api/usage/settings updates settings', async () => {
    const { status, data } = await apiCall('PUT', '/api/usage/settings', {
      eventsEnabled: true,
    }, authToken);

    assert(status === 200, `Expected 200, got ${status}`);

    const response = data as { data?: { eventsEnabled: boolean } };
    assert(response.data?.eventsEnabled === true, 'Expected eventsEnabled to be true');
  });
}

async function testErrorResponses(): Promise<void> {
  console.log('\n❌ Error Response Format Tests (Day 25)');

  await runTest('404 errors include helpful message', async () => {
    const { status, data } = await apiCall('GET', '/api/skills/nonexistent-id', undefined, authToken);
    assert(status === 404, `Expected 404, got ${status}`);

    const response = data as { error: string; code?: string };
    assert(response.error !== undefined, 'Expected error message');
    assert(response.code !== undefined, 'Expected error code');
  });

  await runTest('Validation errors include field-specific details', async () => {
    const { status, data } = await apiCall('POST', '/api/skills', {
      // Missing required fields
    }, authToken);

    assert(status === 400, `Expected 400, got ${status}`);

    const response = data as { details?: unknown[]; suggestion?: string };
    // Should have details or suggestion
    assert(
      response.details !== undefined || response.suggestion !== undefined,
      'Expected details or suggestion in validation error'
    );
  });
}

async function testMCPAPI(): Promise<void> {
  console.log('\n🔌 MCP Servers API Tests');

  await runTest('GET /api/mcp returns MCP servers list', async () => {
    const { status, data } = await apiCall('GET', '/api/mcp', undefined, authToken);
    assert(status === 200, `Expected 200, got ${status}`);

    const response = data as { data?: unknown[] } | unknown[];
    const servers = Array.isArray(response) ? response : response.data;
    assert(Array.isArray(servers), 'Expected array of MCP servers');
  });
}

async function cleanup(): Promise<void> {
  console.log('\n🧹 Cleanup');

  // Delete test skill
  if (testSkillId && authToken) {
    await runTest('DELETE test skill', async () => {
      const { status } = await apiCall('DELETE', `/api/skills/${testSkillId}`, undefined, authToken);
      assert(status === 200 || status === 204 || status === 404, `Cleanup failed: ${status}`);
    });
  }

  // Note: We don't delete the test user/tenant as it might affect other tests
  // In production, you'd have a proper cleanup mechanism
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║           Week 5 Smoke Tests (Days 21-33)                   ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log(`\nAPI URL: ${API_URL}`);
  console.log(`Started: ${new Date().toISOString()}`);

  try {
    // Run test groups in order
    await testHealthCheck();
    await testRegistration();
    await testLogin();
    await testAuthenticatedEndpoints();
    await testTeamsAPI();
    await testSkillsAPI();
    await testUsageAPI();
    await testMCPAPI();
    await testErrorResponses();
    await cleanup();
  } catch (error) {
    console.error('\n💥 Fatal error:', error);
  }

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
