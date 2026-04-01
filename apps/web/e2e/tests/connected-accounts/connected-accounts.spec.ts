/**
 * @fileoverview Connected Accounts E2E Tests
 * @module @nxt1/web/e2e/tests/connected-accounts
 *
 * End-to-end tests for the Connected Accounts / Firecrawl sign-in flow.
 *
 * Coverage:
 * - Happy path: user clicks "Sign In" → loading overlay → modal → "I'm Signed In" → success
 * - Loading overlay appears while backend spins up session
 * - Error state: backend returns 500 → user sees error toast
 * - Cancel state: user closes modal → session is cleaned up
 * - 429 rate limit: too many sessions → user sees warning toast
 *
 * NOTE: These tests mock the Firecrawl backend API responses.
 * They do NOT launch real Firecrawl browser sessions.
 */

import { test, expect } from '../../fixtures';
import { ConnectedAccountsPage } from '../../pages/connected-accounts.page';

// ============================================
// MOCK RESPONSES
// ============================================

const MOCK_START_SUCCESS = {
  success: true,
  data: {
    sessionId: 'test-session-123',
    interactiveLiveViewUrl: 'https://liveview.firecrawl.dev/test-session',
    liveViewUrl: 'https://liveview.firecrawl.dev/test-session-readonly',
    profileName: 'nxt1_stg_testuser_hudl_signin',
  },
};

const MOCK_COMPLETE_SUCCESS = {
  success: true,
  data: { verified: true },
};

const MOCK_COMPLETE_UNVERIFIED = {
  success: true,
  data: { verified: false },
};

// ============================================
// CONNECTED ACCOUNTS TESTS
// ============================================

test.describe('Connected Accounts — Firecrawl Flow', () => {
  test.describe('API Mocked Flow', () => {
    test('should show loading overlay when starting a sign-in session', async ({ page }) => {
      // Mock the start endpoint with a delayed response
      await page.route('**/agent-x/firecrawl/session/start', async (route) => {
        // Delay to observe loading state
        await new Promise((resolve) => setTimeout(resolve, 500));
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(MOCK_START_SUCCESS),
        });
      });

      const caPage = new ConnectedAccountsPage(page);
      await caPage.goto();

      // Click sign-in on a platform — the loading overlay should appear
      await caPage.clickSignIn('Hudl');
      await caPage.assertLoadingOverlayVisible();
    });

    test('should open the sign-in modal with an iframe after session starts', async ({ page }) => {
      await page.route('**/agent-x/firecrawl/session/start', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(MOCK_START_SUCCESS),
        });
      });

      const caPage = new ConnectedAccountsPage(page);
      await caPage.goto();
      await caPage.clickSignIn('Hudl');
      await caPage.waitForSignInModal();

      // The modal should contain the iframe pointing to the Firecrawl live view
      await expect(caPage.signinIframe).toBeAttached();
      await expect(caPage.signinDoneButton).toBeVisible();
    });

    test('should complete sign-in flow and show success toast', async ({ page }) => {
      await page.route('**/agent-x/firecrawl/session/start', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(MOCK_START_SUCCESS),
        });
      });

      await page.route('**/agent-x/firecrawl/session/complete', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(MOCK_COMPLETE_SUCCESS),
        });
      });

      const caPage = new ConnectedAccountsPage(page);
      await caPage.goto();
      await caPage.clickSignIn('Hudl');
      await caPage.waitForSignInModal();
      await caPage.clickDone();

      // Success toast should appear
      await expect(page.locator(':text("connected successfully")')).toBeVisible({
        timeout: 10_000,
      });
    });

    test('should show warning toast when verification fails', async ({ page }) => {
      await page.route('**/agent-x/firecrawl/session/start', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(MOCK_START_SUCCESS),
        });
      });

      await page.route('**/agent-x/firecrawl/session/complete', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(MOCK_COMPLETE_UNVERIFIED),
        });
      });

      const caPage = new ConnectedAccountsPage(page);
      await caPage.goto();
      await caPage.clickSignIn('Hudl');
      await caPage.waitForSignInModal();
      await caPage.clickDone();

      // Warning toast should appear instead of success
      await expect(page.locator(':text("couldn\'t confirm")')).toBeVisible({
        timeout: 10_000,
      });
    });

    test('should show error toast when start session returns 500', async ({ page }) => {
      await page.route('**/agent-x/firecrawl/session/start', async (route) => {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ success: false, error: 'Failed to start sign-in session' }),
        });
      });

      const caPage = new ConnectedAccountsPage(page);
      await caPage.goto();
      await caPage.clickSignIn('Hudl');

      // Error toast should appear
      await expect(
        page.locator(':text("Unable to start sign-in session"), :text("Failed")')
      ).toBeVisible({ timeout: 10_000 });
    });

    test('should show rate-limit warning when start session returns 429', async ({ page }) => {
      await page.route('**/agent-x/firecrawl/session/start', async (route) => {
        await route.fulfill({
          status: 429,
          contentType: 'application/json',
          body: JSON.stringify({
            success: false,
            error: 'Too many active sessions. Please wait a moment and try again.',
          }),
        });
      });

      const caPage = new ConnectedAccountsPage(page);
      await caPage.goto();
      await caPage.clickSignIn('Hudl');

      // Rate limit warning
      await expect(page.locator(':text("Too many active sessions")')).toBeVisible({
        timeout: 10_000,
      });
    });

    test('should cancel session when user closes the modal', async ({ page }) => {
      let cancelCalled = false;

      await page.route('**/agent-x/firecrawl/session/start', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(MOCK_START_SUCCESS),
        });
      });

      await page.route('**/agent-x/firecrawl/session/cancel', async (route) => {
        cancelCalled = true;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true }),
        });
      });

      const caPage = new ConnectedAccountsPage(page);
      await caPage.goto();
      await caPage.clickSignIn('Hudl');
      await caPage.waitForSignInModal();

      // Close the modal via the header close button
      const closeButton = page
        .locator('.nxt1-fc-signin .nxt1-modal-close, nxt1-modal-header button')
        .first();
      await closeButton.click();

      // Give a moment for the cancel request to fire
      await page.waitForTimeout(1000);
      expect(cancelCalled).toBe(true);
    });
  });
});
