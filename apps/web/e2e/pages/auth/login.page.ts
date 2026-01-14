/**
 * @fileoverview Login Page Object
 * @module @nxt1/web/e2e/pages
 *
 * Page Object for the login page.
 * Uses data-testid selectors for stable, maintenance-free tests.
 */

import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from '../base.page';

/**
 * Login page credentials
 */
export interface LoginCredentials {
  email: string;
  password: string;
}

/**
 * Login Page Object
 *
 * Handles all interactions with the login page including:
 * - Email/password authentication
 * - Social login buttons
 * - Navigation to signup/forgot password
 *
 * All selectors use data-testid for maximum stability.
 */
export class LoginPage extends BasePage {
  readonly url = '/auth/login';

  // ===========================================================================
  // SELECTORS - Using data-testid for stability
  // ===========================================================================

  /**
   * Page container
   */
  readonly page_container: Locator;

  /**
   * Page title heading
   */
  readonly pageTitle: Locator;

  /**
   * Social login buttons
   */
  readonly googleButton: Locator;
  readonly appleButton: Locator;
  readonly microsoftButton: Locator;

  /**
   * Email login flow
   */
  readonly continueWithEmailButton: Locator;
  readonly teamCodeButton: Locator;

  /**
   * Email form elements (from shared @nxt1/ui component)
   */
  readonly emailForm: Locator;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly passwordToggle: Locator;
  readonly submitButton: Locator;
  readonly forgotPasswordLink: Locator;

  /**
   * Navigation links
   */
  readonly signupLink: Locator;
  readonly backButton: Locator;

  /**
   * Error message container
   */
  readonly errorMessage: Locator;
  readonly errorText: Locator;

  /**
   * Loading state
   */
  readonly loadingSpinner: Locator;

  constructor(page: Page) {
    super(page);

    // Page container
    this.page_container = page.getByTestId('login-page');
    this.pageTitle = page.getByTestId('login-title');

    // Social buttons (from shared @nxt1/ui component)
    this.googleButton = page.getByTestId('auth-btn-google');
    this.appleButton = page.getByTestId('auth-btn-apple');
    this.microsoftButton = page.getByTestId('auth-btn-microsoft');

    // Email login toggle
    this.continueWithEmailButton = page.getByTestId('login-btn-email');
    this.teamCodeButton = page.getByTestId('login-btn-teamcode');

    // Email form (from shared @nxt1/ui component)
    this.emailForm = page.getByTestId('auth-email-form');
    this.emailInput = page.getByTestId('auth-input-email').locator('input');
    this.passwordInput = page.getByTestId('auth-input-password').locator('input');
    this.passwordToggle = page.getByTestId('auth-toggle-password');
    this.submitButton = page.getByTestId('auth-submit-button');
    this.forgotPasswordLink = page.getByTestId('auth-link-forgot-password');

    // Navigation
    this.signupLink = page.getByTestId('login-link-signup');
    this.backButton = page.locator('[data-testid="back-button"], button[aria-label="Back"]');

    // Error and loading (from shared @nxt1/ui component)
    this.errorMessage = page.getByTestId('auth-form-error');
    this.errorText = page.getByTestId('auth-form-error-message');
    this.loadingSpinner = page.getByTestId('auth-loading-spinner');
  }

  // ===========================================================================
  // ACTIONS
  // ===========================================================================

  /**
   * Navigate to login page and verify it loaded
   */
  async gotoAndVerify(): Promise<void> {
    await this.goto();
    await this.assertPageLoaded();
    await this.assertVisible(this.pageTitle);
  }

  /**
   * Show email login form
   */
  async showEmailForm(): Promise<void> {
    await this.continueWithEmailButton.click();
    await this.waitForElement(this.emailForm);
  }

  /**
   * Fill login form with credentials
   */
  async fillCredentials(credentials: LoginCredentials): Promise<void> {
    await this.emailInput.fill(credentials.email);
    await this.passwordInput.fill(credentials.password);
  }

  /**
   * Submit the login form
   */
  async submit(): Promise<void> {
    await this.submitButton.click();
  }

  /**
   * Complete login flow with email/password
   * Combines showing form, filling credentials, and submitting
   */
  async loginWithEmail(credentials: LoginCredentials): Promise<void> {
    await this.showEmailForm();
    await this.fillCredentials(credentials);
    await this.submit();
  }

  /**
   * Navigate to signup page
   */
  async goToSignup(): Promise<void> {
    await this.signupLink.click();
    await this.page.waitForURL(/\/auth\/signup/);
  }

  /**
   * Navigate to forgot password page
   */
  async goToForgotPassword(): Promise<void> {
    // First show email form if not visible
    const emailFormVisible = await this.emailInput.isVisible().catch(() => false);
    if (!emailFormVisible) {
      await this.showEmailForm();
    }
    await this.forgotPasswordLink.click();
    await this.page.waitForURL(/\/auth\/forgot-password/);
  }

  /**
   * Click Google sign in button
   */
  async clickGoogleSignIn(): Promise<void> {
    await this.googleButton.click();
  }

  /**
   * Click Apple sign in button
   */
  async clickAppleSignIn(): Promise<void> {
    await this.appleButton.click();
  }

  /**
   * Click Microsoft sign in button
   */
  async clickMicrosoftSignIn(): Promise<void> {
    await this.microsoftButton.click();
  }

  /**
   * Go back from email form to social buttons
   */
  async goBack(): Promise<void> {
    await this.backButton.click();
    await this.waitForElement(this.continueWithEmailButton);
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
   * Assert form is in loading state
   */
  async assertLoading(): Promise<void> {
    await this.assertVisible(this.loadingSpinner);
  }

  /**
   * Assert form is not loading
   */
  async assertNotLoading(): Promise<void> {
    await expect(this.loadingSpinner).toBeHidden({ timeout: this.timeout });
  }

  /**
   * Assert login was successful by checking redirect
   */
  async assertLoginSuccess(expectedUrl: string | RegExp = /\/(home|dashboard|onboarding)/): Promise<void> {
    await this.page.waitForURL(expectedUrl, { timeout: this.timeout });
  }

  /**
   * Assert email form is visible
   */
  async assertEmailFormVisible(): Promise<void> {
    await this.assertVisible(this.emailInput);
    await this.assertVisible(this.passwordInput);
    await this.assertVisible(this.submitButton);
  }

  /**
   * Assert social buttons are visible
   */
  async assertSocialButtonsVisible(): Promise<void> {
    await this.assertVisible(this.googleButton);
    await this.assertVisible(this.appleButton);
  }

  // ===========================================================================
  // STATE HELPERS
  // ===========================================================================

  /**
   * Check if email form is currently displayed
   */
  async isEmailFormVisible(): Promise<boolean> {
    return this.emailInput.isVisible();
  }

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
}
