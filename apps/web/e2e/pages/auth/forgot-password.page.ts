/**
 * @fileoverview Forgot Password Page Object
 * @module @nxt1/web/e2e/pages
 *
 * Page Object for the password reset flow.
 * Uses data-testid selectors for stable, maintenance-free tests.
 */

import { Page, Locator } from '@playwright/test';
import { BasePage } from '../base.page';

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

    // Page container and header
    this.page_container = page.getByTestId('forgot-password-page');
    this.pageTitle = page.getByTestId('forgot-password-title');
    this.pageLogo = page.getByTestId('forgot-password-logo');
    this.pageSubtitle = page.getByTestId('forgot-password-subtitle');

    // Form elements
    this.form = page.getByTestId('forgot-password-form');
    this.emailInput = page.getByTestId('forgot-password-input-email').locator('input');
    this.submitButton = page.getByTestId('forgot-password-submit-button');

    // Navigation
    this.footer = page.getByTestId('forgot-password-footer');
    this.backToLoginLink = page.getByTestId('forgot-password-link-back');

    // Success state
    this.successContainer = page.getByTestId('forgot-password-success');
    this.successIcon = page.getByTestId('forgot-password-success-icon');
    this.successTitle = page.getByTestId('forgot-password-success-title');
    this.successMessage = page.getByTestId('forgot-password-success-message');
    this.backToLoginButton = page.getByTestId('forgot-password-btn-back-to-login');

    // Error state
    this.errorContainer = page.getByTestId('forgot-password-error');
    this.errorMessage = page.getByTestId('forgot-password-error-message');
    this.errorCloseButton = page.getByTestId('forgot-password-error-close');

    // Loading
    this.loadingSpinner = page.getByTestId('forgot-password-loading-spinner');
  }

  // ===========================================================================
  // ACTIONS
  // ===========================================================================

  /**
   * Navigate and verify page loaded
   */
  async gotoAndVerify(): Promise<void> {
    await this.goto();
    await this.assertPageLoaded();
    await this.assertVisible(this.pageTitle);
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
   */
  async goToLogin(): Promise<void> {
    await this.backToLoginLink.click();
    await this.page.waitForURL(/\/auth\/login/);
  }

  /**
   * Go back to login via success button
   */
  async goToLoginFromSuccess(): Promise<void> {
    await this.backToLoginButton.click();
    await this.page.waitForURL(/\/auth\/login/);
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
