/**
 * @fileoverview Signup Page Object
 * @module @nxt1/web/e2e/pages
 *
 * Page Object for the signup/registration page.
 * Uses data-testid selectors for stable, maintenance-free tests.
 * Test IDs are imported from @nxt1/core/testing for cross-platform consistency.
 */

import { Page, Locator } from '@playwright/test';
import { BasePage } from '../base.page';
import { AUTH_TEST_IDS, AUTH_PAGE_TEST_IDS } from '@nxt1/core/testing';

/**
 * Signup form data
 */
export interface SignupData {
  email: string;
  password: string;
  confirmPassword?: string;
  displayName?: string;
  teamCode?: string;
  acceptTerms?: boolean;
}

/**
 * Signup Page Object
 *
 * Handles all interactions with the signup page including:
 * - Email/password registration
 * - Social signup buttons
 * - Form validation
 * - Terms acceptance
 *
 * All selectors use data-testid for maximum stability.
 */
export class SignupPage extends BasePage {
  readonly url = '/auth?mode=signup';

  // ===========================================================================
  // SELECTORS - Using data-testid for stability
  // Unified auth page in signup mode - shares components with login
  // ===========================================================================

  /**
   * Page container
   */
  readonly page_container: Locator;

  /**
   * Page elements
   */
  readonly pageTitle: Locator;
  readonly pageLogo: Locator;
  readonly pageSubtitle: Locator;

  /**
   * Social signup buttons (from shared @nxt1/ui component)
   */
  readonly socialButtonsContainer: Locator;
  readonly googleButton: Locator;
  readonly appleButton: Locator;

  /**
   * Form elements (from shared @nxt1/ui component)
   */
  readonly form: Locator;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly confirmPasswordInput: Locator;
  readonly teamCodeInput: Locator;
  readonly passwordToggle: Locator;
  readonly confirmPasswordToggle: Locator;
  readonly submitButton: Locator;

  /**
   * Navigation
   */
  readonly loginLink: Locator;
  readonly termsLink: Locator;
  readonly privacyLink: Locator;
  readonly footer: Locator;

  /**
   * Error and validation messages (from shared @nxt1/ui component)
   */
  readonly errorContainer: Locator;
  readonly errorMessage: Locator;
  readonly errorCloseButton: Locator;

  /**
   * Loading state (from shared @nxt1/ui component)
   */
  readonly loadingSpinner: Locator;

  constructor(page: Page) {
    super(page);

    // Page container and header (signup mode) - from @nxt1/core/testing
    this.page_container = page.getByTestId(AUTH_PAGE_TEST_IDS.SIGNUP_PAGE);
    this.pageTitle = page.getByTestId(AUTH_PAGE_TEST_IDS.SIGNUP_TITLE);
    this.pageLogo = page.locator(`[data-testid="${AUTH_PAGE_TEST_IDS.SIGNUP_LOGO}"], nxt1-logo`);
    this.pageSubtitle = page.getByTestId(AUTH_PAGE_TEST_IDS.SIGNUP_SUBTITLE);

    // Social buttons (from shared @nxt1/ui component)
    this.socialButtonsContainer = page.getByTestId(AUTH_TEST_IDS.SOCIAL_BUTTONS_CONTAINER);
    this.googleButton = page.getByTestId(AUTH_TEST_IDS.BTN_GOOGLE);
    this.appleButton = page.getByTestId(AUTH_TEST_IDS.BTN_APPLE);

    // Form inputs (from shared @nxt1/ui component)
    this.form = page.getByTestId(AUTH_TEST_IDS.EMAIL_FORM);
    this.emailInput = page.getByTestId(AUTH_TEST_IDS.INPUT_EMAIL).locator('input');
    this.passwordInput = page.getByTestId(AUTH_TEST_IDS.INPUT_PASSWORD).locator('input');
    this.confirmPasswordInput = page.locator(
      `[data-testid="${AUTH_TEST_IDS.INPUT_CONFIRM_PASSWORD}"] input`
    );
    this.teamCodeInput = page.locator(
      `[data-testid="${AUTH_PAGE_TEST_IDS.SIGNUP_INPUT_TEAMCODE}"] input, [data-testid="${AUTH_TEST_IDS.INPUT_TEAM_CODE}"] input`
    );
    this.passwordToggle = page.getByTestId(AUTH_TEST_IDS.TOGGLE_PASSWORD);
    this.confirmPasswordToggle = page.locator(
      `[data-testid="${AUTH_TEST_IDS.TOGGLE_CONFIRM_PASSWORD}"]`
    );
    this.submitButton = page.getByTestId(AUTH_TEST_IDS.SUBMIT_BUTTON);

    // Navigation links
    this.footer = page.getByTestId(AUTH_TEST_IDS.TERMS_DISCLAIMER);
    this.loginLink = page.getByTestId(AUTH_PAGE_TEST_IDS.SIGNUP_LINK_LOGIN);
    this.termsLink = page.getByTestId(AUTH_TEST_IDS.TERMS_LINK);
    this.privacyLink = page.getByTestId(AUTH_TEST_IDS.PRIVACY_LINK);

    // Error messages (from shared @nxt1/ui component)
    this.errorContainer = page.getByTestId(AUTH_TEST_IDS.FORM_ERROR);
    this.errorMessage = page.getByTestId(AUTH_TEST_IDS.FORM_ERROR_MESSAGE);
    this.errorCloseButton = page.locator(`[data-testid="${AUTH_TEST_IDS.FORM_ERROR_CLOSE}"]`);

    // Loading (from shared @nxt1/ui component)
    this.loadingSpinner = page.getByTestId(AUTH_TEST_IDS.LOADING_SPINNER);
  }

  // ===========================================================================
  // ACTIONS
  // ===========================================================================

  /**
   * Navigate to signup page and verify it loaded
   */
  async gotoAndVerify(): Promise<void> {
    await this.goto();
    await this.assertPageLoaded();
    await this.assertVisible(this.pageTitle);
  }

  /**
   * Fill signup form with provided data
   */
  async fillForm(data: SignupData): Promise<void> {
    // Fill required fields
    await this.emailInput.fill(data.email);
    await this.passwordInput.fill(data.password);

    // Fill confirm password if provided
    if (data.confirmPassword) {
      await this.confirmPasswordInput.fill(data.confirmPassword);
    }

    // Fill team code if provided
    if (data.teamCode) {
      const isVisible = await this.teamCodeInput.isVisible().catch(() => false);
      if (isVisible) {
        await this.teamCodeInput.fill(data.teamCode);
      }
    }
  }

  /**
   * Submit the signup form
   */
  async submit(): Promise<void> {
    await this.submitButton.click();
  }

  /**
   * Complete signup flow
   */
  async signupWithEmail(data: SignupData): Promise<void> {
    await this.fillForm(data);
    await this.submit();
  }

  /**
   * Navigate to login page
   */
  async goToLogin(): Promise<void> {
    await this.loginLink.click();
    await this.page.waitForURL(/\/auth\/login/);
  }

  /**
   * Click Google signup button
   */
  async clickGoogleSignup(): Promise<void> {
    await this.googleButton.click();
  }

  /**
   * Click Apple signup button
   */
  async clickAppleSignup(): Promise<void> {
    await this.appleButton.click();
  }

  // ===========================================================================
  // ASSERTIONS
  // ===========================================================================

  /**
   * Assert error message is displayed
   */
  async assertError(expectedMessage?: string | RegExp): Promise<void> {
    await this.assertVisible(this.errorMessage);
    if (expectedMessage) {
      await this.assertText(this.errorMessage, expectedMessage);
    }
  }

  /**
   * Assert no error is displayed
   */
  async assertNoError(): Promise<void> {
    await this.assertHidden(this.errorMessage);
  }

  /**
   * Assert signup was successful
   */
  async assertSignupSuccess(expectedUrl: string | RegExp = /\/(onboarding|home)/): Promise<void> {
    await this.page.waitForURL(expectedUrl, { timeout: this.timeout });
  }

  /**
   * Assert validation error is visible
   * The signup page shows errors in the main error container
   */
  async assertValidationError(expectedMessage?: string | RegExp): Promise<void> {
    await this.assertVisible(this.errorContainer);
    if (expectedMessage) {
      await this.assertText(this.errorMessage, expectedMessage);
    }
  }

  /**
   * Assert form is in loading state
   */
  async assertLoading(): Promise<void> {
    await this.assertVisible(this.loadingSpinner);
  }

  // ===========================================================================
  // STATE HELPERS
  // ===========================================================================

  /**
   * Check if there's an error displayed
   */
  async hasError(): Promise<boolean> {
    return this.errorMessage.isVisible();
  }

  /**
   * Get error message text
   */
  async getErrorText(): Promise<string> {
    return (await this.errorMessage.textContent()) ?? '';
  }

  /**
   * Check if submit button is enabled
   */
  async isSubmitEnabled(): Promise<boolean> {
    return this.submitButton.isEnabled();
  }
}
