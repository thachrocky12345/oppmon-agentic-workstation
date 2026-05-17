// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright E2E test configuration for Arkon Web
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './e2e',

  /* Run tests in files in parallel */
  fullyParallel: true,

  /* Fail the build on CI if you accidentally left test.only in the source code */
  forbidOnly: !!process.env.CI,

  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,

  /* Opt out of parallel tests on CI */
  workers: process.env.CI ? 1 : undefined,

  /* Reporter to use */
  reporter: process.env.CI ? 'github' : 'html',

  /* Global timeout for each test */
  timeout: 60000,

  /* Expect timeout for assertions */
  expect: {
    timeout: 15000,
  },

  /* Shared settings for all the projects below */
  use: {
    /* Base URL to use in actions like `await page.goto('/')` */
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3002',

    /* API URL for backend requests */
    extraHTTPHeaders: {
      'X-Test-Mode': 'true',
    },

    /* Collect trace when retrying the failed test */
    trace: 'on-first-retry',

    /* Screenshot on failure */
    screenshot: 'only-on-failure',

    /* Video on failure for debugging */
    video: 'retain-on-failure',

    /* Action timeout */
    actionTimeout: 15000,

    /* Navigation timeout */
    navigationTimeout: 30000,
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },

    /* Test on Firefox */
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },

    /* Accessibility testing project */
    {
      name: 'a11y',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /a11y.*\.spec\.ts/,
    },
  ],

  /* Run your local dev server before starting the tests */
  // Uncomment if you want Playwright to start the dev server automatically
  // webServer: [
  //   {
  //     command: 'pnpm --filter @arkon/api dev',
  //     url: 'http://localhost:3001/api/health',
  //     reuseExistingServer: !process.env.CI,
  //     timeout: 120000,
  //   },
  //   {
  //     command: 'pnpm --filter @arkon/web dev',
  //     url: 'http://localhost:3002',
  //     reuseExistingServer: !process.env.CI,
  //     timeout: 120000,
  //   },
  // ],
})
