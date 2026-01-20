/**
 * @fileoverview Base Page Object
 * @module @nxt1/web/e2e/pages
 *
 * Abstract base class for all Page Object Models.
 * Provides common functionality and enforces consistent patterns.
 */

import { Page, Locator, expect } from '@playwright/test';
import { COMMON_TEST_IDS } from '@nxt1/core/testing';

/**
 * Configuration options for page objects
 */
export interface PageOptions {
  /** Page timeout override */
  timeout?: number;
}

/**
 * Base Page Object class
 *
 * All page objects should extend this class to ensure
 * consistent patterns and access to common utilities.
 *
 * @example
 * ```typescript
 * export class LoginPage extends BasePage {
 *   readonly url = '/auth';
 *
 *   readonly emailInput = this.page.getByTestId('email-input');
 *   readonly passwordInput = this.page.getByTestId('password-input');
 *   readonly submitButton = this.page.getByTestId('submit-button');
 *
 *   async login(email: string, password: string) {
 *     await this.emailInput.fill(email);
 *     await this.passwordInput.fill(password);
 *     await this.submitButton.click();
 *   }
 * }
 * ```
 */
export abstract class BasePage {
  /**
   * The URL path for this page (relative to base URL)
   * Must be implemented by subclasses
   */
  abstract readonly url: string;

  /**
   * Default timeout for page operations
   */
  protected readonly timeout: number;

  constructor(
    public readonly page: Page,
    options: PageOptions = {}
  ) {
    this.timeout = options.timeout ?? 30_000;
  }

  // ===========================================================================
  // NAVIGATION
  // ===========================================================================

  /**
   * Navigate to this page
   */
  async goto(): Promise<void> {
    await this.page.goto(this.url, { timeout: this.timeout });
    await this.waitForHydration();
  }

  /**
   * Navigate to this page and wait for network idle
   */
  async gotoAndWaitForLoad(): Promise<void> {
    await this.page.goto(this.url, {
      timeout: this.timeout,
      waitUntil: 'networkidle',
    });
    await this.waitForHydration();
  }

  /**
   * Wait for Angular SSR hydration and Ionic components to be ready
   * Override in subclasses for custom hydration logic
   */
  async waitForHydration(): Promise<void> {
    await this.page.waitForLoadState('domcontentloaded');
    // Wait for Ionic components to hydrate
    await this.page.waitForTimeout(300);
  }

  /**
   * Wait for the page URL to match expected pattern
   */
  async waitForUrl(urlPattern?: string | RegExp): Promise<void> {
    const pattern = urlPattern ?? this.url;
    await this.page.waitForURL(pattern, { timeout: this.timeout });
  }

  /**
   * Reload the current page
   */
  async reload(): Promise<void> {
    await this.page.reload({ timeout: this.timeout });
    await this.waitForHydration();
  }

  // ===========================================================================
  // WAIT UTILITIES
  // ===========================================================================

  /**
   * Wait for element to be visible
   */
  async waitForElement(locator: Locator, options?: { timeout?: number }): Promise<void> {
    await locator.waitFor({
      state: 'visible',
      timeout: options?.timeout ?? this.timeout,
    });
  }

  /**
   * Wait for element to be hidden
   */
  async waitForElementHidden(locator: Locator, options?: { timeout?: number }): Promise<void> {
    await locator.waitFor({
      state: 'hidden',
      timeout: options?.timeout ?? this.timeout,
    });
  }

  /**
   * Wait for loading indicators to disappear
   * Override in subclasses if using different loading indicators
   */
  async waitForLoadingComplete(): Promise<void> {
    // Wait for common loading indicators to disappear
    const loadingIndicators = [
      this.page.locator(`[data-testid="${COMMON_TEST_IDS.LOADING}"]`),
      this.page.locator(`[data-testid="${COMMON_TEST_IDS.SPINNER}"]`),
      this.page.locator('ion-spinner'),
      this.page.locator('.loading'),
    ];

    for (const indicator of loadingIndicators) {
      const count = await indicator.count();
      if (count > 0) {
        await indicator.first().waitFor({ state: 'hidden', timeout: this.timeout });
      }
    }
  }

  /**
   * Wait for network requests to complete
   */
  async waitForNetworkIdle(): Promise<void> {
    await this.page.waitForLoadState('networkidle', { timeout: this.timeout });
  }

  // ===========================================================================
  // COMMON ASSERTIONS
  // ===========================================================================

  /**
   * Assert that the page is loaded (URL matches)
   */
  async assertPageLoaded(): Promise<void> {
    await expect(this.page).toHaveURL(new RegExp(this.url));
  }

  /**
   * Assert page title
   */
  async assertTitle(title: string | RegExp): Promise<void> {
    await expect(this.page).toHaveTitle(title);
  }

  /**
   * Assert element is visible
   */
  async assertVisible(locator: Locator): Promise<void> {
    await expect(locator).toBeVisible({ timeout: this.timeout });
  }

  /**
   * Assert element is hidden
   */
  async assertHidden(locator: Locator): Promise<void> {
    await expect(locator).toBeHidden({ timeout: this.timeout });
  }

  /**
   * Assert element has text
   */
  async assertText(locator: Locator, text: string | RegExp): Promise<void> {
    await expect(locator).toContainText(text, { timeout: this.timeout });
  }

  // ===========================================================================
  // INTERACTION UTILITIES
  // ===========================================================================

  /**
   * Click element and wait for navigation
   */
  async clickAndWaitForNavigation(locator: Locator): Promise<void> {
    await Promise.all([this.page.waitForNavigation({ timeout: this.timeout }), locator.click()]);
  }

  /**
   * Fill input and verify value
   */
  async fillInput(locator: Locator, value: string): Promise<void> {
    await locator.fill(value);
    await expect(locator).toHaveValue(value);
  }

  /**
   * Clear input field
   */
  async clearInput(locator: Locator): Promise<void> {
    await locator.clear();
    await expect(locator).toHaveValue('');
  }

  /**
   * Type text with delay (simulates real user typing)
   */
  async typeSlowly(locator: Locator, text: string, delay = 50): Promise<void> {
    await locator.pressSequentially(text, { delay });
  }

  // ===========================================================================
  // SCREENSHOT UTILITIES
  // ===========================================================================

  /**
   * Take a screenshot of the page
   */
  async screenshot(name: string): Promise<Buffer> {
    return this.page.screenshot({
      path: `test-results/screenshots/${name}.png`,
      fullPage: true,
    });
  }

  /**
   * Take a screenshot of a specific element
   */
  async screenshotElement(locator: Locator, name: string): Promise<Buffer> {
    return locator.screenshot({
      path: `test-results/screenshots/${name}.png`,
    });
  }

  // ===========================================================================
  // DEBUG UTILITIES
  // ===========================================================================

  /**
   * Pause test execution for debugging
   * Only use in development!
   */
  async pause(): Promise<void> {
    await this.page.pause();
  }

  /**
   * Get current URL
   */
  getCurrentUrl(): string {
    return this.page.url();
  }

  /**
   * Get page content
   */
  async getPageContent(): Promise<string> {
    return this.page.content();
  }
}
