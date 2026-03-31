/**
 * @fileoverview Invite Page Object
 * @module @nxt1/web/e2e/pages
 *
 * Page Object Model for the Invite feature (web).
 * Covers the main invite shell page with QR code, channel grid,
 * stats card, achievements, and celebration overlay.
 *
 * Uses TEST_IDS from @nxt1/core/testing for all selectors.
 */

import { type Page, type Locator } from '@playwright/test';
import { BasePage } from './base.page';
import { INVITE_TEST_IDS } from '@nxt1/core/testing';

/**
 * Page Object for the Invite page (/invite).
 */
export class InvitePage extends BasePage {
  readonly url = '/invite';

  // Root container
  readonly container: Locator;

  // QR Section
  readonly qrSection: Locator;
  readonly qrImage: Locator;
  readonly qrLoading: Locator;
  readonly qrError: Locator;

  // Content sections
  readonly explainer: Locator;
  readonly valueCard: Locator;
  readonly statsCard: Locator;
  readonly channelGrid: Locator;
  readonly channelItems: Locator;
  readonly achievements: Locator;

  // Stats detail
  readonly statsSent: Locator;
  readonly statsJoined: Locator;
  readonly statsRate: Locator;
  readonly statsStreak: Locator;

  // States
  readonly celebration: Locator;
  readonly loadingSkeleton: Locator;
  readonly errorState: Locator;
  readonly emptyState: Locator;

  constructor(page: Page) {
    super(page);
    this.container = page.getByTestId(INVITE_TEST_IDS.SHELL);
    this.qrSection = page.getByTestId(INVITE_TEST_IDS.QR_SECTION);
    this.qrImage = page.getByTestId(INVITE_TEST_IDS.QR_IMAGE);
    this.qrLoading = page.getByTestId(INVITE_TEST_IDS.QR_LOADING);
    this.qrError = page.getByTestId(INVITE_TEST_IDS.QR_ERROR);
    this.explainer = page.getByTestId(INVITE_TEST_IDS.EXPLAINER);
    this.valueCard = page.getByTestId(INVITE_TEST_IDS.VALUE_CARD);
    this.statsCard = page.getByTestId(INVITE_TEST_IDS.STATS_CARD);
    this.channelGrid = page.getByTestId(INVITE_TEST_IDS.CHANNEL_GRID);
    this.channelItems = page.getByTestId(INVITE_TEST_IDS.CHANNEL_ITEM);
    this.achievements = page.getByTestId(INVITE_TEST_IDS.ACHIEVEMENTS);
    this.statsSent = page.getByTestId(INVITE_TEST_IDS.STATS_SENT);
    this.statsJoined = page.getByTestId(INVITE_TEST_IDS.STATS_JOINED);
    this.statsRate = page.getByTestId(INVITE_TEST_IDS.STATS_RATE);
    this.statsStreak = page.getByTestId(INVITE_TEST_IDS.STATS_STREAK);
    this.celebration = page.getByTestId(INVITE_TEST_IDS.CELEBRATION);
    this.loadingSkeleton = page.getByTestId(INVITE_TEST_IDS.LOADING_SKELETON);
    this.errorState = page.getByTestId(INVITE_TEST_IDS.ERROR_STATE);
    this.emptyState = page.getByTestId(INVITE_TEST_IDS.EMPTY_STATE);
  }

  /**
   * Navigate to invite page and wait for the shell to be visible.
   * Requires the user to be authenticated.
   */
  override async goto(): Promise<void> {
    await this.page.goto(this.url);
    await this.waitForHydration();
  }

  /**
   * Assert the invite shell is visible and fully rendered.
   */
  async assertPageVisible(): Promise<void> {
    await this.assertVisible(this.container);
  }

  /**
   * Assert the loading skeleton is displayed.
   */
  async assertLoadingVisible(): Promise<void> {
    await this.assertVisible(this.loadingSkeleton);
  }

  /**
   * Get the number of share channel items displayed.
   */
  async getChannelCount(): Promise<number> {
    return this.channelItems.count();
  }

  /**
   * Click a specific share channel by index (0-based).
   */
  async clickChannel(index: number): Promise<void> {
    await this.channelItems.nth(index).click();
  }
}
