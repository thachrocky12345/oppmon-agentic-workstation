// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

import { test, expect } from '@playwright/test'

/**
 * Smoke tests for main dashboard pages
 * Verifies pages load and display expected content.
 */

// Helper to login before tests
async function login(page: any) {
  // Go to login page
  await page.goto('/login')

  // Fill in credentials (test user from seed: admin@arkon.dev / admin123)
  await page.fill('input#email', 'admin@arkon.dev')
  await page.fill('input#password', 'admin123')
  await page.click('button[type="submit"]')

  // Wait for navigation away from login page or for an error
  try {
    await page.waitForURL((url: URL) => !url.pathname.includes('/login'), { timeout: 15000 })
  } catch (e) {
    // Check if there's an error message
    const errorVisible = await page.locator('.bg-red-50').isVisible()
    if (errorVisible) {
      const errorText = await page.locator('.bg-red-50').textContent()
      throw new Error(`Login failed: ${errorText}`)
    }
    throw e
  }

  // Wait a bit for cookies to be fully set
  await page.waitForTimeout(500)
}

test.describe('Landing Page', () => {
  test('displays hero section', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('h2').first()).toContainText('AI Agent Gateway Platform')
    await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Get Started' })).toBeVisible()
  })
})

test.describe('Dashboard Pages (authenticated)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('dashboard shows overview cards', async ({ page }) => {
    await page.goto('/dashboard')
    // After login, should show dashboard content
    await expect(page.locator('h1')).toContainText('Dashboard')
  })

  test('agents page loads', async ({ page }) => {
    await page.goto('/agents')
    await expect(page.locator('h1')).toContainText('Agents')
    await expect(page.locator('text=Register Agent')).toBeVisible()
  })

  test('events page loads', async ({ page }) => {
    await page.goto('/events')
    await expect(page.locator('h1')).toContainText('Events')
    await expect(page.locator('text=Live')).toBeVisible()
  })

  test('security page loads', async ({ page }) => {
    await page.goto('/security')
    await expect(page.locator('h1')).toContainText('Security')
    await expect(page.locator('text=ThreatGuard')).toBeVisible()
  })

  test('analytics page loads', async ({ page }) => {
    await page.goto('/analytics')
    await expect(page.locator('h1')).toContainText('Analytics')
  })

  test('costs page loads', async ({ page }) => {
    await page.goto('/costs')
    await expect(page.locator('h1')).toContainText('Costs')
  })

  test('workflows page loads', async ({ page }) => {
    await page.goto('/workflows')
    await expect(page.locator('h1')).toContainText('Workflows')
    await expect(page.locator('text=Create Workflow').first()).toBeVisible()
  })

  test('incidents page loads', async ({ page }) => {
    await page.goto('/incidents')
    await expect(page.locator('h1')).toContainText('Incidents')
    await expect(page.locator('text=Report Incident')).toBeVisible()
  })

  test('infrastructure page loads', async ({ page }) => {
    await page.goto('/infrastructure')
    await expect(page.locator('h1')).toContainText('Infrastructure')
  })

  test('journal page loads', async ({ page }) => {
    await page.goto('/journal')
    await expect(page.locator('h1')).toContainText('Journal')
  })

  test('notifications page loads', async ({ page }) => {
    await page.goto('/notifications')
    await expect(page.locator('h1')).toContainText('Notifications')
  })
})

test.describe('Admin Pages (authenticated)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('admin dashboard loads', async ({ page }) => {
    await page.goto('/admin')
    await expect(page.locator('h1')).toContainText('Admin Dashboard')
  })

  test('teams page loads', async ({ page }) => {
    await page.goto('/admin/teams')
    await expect(page.locator('h1')).toContainText('Teams')
    await expect(page.locator('text=Create Team')).toBeVisible()
  })

  test('skills page loads', async ({ page }) => {
    await page.goto('/admin/skills')
    await expect(page.locator('h1')).toContainText('Skills')
    await expect(page.locator('text=Create Skill')).toBeVisible()
  })

  test('mcp servers page loads', async ({ page }) => {
    await page.goto('/admin/mcp')
    await expect(page.locator('h1')).toContainText('MCP Server')
    await expect(page.locator('text=Add Server')).toBeVisible()
  })

  test('usage page loads', async ({ page }) => {
    await page.goto('/admin/usage')
    await expect(page.locator('h1')).toContainText('Usage')
  })

  test('audit log page loads', async ({ page }) => {
    await page.goto('/admin/audit')
    await expect(page.locator('h1')).toContainText('Audit')
  })
})
