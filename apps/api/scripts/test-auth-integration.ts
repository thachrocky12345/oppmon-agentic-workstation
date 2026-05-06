#!/usr/bin/env tsx
/**
 * Auth Integration Tests
 *
 * Quick integration tests for authentication endpoints.
 * These tests verify the full request/response cycle including:
 * - Database interactions
 * - Validation
 * - Error handling
 *
 * Usage: pnpm tsx scripts/test-auth-integration.ts
 *
 * Prerequisites:
 * - API server running on localhost:3001
 * - Database running with schema applied
 */

const API_URL = process.env.API_URL || 'http://localhost:3001';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  duration: number;
}

const results: TestResult[] = [];

async function apiCall(
  method: string,
  path: string,
  body?: unknown,
  token?: string
): Promise<{ status: number; data: unknown; headers: Headers }> {
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
  return { status: response.status, data, headers: response.headers };
}

async function runTest(name: string, fn: () => Promise<void>): Promise<void> {
  const start = Date.now();
  try {
    await fn();
    const duration = Date.now() - start;
    results.push({ name, passed: true, duration });
    console.log(`  ✓ ${name} (${duration}ms)`);
  } catch (error) {
    const duration = Date.now() - start;
    const message = error instanceof Error ? error.message : String(error);
    results.push({ name, passed: false, error: message, duration });
    console.log(`  ✗ ${name} (${duration}ms)`);
    console.log(`    Error: ${message}`);
  }
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function assertDeepEqual(actual: unknown, expected: unknown, message: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${message}\n  Expected: ${JSON.stringify(expected)}\n  Actual: ${JSON.stringify(actual)}`);
  }
}

// ============================================================================
// Registration Tests
// ============================================================================

async function testRegistrationSuccess(): Promise<void> {
  console.log('\n📝 Registration Success Tests');

  const testEmail = `reg-success-${Date.now()}@test.example.com`;
  const testName = 'Test User';

  await runTest('registers user with all fields', async () => {
    const { status, data } = await apiCall('POST', '/api/auth/register', {
      email: testEmail,
      password: 'SecurePassword123!',
      name: testName,
    });

    assert(status === 201, `Expected 201, got ${status}: ${JSON.stringify(data)}`);

    const response = data as { token: string; user: { id: string; email: string; name: string; role: string; tenantId: string } };

    assert(typeof response.token === 'string' && response.token.length > 0, 'Expected JWT token');
    assert(typeof response.user.id === 'string' && response.user.id.length > 0, 'Expected user ID');
    assert(response.user.email === testEmail.toLowerCase(), 'Email should be lowercase');
    assert(response.user.name === testName, 'Name should match');
    assert(response.user.role === 'TENANT_ADMIN', 'Role should be TENANT_ADMIN');
    assert(typeof response.user.tenantId === 'string' && response.user.tenantId.length > 0, 'Expected tenant ID');
  });

  await runTest('registers user without name (uses email prefix)', async () => {
    const emailNoName = `no-name-${Date.now()}@test.example.com`;

    const { status, data } = await apiCall('POST', '/api/auth/register', {
      email: emailNoName,
      password: 'SecurePassword123!',
    });

    assert(status === 201, `Expected 201, got ${status}: ${JSON.stringify(data)}`);

    const response = data as { user: { name: string } };
    assert(response.user.name === emailNoName.split('@')[0], `Name should default to email prefix, got ${response.user.name}`);
  });

  await runTest('token is valid JWT format', async () => {
    const { status, data } = await apiCall('POST', '/api/auth/register', {
      email: `jwt-test-${Date.now()}@test.example.com`,
      password: 'SecurePassword123!',
    });

    assert(status === 201, `Expected 201, got ${status}`);

    const response = data as { token: string };
    const parts = response.token.split('.');
    assert(parts.length === 3, 'JWT should have 3 parts');
  });
}

async function testRegistrationValidation(): Promise<void> {
  console.log('\n🔍 Registration Validation Tests');

  await runTest('rejects short password', async () => {
    const { status, data } = await apiCall('POST', '/api/auth/register', {
      email: `short-pw-${Date.now()}@test.example.com`,
      password: 'short',
    });

    assert(status === 400, `Expected 400, got ${status}`);
    const response = data as { error: string; code?: string };
    assert(response.error.includes('Validation') || response.code === 'VALIDATION_ERROR', 'Expected validation error');
  });

  await runTest('rejects invalid email', async () => {
    const { status, data } = await apiCall('POST', '/api/auth/register', {
      email: 'not-an-email',
      password: 'SecurePassword123!',
    });

    assert(status === 400, `Expected 400, got ${status}`);
    const response = data as { error: string };
    assert(response.error.includes('Validation') || response.error.includes('email'), 'Expected email validation error');
  });

  await runTest('rejects missing password', async () => {
    const { status, data } = await apiCall('POST', '/api/auth/register', {
      email: `no-pw-${Date.now()}@test.example.com`,
    });

    assert(status === 400, `Expected 400, got ${status}`);
  });

  await runTest('rejects missing email', async () => {
    const { status, data } = await apiCall('POST', '/api/auth/register', {
      password: 'SecurePassword123!',
    });

    assert(status === 400, `Expected 400, got ${status}`);
  });

  await runTest('rejects empty body', async () => {
    const { status } = await apiCall('POST', '/api/auth/register', {});

    assert(status === 400, `Expected 400, got ${status}`);
  });
}

async function testRegistrationDuplicates(): Promise<void> {
  console.log('\n🔄 Registration Duplicate Tests');

  const duplicateEmail = `duplicate-${Date.now()}@test.example.com`;

  await runTest('first registration succeeds', async () => {
    const { status, data } = await apiCall('POST', '/api/auth/register', {
      email: duplicateEmail,
      password: 'SecurePassword123!',
    });

    assert(status === 201, `Expected 201, got ${status}: ${JSON.stringify(data)}`);
  });

  await runTest('second registration with same email fails with 409', async () => {
    const { status, data } = await apiCall('POST', '/api/auth/register', {
      email: duplicateEmail,
      password: 'DifferentPassword123!',
    });

    assert(status === 409, `Expected 409, got ${status}`);
    const response = data as { error: string };
    assert(response.error.toLowerCase().includes('already'), 'Should mention email already exists');
  });
}

// ============================================================================
// Login Tests
// ============================================================================

async function testLoginFlow(): Promise<void> {
  console.log('\n🔐 Login Flow Tests');

  const loginEmail = `login-test-${Date.now()}@test.example.com`;
  const loginPassword = 'SecurePassword123!';
  let registeredUserId: string;

  // First register a user
  await runTest('setup: register test user', async () => {
    const { status, data } = await apiCall('POST', '/api/auth/register', {
      email: loginEmail,
      password: loginPassword,
      name: 'Login Test User',
    });

    assert(status === 201, `Expected 201, got ${status}`);
    const response = data as { user: { id: string } };
    registeredUserId = response.user.id;
  });

  await runTest('login with correct credentials succeeds', async () => {
    const { status, data } = await apiCall('POST', '/api/auth/login', {
      email: loginEmail,
      password: loginPassword,
    });

    assert(status === 200, `Expected 200, got ${status}: ${JSON.stringify(data)}`);

    const response = data as { token: string; user: { id: string } };
    assert(typeof response.token === 'string', 'Expected token');
    assert(response.user.id === registeredUserId, 'User ID should match');
  });

  await runTest('login with wrong password fails', async () => {
    const { status, data } = await apiCall('POST', '/api/auth/login', {
      email: loginEmail,
      password: 'WrongPassword123!',
    });

    assert(status === 401, `Expected 401, got ${status}`);
    const response = data as { error: string };
    assert(response.error.toLowerCase().includes('invalid'), 'Should indicate invalid credentials');
  });

  await runTest('login with nonexistent email fails', async () => {
    const { status, data } = await apiCall('POST', '/api/auth/login', {
      email: 'nonexistent@test.example.com',
      password: loginPassword,
    });

    assert(status === 401, `Expected 401, got ${status}`);
  });
}

// ============================================================================
// Session Tests
// ============================================================================

async function testSessionManagement(): Promise<void> {
  console.log('\n👤 Session Management Tests');

  const sessionEmail = `session-${Date.now()}@test.example.com`;
  let authToken: string;

  // Register and get token
  await runTest('setup: register and get token', async () => {
    const { status, data } = await apiCall('POST', '/api/auth/register', {
      email: sessionEmail,
      password: 'SecurePassword123!',
    });

    assert(status === 201, `Expected 201, got ${status}`);
    const response = data as { token: string };
    authToken = response.token;
  });

  await runTest('GET /api/auth/me returns user info', async () => {
    const { status, data } = await apiCall('GET', '/api/auth/me', undefined, authToken);

    assert(status === 200, `Expected 200, got ${status}`);

    const response = data as { user: { email: string }; tenant: { id: string } };
    assert(response.user.email === sessionEmail.toLowerCase(), 'Email should match');
    assert(typeof response.tenant.id === 'string', 'Should include tenant info');
  });

  await runTest('GET /api/auth/me without token returns 401', async () => {
    const { status, data } = await apiCall('GET', '/api/auth/me');

    assert(status === 401, `Expected 401, got ${status}`);

    const response = data as { suggestion?: string };
    assert(response.suggestion !== undefined, 'Should include helpful suggestion');
  });

  await runTest('GET /api/auth/me with invalid token returns 401', async () => {
    const { status } = await apiCall('GET', '/api/auth/me', undefined, 'invalid-token');

    assert(status === 401, `Expected 401, got ${status}`);
  });
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║           Auth Integration Tests                            ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log(`\nAPI URL: ${API_URL}`);
  console.log(`Started: ${new Date().toISOString()}`);

  // Check if API is reachable
  try {
    const { status } = await apiCall('GET', '/api/health');
    if (status !== 200) {
      console.error(`\n❌ API health check failed (status ${status}). Is the server running?`);
      process.exit(1);
    }
  } catch (error) {
    console.error('\n❌ Could not connect to API. Is the server running on', API_URL, '?');
    process.exit(1);
  }

  // Run test suites
  await testRegistrationSuccess();
  await testRegistrationValidation();
  await testRegistrationDuplicates();
  await testLoginFlow();
  await testSessionManagement();

  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const total = results.length;
  const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);

  console.log(`\n  Total:    ${total}`);
  console.log(`  Passed:   ${passed} ✓`);
  console.log(`  Failed:   ${failed} ✗`);
  console.log(`  Duration: ${totalDuration}ms`);
  console.log(`\n  Success Rate: ${((passed / total) * 100).toFixed(1)}%`);

  if (failed > 0) {
    console.log('\nFailed Tests:');
    results
      .filter((r) => !r.passed)
      .forEach((r) => {
        console.log(`  - ${r.name}`);
        if (r.error) {
          console.log(`    ${r.error}`);
        }
      });
  }

  console.log(`\nFinished: ${new Date().toISOString()}`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
