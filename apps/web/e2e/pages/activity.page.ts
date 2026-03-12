/**
 * @fileoverview Activity Page Object
 * @module @nxt1/web/e2e/pages
 *
 * Page Object Model for the Activity feature (web).
 * Covers the main activity feed, tab navigation, and item interactions.
 *
 * Uses TEST_IDS from @nxt1/core/testing for all selectors.
 */

import { type Page, type Locator } from '@playwright/test';
import { BasePage } from './base.page';
import { ACTIVITY_TEST_IDS } from '@nxt1/core/testing';

/**
 * Page Object for the Activity page (/activity).
 */
export class ActivityPage extends BasePage {
  readonly url = '/activity';

  // Shell
  readonly container: Locator;
  readonly tabs: Locator;

  // List
  readonly listContainer: Locator;
  readonly listItems: Locator;

  // States
  readonly loadingSkeleton: Locator;
  readonly emptyState: Locator;
  readonly errorState: Locator;

  // Actions
  readonly markAllReadButton: Locator;
  readonly refreshButton: Locator;
  readonly loadMoreButton: Locator;

  // Badge
  readonly badgeCount: Locator;

  constructor(page: Page) {
    super(page);
    this.container = page.getByTestId(ACTIVITY_TEST_IDS.SHELL);
    this.tabs = page.getByTestId(ACTIVITY_TEST_IDS.TABS);
    this.listContainer = page.getByTestId(ACTIVITY_TEST_IDS.LIST_CONTAINER);
    this.listItems = page.getByTestId(new RegExp(`^${ACTIVITY_TEST_IDS.LIST_ITEM}`));
    this.loadingSkeleton = page.getByTestId(ACTIVITY_TEST_IDS.LOADING_SKELETON);
    this.emptyState = page.getByTestId(ACTIVITY_TEST_IDS.EMPTY_STATE);
    this.errorState = page.getByTestId(ACTIVITY_TEST_IDS.ERROR_STATE);
    this.markAllReadButton = page.getByTestId(ACTIVITY_TEST_IDS.MARK_ALL_READ_BUTTON);
    this.refreshButton = page.getByTestId(ACTIVITY_TEST_IDS.REFRESH_BUTTON);
    this.loadMoreButton = page.getByTestId(ACTIVITY_TEST_IDS.LOAD_MORE_BUTTON);
    this.badgeCount = page.getByTestId(ACTIVITY_TEST_IDS.BADGE_COUNT);
  }

  /**
   * Navigate to activity page and wait for the shell to be visible.
   * Requires the user to be authenticated.
   */
  override async goto(): Promise<void> {
    await this.page.goto(this.url);
    await this.waitForElement(this.container);
  }

  /**
   * Assert the activity shell is visible and fully rendered.
   */
  async assertPageVisible(): Promise<void> {
    await this.assertVisible(this.container);
  }

  /**
   * Assert that feed items are loaded (list container visible with items).
   */
  async assertFeedLoaded(): Promise<void> {
    await this.assertVisible(this.listContainer);
  }

  /**
   * Assert the empty state is displayed.
   */
  async assertEmptyState(): Promise<void> {
    await this.assertVisible(this.emptyState);
  }

  /**
   * Assert the error state is displayed.
   */
  async assertErrorState(): Promise<void> {
    await this.assertVisible(this.errorState);
  }

  /**
   * Switch to a specific tab by tab name.
   */
  async switchTab(tabName: string): Promise<void> {
    const tab = this.page.getByTestId(`${ACTIVITY_TEST_IDS.TAB_ITEM}-${tabName}`);
    await tab.click();
  }

  /**
   * Click the mark all read button.
   */
  async markAllRead(): Promise<void> {
    await this.markAllReadButton.click();
  }

  /**
   * Get a specific list item by its index.
   */
  getItemByIndex(index: number): Locator {
    return this.listItems.nth(index);
  }
}
