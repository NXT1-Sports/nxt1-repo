/**
 * @fileoverview Onboarding Page Object
 * @module @nxt1/web/e2e/pages
 *
 * Page Object for the onboarding flow.
 * Uses data-testid selectors from @nxt1/core/testing for cross-platform consistency.
 *
 * The onboarding flow consists of these steps:
 * 1. Profile (name, photo, location)
 * 2. Sport (sport selection)
 * 3. Gender
 * 4. Birthdate
 * 5. Referral (how did you hear about us)
 * 6. Role (optional)
 */

import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from '../base.page';
import {
  ONBOARDING_TEST_IDS,
  ONBOARDING_PAGE_TEST_IDS,
  ROUTES,
  TIMEOUTS,
} from '@nxt1/core/testing';

/**
 * Profile data for onboarding
 */
export interface OnboardingProfileData {
  firstName: string;
  lastName: string;
  photoPath?: string;
}

/**
 * Sport entry data
 */
export interface SportEntryData {
  sport: string;
  teamName?: string;
  teamType?: string;
  position?: string;
}

/**
 * Onboarding Page Object
 *
 * Handles all interactions with the onboarding wizard including:
 * - Profile setup (name, photo, location)
 * - Sport selection and configuration
 * - Gender selection
 * - Birthdate entry
 * - Referral source
 * - Optional role selection
 *
 * All selectors use data-testid for maximum stability across web and mobile.
 */
export class OnboardingPage extends BasePage {
  readonly url = ROUTES.AUTH.ONBOARDING;

  // ===========================================================================
  // PAGE-LEVEL SELECTORS
  // ===========================================================================

  /** Main page container */
  readonly pageContainer: Locator;

  /** Page title */
  readonly pageTitle: Locator;

  /** Page subtitle */
  readonly pageSubtitle: Locator;

  // ===========================================================================
  // PROGRESS BAR
  // ===========================================================================

  /** Progress bar container */
  readonly progressBar: Locator;

  // ===========================================================================
  // NAVIGATION BUTTONS
  // ===========================================================================

  /** Skip button (for optional steps) */
  readonly skipButton: Locator;

  /** Continue/Next button */
  readonly continueButton: Locator;

  /** Complete button (final step) */
  readonly completeButton: Locator;

  // ===========================================================================
  // PROFILE STEP SELECTORS
  // ===========================================================================

  /** Profile step container */
  readonly profileStep: Locator;

  /** First name input */
  readonly firstNameInput: Locator;

  /** Last name input */
  readonly lastNameInput: Locator;

  /** Photo upload button */
  readonly photoUpload: Locator;

  /** Hidden file input for photo */
  readonly photoInput: Locator;

  /** Detect location button */
  readonly detectLocationButton: Locator;

  // ===========================================================================
  // SPORT STEP SELECTORS
  // ===========================================================================

  /** Sport step container */
  readonly sportStep: Locator;

  // ===========================================================================
  // GENDER STEP SELECTORS
  // ===========================================================================

  /** Gender step container */
  readonly genderStep: Locator;

  // ===========================================================================
  // BIRTHDATE STEP SELECTORS
  // ===========================================================================

  /** Birthdate step container */
  readonly birthdateStep: Locator;

  /** Birthdate input */
  readonly birthdateInput: Locator;

  // ===========================================================================
  // REFERRAL STEP SELECTORS
  // ===========================================================================

  /** Referral step container */
  readonly referralStep: Locator;

  // ===========================================================================
  // ROLE SELECTION SELECTORS
  // ===========================================================================

  /** Role selection step container */
  readonly roleStep: Locator;

  // ===========================================================================
  // ERROR & SUCCESS SELECTORS
  // ===========================================================================

  /** Error message container */
  readonly errorMessage: Locator;

  /** Success/completion container */
  readonly successMessage: Locator;

  constructor(page: Page) {
    super(page);

    // Page-level
    this.pageContainer = page.getByTestId(ONBOARDING_PAGE_TEST_IDS.ONBOARDING_PAGE);
    this.pageTitle = page.getByTestId(ONBOARDING_PAGE_TEST_IDS.ONBOARDING_TITLE);
    this.pageSubtitle = page.getByTestId(ONBOARDING_PAGE_TEST_IDS.ONBOARDING_SUBTITLE);

    // Progress bar
    this.progressBar = page.getByTestId(ONBOARDING_TEST_IDS.PROGRESS_BAR);

    // Navigation buttons
    this.skipButton = page.getByTestId(ONBOARDING_TEST_IDS.BTN_SKIP);
    this.continueButton = page.getByTestId(ONBOARDING_TEST_IDS.BTN_CONTINUE);
    this.completeButton = page.getByTestId(ONBOARDING_TEST_IDS.BTN_COMPLETE);

    // Profile step
    this.profileStep = page.getByTestId(ONBOARDING_TEST_IDS.STEP_PROFILE);
    this.firstNameInput = page.getByTestId(ONBOARDING_TEST_IDS.INPUT_FIRST_NAME);
    this.lastNameInput = page.getByTestId(ONBOARDING_TEST_IDS.INPUT_LAST_NAME);
    this.photoUpload = page.getByTestId(ONBOARDING_TEST_IDS.PHOTO_UPLOAD);
    this.photoInput = page.getByTestId(ONBOARDING_TEST_IDS.PHOTO_INPUT);
    this.detectLocationButton = page.getByTestId(ONBOARDING_TEST_IDS.LOCATION_DETECT);

    // Sport step
    this.sportStep = page.getByTestId(ONBOARDING_TEST_IDS.STEP_SPORT);

    // Gender step
    this.genderStep = page.getByTestId(ONBOARDING_TEST_IDS.STEP_GENDER);

    // Birthdate step
    this.birthdateStep = page.getByTestId(ONBOARDING_TEST_IDS.STEP_BIRTHDATE);
    this.birthdateInput = page.getByTestId(ONBOARDING_TEST_IDS.INPUT_BIRTHDATE);

    // Referral step
    this.referralStep = page.getByTestId(ONBOARDING_TEST_IDS.STEP_REFERRAL);

    // Role step
    this.roleStep = page.getByTestId(ONBOARDING_TEST_IDS.STEP_ROLE);

    // Error/success
    this.errorMessage = page.getByTestId(ONBOARDING_TEST_IDS.STEP_ERROR);
    this.successMessage = page.getByTestId(ONBOARDING_PAGE_TEST_IDS.ONBOARDING_SUCCESS);
  }

  // ===========================================================================
  // NAVIGATION ACTIONS
  // ===========================================================================

  /**
   * Navigate to onboarding page and verify it loaded
   */
  async gotoAndVerify(): Promise<void> {
    await this.goto();
    await this.waitForHydration();
    await this.assertPageLoaded();
  }

  /**
   * Wait for Angular SSR hydration to complete
   */
  override async waitForHydration(): Promise<void> {
    await this.page.waitForLoadState('networkidle');
    await this.page.waitForTimeout(500); // Allow animations to settle
  }

  /**
   * Assert that the onboarding page loaded
   */
  override async assertPageLoaded(): Promise<void> {
    // Wait for any step to be visible (first step on load)
    await expect(this.profileStep.or(this.sportStep).or(this.genderStep)).toBeVisible({
      timeout: TIMEOUTS.NAVIGATION,
    });
  }

  /**
   * Click continue/next button
   */
  async clickContinue(): Promise<void> {
    await this.continueButton.click();
    await this.page.waitForTimeout(300); // Allow step transition animation
  }

  /**
   * Click skip button
   */
  async clickSkip(): Promise<void> {
    await this.skipButton.click();
    await this.page.waitForTimeout(300);
  }

  /**
   * Click complete button (final step)
   */
  async clickComplete(): Promise<void> {
    await this.completeButton.click();
  }

  // ===========================================================================
  // PROFILE STEP ACTIONS
  // ===========================================================================

  /**
   * Fill profile step data
   */
  async fillProfile(data: OnboardingProfileData): Promise<void> {
    await this.firstNameInput.fill(data.firstName);
    await this.lastNameInput.fill(data.lastName);

    if (data.photoPath) {
      await this.photoInput.setInputFiles(data.photoPath);
    }
  }

  /**
   * Assert profile step is visible
   */
  async assertProfileStepVisible(): Promise<void> {
    await expect(this.profileStep).toBeVisible({ timeout: TIMEOUTS.DEFAULT });
  }

  // ===========================================================================
  // SPORT STEP ACTIONS
  // ===========================================================================

  /**
   * Select a sport by name
   */
  async selectSport(sportName: string): Promise<void> {
    const sanitizedName = sportName.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const sportChip = this.page.getByTestId(`${ONBOARDING_TEST_IDS.SPORT_CHIP}-${sanitizedName}`);
    await sportChip.click();
  }

  /**
   * Assert sport step is visible
   */
  async assertSportStepVisible(): Promise<void> {
    await expect(this.sportStep).toBeVisible({ timeout: TIMEOUTS.DEFAULT });
  }

  // ===========================================================================
  // GENDER STEP ACTIONS
  // ===========================================================================

  /**
   * Select gender option
   */
  async selectGender(gender: string): Promise<void> {
    const sanitizedGender = gender.toLowerCase();
    const genderOption = this.page.getByTestId(
      `${ONBOARDING_TEST_IDS.GENDER_OPTION}-${sanitizedGender}`
    );
    await genderOption.click();
  }

  /**
   * Assert gender step is visible
   */
  async assertGenderStepVisible(): Promise<void> {
    await expect(this.genderStep).toBeVisible({ timeout: TIMEOUTS.DEFAULT });
  }

  // ===========================================================================
  // BIRTHDATE STEP ACTIONS
  // ===========================================================================

  /**
   * Fill birthdate
   */
  async fillBirthdate(date: string): Promise<void> {
    await this.birthdateInput.fill(date);
  }

  /**
   * Assert birthdate step is visible
   */
  async assertBirthdateStepVisible(): Promise<void> {
    await expect(this.birthdateStep).toBeVisible({ timeout: TIMEOUTS.DEFAULT });
  }

  // ===========================================================================
  // REFERRAL STEP ACTIONS
  // ===========================================================================

  /**
   * Select referral option
   */
  async selectReferralOption(type: string): Promise<void> {
    const sanitizedType = type.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const referralOption = this.page.getByTestId(
      `${ONBOARDING_TEST_IDS.REFERRAL_OPTION}-${sanitizedType}`
    );
    await referralOption.click();
  }

  /**
   * Assert referral step is visible
   */
  async assertReferralStepVisible(): Promise<void> {
    await expect(this.referralStep).toBeVisible({ timeout: TIMEOUTS.DEFAULT });
  }

  // ===========================================================================
  // ROLE SELECTION ACTIONS
  // ===========================================================================

  /**
   * Select a role
   */
  async selectRole(role: string): Promise<void> {
    const sanitizedRole = role.toLowerCase();
    const roleOption = this.page.getByTestId(`${ONBOARDING_TEST_IDS.ROLE_OPTION}-${sanitizedRole}`);
    await roleOption.click();
  }

  /**
   * Assert role step is visible
   */
  async assertRoleStepVisible(): Promise<void> {
    await expect(this.roleStep).toBeVisible({ timeout: TIMEOUTS.DEFAULT });
  }

  // ===========================================================================
  // ASSERTIONS
  // ===========================================================================

  /**
   * Assert continue button is enabled
   */
  async assertContinueEnabled(): Promise<void> {
    await expect(this.continueButton).toBeEnabled();
  }

  /**
   * Assert continue button is disabled
   */
  async assertContinueDisabled(): Promise<void> {
    await expect(this.continueButton).toBeDisabled();
  }

  /**
   * Assert skip button is visible
   */
  async assertSkipVisible(): Promise<void> {
    await expect(this.skipButton).toBeVisible();
  }

  /**
   * Assert error message is displayed
   */
  async assertError(messagePattern?: RegExp | string): Promise<void> {
    await expect(this.errorMessage).toBeVisible({ timeout: TIMEOUTS.DEFAULT });

    if (messagePattern) {
      await expect(this.errorMessage).toContainText(
        typeof messagePattern === 'string' ? messagePattern : messagePattern
      );
    }
  }

  /**
   * Assert onboarding completed successfully
   */
  async assertOnboardingComplete(): Promise<void> {
    // Should redirect to home or show success
    await this.page.waitForURL(/\/(home|feed|profile)/, {
      timeout: TIMEOUTS.NAVIGATION,
    });
  }

  /**
   * Check if a specific step indicator is active
   */
  async isStepActive(stepNumber: number): Promise<boolean> {
    const stepIndicator = this.page.getByTestId(
      `${ONBOARDING_TEST_IDS.STEP_INDICATOR}-${stepNumber}`
    );
    const classes = await stepIndicator.getAttribute('class');
    return classes?.includes('active') ?? false;
  }

  // ===========================================================================
  // COMPLETE FLOW HELPERS
  // ===========================================================================

  /**
   * Complete the entire onboarding flow with minimal data
   */
  async completeOnboardingFlow(options?: {
    profile?: OnboardingProfileData;
    sport?: string;
    gender?: string;
    birthdate?: string;
    referral?: string;
    role?: string;
  }): Promise<void> {
    // Profile step
    await this.assertProfileStepVisible();
    await this.fillProfile(
      options?.profile ?? {
        firstName: 'Test',
        lastName: 'User',
      }
    );
    await this.clickContinue();

    // Sport step
    await this.assertSportStepVisible();
    await this.selectSport(options?.sport ?? 'Football');
    await this.clickContinue();

    // Gender step (if visible)
    try {
      await this.assertGenderStepVisible();
      await this.selectGender(options?.gender ?? 'male');
      await this.clickContinue();
    } catch {
      // Gender step might be skipped based on role
    }

    // Birthdate step (if visible)
    try {
      await this.assertBirthdateStepVisible();
      await this.fillBirthdate(options?.birthdate ?? '2005-01-15');
      await this.clickContinue();
    } catch {
      // Birthdate step might be skipped
    }

    // Referral step (if visible)
    try {
      await this.assertReferralStepVisible();
      if (options?.referral) {
        await this.selectReferralOption(options.referral);
      }
      await this.clickContinue();
    } catch {
      // Referral step might be optional
    }

    // Role step (optional)
    try {
      await this.assertRoleStepVisible();
      if (options?.role) {
        await this.selectRole(options.role);
      }
      await this.clickComplete();
    } catch {
      // Role step might be skipped
    }
  }
}
