/**
 * @fileoverview Settings Page Object
 * @module @nxt1/web/e2e/pages
 *
 * Page Object Model for the Settings feature (web).
 * Covers the main settings page and the account information sub-page.
 *
 * Uses TEST_IDS from @nxt1/core/testing for all selectors.
 */

import { type Page, type Locator } from '@playwright/test';
import { BasePage } from './base.page';
import { SETTINGS_TEST_IDS } from '@nxt1/core/testing';

// ============================================
// SETTINGS PAGE
// ============================================

/**
 * Page Object for the main Settings page (/settings).
 */
export class SettingsPage extends BasePage {
  readonly url = '/settings';

  // Root container
  readonly container: Locator;

  constructor(page: Page) {
    super(page);
    this.container = page.getByTestId(SETTINGS_TEST_IDS.PAGE);
  }

  /**
   * Navigate to settings and wait for the page container to be visible.
   * Requires the user to be authenticated.
   */
  override async goto(): Promise<void> {
    await this.page.goto(this.url);
    await this.waitForElement(this.container);
  }

  /**
   * Assert the settings page is visible and fully rendered.
   */
  async assertPageVisible(): Promise<void> {
    await this.assertVisible(this.container);
  }
}

// ============================================
// ACCOUNT INFORMATION PAGE
// ============================================

/**
 * Page Object for the Account Information sub-page (/settings/account-information).
 */
export class AccountInformationPage extends BasePage {
  readonly url = '/settings/account-information';

  // Root container
  readonly container: Locator;

  // Action items (using item IDs as data-testid, set by settings-item component)
  readonly emailItem: Locator;
  readonly changePasswordItem: Locator;
  readonly signOutItem: Locator;
  readonly deleteAccountItem: Locator;

  constructor(page: Page) {
    super(page);
    this.container = page.getByTestId(SETTINGS_TEST_IDS.ACCOUNT_INFO_PAGE);
    this.emailItem = page.getByTestId(SETTINGS_TEST_IDS.EMAIL_ITEM);
    this.changePasswordItem = page.getByTestId(SETTINGS_TEST_IDS.CHANGE_PASSWORD_ITEM);
    this.signOutItem = page.getByTestId(SETTINGS_TEST_IDS.SIGN_OUT_ITEM);
    this.deleteAccountItem = page.getByTestId(SETTINGS_TEST_IDS.DELETE_ACCOUNT_ITEM);
  }

  /**
   * Navigate to the account information page.
   * Requires the user to be authenticated.
   */
  override async goto(): Promise<void> {
    await this.page.goto(this.url);
    await this.waitForElement(this.container);
  }

  /**
   * Click the "Change Password" action item.
   */
  async clickChangePassword(): Promise<void> {
    await this.changePasswordItem.click();
  }

  /**
   * Click the "Sign Out" action item to trigger the confirmation sheet.
   */
  async clickSignOut(): Promise<void> {
    await this.signOutItem.click();
  }

  /**
   * Click the "Delete Account" action item to trigger the destructive confirmation sheet.
   */
  async clickDeleteAccount(): Promise<void> {
    await this.deleteAccountItem.click();
  }
}
