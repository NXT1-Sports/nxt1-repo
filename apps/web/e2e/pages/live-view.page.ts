/**
 * @fileoverview Live View Page Object
 * @module @nxt1/web/e2e/pages
 *
 * Page Object Model for the Agent X Live View panel.
 * Covers the desktop live-view iframe panel, action buttons,
 * and loading/error states.
 *
 * Uses TEST_IDS from @nxt1/core/testing for all selectors.
 */

import { type Page, type Locator } from '@playwright/test';
import { BasePage } from './base.page';
import { LIVE_VIEW_TEST_IDS } from '@nxt1/core/testing';

/**
 * Page Object for the Agent X Live View panel.
 *
 * The live view panel appears within the Agent X shell on desktop
 * when a session is started. It embeds an interactive browser iframe.
 */
export class LiveViewPage extends BasePage {
  readonly url = '/agent-x';

  // Panel structure
  readonly panelContainer: Locator;
  readonly iframe: Locator;
  readonly header: Locator;

  // Action buttons
  readonly refreshButton: Locator;
  readonly closeButton: Locator;
  readonly copyLinkButton: Locator;
  readonly openExternalLink: Locator;
  readonly fullscreenButton: Locator;
  readonly downloadButton: Locator;

  // States
  readonly loadingState: Locator;
  readonly errorState: Locator;

  constructor(page: Page) {
    super(page);
    this.panelContainer = page.getByTestId(LIVE_VIEW_TEST_IDS.PANEL_CONTAINER);
    this.iframe = page.getByTestId(LIVE_VIEW_TEST_IDS.IFRAME);
    this.header = page.getByTestId(LIVE_VIEW_TEST_IDS.HEADER);
    this.refreshButton = page.getByTestId(LIVE_VIEW_TEST_IDS.REFRESH_BUTTON);
    this.closeButton = page.getByTestId(LIVE_VIEW_TEST_IDS.CLOSE_BUTTON);
    this.copyLinkButton = page.getByTestId(LIVE_VIEW_TEST_IDS.COPY_LINK_BUTTON);
    this.openExternalLink = page.getByTestId(LIVE_VIEW_TEST_IDS.OPEN_EXTERNAL_LINK);
    this.fullscreenButton = page.getByTestId(LIVE_VIEW_TEST_IDS.FULLSCREEN_BUTTON);
    this.downloadButton = page.getByTestId(LIVE_VIEW_TEST_IDS.DOWNLOAD_BUTTON);
    this.loadingState = page.getByTestId(LIVE_VIEW_TEST_IDS.LOADING_STATE);
    this.errorState = page.getByTestId(LIVE_VIEW_TEST_IDS.ERROR_STATE);
  }

  /**
   * Navigate to the Agent X shell and wait for the page to render.
   */
  override async goto(): Promise<void> {
    await this.page.goto(this.url);
    await this.waitForHydration();
  }

  /**
   * Assert the live view panel is visible (session active).
   */
  async assertPanelVisible(): Promise<void> {
    await this.assertVisible(this.panelContainer);
  }

  /**
   * Assert the live view panel is NOT visible (no session).
   */
  async assertPanelHidden(): Promise<void> {
    await this.assertHidden(this.panelContainer);
  }

  /**
   * Assert the iframe is visible and has a src attribute.
   */
  async assertIframeLoaded(): Promise<void> {
    await this.assertVisible(this.iframe);
  }

  /**
   * Assert the loading state is displayed.
   */
  async assertLoadingState(): Promise<void> {
    await this.assertVisible(this.loadingState);
  }

  /**
   * Assert the error state is displayed.
   */
  async assertErrorState(): Promise<void> {
    await this.assertVisible(this.errorState);
  }

  /**
   * Close the live view panel.
   */
  async closePanel(): Promise<void> {
    await this.closeButton.click();
  }

  /**
   * Refresh the live view session.
   */
  async refreshSession(): Promise<void> {
    await this.refreshButton.click();
  }

  /**
   * Mock the live view start API to return a successful session.
   */
  async mockStartSession(session?: Partial<MockLiveViewSession>): Promise<void> {
    const mockSession: MockLiveViewSession = {
      sessionId: 'e2e-session-001',
      interactiveUrl: 'https://connect.firecrawl.dev/session/e2e-abc123',
      requestedUrl: 'https://www.hudl.com',
      resolvedUrl: 'https://www.hudl.com/',
      destinationTier: 'platform',
      platformKey: 'hudl_signin',
      domainLabel: 'hudl.com',
      authStatus: 'authenticated',
      capabilities: { canRefresh: true, canNavigate: true, hasAuthProfile: true },
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 600_000).toISOString(),
      ...session,
    };

    await this.page.route('**/api/**/agent-x/live-view/start', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        json: { success: true, data: mockSession },
      })
    );
  }

  /**
   * Mock the live view start API to return a failure.
   */
  async mockStartSessionError(error = 'Internal server error', status = 500): Promise<void> {
    await this.page.route('**/api/**/agent-x/live-view/start', (route) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        json: { success: false, error },
      })
    );
  }

  /**
   * Mock the live view navigate API.
   */
  async mockNavigate(success = true): Promise<void> {
    await this.page.route('**/api/**/agent-x/live-view/navigate', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        json: success
          ? { success: true, data: { resolvedUrl: 'https://www.hudl.com/video' } }
          : { success: false, error: 'Navigation failed' },
      })
    );
  }

  /**
   * Mock the live view refresh API.
   */
  async mockRefresh(success = true): Promise<void> {
    await this.page.route('**/api/**/agent-x/live-view/refresh', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        json: success ? { success: true } : { success: false, error: 'Refresh failed' },
      })
    );
  }

  /**
   * Mock the live view close API.
   */
  async mockClose(): Promise<void> {
    await this.page.route('**/api/**/agent-x/live-view/close', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        json: { success: true },
      })
    );
  }
}

/**
 * Mock session data shape for E2E route mocking.
 */
interface MockLiveViewSession {
  sessionId: string;
  interactiveUrl: string;
  requestedUrl: string;
  resolvedUrl: string;
  destinationTier: string;
  platformKey?: string;
  domainLabel: string;
  authStatus: string;
  capabilities: {
    canRefresh: boolean;
    canNavigate: boolean;
    hasAuthProfile: boolean;
  };
  createdAt: string;
  expiresAt: string;
}
