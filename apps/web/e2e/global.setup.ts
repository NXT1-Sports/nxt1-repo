/**
 * @fileoverview Global Setup - Authentication State
 * @module @nxt1/web/e2e
 *
 * Runs once before all tests to establish authentication state.
 * Creates a logged-in session that other tests can reuse.
 *
 * @see https://playwright.dev/docs/auth
 */

import { chromium, FullConfig } from '@playwright/test';
import path from 'path';
import fs from 'fs';

/**
 * Auth storage state path
 */
const AUTH_FILE = path.join(__dirname, '.auth', 'user.json');

/**
 * Global setup function
 * Performs authentication and saves state for reuse
 */
async function globalSetup(config: FullConfig): Promise<void> {
  // Ensure .auth directory exists
  const authDir = path.dirname(AUTH_FILE);
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
  }

  // Get test credentials from environment
  const email = process.env.E2E_TEST_USER_EMAIL;
  const password = process.env.E2E_TEST_USER_PASSWORD;

  // Skip auth setup if no credentials provided
  if (!email || !password) {
    console.log('⚠️  No E2E credentials provided, skipping auth setup');
    console.log('   Set E2E_TEST_USER_EMAIL and E2E_TEST_USER_PASSWORD to enable');

    // Create empty auth state
    fs.writeFileSync(AUTH_FILE, JSON.stringify({ cookies: [], origins: [] }));
    return;
  }

  const baseURL = config.projects[0].use.baseURL || 'http://localhost:4200';

  console.log('🔐 Setting up authentication state...');
  console.log(`   Base URL: ${baseURL}`);
  console.log(`   User: ${email}`);

  // Launch browser for authentication
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Navigate to login page
    await page.goto(`${baseURL}/auth`, { timeout: 60_000 });

    // Wait for page to load
    await page.waitForLoadState('networkidle');

    // Click "Continue with Email" button if visible
    const emailButton = page.getByRole('button', { name: /continue with email/i });
    const hasEmailButton = await emailButton.isVisible().catch(() => false);
    if (hasEmailButton) {
      await emailButton.click();
      await page.waitForTimeout(500); // Wait for form transition
    }

    // Fill login form
    const emailInput = page.locator('ion-input[type="email"] input, input[type="email"]').first();
    const passwordInput = page
      .locator('ion-input[type="password"] input, input[type="password"]')
      .first();

    await emailInput.waitFor({ state: 'visible', timeout: 10_000 });
    await emailInput.fill(email);
    await passwordInput.fill(password);

    // Submit form
    const submitButton = page.getByRole('button', { name: /sign in|log in|submit/i });
    await submitButton.click();

    // Wait for successful login (redirect away from auth pages)
    await page.waitForURL((url) => !url.pathname.includes('/auth/'), { timeout: 30_000 });

    console.log('✅ Authentication successful');
    console.log(`   Redirected to: ${page.url()}`);

    // Save authentication state
    await context.storageState({ path: AUTH_FILE });
    console.log(`   State saved to: ${AUTH_FILE}`);
  } catch (error) {
    console.error('❌ Authentication setup failed:', error);

    // Save screenshot for debugging
    const screenshotPath = path.join(authDir, 'setup-failure.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`   Screenshot saved: ${screenshotPath}`);

    // Create empty auth state so tests can still run unauthenticated
    fs.writeFileSync(AUTH_FILE, JSON.stringify({ cookies: [], origins: [] }));
  } finally {
    await browser.close();
  }
}

export default globalSetup;
