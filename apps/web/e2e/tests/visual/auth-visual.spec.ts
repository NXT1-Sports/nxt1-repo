/**
 * @fileoverview Auth Pages Visual Regression Tests
 * @module @nxt1/web/e2e/tests/visual
 *
 * Visual regression tests for authentication pages.
 * Captures and compares screenshots to detect unintended UI changes.
 *
 * @usage
 * - First run: Creates baseline screenshots in ./snapshots/
 * - Subsequent runs: Compares against baselines
 * - Update baselines: npx playwright test --update-snapshots
 *
 * @see https://playwright.dev/docs/test-snapshots
 */

import { test, expect } from '@playwright/test';
import { LoginPage } from '../../pages/auth/login.page';
import { SignupPage } from '../../pages/auth/signup.page';
import { ForgotPasswordPage } from '../../pages/auth/forgot-password.page';
import { AUTH_TEST_IDS, COMMON_TEST_IDS } from '@nxt1/core/testing';

// Visual tests tolerance - allow minor pixel differences from font rendering
const VISUAL_TEST_OPTIONS = {
  maxDiffPixelRatio: 0.02, // Allow 2% pixel difference
  threshold: 0.3, // Pixel color threshold
};

test.describe('Auth Pages Visual Regression', () => {
  test.describe.configure({ mode: 'parallel' });

  // ===========================================================================
  // LOGIN PAGE VISUAL TESTS
  // ===========================================================================

  test.describe('Login Page', () => {
    let loginPage: LoginPage;

    test.beforeEach(async ({ page }) => {
      loginPage = new LoginPage(page);
    });

    test('login page - initial state', async ({ page }) => {
      await loginPage.goto();
      await loginPage.waitForElement(loginPage.pageTitle);

      // Wait for any animations to complete
      await page.waitForTimeout(500);

      await expect(page).toHaveScreenshot('login-initial.png', {
        fullPage: true,
        ...VISUAL_TEST_OPTIONS,
        mask: [
          // Mask any dynamic content like timestamps
          page.locator(`[data-testid="${COMMON_TEST_IDS.TIMESTAMP}"]`),
        ],
      });
    });

    test('login page - email form visible', async ({ page }) => {
      await loginPage.goto();
      await loginPage.showEmailForm();

      // Wait for form transition
      await page.waitForTimeout(300);

      await expect(page).toHaveScreenshot('login-email-form.png', {
        fullPage: true,
      });
    });

    test('login page - email validation error', async ({ page }) => {
      await loginPage.goto();
      await loginPage.showEmailForm();

      // Fill invalid email to trigger validation
      await loginPage.emailInput.fill('invalid-email');
      await loginPage.emailInput.blur();

      await page.waitForTimeout(200);

      await expect(page).toHaveScreenshot('login-email-error.png', {
        fullPage: true,
      });
    });

    test('login page - form filled', async ({ page }) => {
      await loginPage.goto();
      await loginPage.showEmailForm();

      await loginPage.fillCredentials({
        email: 'test@example.com',
        password: 'password123',
      });

      await expect(page).toHaveScreenshot('login-form-filled.png', {
        fullPage: true,
        mask: [
          // Mask password field for security
          loginPage.passwordInput,
        ],
      });
    });
  });

  // ===========================================================================
  // SIGNUP PAGE VISUAL TESTS
  // ===========================================================================

  test.describe('Signup Page', () => {
    let signupPage: SignupPage;

    test.beforeEach(async ({ page }) => {
      signupPage = new SignupPage(page);
    });

    test('signup page - initial state', async ({ page }) => {
      await signupPage.goto();
      await signupPage.waitForElement(signupPage.pageTitle);
      await page.waitForTimeout(500);

      await expect(page).toHaveScreenshot('signup-initial.png', {
        fullPage: true,
      });
    });

    // Skip: confirmPasswordInput not present in unified auth form
    test.skip('signup page - form partially filled', async ({ page }) => {
      await signupPage.goto();
      await signupPage.showEmailForm(); // Show form first
      await signupPage.waitForElement(signupPage.form);

      await signupPage.emailInput.fill('newuser@example.com');
      await signupPage.passwordInput.fill('securepassword');

      await expect(page).toHaveScreenshot('signup-partial-fill.png', {
        fullPage: true,
        ...VISUAL_TEST_OPTIONS,
        mask: [signupPage.passwordInput],
      });
    });

    // Skip: confirmPasswordInput not present in unified auth form
    test.skip('signup page - password mismatch', async ({ page }) => {
      await signupPage.goto();
      await signupPage.showEmailForm(); // Show form first
      await signupPage.waitForElement(signupPage.form);

      await signupPage.fillForm({
        email: 'newuser@example.com',
        password: 'password123',
        confirmPassword: 'different456',
      });

      // Focus out to trigger validation
      await signupPage.teamCodeInput.focus();
      await page.waitForTimeout(200);

      await expect(page).toHaveScreenshot('signup-password-mismatch.png', {
        fullPage: true,
        ...VISUAL_TEST_OPTIONS,
        mask: [signupPage.passwordInput],
      });
    });

    test('signup page - footer links', async ({ page }) => {
      await signupPage.goto();
      await signupPage.showEmailForm(); // Show form to access footer/terms
      await signupPage.waitForElement(signupPage.footer);

      // Wait for page to stabilize
      await page.waitForTimeout(300);

      // Screenshot just the footer area
      await expect(signupPage.footer).toHaveScreenshot('signup-footer.png');
    });
  });

  // ===========================================================================
  // FORGOT PASSWORD PAGE VISUAL TESTS
  // ===========================================================================

  test.describe('Forgot Password Page', () => {
    let forgotPasswordPage: ForgotPasswordPage;

    test.beforeEach(async ({ page }) => {
      forgotPasswordPage = new ForgotPasswordPage(page);
    });

    test('forgot password - initial state', async ({ page }) => {
      await forgotPasswordPage.goto();
      await forgotPasswordPage.waitForElement(forgotPasswordPage.pageTitle);
      await page.waitForTimeout(500);

      await expect(page).toHaveScreenshot('forgot-password-initial.png', {
        fullPage: true,
      });
    });

    test('forgot password - email entered', async ({ page }) => {
      await forgotPasswordPage.goto();
      await forgotPasswordPage.waitForElement(forgotPasswordPage.form);

      await forgotPasswordPage.emailInput.fill('user@example.com');

      await expect(page).toHaveScreenshot('forgot-password-email-entered.png', {
        fullPage: true,
      });
    });

    test('forgot password - form elements', async ({ page }) => {
      await forgotPasswordPage.goto();
      await forgotPasswordPage.waitForElement(forgotPasswordPage.form);

      // Wait for page to stabilize
      await page.waitForTimeout(300);

      // Screenshot just the form
      await expect(forgotPasswordPage.form).toHaveScreenshot('forgot-password-form.png');
    });
  });

  // ===========================================================================
  // RESPONSIVE VISUAL TESTS
  // ===========================================================================

  test.describe('Responsive Screenshots', () => {
    test('login page - mobile viewport', async ({ page }) => {
      // Set mobile viewport
      await page.setViewportSize({ width: 375, height: 812 });

      const loginPage = new LoginPage(page);
      await loginPage.goto();
      await loginPage.waitForElement(loginPage.pageTitle);
      await page.waitForTimeout(500);

      await expect(page).toHaveScreenshot('login-mobile.png', {
        fullPage: true,
        ...VISUAL_TEST_OPTIONS,
      });
    });

    test('signup page - mobile viewport', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 812 });

      const signupPage = new SignupPage(page);
      await signupPage.goto();
      await signupPage.waitForElement(signupPage.pageTitle);
      await page.waitForTimeout(500);

      await expect(page).toHaveScreenshot('signup-mobile.png', {
        fullPage: true,
        ...VISUAL_TEST_OPTIONS,
      });
    });

    test('login page - tablet viewport', async ({ page }) => {
      await page.setViewportSize({ width: 768, height: 1024 });

      const loginPage = new LoginPage(page);
      await loginPage.goto();
      await loginPage.waitForElement(loginPage.pageTitle);
      await page.waitForTimeout(500);

      await expect(page).toHaveScreenshot('login-tablet.png', {
        fullPage: true,
        ...VISUAL_TEST_OPTIONS,
      });
    });
  });

  // ===========================================================================
  // THEME VISUAL TESTS (if applicable)
  // ===========================================================================

  test.describe('Theme Screenshots', () => {
    test('login page - dark mode (default)', async ({ page }) => {
      // NXT1 uses dark theme by default
      const loginPage = new LoginPage(page);
      await loginPage.goto();
      await loginPage.waitForElement(loginPage.pageTitle);

      await expect(page).toHaveScreenshot('login-dark-theme.png', {
        fullPage: true,
        ...VISUAL_TEST_OPTIONS,
      });
    });

    test.skip('login page - light mode', async ({ page }) => {
      // Skip until light mode is implemented
      // Emulate light color scheme
      await page.emulateMedia({ colorScheme: 'light' });

      const loginPage = new LoginPage(page);
      await loginPage.goto();
      await loginPage.waitForElement(loginPage.pageTitle);

      await expect(page).toHaveScreenshot('login-light-theme.png', {
        fullPage: true,
      });
    });
  });
});

// ===========================================================================
// VISUAL COMPARISON UTILITIES
// ===========================================================================

test.describe('Component Screenshots', () => {
  test('social buttons component', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.waitForElement(loginPage.googleButton);

    // Screenshot just the social buttons
    const socialButtons = page.getByTestId(AUTH_TEST_IDS.SOCIAL_BUTTONS_CONTAINER);
    await expect(socialButtons).toHaveScreenshot('social-buttons.png');
  });

  test('auth form component', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.showEmailForm();
    await page.waitForTimeout(300);

    // Screenshot just the auth form
    await expect(loginPage.emailForm).toHaveScreenshot('auth-email-form.png');
  });
});
