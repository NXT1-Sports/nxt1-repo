/**
 * Debug test for Firebase Auth login
 * Run with: E2E_REAL_AUTH=true npx playwright test tests/auth/login-debug.spec.ts --project=chromium
 */

import { test, expect } from '@playwright/test';

test.describe('Login Debug', () => {
  test('debug Firebase Auth login', async ({ page }) => {
    const consoleMessages: string[] = [];
    const networkErrors: string[] = [];

    // Capture console messages
    page.on('console', (msg) => {
      consoleMessages.push(`[${msg.type()}] ${msg.text()}`);
    });

    page.on('requestfailed', (request) => {
      networkErrors.push(`${request.method()} ${request.url()} - ${request.failure()?.errorText}`);
    });

    // Navigate to login
    await page.goto('/auth/login');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    console.log('=== Initial page state ===');
    console.log('URL:', page.url());

    // Click "Continue with Email"
    const emailButton = page.getByTestId('auth-btn-email');
    await emailButton.waitFor({ state: 'visible', timeout: 10000 });
    await emailButton.click({ force: true });
    await page.waitForTimeout(500);

    // Fill credentials using type() which properly triggers Angular ngModel
    const email = process.env.E2E_TEST_USER_EMAIL || 'john@nxt1sports.com';
    const password = process.env.E2E_TEST_USER_PASSWORD || 'Jk021300!';

    const emailInput = page.getByTestId('auth-input-email').locator('input');
    const passwordInput = page.getByTestId('auth-input-password').locator('input');

    // Clear and type to trigger proper Angular change detection
    await emailInput.click();
    await emailInput.fill('');
    await emailInput.pressSequentially(email, { delay: 5 });

    await passwordInput.click();
    await passwordInput.fill('');
    await passwordInput.pressSequentially(password, { delay: 5 });

    // Give Angular time to process
    await page.waitForTimeout(300);

    console.log('\n=== Before submit ===');
    console.log('Email filled:', await emailInput.inputValue());
    console.log(
      'Password filled:',
      (await passwordInput.inputValue()).length > 0 ? '(filled)' : '(empty)'
    );

    // Check if button is disabled
    const submitButton = page.getByTestId('auth-submit-button');
    const isDisabled = await submitButton.getAttribute('disabled');
    console.log('Submit button disabled:', isDisabled !== null);

    if (isDisabled !== null) {
      console.log('❌ Button is disabled - form validation failed');
      // Take screenshot for debugging
      await page.screenshot({ path: 'test-results/login-debug-disabled.png' });
      return;
    }

    // Submit the form
    await submitButton.click();

    // Wait for response
    await page.waitForTimeout(5000);

    console.log('\n=== After submit (5s wait) ===');
    console.log('Current URL:', page.url());

    console.log('\n=== Network Errors ===');
    if (networkErrors.length === 0) {
      console.log('No network errors');
    } else {
      networkErrors.forEach((err) => console.log('  ' + err));
    }

    console.log('\n=== Console Messages (auth-related) ===');
    const authConsole = consoleMessages.filter(
      (m) =>
        m.toLowerCase().includes('auth') ||
        m.toLowerCase().includes('login') ||
        m.toLowerCase().includes('firebase') ||
        m.toLowerCase().includes('error') ||
        m.toLowerCase().includes('submit')
    );
    if (authConsole.length === 0) {
      console.log('No auth-related console messages');
    } else {
      authConsole.slice(-15).forEach((m) => console.log('  ' + m));
    }

    // Check for error message
    const errorEl = page.getByTestId('auth-form-error');
    const hasError = await errorEl.isVisible().catch(() => false);
    if (hasError) {
      const errorText = await page.getByTestId('auth-form-error-message').textContent();
      console.log('\n=== ERROR MESSAGE ===');
      console.log(errorText);
    }

    // Take screenshot
    await page.screenshot({ path: 'test-results/login-debug.png' });
    console.log('\nScreenshot saved to test-results/login-debug.png');

    // Report final state
    const currentPath = new URL(page.url()).pathname;
    if (currentPath.includes('/auth')) {
      console.log('\n❌ Still on auth page - login did not navigate');
    } else {
      console.log('\n✅ Successfully navigated to:', currentPath);
    }
  });
});
