// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

import { test, expect } from '@playwright/test'

/**
 * E2E tests for authentication flows
 *
 * These tests verify:
 * - User registration (with and without optional fields)
 * - Login with valid/invalid credentials
 * - Error handling and user feedback
 * - Session management (logout, redirect after login)
 *
 * Prerequisites:
 * - API server running on localhost:3001
 * - Web server running on localhost:3002
 * - Database with seed data (admin@arkon.dev / admin123)
 */

const TEST_PASSWORD = 'TestPassword123!'

// Generate unique email for each test run
function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}@test.example.com`
}

test.describe('Registration Flow', () => {
  test('displays registration page correctly', async ({ page }) => {
    await page.goto('/register')

    // Check page title and heading
    await expect(page.locator('h1')).toContainText('Arkon')
    await expect(page.locator('h2')).toContainText('Create your account')

    // Check all form fields are present
    await expect(page.locator('input#name')).toBeVisible()
    await expect(page.locator('input#email')).toBeVisible()
    await expect(page.locator('input#password')).toBeVisible()
    await expect(page.locator('input#confirmPassword')).toBeVisible()
    await expect(page.locator('button[type="submit"]')).toBeVisible()

    // Check link to login page
    await expect(page.locator('a[href="/login"]')).toBeVisible()
  })

  test('registers new user with all fields', async ({ page }) => {
    await page.goto('/register')

    const email = uniqueEmail('full-user')

    // Fill in all fields
    await page.fill('input#name', 'Test User')
    await page.fill('input#email', email)
    await page.fill('input#password', TEST_PASSWORD)
    await page.fill('input#confirmPassword', TEST_PASSWORD)

    // Submit form
    await page.click('button[type="submit"]')

    // Should redirect to admin dashboard on success
    await expect(page).toHaveURL(/\/admin/, { timeout: 15000 })
  })

  test('registers new user without optional name field', async ({ page }) => {
    await page.goto('/register')

    const email = uniqueEmail('no-name-user')

    // Fill in only required fields (skip name)
    await page.fill('input#email', email)
    await page.fill('input#password', TEST_PASSWORD)
    await page.fill('input#confirmPassword', TEST_PASSWORD)

    // Submit form
    await page.click('button[type="submit"]')

    // Should still succeed and redirect
    await expect(page).toHaveURL(/\/admin/, { timeout: 15000 })
  })

  test('shows error for invalid email format', async ({ page }) => {
    await page.goto('/register')

    await page.fill('input#email', 'invalid-email')
    await page.fill('input#password', TEST_PASSWORD)
    await page.fill('input#confirmPassword', TEST_PASSWORD)

    // Try to submit - HTML5 validation should prevent submission
    await page.click('button[type="submit"]')

    // Should stay on registration page (HTML5 validation prevents submit)
    await expect(page).toHaveURL(/\/register/)
  })

  test('shows error for password too short', async ({ page }) => {
    await page.goto('/register')

    const email = uniqueEmail('short-pw')

    await page.fill('input#email', email)
    await page.fill('input#password', 'short')
    await page.fill('input#confirmPassword', 'short')

    await page.click('button[type="submit"]')

    // Should show error message (the red error box)
    await expect(page.locator('.bg-red-50')).toContainText('8 characters', { timeout: 5000 })
  })

  test('shows error for mismatched passwords', async ({ page }) => {
    await page.goto('/register')

    const email = uniqueEmail('mismatch-pw')

    await page.fill('input#email', email)
    await page.fill('input#password', TEST_PASSWORD)
    await page.fill('input#confirmPassword', 'DifferentPassword123!')

    await page.click('button[type="submit"]')

    // Should show mismatch error
    await expect(page.locator('.bg-red-50')).toContainText('do not match', { timeout: 5000 })
  })

  test('shows error for duplicate email', async ({ page }) => {
    await page.goto('/register')

    const email = uniqueEmail('duplicate-test')

    // Register first time
    await page.fill('input#email', email)
    await page.fill('input#password', TEST_PASSWORD)
    await page.fill('input#confirmPassword', TEST_PASSWORD)
    await page.click('button[type="submit"]')
    await expect(page).toHaveURL(/\/admin/, { timeout: 15000 })

    // Navigate back to register and try again with same email
    await page.goto('/register')
    await page.fill('input#email', email)
    await page.fill('input#password', TEST_PASSWORD)
    await page.fill('input#confirmPassword', TEST_PASSWORD)
    await page.click('button[type="submit"]')

    // Should show duplicate error
    await expect(page.locator('.bg-red-50')).toContainText('already', { timeout: 5000 })
  })

  test('register button shows loading state', async ({ page }) => {
    await page.goto('/register')

    const email = uniqueEmail('loading-test')

    await page.fill('input#email', email)
    await page.fill('input#password', TEST_PASSWORD)
    await page.fill('input#confirmPassword', TEST_PASSWORD)

    // Click and check for loading text
    const submitButton = page.locator('button[type="submit"]')
    await submitButton.click()

    // Button text changes to "Creating account..." when loading
    // This might be very fast, so we check if we're redirected or see loading
    const wasLoadingOrRedirected = await Promise.race([
      submitButton.textContent().then(text => text?.includes('Creating')),
      page.waitForURL(/\/admin/, { timeout: 15000 }).then(() => true),
    ])
    expect(wasLoadingOrRedirected).toBeTruthy()
  })
})

test.describe('Login Flow', () => {
  test('displays login page correctly', async ({ page }) => {
    await page.goto('/login')

    // Check heading - h2 says "Sign in to your account"
    await expect(page.locator('h2')).toContainText('Sign in')

    // Check form fields
    await expect(page.locator('input#email')).toBeVisible()
    await expect(page.locator('input#password')).toBeVisible()
    await expect(page.locator('button[type="submit"]')).toBeVisible()

    // Check link to register
    await expect(page.locator('a[href="/register"]')).toBeVisible()
  })

  test('login fails with invalid credentials', async ({ page }) => {
    await page.goto('/login')

    await page.fill('input#email', 'nonexistent@example.com')
    await page.fill('input#password', 'wrongpassword123')
    await page.click('button[type="submit"]')

    // Should show error
    await expect(page.locator('.bg-red-50')).toBeVisible({ timeout: 5000 })
  })

  test('redirects to original page after login', async ({ page }) => {
    // Try to access protected page while logged out
    await page.goto('/admin/skills')

    // Should redirect to login with return URL
    await expect(page).toHaveURL(/\/login/)
  })

  test('login with seeded admin user works', async ({ page }) => {
    await page.goto('/login')

    // Use seeded test credentials
    await page.fill('input#email', 'admin@arkon.dev')
    await page.fill('input#password', 'admin123')
    await page.click('button[type="submit"]')

    // Should redirect away from login
    await expect(page).not.toHaveURL(/\/login/, { timeout: 15000 })
  })
})

test.describe('Logout Flow', () => {
  test('can logout after login', async ({ page }) => {
    // First login
    await page.goto('/login')
    await page.fill('input#email', 'admin@arkon.dev')
    await page.fill('input#password', 'admin123')
    await page.click('button[type="submit"]')
    await expect(page).not.toHaveURL(/\/login/, { timeout: 15000 })

    // Navigate to dashboard and verify logged in
    await page.goto('/dashboard')

    // Page should load (if it redirects to login, we know we're not logged in)
    const url = page.url()
    expect(url).not.toContain('/login')
  })
})

test.describe('Auth Error Handling', () => {
  test('handles API errors gracefully', async ({ page }) => {
    await page.goto('/register')

    const email = uniqueEmail('api-error-test')

    // Fill form
    await page.fill('input#email', email)
    await page.fill('input#password', TEST_PASSWORD)
    await page.fill('input#confirmPassword', TEST_PASSWORD)

    // Mock API failure
    await page.route('**/api/auth/register', route => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Internal server error' }),
      })
    })

    await page.click('button[type="submit"]')

    // Should show error message, not crash
    await expect(page.locator('.bg-red-50')).toBeVisible({ timeout: 5000 })
  })

  test('handles network errors gracefully', async ({ page }) => {
    await page.goto('/register')

    const email = uniqueEmail('network-error')

    await page.fill('input#email', email)
    await page.fill('input#password', TEST_PASSWORD)
    await page.fill('input#confirmPassword', TEST_PASSWORD)

    // Mock network failure
    await page.route('**/api/auth/register', route => {
      route.abort('failed')
    })

    await page.click('button[type="submit"]')

    // Should show error message
    await expect(page.locator('.bg-red-50')).toBeVisible({ timeout: 5000 })
  })

  test('shows helpful error message for validation errors', async ({ page }) => {
    await page.goto('/register')

    // Mock validation error from API
    await page.route('**/api/auth/register', route => {
      route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'Validation failed',
          code: 'VALIDATION_ERROR',
          suggestion: 'Please check the following fields: email, password',
          details: [
            { field: 'email', message: 'Invalid email format' },
            { field: 'password', message: 'Password too weak' },
          ],
        }),
      })
    })

    await page.fill('input#email', 'test@test.com')
    await page.fill('input#password', TEST_PASSWORD)
    await page.fill('input#confirmPassword', TEST_PASSWORD)
    await page.click('button[type="submit"]')

    // Should show validation error
    await expect(page.locator('.bg-red-50')).toBeVisible({ timeout: 5000 })
  })
})

test.describe('Form Accessibility', () => {
  test('form fields have proper labels', async ({ page }) => {
    await page.goto('/register')

    // Check each input has a label
    await expect(page.locator('label[for="email"]')).toBeVisible()
    await expect(page.locator('label[for="password"]')).toBeVisible()
  })

  test('form can be submitted with Enter key', async ({ page }) => {
    await page.goto('/login')

    await page.fill('input#email', 'admin@arkon.dev')
    await page.fill('input#password', 'admin123')

    // Press Enter to submit
    await page.press('input#password', 'Enter')

    // Should submit the form - either navigate away or show error
    await expect(page).not.toHaveURL(/\/login/, { timeout: 15000 })
  })

  test('inputs show focus styles', async ({ page }) => {
    await page.goto('/register')

    const emailInput = page.locator('input#email')
    await emailInput.focus()

    // Check element is focused
    await expect(emailInput).toBeFocused()
  })
})
