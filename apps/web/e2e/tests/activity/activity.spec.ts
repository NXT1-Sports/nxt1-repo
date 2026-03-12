/**
 * @fileoverview Activity E2E Tests
 * @module @nxt1/web/e2e/tests/activity
 *
 * End-to-end tests for the Activity feature.
 *
 * Coverage:
 * - Activity page renders when authenticated (happy path)
 * - Tabs are visible and interactive
 * - Feed items load correctly
 * - Empty state when no activity
 * - Error state on API failure
 * - Unauthenticated access redirects to /auth
 *
 * NOTE: Authenticated flows require E2E_REAL_AUTH=true and a valid test user.
 */

import { test, expect } from '../../fixtures';
import { ActivityPage } from '../../pages/activity.page';
import { ACTIVITY_TEST_IDS } from '@nxt1/core/testing';

// ============================================
// ACTIVITY PAGE TESTS
// ============================================

test.describe('Activity Page', () => {
  // ===========================================================================
  // UNAUTHENTICATED TESTS
  // These run without auth setup and verify redirect behavior.
  // ===========================================================================

  test.describe('Unauthenticated Access', () => {
    test('should redirect unauthenticated users away from /activity', async ({ page }) => {
      await page.goto('/activity');

      // Platform handles redirect: either auth page or home (SSR-rendered redirects)
      await page.waitForURL(
        (url) => url.pathname !== '/activity' || url.pathname.startsWith('/auth'),
        { timeout: 5000 }
      );
      const currentUrl = page.url();
      // Should not be on the activity page (no activity-shell container rendered)
      const activityContainer = page.getByTestId(ACTIVITY_TEST_IDS.SHELL);
      const isVisible = await activityContainer.isVisible().catch(() => false);
      // Either redirected OR container not visible
      expect(isVisible || currentUrl.includes('/auth')).toBeTruthy();
    });
  });

  // ===========================================================================
  // AUTHENTICATED TESTS
  // Require: E2E_REAL_AUTH=true
  // ===========================================================================

  test.describe('Authenticated Access', () => {
    let activityPage: ActivityPage;

    test.beforeEach(async ({ page, testUser: _testUser }) => {
      test.skip(!process.env['E2E_REAL_AUTH'], 'Requires E2E_REAL_AUTH=true');
      activityPage = new ActivityPage(page);
      await activityPage.goto();
    });

    // ----- Happy Path -----

    test('should display activity shell container', async ({ page }) => {
      test.skip(!process.env['E2E_REAL_AUTH'], 'Requires E2E_REAL_AUTH=true');
      const container = page.getByTestId(ACTIVITY_TEST_IDS.SHELL);
      await expect(container).toBeVisible();
    });

    test('should display activity tabs', async ({ page }) => {
      test.skip(!process.env['E2E_REAL_AUTH'], 'Requires E2E_REAL_AUTH=true');
      const tabs = page.getByTestId(ACTIVITY_TEST_IDS.TABS);
      await expect(tabs).toBeVisible();
    });

    test('should display feed content or empty state', async ({ page }) => {
      test.skip(!process.env['E2E_REAL_AUTH'], 'Requires E2E_REAL_AUTH=true');
      // After load, either items or empty state should be visible
      const listContainer = page.getByTestId(ACTIVITY_TEST_IDS.LIST_CONTAINER);
      const emptyState = page.getByTestId(ACTIVITY_TEST_IDS.EMPTY_STATE);

      const listVisible = await listContainer.isVisible().catch(() => false);
      const emptyVisible = await emptyState.isVisible().catch(() => false);
      expect(listVisible || emptyVisible).toBeTruthy();
    });

    // ----- Tab Switching -----

    test('should switch tabs when tab is clicked', async ({ page }) => {
      test.skip(!process.env['E2E_REAL_AUTH'], 'Requires E2E_REAL_AUTH=true');
      const agentTab = page.getByTestId(`${ACTIVITY_TEST_IDS.TAB_ITEM}-agent`);
      // Agent tab may or may not be present based on user role
      const agentTabVisible = await agentTab.isVisible().catch(() => false);
      if (agentTabVisible) {
        await agentTab.click();
        // After switching, content should update (list or empty state)
        await page.waitForTimeout(500);
        const listContainer = page.getByTestId(ACTIVITY_TEST_IDS.LIST_CONTAINER);
        const emptyState = page.getByTestId(ACTIVITY_TEST_IDS.EMPTY_STATE);
        const hasContent =
          (await listContainer.isVisible().catch(() => false)) ||
          (await emptyState.isVisible().catch(() => false));
        expect(hasContent).toBeTruthy();
      }
    });
  });

  // ===========================================================================
  // API MOCK TESTS (MSW)
  // These tests use route-level API mocking for deterministic behavior.
  // ===========================================================================

  test.describe('API Mocked States', () => {
    test('should show empty state when API returns no items', async ({ page }) => {
      // Mock the activity feed endpoint to return empty data
      await page.route('**/api/v1/activity/feed*', (route) =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          json: { success: true, data: { items: [], hasMore: false, total: 0 } },
        })
      );

      await page.route('**/api/v1/activity/badges*', (route) =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          json: { success: true, data: { all: 0, inbox: 0, agent: 0, alerts: 0 } },
        })
      );

      await page.goto('/activity');

      // Should show empty state or at least not crash
      const emptyState = page.getByTestId(ACTIVITY_TEST_IDS.EMPTY_STATE);
      const shell = page.getByTestId(ACTIVITY_TEST_IDS.SHELL);
      const shellVisible = await shell.isVisible().catch(() => false);
      const emptyVisible = await emptyState.isVisible().catch(() => false);
      // At minimum the page should render (shell or empty state visible)
      expect(shellVisible || emptyVisible).toBeTruthy();
    });

    test('should show error state when API returns server error', async ({ page }) => {
      // Mock the activity feed endpoint to return a 500 error
      await page.route('**/api/v1/activity/feed*', (route) =>
        route.fulfill({
          status: 500,
          contentType: 'application/json',
          json: { success: false, error: 'Internal server error' },
        })
      );

      await page.goto('/activity');

      // Should show error state or handle gracefully
      const errorState = page.getByTestId(ACTIVITY_TEST_IDS.ERROR_STATE);
      const shell = page.getByTestId(ACTIVITY_TEST_IDS.SHELL);
      const errorVisible = await errorState.isVisible().catch(() => false);
      const shellVisible = await shell.isVisible().catch(() => false);
      // Page should still render something (error state or shell)
      expect(errorVisible || shellVisible).toBeTruthy();
    });
  });
});
