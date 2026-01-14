/**
 * @fileoverview Signup Page Object
 * @module @nxt1/web/e2e/pages
 *
 * Page Object for the signup/registration page.
 * Uses data-testid selectors for stable, maintenance-free tests.
 */

import { Page, Locator } from '@playwright/test';
import { BasePage } from '../base.page';

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
  readonly url = '/auth/signup';

  // ===========================================================================
  // SELECTORS - Using data-testid for stability
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
   * Social signup buttons
   */
  readonly socialButtonsContainer: Locator;
  readonly googleButton: Locator;
  readonly appleButton: Locator;

  /**
   * Form elements
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
   * Error and validation messages
   */
  readonly errorContainer: Locator;
  readonly errorMessage: Locator;
  readonly errorCloseButton: Locator;

  /**
   * Loading state
   */
  readonly loadingSpinner: Locator;

  constructor(page: Page) {
    super(page);

    // Page container and header
    this.page_container = page.getByTestId('signup-page');
    this.pageTitle = page.getByTestId('signup-title');
    this.pageLogo = page.getByTestId('signup-logo');
    this.pageSubtitle = page.getByTestId('signup-subtitle');

    // Social buttons
    this.socialButtonsContainer = page.getByTestId('signup-social-buttons');
    this.googleButton = page.getByTestId('signup-btn-google');
    this.appleButton = page.getByTestId('signup-btn-apple');

    // Form inputs
    this.form = page.getByTestId('signup-form');
    this.emailInput = page.getByTestId('signup-input-email').locator('input');
    this.passwordInput = page.getByTestId('signup-input-password').locator('input');
    this.confirmPasswordInput = page.getByTestId('signup-input-confirm-password').locator('input');
    this.teamCodeInput = page.getByTestId('signup-input-teamcode').locator('input');
    this.passwordToggle = page.getByTestId('signup-toggle-password');
    this.confirmPasswordToggle = page.getByTestId('signup-toggle-confirm-password');
    this.submitButton = page.getByTestId('signup-submit-button');

    // Navigation links
    this.footer = page.getByTestId('signup-footer');
    this.loginLink = page.getByTestId('signup-link-login');
    this.termsLink = page.getByTestId('signup-link-terms');
    this.privacyLink = page.getByTestId('signup-link-privacy');

    // Error messages
    this.errorContainer = page.getByTestId('signup-error');
    this.errorMessage = page.getByTestId('signup-error-message');
    this.errorCloseButton = page.getByTestId('signup-error-close');

    // Loading
    this.loadingSpinner = page.getByTestId('signup-loading-spinner');
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
    return this.errorMessage.textContent() ?? '';
  }

  /**
   * Check if submit button is enabled
   */
  async isSubmitEnabled(): Promise<boolean> {
    return this.submitButton.isEnabled();
  }
}
