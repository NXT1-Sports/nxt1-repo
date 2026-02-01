/**
 * @fileoverview MSW Integration Fixture for Playwright
 * @module @nxt1/web/e2e/fixtures
 *
 * Provides MSW mocking capabilities as a Playwright fixture.
 * This allows tests to easily control API mocking on a per-test basis.
 *
 * @see https://playwright.dev/docs/test-fixtures
 * @see https://mswjs.io/docs/integrations/node
 * @version 2.0.0 (2026)
 */

import { test as base } from '@playwright/test';
import {
  server,
  startMockServer,
  stopMockServer,
  resetMockHandlers,
  mockErrors,
  MOCK_USER,
  MOCK_PROFILE,
  MOCK_TEAMS,
  MOCK_POSTS,
  MOCK_NOTIFICATIONS,
} from '../mocks';
import type { RequestHandler } from 'msw';

/**
 * MSW fixture interface
 */
export interface MSWFixture {
  /**
   * Add custom handlers for this test only
   * Handlers are reset after each test
   */
  use: (...handlers: RequestHandler[]) => void;

  /**
   * Simulate server error (500) for all API requests
   */
  simulateServerError: () => void;

  /**
   * Simulate unauthorized error (401) for all API requests
   */
  simulateUnauthorized: () => void;

  /**
   * Simulate network timeout for all API requests
   */
  simulateTimeout: () => void;

  /**
   * Simulate rate limiting (429) for all API requests
   */
  simulateRateLimited: () => void;

  /**
   * Reset handlers to defaults
   */
  reset: () => void;

  /**
   * Access to mock data for assertions
   */
  mockData: {
    user: typeof MOCK_USER;
    profile: typeof MOCK_PROFILE;
    teams: typeof MOCK_TEAMS;
    posts: typeof MOCK_POSTS;
    notifications: typeof MOCK_NOTIFICATIONS;
  };
}

/**
 * Track if MSW server has been started
 */
let mswServerStarted = false;

/**
 * Extended test fixture with MSW support
 */
export const testWithMSW = base.extend<{ msw: MSWFixture }>({
  msw: async ({ page: _page }, use) => {
    // Start server if not already running
    if (!mswServerStarted) {
      startMockServer();
      mswServerStarted = true;
    }

    // Create fixture object
    const fixture: MSWFixture = {
      use: (...handlers) => {
        server.use(...handlers);
      },
      simulateServerError: mockErrors.serverError,
      simulateUnauthorized: mockErrors.unauthorized,
      simulateTimeout: mockErrors.timeout,
      simulateRateLimited: mockErrors.rateLimited,
      reset: resetMockHandlers,
      mockData: {
        user: MOCK_USER,
        profile: MOCK_PROFILE,
        teams: MOCK_TEAMS,
        posts: MOCK_POSTS,
        notifications: MOCK_NOTIFICATIONS,
      },
    };

    // Provide fixture to test
    await use(fixture);

    // Reset handlers after each test
    resetMockHandlers();
  },
});

/**
 * Export expect for convenience
 */
export { expect } from '@playwright/test';

/**
 * Worker-level fixture to manage MSW server lifecycle
 * This ensures the server is only started once per worker
 */
export const testWithMSWWorker = base.extend<{ msw: MSWFixture }, { mswServer: void }>({
  // Worker-scoped fixture - runs once per worker
  mswServer: [
    async (_unused, use) => {
      startMockServer();
      await use();
      stopMockServer();
    },
    { scope: 'worker' },
  ],

  // Test-scoped fixture - uses worker's server
  msw: async ({ mswServer: _mswServer, page: _page }, use) => {
    const fixture: MSWFixture = {
      use: (...handlers) => {
        server.use(...handlers);
      },
      simulateServerError: mockErrors.serverError,
      simulateUnauthorized: mockErrors.unauthorized,
      simulateTimeout: mockErrors.timeout,
      simulateRateLimited: mockErrors.rateLimited,
      reset: resetMockHandlers,
      mockData: {
        user: MOCK_USER,
        profile: MOCK_PROFILE,
        teams: MOCK_TEAMS,
        posts: MOCK_POSTS,
        notifications: MOCK_NOTIFICATIONS,
      },
    };

    await use(fixture);
    resetMockHandlers();
  },
});
