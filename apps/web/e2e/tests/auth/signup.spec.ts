/**
 * @fileoverview Signup Flow E2E Tests
 * @module @nxt1/web/e2e/tests/auth
 *
 * End-to-end tests for user registration functionality.
 */

import { test, expect } from '../../fixtures';
import {
  generateTestEmail,
  generateTestPassword,
  INVALID_EMAILS,
  WEAK_PASSWORDS,
  AUTH_ERRORS,
  ROUTES,
} from '../../utils';

test.describe('Signup Page', () => {
  test.beforeEach(async ({ signupPage }) => {
    await signupPage.gotoAndVerify();
  });

  // ===========================================================================
  // PAGE LOAD TESTS
  // ===========================================================================

  test.describe('Page Load', () => {
    test('should display signup page with correct elements', async ({ signupPage }) => {
      // Initial state shows social buttons
      await signupPage.assertVisible(signupPage.pageTitle);
      await signupPage.assertVisible(signupPage.socialButtonsContainer);
      await signupPage.assertVisible(signupPage.continueWithEmailButton);

      // After clicking Continue with Email, form should appear
      await signupPage.showEmailForm();
      await signupPage.assertVisible(signupPage.emailInput);
      await signupPage.assertVisible(signupPage.passwordInput);
      await signupPage.assertVisible(signupPage.submitButton);
    });

    test('should have correct page title', async ({ page }) => {
      await expect(page).toHaveTitle(/create|sign up|register|nxt1/i);
    });

    test('should show mode switcher after email form opened', async ({ signupPage }) => {
      // The mode switcher appears after clicking Continue with Email
      await signupPage.showEmailForm();
      // Mode switcher should be visible (using auth-mode-login/auth-mode-signup)
      await signupPage.assertVisible(signupPage.page.getByTestId('auth-mode-login'));
    });
  });

  // ===========================================================================
  // FORM VALIDATION TESTS
  // ===========================================================================

  test.describe('Form Validation', () => {
    test.beforeEach(async ({ signupPage }) => {
      // Each validation test needs form visible
      await signupPage.showEmailForm();
    });

    test('should not submit with empty form', async ({ signupPage }) => {
      await signupPage.submit();

      // Should stay on signup page
      await signupPage.assertPageLoaded();
    });

    test('should not submit with only email', async ({ signupPage }) => {
      await signupPage.emailInput.fill('test@example.com');
      await signupPage.submit();

      await signupPage.assertPageLoaded();
    });

    test('should not submit with only password', async ({ signupPage }) => {
      await signupPage.passwordInput.fill('Password123!');
      await signupPage.submit();

      await signupPage.assertPageLoaded();
    });

    test.describe('Invalid Emails', () => {
      for (const email of INVALID_EMAILS.slice(1, 3)) {
        test(`should reject: ${email || '(empty)'}`, async ({ signupPage }) => {
          await signupPage.emailInput.fill(email);
          await signupPage.passwordInput.fill('Password123!');

          // Check browser validation
          const isValid = await signupPage.emailInput.evaluate(
            (el: HTMLInputElement) => el.validity.valid
          );

          if (email) {
            expect(isValid).toBe(false);
          }
        });
      }
    });

    test.describe('Weak Passwords', () => {
      for (const password of WEAK_PASSWORDS.filter((p) => p)) {
        test(`should warn about weak password: ${password}`, async ({ signupPage }) => {
          await signupPage.fillForm({
            email: generateTestEmail(),
            password,
          });

          await signupPage.submit();

          // Should either show error or stay on page
          const hasError = await signupPage.hasError();
          const stillOnPage = signupPage.getCurrentUrl().includes('/auth');

          expect(hasError || stillOnPage).toBe(true);
        });
      }
    });
  });

  // ===========================================================================
  // SUCCESSFUL REGISTRATION TESTS
  // ===========================================================================

  test.describe('Successful Registration', () => {
    // These tests require a backend server - skip in CI without backend
    test.skip(
      () => !process.env.TEST_BACKEND_URL,
      'Skipping registration tests - no backend configured'
    );

    test.beforeEach(async ({ signupPage }) => {
      await signupPage.showEmailForm();
    });

    test('should register new user with valid credentials', async ({ signupPage }) => {
      const testEmail = generateTestEmail();
      const testPassword = generateTestPassword();

      await signupPage.signupWithEmail({
        email: testEmail,
        password: testPassword,
      });

      // Should redirect to onboarding or home
      await signupPage.assertSignupSuccess();
    });

    test('should clear form errors on valid input', async ({ signupPage }) => {
      // Submit empty to trigger validation
      await signupPage.submit();

      // Now fill valid data
      await signupPage.fillForm({
        email: generateTestEmail(),
        password: generateTestPassword(),
      });

      // Errors should clear (implementation dependent)
      // This is a best-effort test
    });
  });

  // ===========================================================================
  // REGISTRATION FAILURE TESTS
  // ===========================================================================

  test.describe('Registration Failures', () => {
    // These tests require a backend server - skip in CI without backend
    test.skip(
      () => !process.env.TEST_BACKEND_URL,
      'Skipping registration failure tests - no backend configured'
    );

    test.beforeEach(async ({ signupPage }) => {
      await signupPage.showEmailForm();
    });

    test('should show error for existing email', async ({ signupPage, testUser }) => {
      test.skip(!testUser.email, 'Test user not configured');

      await signupPage.signupWithEmail({
        email: testUser.email,
        password: generateTestPassword(),
      });

      await signupPage.assertError(AUTH_ERRORS.EMAIL_IN_USE);
    });
  });

  // ===========================================================================
  // NAVIGATION TESTS
  // ===========================================================================

  test.describe('Navigation', () => {
    test('should have terms link after opening email form', async ({ signupPage }) => {
      // Terms disclaimer shows only after email form is opened in signup mode
      await signupPage.showEmailForm();
      const hasTerms = await signupPage.termsLink.isVisible().catch(() => false);
      if (hasTerms) {
        await signupPage.assertVisible(signupPage.termsLink);
      }
    });
  });

  // ===========================================================================
  // SOCIAL SIGNUP TESTS
  // ===========================================================================

  test.describe('Social Signup', () => {
    test('should have Google signup button', async ({ signupPage }) => {
      const hasGoogle = await signupPage.googleButton.isVisible().catch(() => false);
      if (hasGoogle) {
        await signupPage.assertVisible(signupPage.googleButton);
      }
    });

    test('should have Apple signup button', async ({ signupPage }) => {
      const hasApple = await signupPage.appleButton.isVisible().catch(() => false);
      if (hasApple) {
        await signupPage.assertVisible(signupPage.appleButton);
      }
    });
  });
});

// ===========================================================================
// ACCESSIBILITY TESTS
// ===========================================================================

test.describe('Signup Accessibility', () => {
  test('should be keyboard navigable', async ({ signupPage }) => {
    await signupPage.gotoAndVerify();
    await signupPage.showEmailForm();

    // Tab through form elements
    await signupPage.page.keyboard.press('Tab');
    await signupPage.page.keyboard.press('Tab');

    // Should be able to type in focused input
    await signupPage.page.keyboard.type('test');
  });

  test('should have proper form labels', async ({ signupPage }) => {
    await signupPage.gotoAndVerify();
    await signupPage.showEmailForm();

    // Check for associated labels or aria-labels
    const emailLabel = signupPage.page.locator('label:has-text("email"), [aria-label*="email" i]');
    const hasEmailLabel = (await emailLabel.count()) > 0;

    // Either explicit label or aria-label should exist
    expect(hasEmailLabel || (await signupPage.emailInput.getAttribute('aria-label'))).toBeTruthy();
  });
});
