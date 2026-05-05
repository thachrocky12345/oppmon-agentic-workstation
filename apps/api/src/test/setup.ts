/**
 * Test Setup
 *
 * Runs before all tests to set up the testing environment.
 */

import { beforeAll, afterAll } from 'vitest';

// Set test environment
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';
process.env.DATABASE_URL = 'postgres://test:test@localhost:5432/arkon_test';

// Global setup
beforeAll(async () => {
  // Any global test setup
  console.log('Test environment initialized');
});

// Global teardown
afterAll(async () => {
  // Cleanup after all tests
  console.log('Test environment cleanup');
});
