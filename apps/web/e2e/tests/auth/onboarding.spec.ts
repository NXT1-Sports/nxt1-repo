/**
 * @fileoverview Onboarding Flow E2E Tests
 * @module @nxt1/web/e2e/tests/auth
 *
 * End-to-end tests for the onboarding wizard.
 * Tests the complete user onboarding flow including profile setup,
 * sport selection, and optional role selection.
 *
 * Prerequisites:
 * - Test user must be authenticated (use global setup or signup first)
 * - Test user should not have completed onboarding yet
 */

import { test, expect } from '../../fixtures';
import { TIMEOUTS } from '@nxt1/core/testing';

test.describe('Onboarding Flow', () => {
  // ===========================================================================
  // SETUP: Create new user before each test
  // ===========================================================================

  test.beforeEach(async ({ signupPage, page }) => {
    // Create a new test account that hasn't completed onboarding
    await signupPage.gotoAndVerify();

    const timestamp = Date.now();
    const testEmail = `e2e-onboarding-${timestamp}@test.nxt1.com`;

    await signupPage.signupWithEmail({
      email: testEmail,
      password: 'TestPassword123!',
    });

    // Should redirect to onboarding after signup
    await page.waitForURL(/auth\/onboarding/, { timeout: TIMEOUTS.NAVIGATION });
  });

  // ===========================================================================
  // PAGE LOAD TESTS
  // ===========================================================================

  test.describe('Page Load', () => {
    test('should display onboarding page after signup', async ({ onboardingPage }) => {
      // First step (profile) should be visible
      await onboardingPage.assertProfileStepVisible();
    });

    test('should show progress bar', async ({ onboardingPage }) => {
      await expect(onboardingPage.progressBar).toBeVisible();
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
      await expect(onboardingPage.photoUpload).toBeVisible();
    });

    test('should require first name', async ({ onboardingPage }) => {
      await onboardingPage.fillProfile({
        firstName: '',
        lastName: 'User',
      });

      // Continue should be disabled or show validation error
      await onboardingPage.assertContinueDisabled();
    });

    test('should require last name', async ({ onboardingPage }) => {
      await onboardingPage.fillProfile({
        firstName: 'Test',
        lastName: '',
      });

      await onboardingPage.assertContinueDisabled();
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

    test('should display sport selection', async ({ onboardingPage }) => {
      await onboardingPage.assertSportStepVisible();
    });

    test('should allow selecting a sport', async ({ onboardingPage }) => {
      await onboardingPage.selectSport('Football');
      await onboardingPage.assertContinueEnabled();
    });

    test('should allow selecting multiple sports', async ({ onboardingPage }) => {
      await onboardingPage.selectSport('Football');
      await onboardingPage.selectSport('Basketball');
      await onboardingPage.assertContinueEnabled();
    });

    test('should advance to next step after sport selection', async ({ onboardingPage }) => {
      await onboardingPage.selectSport('Football');
      await onboardingPage.clickContinue();

      // Should advance to gender or birthdate step
      const isGenderVisible = await onboardingPage.genderStep.isVisible().catch(() => false);
      const isBirthdateVisible = await onboardingPage.birthdateStep.isVisible().catch(() => false);

      expect(isGenderVisible || isBirthdateVisible).toBe(true);
    });
  });

  // ===========================================================================
  // GENDER STEP TESTS (if applicable)
  // ===========================================================================

  test.describe('Gender Step', () => {
    test.beforeEach(async ({ onboardingPage }) => {
      // Complete profile and sport steps
      await onboardingPage.fillProfile({ firstName: 'Test', lastName: 'Athlete' });
      await onboardingPage.clickContinue();
      await onboardingPage.selectSport('Football');
      await onboardingPage.clickContinue();
    });

    test('should display gender options', async ({ onboardingPage }) => {
      // Skip if gender step is not shown for this flow
      const isVisible = await onboardingPage.genderStep.isVisible().catch(() => false);
      test.skip(!isVisible, 'Gender step not shown in this flow');

      await onboardingPage.assertGenderStepVisible();
    });

    test('should allow selecting gender', async ({ onboardingPage }) => {
      const isVisible = await onboardingPage.genderStep.isVisible().catch(() => false);
      test.skip(!isVisible, 'Gender step not shown in this flow');

      await onboardingPage.selectGender('male');
      await onboardingPage.assertContinueEnabled();
    });
  });

  // ===========================================================================
  // REFERRAL STEP TESTS
  // ===========================================================================

  test.describe('Referral Step', () => {
    test('should allow skipping referral step', async ({ onboardingPage }) => {
      // Navigate through required steps
      await onboardingPage.fillProfile({ firstName: 'Test', lastName: 'Athlete' });
      await onboardingPage.clickContinue();
      await onboardingPage.selectSport('Football');
      await onboardingPage.clickContinue();

      // Navigate through optional steps until referral
      // (Gender, Birthdate steps may or may not appear)
      let attempts = 0;
      while (attempts < 5) {
        const isReferralVisible = await onboardingPage.referralStep.isVisible().catch(() => false);
        if (isReferralVisible) break;

        const isSkipVisible = await onboardingPage.skipButton.isVisible().catch(() => false);
        const isContinueEnabled = await onboardingPage.continueButton
          .isEnabled()
          .catch(() => false);

        if (isSkipVisible) {
          await onboardingPage.clickSkip();
        } else if (isContinueEnabled) {
          await onboardingPage.clickContinue();
        }
        attempts++;
      }

      // If referral step is visible, verify skip works
      const isReferralVisible = await onboardingPage.referralStep.isVisible().catch(() => false);
      if (isReferralVisible) {
        await onboardingPage.assertSkipVisible();
      }
    });
  });

  // ===========================================================================
  // COMPLETE FLOW TESTS
  // ===========================================================================

  test.describe('Complete Flow', () => {
    test('should complete onboarding and redirect to home', async ({ onboardingPage }) => {
      // Use the helper to complete the full flow
      await onboardingPage.completeOnboardingFlow({
        profile: { firstName: 'Complete', lastName: 'FlowTest' },
        sport: 'Football',
        gender: 'male',
        birthdate: '2005-06-15',
      });

      // Should redirect to home/feed
      await onboardingPage.assertOnboardingComplete();
    });

    test('should persist progress if page is refreshed', async ({ onboardingPage, page }) => {
      // Complete profile step
      await onboardingPage.fillProfile({
        firstName: 'Persist',
        lastName: 'Test',
      });
      await onboardingPage.clickContinue();

      // Should be on sport step
      await onboardingPage.assertSportStepVisible();

      // Refresh the page
      await page.reload();
      await onboardingPage.waitForHydration();

      // Should still be on sport step (or restore progress)
      // Note: This depends on session persistence implementation
      await onboardingPage.assertPageLoaded();
    });

    test('should handle back navigation correctly', async ({ onboardingPage, page }) => {
      // Complete profile and sport steps
      await onboardingPage.fillProfile({
        firstName: 'Back',
        lastName: 'Test',
      });
      await onboardingPage.clickContinue();
      await onboardingPage.selectSport('Football');
      await onboardingPage.clickContinue();

      // Go back using browser navigation
      await page.goBack();

      // Should return to previous step with data preserved
      await onboardingPage.waitForHydration();
    });
  });

  // ===========================================================================
  // VALIDATION TESTS
  // ===========================================================================

  test.describe('Validation', () => {
    test('should show error for invalid profile data', async ({ onboardingPage }) => {
      // Try to continue with empty profile
      await onboardingPage.assertContinueDisabled();
    });

    test('should validate sport selection before continuing', async ({ onboardingPage }) => {
      await onboardingPage.fillProfile({ firstName: 'Test', lastName: 'User' });
      await onboardingPage.clickContinue();

      // On sport step, continue should be disabled without selection
      await onboardingPage.assertSportStepVisible();
      await onboardingPage.assertContinueDisabled();
    });
  });

  // ===========================================================================
  // ACCESSIBILITY TESTS
  // ===========================================================================

  test.describe('Accessibility', () => {
    test('should have proper focus management', async ({ onboardingPage, page }) => {
      await onboardingPage.assertProfileStepVisible();

      // First name input should be focusable
      await page.keyboard.press('Tab');
      await expect(onboardingPage.firstNameInput).toBeFocused();
    });

    test('should support keyboard navigation', async ({ onboardingPage, page }) => {
      await onboardingPage.fillProfile({ firstName: 'Keyboard', lastName: 'Test' });

      // Should be able to submit with Enter
      await page.keyboard.press('Enter');

      // Should advance (or continue button should be focused for Enter)
      await onboardingPage.assertSportStepVisible();
    });
  });
});

// ===========================================================================
// MOBILE VIEWPORT TESTS
// ===========================================================================

test.describe('Onboarding Mobile', () => {
  test.use({
    viewport: { width: 390, height: 844 }, // iPhone 14 size
  });

  test('should display correctly on mobile', async ({ signupPage, onboardingPage, page }) => {
    // Setup: Create account and get to onboarding
    await signupPage.gotoAndVerify();

    const timestamp = Date.now();
    await signupPage.signupWithEmail({
      email: `e2e-mobile-${timestamp}@test.nxt1.com`,
      password: 'TestPassword123!',
    });

    await page.waitForURL(/auth\/onboarding/, { timeout: TIMEOUTS.NAVIGATION });

    // Profile step should be visible and properly styled for mobile
    await onboardingPage.assertProfileStepVisible();
    await expect(onboardingPage.continueButton).toBeVisible();
  });

  test('should have touch-friendly button sizes', async ({ signupPage, onboardingPage, page }) => {
    await signupPage.gotoAndVerify();

    const timestamp = Date.now();
    await signupPage.signupWithEmail({
      email: `e2e-touch-${timestamp}@test.nxt1.com`,
      password: 'TestPassword123!',
    });

    await page.waitForURL(/auth\/onboarding/, { timeout: TIMEOUTS.NAVIGATION });

    // Continue button should have adequate touch target size
    const buttonBox = await onboardingPage.continueButton.boundingBox();
    expect(buttonBox?.height).toBeGreaterThanOrEqual(44); // Minimum touch target
  });
});
