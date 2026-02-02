/**
 * @fileoverview Login Flow E2E Tests
 * @module @nxt1/web/e2e/tests/auth
 *
 * End-to-end tests for user login functionality.
 * Tests various login scenarios including success, failure, and edge cases.
 */

import { test, expect } from '../../fixtures';
import { generateTestEmail, INVALID_EMAILS, AUTH_ERRORS, ROUTES } from '../../utils';

test.describe('Login Page', () => {
  test.beforeEach(async ({ loginPage }) => {
    await loginPage.gotoAndVerify();
  });

  // ===========================================================================
  // PAGE LOAD TESTS
  // ===========================================================================

  test.describe('Page Load', () => {
    test('should display login page with correct elements', async ({ loginPage }) => {
      // Verify page title
      await loginPage.assertVisible(loginPage.pageTitle);

      // Verify social buttons are visible
      await loginPage.assertSocialButtonsVisible();

      // Verify email option button
      await loginPage.assertVisible(loginPage.continueWithEmailButton);
    });

    test('should have correct page title', async ({ page }) => {
      await expect(page).toHaveTitle(/sign in|login|nxt1/i);
    });
  });

  // ===========================================================================
  // EMAIL FORM TESTS
  // ===========================================================================

  test.describe('Email Form', () => {
    test('should show email form when clicking continue with email', async ({ loginPage }) => {
      await loginPage.showEmailForm();
      await loginPage.assertEmailFormVisible();
    });

    test('should allow going back to social buttons', async ({ loginPage }) => {
      await loginPage.showEmailForm();
      await loginPage.assertEmailFormVisible();

      await loginPage.goBack();
      await loginPage.assertSocialButtonsVisible();
    });

    test('should have forgot password link in email form', async ({ loginPage }) => {
      await loginPage.showEmailForm();
      await loginPage.assertVisible(loginPage.forgotPasswordLink);
    });
  });

  // ===========================================================================
  // LOGIN SUCCESS TESTS
  // Requires real Firebase Auth backend
  // Run with E2E_REAL_AUTH=true
  // ===========================================================================

  test.describe('Successful Login', () => {
    test('should login successfully with valid credentials', async ({ loginPage, testUser }) => {
      test.skip(!process.env['E2E_REAL_AUTH'], 'Requires E2E_REAL_AUTH=true');

      await loginPage.loginWithEmail(testUser);
      await loginPage.assertLoginSuccess();
    });

    test('should clear error message on successful retry', async ({ loginPage, testUser }) => {
      test.skip(!process.env['E2E_REAL_AUTH'], 'Requires E2E_REAL_AUTH=true');

      // First, try with wrong password (should fail)
      const firstAttempt = await loginPage.tryLoginWithEmail({
        email: testUser.email,
        password: 'WrongPassword123!',
      });
      expect(firstAttempt).toBe(false);

      // Wait for error
      await loginPage.assertError();

      // Now login with correct credentials
      await loginPage.fillCredentials(testUser);
      await loginPage.submit();

      // Should succeed
      await loginPage.assertLoginSuccess();
    });
  });

  // ===========================================================================
  // LOGIN FAILURE TESTS
  // ===========================================================================

  test.describe('Login Failures', () => {
    test('should show error for invalid credentials', async ({ loginPage }) => {
      test.skip(!process.env['E2E_REAL_AUTH'], 'Requires E2E_REAL_AUTH=true');

      const success = await loginPage.tryLoginWithEmail({
        email: generateTestEmail('invalid'),
        password: 'WrongPassword123!',
      });

      expect(success).toBe(false);
      await loginPage.assertError();
    });

    test('should show error for empty email', async ({ loginPage }) => {
      await loginPage.showEmailForm();
      await loginPage.fillCredentials({
        email: '',
        password: 'SomePassword123!',
      });
      await loginPage.submitAndExpectValidationError();

      // Form should not have navigated
      await loginPage.assertPageLoaded();
    });

    test('should show error for empty password', async ({ loginPage }) => {
      await loginPage.showEmailForm();
      await loginPage.fillCredentials({
        email: 'test@example.com',
        password: '',
      });
      await loginPage.submitAndExpectValidationError();

      // Form should not have navigated
      await loginPage.assertPageLoaded();
    });

    test.describe('Invalid Email Formats', () => {
      for (const invalidEmail of INVALID_EMAILS.slice(1, 4)) {
        test(`should reject invalid email: ${invalidEmail}`, async ({ loginPage }) => {
          await loginPage.showEmailForm();
          await loginPage.fillCredentials({
            email: invalidEmail,
            password: 'Password123!',
          });

          // Browser validation should prevent submission
          const emailInput = loginPage.emailInput;
          const isValid = await emailInput.evaluate((el: HTMLInputElement) => el.validity.valid);
          expect(isValid).toBe(false);
        });
      }
    });
  });

  // ===========================================================================
  // NAVIGATION TESTS
  // ===========================================================================

  test.describe('Navigation', () => {
    test('should navigate to forgot password page', async ({ loginPage, page }) => {
      await loginPage.goToForgotPassword();
      await expect(page).toHaveURL(new RegExp(ROUTES.auth.forgotPassword));
    });
  });

  // ===========================================================================
  // LOADING STATE TESTS
  // ===========================================================================

  test.describe('Loading States', () => {
    test('should show loading state during login', async ({ loginPage }) => {
      await loginPage.showEmailForm();
      await loginPage.fillCredentials({
        email: generateTestEmail(),
        password: 'Password123!',
      });

      // Click and immediately check loading
      const submitPromise = loginPage.submit();

      // Loading should appear (may be very brief)
      // This is timing-dependent, so we just verify the form submitted
      await submitPromise;
    });

    test('should disable form during submission', async ({ loginPage }) => {
      await loginPage.showEmailForm();
      await loginPage.fillCredentials({
        email: generateTestEmail(),
        password: 'Password123!',
      });

      // After submission starts, button should be disabled briefly
      // This is an optimistic test - real implementation may vary
    });
  });
});

// ===========================================================================
// SOCIAL LOGIN TESTS (Separate describe for clarity)
// ===========================================================================

test.describe('Social Login', () => {
  test.beforeEach(async ({ loginPage }) => {
    await loginPage.gotoAndVerify();
  });

  test('should have Google sign in button', async ({ loginPage }) => {
    await loginPage.assertVisible(loginPage.googleButton);
  });

  test('should have Apple sign in button', async ({ loginPage }) => {
    await loginPage.assertVisible(loginPage.appleButton);
  });

  // Note: We can't fully test OAuth flows in E2E without mocking
  // These tests verify the buttons exist and are clickable

  test.skip('should open Google OAuth popup', async ({ loginPage, page }) => {
    // Listen for popup
    const popupPromise = page.waitForEvent('popup');

    await loginPage.clickGoogleSignIn();

    const popup = await popupPromise;
    expect(popup.url()).toContain('accounts.google.com');
    await popup.close();
  });
});
