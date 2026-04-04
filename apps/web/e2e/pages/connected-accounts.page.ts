/**
 * @fileoverview Connected Accounts Page Object
 * @module @nxt1/web/e2e/pages
 *
 * Page Object Model for the Connected Accounts / Firecrawl sign-in flow.
 * Covers the settings → connected accounts page, the sign-in modal,
 * and the interactive live view overlay.
 */

import { type Page, type Locator, expect } from '@playwright/test';
import { BasePage } from './base.page';

// ============================================
// CONNECTED ACCOUNTS PAGE
// ============================================

export class ConnectedAccountsPage extends BasePage {
  readonly url = '/settings/connected-accounts';

  // Connected accounts list
  readonly container: Locator;
  readonly platformCards: Locator;
  readonly connectButtons: Locator;

  // Firecrawl sign-in modal
  readonly signinModal: Locator;
  readonly signinIframe: Locator;
  readonly signinDoneButton: Locator;
  readonly signinLoadingSpinner: Locator;

  // Loading overlay (pre-launch)
  readonly loadingOverlay: Locator;

  constructor(page: Page) {
    super(page);
    this.container = page.locator('.nxt1-ca-web');
    this.platformCards = page.locator('.nxt1-ca-platform-card, .nxt1-ca-platform');
    this.connectButtons = page.locator('button:has-text("Sign In"), button:has-text("Connect")');

    // Firecrawl modal selectors
    this.signinModal = page.locator('.nxt1-fc-signin');
    this.signinIframe = page.locator('.nxt1-fc-iframe');
    this.signinDoneButton = page.locator('.nxt1-fc-done-btn');
    this.signinLoadingSpinner = page.locator('.nxt1-fc-loading');

    // Loading overlay
    this.loadingOverlay = page.locator('.nxt1-ca-loading-overlay');
  }

  override async goto(): Promise<void> {
    await this.page.goto(this.url);
    await this.waitForElement(this.container);
  }

  /**
   * Click "Sign In" on a specific platform card by label.
   */
  async clickSignIn(platformLabel: string): Promise<void> {
    const card = this.page.locator(
      `.nxt1-ca-platform-card:has-text("${platformLabel}"), .nxt1-ca-platform:has-text("${platformLabel}")`
    );
    const signInBtn = card.locator('button:has-text("Sign In")');
    await signInBtn.click();
  }

  /**
   * Wait for the Firecrawl sign-in modal to appear with the iframe loaded.
   */
  async waitForSignInModal(): Promise<void> {
    await expect(this.signinModal).toBeVisible({ timeout: 30_000 });
  }

  /**
   * Wait for the iframe inside the modal to finish loading (spinner gone).
   */
  async waitForIframeLoaded(): Promise<void> {
    await expect(this.signinLoadingSpinner).toBeHidden({ timeout: 30_000 });
    await expect(this.signinIframe).toBeVisible();
  }

  /**
   * Click "I'm Signed In" to complete the flow.
   */
  async clickDone(): Promise<void> {
    await this.signinDoneButton.click();
  }

  /**
   * Assert the loading overlay is shown while Firecrawl session spins up.
   */
  async assertLoadingOverlayVisible(): Promise<void> {
    await expect(this.loadingOverlay).toBeVisible({ timeout: 5_000 });
  }

  /**
   * Assert a platform shows "Connected" status.
   */
  async assertPlatformConnected(platformLabel: string): Promise<void> {
    const card = this.page.locator(
      `.nxt1-ca-platform-card:has-text("${platformLabel}"), .nxt1-ca-platform:has-text("${platformLabel}")`
    );
    await expect(card.locator(':text("Connected"), :text("Active")')).toBeVisible({
      timeout: 10_000,
    });
  }
}
