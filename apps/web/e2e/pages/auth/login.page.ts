/**
 * @fileoverview Login Page Object
 * @module @nxt1/web/e2e/pages
 *
 * Page Object for the login page.
 * Uses data-testid selectors for stable, maintenance-free tests.
 * Test IDs are imported from @nxt1/core/testing for cross-platform consistency.
 */

import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from '../base.page';
import { AUTH_TEST_IDS, AUTH_PAGE_TEST_IDS } from '@nxt1/core/testing';

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
  readonly url = '/auth';

  // ===========================================================================
  // SELECTORS - Using data-testid for stability
  // Unified auth page shows login by default, uses mode query param for signup
  // ===========================================================================

  /**
   * Page container - dynamically set based on mode
   */
  readonly page_container: Locator;

  /**
   * Page title heading
   */
  readonly pageTitle: Locator;

  /**
   * Social login buttons (from shared @nxt1/ui component)
   */
  readonly socialButtonsContainer: Locator;
  readonly googleButton: Locator;
  readonly appleButton: Locator;
  readonly microsoftButton: Locator;

  /**
   * Action buttons (from shared @nxt1/ui component)
   */
  readonly actionButtonsContainer: Locator;
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
   * Error message container (from shared @nxt1/ui component)
   */
  readonly errorMessage: Locator;
  readonly errorText: Locator;

  /**
   * Loading state (from shared @nxt1/ui component)
   */
  readonly loadingSpinner: Locator;

  constructor(page: Page) {
    super(page);

    // Page container (login mode) - from @nxt1/core/testing
    this.page_container = page.getByTestId(AUTH_PAGE_TEST_IDS.LOGIN_PAGE);
    this.pageTitle = page.getByTestId(AUTH_PAGE_TEST_IDS.LOGIN_TITLE);

    // Social buttons (from shared @nxt1/ui component)
    this.socialButtonsContainer = page.getByTestId(AUTH_TEST_IDS.SOCIAL_BUTTONS_CONTAINER);
    this.googleButton = page.getByTestId(AUTH_TEST_IDS.BTN_GOOGLE);
    this.appleButton = page.getByTestId(AUTH_TEST_IDS.BTN_APPLE);
    this.microsoftButton = page.getByTestId(AUTH_TEST_IDS.BTN_MICROSOFT);

    // Action buttons (from shared @nxt1/ui component)
    this.actionButtonsContainer = page.getByTestId(AUTH_TEST_IDS.ACTION_BUTTONS_CONTAINER);
    this.continueWithEmailButton = page.getByTestId(AUTH_TEST_IDS.BTN_EMAIL);
    this.teamCodeButton = page.getByTestId(AUTH_TEST_IDS.BTN_TEAM_CODE);

    // Email form (from shared @nxt1/ui component)
    this.emailForm = page.getByTestId(AUTH_TEST_IDS.EMAIL_FORM);
    this.emailInput = page.getByTestId(AUTH_TEST_IDS.INPUT_EMAIL).locator('input');
    this.passwordInput = page.getByTestId(AUTH_TEST_IDS.INPUT_PASSWORD).locator('input');
    this.passwordToggle = page.getByTestId(AUTH_TEST_IDS.TOGGLE_PASSWORD);
    this.submitButton = page.getByTestId(AUTH_TEST_IDS.SUBMIT_BUTTON);
    this.forgotPasswordLink = page.getByTestId(AUTH_TEST_IDS.LINK_FORGOT_PASSWORD);

    // Navigation - page-specific selectors
    this.signupLink = page.getByTestId(AUTH_PAGE_TEST_IDS.LOGIN_LINK_SIGNUP);
    this.backButton = page.locator(`[data-testid="${AUTH_TEST_IDS.BACK_BUTTON}"], ion-back-button`);

    // Error and loading (from shared @nxt1/ui component)
    this.errorMessage = page.getByTestId(AUTH_TEST_IDS.FORM_ERROR);
    this.errorText = page.getByTestId(AUTH_TEST_IDS.FORM_ERROR_MESSAGE);
    this.loadingSpinner = page.getByTestId(AUTH_TEST_IDS.LOADING_SPINNER);
  }

  // ===========================================================================
  // ACTIONS
  // ===========================================================================

  /**
   * Navigate to login page and verify it loaded
   */
  async gotoAndVerify(): Promise<void> {
    await this.goto();
    await this.waitForHydration();
    await this.assertPageLoaded();
    await this.assertVisible(this.pageTitle);
  }

  /**
   * Wait for Angular SSR hydration to complete
   */
  override async waitForHydration(): Promise<void> {
    // Wait for Ionic components to be ready
    await this.page.waitForLoadState('networkidle');
    await this.page.waitForTimeout(500); // Allow Ionic animations to settle
  }

  /**
   * Show email login form
   */
  async showEmailForm(): Promise<void> {
    await this.waitForHydration();

    // Wait for the email button to be visible and stable
    await this.continueWithEmailButton.waitFor({ state: 'visible', timeout: 10000 });

    // Ionic buttons may need a direct click on the native button inside
    // Try clicking the button, and if form doesn't appear, try JavaScript click
    await this.continueWithEmailButton.click({ force: true });

    // Wait a brief moment for Angular change detection
    await this.page.waitForTimeout(100);

    // If form not visible yet, try JavaScript-based click as fallback
    const formVisible = await this.emailForm.isVisible().catch(() => false);
    if (!formVisible) {
      // Use evaluate to trigger click directly on the element
      await this.continueWithEmailButton.evaluate((el) => {
        (el as HTMLElement).click();
      });
      await this.page.waitForTimeout(100);
    }

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
    await this.submitButton.click({ force: true });
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
    await this.signupLink.waitFor({ state: 'visible', timeout: 10000 });
    await this.signupLink.click({ force: true });
    await this.page.waitForTimeout(100);

    // If mode didn't switch, try JavaScript click
    const signupPageVisible = await this.page
      .getByTestId(AUTH_PAGE_TEST_IDS.SIGNUP_PAGE)
      .isVisible()
      .catch(() => false);
    const urlHasSignup = this.page.url().includes('mode=signup');
    if (!signupPageVisible && !urlHasSignup) {
      await this.signupLink.evaluate((el) => (el as HTMLElement).click());
      await this.page.waitForTimeout(100);
    }

    // Unified auth page uses mode switching, not separate URL
    await this.page.waitForFunction(
      (testId: string) => {
        return (
          document.querySelector(`[data-testid="${testId}"]`) !== null ||
          window.location.search.includes('mode=signup')
        );
      },
      AUTH_PAGE_TEST_IDS.SIGNUP_PAGE,
      { timeout: 15000 }
    );
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

    await this.forgotPasswordLink.waitFor({ state: 'visible', timeout: 10000 });
    await this.forgotPasswordLink.click({ force: true });
    await this.page.waitForTimeout(100);

    // If navigation didn't happen, try JavaScript click
    if (!this.page.url().includes('forgot-password')) {
      await this.forgotPasswordLink.evaluate((el) => (el as HTMLElement).click());
    }

    await this.page.waitForURL(/\/auth\/forgot-password/, { timeout: 30000 });
  }

  /**
   * Click Google sign in button
   */
  async clickGoogleSignIn(): Promise<void> {
    await this.googleButton.click({ force: true });
  }

  /**
   * Click Apple sign in button
   */
  async clickAppleSignIn(): Promise<void> {
    await this.appleButton.click({ force: true });
  }

  /**
   * Click Microsoft sign in button
   */
  async clickMicrosoftSignIn(): Promise<void> {
    await this.microsoftButton.click({ force: true });
  }

  /**
   * Go back from email form to social buttons
   */
  async goBack(): Promise<void> {
    await this.backButton.click({ force: true });
    await this.page.waitForTimeout(300); // Wait for animation
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
  async assertLoginSuccess(
    expectedUrl: string | RegExp = /\/(home|dashboard|onboarding)/
  ): Promise<void> {
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
    return (await this.errorMessage.textContent()) ?? '';
  }
}
