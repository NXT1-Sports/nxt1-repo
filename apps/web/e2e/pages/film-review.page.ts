import { type Page, type Locator } from '@playwright/test';
import { TEST_IDS } from '@nxt1/core/testing';

/**
 * Page Object for Film Review feature (E2E tests)
 *
 * Encapsulates all selectors and interaction methods for the Film Review panel.
 * Uses test IDs from @nxt1/core/testing for maintainability.
 *
 * @public
 */
export class FilmReviewPage {
  readonly videoPlayer: Locator;
  readonly generateTimelineButton: Locator;
  readonly timelineGeneratingSpinner: Locator;
  readonly timelinePrevButton: Locator;
  readonly timelineNextButton: Locator;
  readonly playlistListContainer: Locator;
  readonly emptyState: Locator;

  /**
   * Initialize page object with selectors
   * @param page - Playwright page instance
   */
  constructor(private readonly page: Page) {
    this.videoPlayer = page.getByTestId(TEST_IDS.FILM_REVIEW.VIDEO_PLAYER);
    this.generateTimelineButton = page.getByTestId(TEST_IDS.FILM_REVIEW.GENERATE_TIMELINE_BUTTON);
    this.timelineGeneratingSpinner = page.getByTestId(
      TEST_IDS.FILM_REVIEW.TIMELINE_GENERATING_SPINNER
    );
    this.timelinePrevButton = page.getByTestId(TEST_IDS.FILM_REVIEW.TIMELINE_PLAY_NAV_PREV);
    this.timelineNextButton = page.getByTestId(TEST_IDS.FILM_REVIEW.TIMELINE_PLAY_NAV_NEXT);
    this.playlistListContainer = page.getByTestId(TEST_IDS.FILM_REVIEW.LIST_CONTAINER);
    this.emptyState = page.getByTestId(TEST_IDS.FILM_REVIEW.EMPTY_STATE);
  }

  /**
   * Navigate to Film Review feature page
   * @returns Promise resolving when page is loaded
   */
  async goto(): Promise<void> {
    await this.page.goto('/agent-x/film-review');
  }

  /**
   * Click Generate Timeline button and verify loading spinner appears
   * @returns Promise resolving when click is complete
   */
  async generateTimeline(): Promise<void> {
    await this.generateTimelineButton.click();
    // Spinner should appear immediately (loading state)
    await this.timelineGeneratingSpinner.waitFor({ state: 'visible' });
  }

  /**
   * Wait for timeline generation to complete (spinner disappears, play nav appears)
   * @param timeoutMs - Maximum wait time in ms (default 30s per service polling)
   * @returns Promise resolving when generation completes
   */
  async waitForTimelineComplete(timeoutMs = 35_000): Promise<void> {
    // Wait for spinner to disappear
    await this.timelineGeneratingSpinner.waitFor({
      state: 'hidden',
      timeout: timeoutMs,
    });
    // Verify play nav buttons appear
    await this.timelinePrevButton.waitFor({ state: 'visible' });
  }

  /**
   * Click previous play button to navigate to previous segment
   * @returns Promise resolving when click is complete
   */
  async goToPreviousPlay(): Promise<void> {
    await this.timelinePrevButton.click();
  }

  /**
   * Click next play button to navigate to next segment
   * @returns Promise resolving when click is complete
   */
  async goToNextPlay(): Promise<void> {
    await this.timelineNextButton.click();
  }

  /**
   * Select a specific play from the playlist dropdown
   * @param playNumber - Zero-based index of play to select
   * @returns Promise resolving when play is selected
   */
  async selectPlayFromPlaylist(playNumber: number): Promise<void> {
    const option = this.page.getByTestId(TEST_IDS.FILM_REVIEW.LIST_ITEM).nth(playNumber);
    await option.click();
  }

  /**
   * Get current video time in seconds
   * @returns Current video playback time
   */
  async getCurrentVideoTime(): Promise<number> {
    const video = this.videoPlayer.locator('video');
    const timeStr = await video.evaluate((v: HTMLVideoElement) => v.currentTime.toString());
    return parseFloat(timeStr);
  }

  /**
   * Verify that play nav buttons are visible (timeline exists)
   * @returns True if both prev/next buttons are visible
   */
  async hasPlayNavigation(): Promise<boolean> {
    const prevVisible = await this.timelinePrevButton.isVisible();
    const nextVisible = await this.timelineNextButton.isVisible();
    return prevVisible || nextVisible; // At least one should be visible
  }

  /**
   * Verify empty state message is displayed
   * @returns True if empty state is visible
   */
  async hasEmptyState(): Promise<boolean> {
    return this.emptyState.isVisible();
  }
}
