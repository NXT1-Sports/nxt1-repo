/**
 * @fileoverview News Page Object
 * @module @nxt1/web/e2e/pages
 *
 * Page Object Model for the News/Pulse feature (web).
 * Covers the main feed, category tabs, article detail, and state handling.
 *
 * Uses TEST_IDS from @nxt1/core/testing for all selectors.
 */

import { type Page, type Locator } from '@playwright/test';
import { BasePage } from './base.page';
import { NEWS_TEST_IDS } from '@nxt1/core/testing';

/**
 * Page Object for the News page (/news or /explore with Pulse tab).
 */
export class NewsPage extends BasePage {
  readonly url = '/news';

  // Feed list
  readonly listContainer: Locator;
  readonly list: Locator;
  readonly listItems: Locator;

  // States
  readonly loadingSkeleton: Locator;
  readonly emptyState: Locator;
  readonly errorState: Locator;
  readonly retryButton: Locator;
  readonly loadMoreTrigger: Locator;

  // Article detail
  readonly articleDetail: Locator;
  readonly articleDetailBack: Locator;
  readonly articleDetailShare: Locator;
  readonly articleDetailReadFull: Locator;

  constructor(page: Page) {
    super(page);
    this.listContainer = page.getByTestId(NEWS_TEST_IDS.LIST_CONTAINER);
    this.list = page.getByTestId(NEWS_TEST_IDS.LIST);
    this.listItems = page.getByTestId(NEWS_TEST_IDS.LIST_ITEM);
    this.loadingSkeleton = page.getByTestId(NEWS_TEST_IDS.SKELETON);
    this.emptyState = page.getByTestId(NEWS_TEST_IDS.EMPTY_STATE);
    this.errorState = page.getByTestId(NEWS_TEST_IDS.ERROR_STATE);
    this.retryButton = page.getByTestId(NEWS_TEST_IDS.RETRY_BTN);
    this.loadMoreTrigger = page.getByTestId(NEWS_TEST_IDS.LOAD_MORE);
    this.articleDetail = page.getByTestId(NEWS_TEST_IDS.ARTICLE_DETAIL);
    this.articleDetailBack = page.getByTestId(NEWS_TEST_IDS.ARTICLE_DETAIL_BACK);
    this.articleDetailShare = page.getByTestId(NEWS_TEST_IDS.ARTICLE_DETAIL_SHARE);
    this.articleDetailReadFull = page.getByTestId(NEWS_TEST_IDS.ARTICLE_DETAIL_READ_FULL);
  }

  /**
   * Navigate to news page and wait for feed to render.
   */
  override async goto(): Promise<void> {
    await this.page.goto(this.url);
    await this.waitForHydration();
  }

  /**
   * Assert that the feed list is visible with articles.
   */
  async assertFeedLoaded(): Promise<void> {
    await this.assertVisible(this.listContainer);
  }

  /**
   * Assert that the empty state is displayed.
   */
  async assertEmptyState(): Promise<void> {
    await this.assertVisible(this.emptyState);
  }

  /**
   * Assert that the error state is displayed.
   */
  async assertErrorState(): Promise<void> {
    await this.assertVisible(this.errorState);
  }

  /**
   * Click the retry button (visible in error state).
   */
  async clickRetry(): Promise<void> {
    await this.retryButton.click();
  }

  /**
   * Get a specific article card by its index.
   */
  getArticleByIndex(index: number): Locator {
    return this.listItems.nth(index);
  }

  /**
   * Click on an article card to open detail view.
   */
  async openArticle(index: number): Promise<void> {
    await this.getArticleByIndex(index).click();
  }

  /**
   * Close article detail via back button.
   */
  async closeArticleDetail(): Promise<void> {
    await this.articleDetailBack.click();
  }

  /**
   * Click share on article detail.
   */
  async shareArticle(): Promise<void> {
    await this.articleDetailShare.click();
  }
}
