/**
 * @fileoverview Forgot Password Page Object
 * @module @nxt1/web/e2e/pages
 *
 * Page Object for the password reset flow.
 * Uses data-testid selectors for stable, maintenance-free tests.
 * Test IDs are imported from @nxt1/core/testing for cross-platform consistency.
 */

import { Page, Locator } from '@playwright/test';
import { BasePage } from '../base.page';
import { AUTH_TEST_IDS, AUTH_PAGE_TEST_IDS } from '@nxt1/core/testing';

/**
 * Forgot Password Page Object
 *
 * Handles password reset flow interactions.
 * All selectors use data-testid for maximum stability.
 */
export class ForgotPasswordPage extends BasePage {
  readonly url = '/auth/forgot-password';

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
   * Form elements
   */
  readonly form: Locator;
  readonly emailInput: Locator;
  readonly submitButton: Locator;

  /**
   * Navigation
   */
  readonly backToLoginLink: Locator;
  readonly footer: Locator;

  /**
   * Success state
   */
  readonly successContainer: Locator;
  readonly successIcon: Locator;
  readonly successTitle: Locator;
  readonly successMessage: Locator;
  readonly backToLoginButton: Locator;

  /**
   * Error state
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

    // Page container and header - from @nxt1/core/testing
    this.page_container = page.getByTestId(AUTH_PAGE_TEST_IDS.FORGOT_PASSWORD_PAGE);
    this.pageTitle = page.getByTestId(AUTH_PAGE_TEST_IDS.FORGOT_PASSWORD_TITLE);
    this.pageLogo = page.locator(
      `[data-testid="${AUTH_PAGE_TEST_IDS.FORGOT_PASSWORD_LOGO}"], nxt1-logo`
    );
    this.pageSubtitle = page.getByTestId(AUTH_PAGE_TEST_IDS.FORGOT_PASSWORD_SUBTITLE);

    // Form elements - uses shared @nxt1/ui auth-email-form component with mode="reset"
    // Ionic ion-input uses shadow DOM - locate the native input inside
    this.form = page.getByTestId(AUTH_PAGE_TEST_IDS.FORGOT_PASSWORD_FORM);
    this.emailInput = page.getByTestId(AUTH_TEST_IDS.INPUT_EMAIL).locator('input');
    this.submitButton = page.getByTestId(AUTH_TEST_IDS.SUBMIT_BUTTON);

    // Navigation
    this.footer = page.getByTestId(AUTH_PAGE_TEST_IDS.FORGOT_PASSWORD_FOOTER);
    this.backToLoginLink = page.getByTestId(AUTH_PAGE_TEST_IDS.FORGOT_PASSWORD_LINK_BACK);

    // Success state
    this.successContainer = page.getByTestId(AUTH_PAGE_TEST_IDS.FORGOT_PASSWORD_SUCCESS);
    this.successIcon = page.getByTestId(AUTH_PAGE_TEST_IDS.FORGOT_PASSWORD_SUCCESS_ICON);
    this.successTitle = page.getByTestId(AUTH_PAGE_TEST_IDS.FORGOT_PASSWORD_SUCCESS_TITLE);
    this.successMessage = page.getByTestId(AUTH_PAGE_TEST_IDS.FORGOT_PASSWORD_SUCCESS_MESSAGE);
    this.backToLoginButton = page.getByTestId(AUTH_PAGE_TEST_IDS.FORGOT_PASSWORD_BTN_BACK);

    // Error state - uses shared @nxt1/ui component error display
    this.errorContainer = page.getByTestId(AUTH_TEST_IDS.FORM_ERROR);
    this.errorMessage = page.getByTestId(AUTH_TEST_IDS.FORM_ERROR_MESSAGE);
    this.errorCloseButton = page.locator(`[data-testid="${AUTH_TEST_IDS.FORM_ERROR_CLOSE}"]`);

    // Loading - uses shared @nxt1/ui component spinner
    this.loadingSpinner = page.getByTestId(AUTH_TEST_IDS.LOADING_SPINNER);
  }

  // ===========================================================================
  // ACTIONS
  // ===========================================================================

  /**
   * Navigate and verify page loaded
   * Note: Angular SSR may show different URL than expected during hydration
   */
  async gotoAndVerify(): Promise<void> {
    await this.goto();
    await this.waitForHydration();
    // Check content is visible rather than strict URL matching
    // because Angular hydration may show interim URL
    await this.assertVisible(this.pageTitle);
  }

  /**
   * Wait for Angular SSR hydration and Ionic components to be ready
   */
  override async waitForHydration(): Promise<void> {
    await this.page.waitForLoadState('networkidle');
    await this.page.waitForTimeout(500); // Allow Ionic animations to settle
  }

  /**
   * Request password reset
   */
  async requestReset(email: string): Promise<void> {
    await this.emailInput.fill(email);
    await this.submitButton.click();
  }

  /**
   * Go back to login page via link
   * Note: The unified auth page uses /auth for login, not /auth/login
   */
  async goToLogin(): Promise<void> {
    await this.backToLoginLink.click();
    // Wait for navigation - unified auth page at /auth
    await this.page.waitForURL(/\/auth(?:\?|$)/);
  }

  /**
   * Go back to login via success button
   */
  async goToLoginFromSuccess(): Promise<void> {
    await this.backToLoginButton.click();
    await this.page.waitForURL(/\/auth(?:\?|$)/);
  }

  // ===========================================================================
  // ASSERTIONS
  // ===========================================================================

  /**
   * Assert success state is displayed
   */
  async assertSuccess(): Promise<void> {
    await this.assertVisible(this.successContainer);
    await this.assertVisible(this.successIcon);
    await this.assertVisible(this.successMessage);
  }

  /**
   * Assert error is displayed
   */
  async assertError(): Promise<void> {
    await this.assertVisible(this.errorContainer);
    await this.assertVisible(this.errorMessage);
  }

  /**
   * Assert form is loading
   */
  async assertLoading(): Promise<void> {
    await this.assertVisible(this.loadingSpinner);
  }
}
