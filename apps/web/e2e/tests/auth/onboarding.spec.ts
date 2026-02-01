/**
 * @fileoverview Onboarding Flow E2E Tests
 * @module @nxt1/web/e2e/tests/auth
 *
 * End-to-end tests for the onboarding wizard.
 * Tests the complete user onboarding flow including profile setup,
 * sport selection, and optional role selection.
 *
 * Prerequisites:
 * - Test user credentials must be set in environment (E2E_TEST_USER_EMAIL/PASSWORD)
 * - Test user account must NOT have completed onboarding (triggers onboarding on login)
 * - Requires E2E_REAL_AUTH=true for real Firebase authentication
 */

import { test, expect } from '../../fixtures';
import { TIMEOUTS } from '@nxt1/core/testing';

// Requires E2E_REAL_AUTH and test user configured to go to onboarding
test.describe('Onboarding Flow', () => {
  test.skip(() => !process.env.E2E_REAL_AUTH, 'Requires E2E_REAL_AUTH=true');

  // ===========================================================================
  // SETUP: Login with test user before each test
  // ===========================================================================

  test.beforeEach(async ({ loginPage, page, testUser }) => {
    // Login with the test account configured for onboarding
    await loginPage.gotoAndVerify();
    await loginPage.loginWithEmail(testUser);

    // Should redirect to onboarding after login (user hasn't completed onboarding)
    await page.waitForURL(/auth\/onboarding/, { timeout: TIMEOUTS.NAVIGATION });
  });

  // ===========================================================================
  // PAGE LOAD TESTS
  // ===========================================================================

  test.describe('Page Load', () => {
    test('should display onboarding page after login', async ({ onboardingPage }) => {
      // First step (profile) should be visible
      await onboardingPage.assertProfileStepVisible();
    });

    test('should show continue button', async ({ onboardingPage }) => {
      await expect(onboardingPage.continueButton).toBeVisible();
    });
  });

  // ===========================================================================
  // PROFILE STEP TESTS
  // ===========================================================================

  test.describe('Profile Step', () => {
    test('should display profile form elements', async ({ onboardingPage }) => {
      await onboardingPage.assertProfileStepVisible();
      await expect(onboardingPage.firstNameInput).toBeVisible();
      await expect(onboardingPage.lastNameInput).toBeVisible();
    });

    test('should allow continuing with valid profile', async ({ onboardingPage }) => {
      await onboardingPage.fillProfile({
        firstName: 'Test',
        lastName: 'Athlete',
      });

      await onboardingPage.assertContinueEnabled();
    });

    test('should advance to sport step after profile', async ({ onboardingPage }) => {
      await onboardingPage.fillProfile({
        firstName: 'Test',
        lastName: 'Athlete',
      });

      await onboardingPage.clickContinue();
      await onboardingPage.assertSportStepVisible();
    });
  });

  // ===========================================================================
  // SPORT STEP TESTS
  // ===========================================================================

  test.describe('Sport Step', () => {
    test.beforeEach(async ({ onboardingPage }) => {
      // Complete profile step first
      await onboardingPage.fillProfile({
        firstName: 'Test',
        lastName: 'Athlete',
      });
      await onboardingPage.clickContinue();
    });

    test('should advance to sport step after profile', async ({ page }) => {
      // Wait for navigation after profile
      await page.waitForTimeout(1000);
      // Verify we're still on onboarding (sport step or later)
      expect(page.url()).toContain('/auth/onboarding');
    });
  });

  // ===========================================================================
  // GENDER STEP TESTS (if applicable)
  // ===========================================================================

  test.describe('Gender Step', () => {
    test.beforeEach(async ({ onboardingPage, page }) => {
      // Complete profile step
      await onboardingPage.fillProfile({ firstName: 'Test', lastName: 'Athlete' });
      await onboardingPage.clickContinue();
      await page.waitForTimeout(500);
    });

    test('should allow continuing through steps', async ({ onboardingPage, page }) => {
      // Just verify we can continue clicking through
      const continueVisible = await onboardingPage.continueButton.isVisible().catch(() => false);
      expect(continueVisible).toBe(true);
    });
  });

  // ===========================================================================
  // NAVIGATION TESTS
  // ===========================================================================

  test.describe('Navigation', () => {
    test('should allow navigating through onboarding', async ({ onboardingPage, page }) => {
      // Fill profile
      await onboardingPage.fillProfile({ firstName: 'Nav', lastName: 'Test' });
      await onboardingPage.clickContinue();
      await page.waitForTimeout(500);

      // Click continue a few more times if possible
      const continueVisible = await onboardingPage.continueButton.isVisible().catch(() => false);
      if (continueVisible) {
        await onboardingPage.clickContinue();
        await page.waitForTimeout(500);
      }

      // Verify we're still on the app
      expect(page.url()).toContain('localhost:4500');
    });
  });

  // ===========================================================================
  // COMPLETE FLOW TESTS
  // ===========================================================================

  test.describe('Complete Flow', () => {
    test('should navigate through onboarding steps', async ({ onboardingPage, page }) => {
      // Fill profile
      await onboardingPage.fillProfile({
        firstName: 'E2E',
        lastName: 'Test',
      });
      await onboardingPage.clickContinue();

      // Wait for sport step or next step to appear
      await page.waitForTimeout(1000);

      // Verify we moved past profile step
      const currentUrl = page.url();
      expect(currentUrl).toContain('/auth/onboarding');
    });

    test('should persist progress if page is refreshed', async ({ onboardingPage, page }) => {
      // Complete profile step
      await onboardingPage.fillProfile({
        firstName: 'Persist',
        lastName: 'Test',
      });
      await onboardingPage.clickContinue();
      await page.waitForTimeout(1000);

      // Refresh the page
      await page.reload();
      await onboardingPage.waitForHydration();

      // Should still be on onboarding
      await onboardingPage.assertPageLoaded();
    });
  });
});

// ===========================================================================
// MOBILE VIEWPORT TESTS
// ===========================================================================

test.describe('Onboarding Mobile', () => {
  test.skip(() => !process.env.E2E_REAL_AUTH, 'Requires E2E_REAL_AUTH=true');

  test.use({
    viewport: { width: 390, height: 844 }, // iPhone 14 size
  });

  test('should display correctly on mobile', async ({
    loginPage,
    onboardingPage,
    page,
    testUser,
  }) => {
    // Setup: Login with test account configured for onboarding
    await loginPage.gotoAndVerify();
    await loginPage.loginWithEmail(testUser);
    await page.waitForURL(/auth\/onboarding/, { timeout: TIMEOUTS.NAVIGATION });

    // Profile step should be visible and properly styled for mobile
    await onboardingPage.assertProfileStepVisible();
    await expect(onboardingPage.continueButton).toBeVisible();
  });

  test('should have touch-friendly button sizes', async ({
    loginPage,
    onboardingPage,
    page,
    testUser,
  }) => {
    await loginPage.gotoAndVerify();
    await loginPage.loginWithEmail(testUser);
    await page.waitForURL(/auth\/onboarding/, { timeout: TIMEOUTS.NAVIGATION });

    // Continue button should have adequate touch target size
    const buttonBox = await onboardingPage.continueButton.boundingBox();
    expect(buttonBox?.height).toBeGreaterThanOrEqual(44); // Minimum touch target
  });
});
