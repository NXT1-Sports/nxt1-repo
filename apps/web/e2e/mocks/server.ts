/**
 * @fileoverview MSW Server Setup for Playwright E2E Tests
 * @module @nxt1/web/e2e/mocks
 *
 * Configures Mock Service Worker for Node.js environment (Playwright).
 * This setup intercepts API requests during E2E tests.
 *
 * @see https://mswjs.io/docs/integrations/node
 * @version 2.0.0 (2026)
 */

import { setupServer } from 'msw/node';
import { handlers, errorHandlers } from './handlers';

/**
 * URLs that should NEVER be intercepted by MSW
 * These are external services that need real network access
 */
const PASSTHROUGH_URLS = [
  // Firebase Auth (CRITICAL for login)
  'identitytoolkit.googleapis.com',
  'securetoken.googleapis.com',
  'firebaseauth.googleapis.com',
  // Firebase Installations (required for Auth to work)
  'firebaseinstallations.googleapis.com',
  // Firebase Core Services
  'firebase.googleapis.com',
  'firebaseremoteconfig.googleapis.com',
  'firebaselogging.googleapis.com',
  // Firebase Analytics & Performance
  'firebaseanalytics.googleapis.com',
  'firebase-settings.crashlytics.com',
  'app-measurement.com',
  // Firebase other services
  'firestore.googleapis.com',
  'firebasestorage.googleapis.com',
  'fcm.googleapis.com',
  // Google APIs
  'www.googleapis.com',
  'accounts.google.com',
  'apis.google.com',
  'oauth2.googleapis.com',
  // CDNs and static assets
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'cdn.jsdelivr.net',
];

/**
 * Check if a URL should bypass MSW
 */
function shouldBypass(url: string): boolean {
  return PASSTHROUGH_URLS.some((domain) => url.includes(domain));
}

/**
 * MSW Server instance for Node.js
 * Used in Playwright tests to intercept HTTP requests
 */
export const server = setupServer(...handlers);

/**
 * Start MSW server with default handlers
 * Call this in global setup or test beforeAll
 */
export function startMockServer(): void {
  server.listen({
    onUnhandledRequest: (request, print) => {
      const url = request.url;

      // Allow Firebase and external services through without warning
      if (shouldBypass(url)) {
        return; // Silently bypass
      }

      // Warn about unhandled API requests (potential missing mock)
      if (url.includes('/api/') || url.includes('localhost:3001')) {
        print.warning();
      }
      // Silently ignore other requests (static assets, etc.)
    },
  });
  console.log('🔶 MSW Server started - API requests will be mocked');
}

/**
 * Stop MSW server
 * Call this in global teardown or test afterAll
 */
export function stopMockServer(): void {
  server.close();
  console.log('🔶 MSW Server stopped');
}

/**
 * Reset handlers to defaults between tests
 * Call this in test afterEach
 */
export function resetMockHandlers(): void {
  server.resetHandlers();
}

/**
 * Add temporary handlers for specific test scenarios
 *
 * @example
 * // In a test file
 * test('handles server error', async () => {
 *   useMockHandler(errorHandlers.serverError);
 *   // ... test code
 * });
 */
export function useMockHandler(...customHandlers: Parameters<typeof server.use>): void {
  server.use(...customHandlers);
}

/**
 * Simulate error scenarios
 */
export const mockErrors = {
  /**
   * Simulate server error (500) for all requests
   */
  serverError: () => useMockHandler(errorHandlers.serverError),

  /**
   * Simulate unauthorized error (401) for all requests
   */
  unauthorized: () => useMockHandler(errorHandlers.unauthorized),

  /**
   * Simulate network timeout for all requests
   */
  timeout: () => useMockHandler(errorHandlers.timeout),

  /**
   * Simulate rate limiting (429) for all requests
   */
  rateLimited: () => useMockHandler(errorHandlers.rateLimited),
};

// Export everything for convenience
export { handlers, errorHandlers } from './handlers';
export { MOCK_USER, MOCK_PROFILE, MOCK_TEAMS, MOCK_POSTS, MOCK_NOTIFICATIONS } from './handlers';
