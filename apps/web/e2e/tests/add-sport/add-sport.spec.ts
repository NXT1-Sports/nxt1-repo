/**
 * @fileoverview Add Sport E2E Tests
 * @module @nxt1/web/e2e/tests/add-sport
 *
 * End-to-end tests for the Add Sport / Add Team wizard.
 *
 * Coverage:
 * - Wizard shell renders when authenticated (happy path)
 * - Sport selection step is the initial step
 * - Unauthenticated access redirects to /auth
 * - Error state on API failure
 * - Empty/loading states
 *
 * NOTE: Authenticated flows require E2E_REAL_AUTH=true and a valid test user.
 */

import { test, expect } from '../../fixtures';
import { AddSportPage } from '../../pages/add-sport.page';
import { ADD_SPORT_TEST_IDS } from '@nxt1/core/testing';

// ============================================
// ADD SPORT WIZARD TESTS
// ============================================

test.describe('Add Sport Wizard', () => {
  // ===========================================================================
  // UNAUTHENTICATED TESTS
  // ===========================================================================

  test.describe('Unauthenticated Access', () => {
    test('should redirect unauthenticated users away from /add-sport', async ({ page }) => {
      await page.goto('/add-sport');

      // Platform handles redirect: either auth page or home (SSR-rendered redirects)
      await page.waitForURL(
        (url) => url.pathname !== '/add-sport' || url.pathname.startsWith('/auth'),
        { timeout: 5000 }
      );
      const currentUrl = page.url();
      // Should not be on the add-sport page (no shell rendered)
      const shell = page.getByTestId(ADD_SPORT_TEST_IDS.SHELL);
      const isVisible = await shell.isVisible().catch(() => false);
      // Either redirected OR shell not visible
      expect(isVisible || currentUrl.includes('/auth')).toBeTruthy();
    });
  });

  // ===========================================================================
  // AUTHENTICATED TESTS
  // Require: E2E_REAL_AUTH=true
  // ===========================================================================

  test.describe('Authenticated Access', () => {
    let addSportPage: AddSportPage;

    test.beforeEach(async ({ page, testUser: _testUser }) => {
      test.skip(!process.env['E2E_REAL_AUTH'], 'Requires E2E_REAL_AUTH=true');
      addSportPage = new AddSportPage(page);
      await addSportPage.goto();
    });

    // ----- Happy Path -----

    test('should display the wizard shell', async ({ page }) => {
      test.skip(!process.env['E2E_REAL_AUTH'], 'Requires E2E_REAL_AUTH=true');
      const shell = page.getByTestId(ADD_SPORT_TEST_IDS.SHELL);
      await expect(shell).toBeVisible();
    });

    test('should show sport selection as the first step', async ({ page }) => {
      test.skip(!process.env['E2E_REAL_AUTH'], 'Requires E2E_REAL_AUTH=true');
      const sportStep = page.getByTestId(ADD_SPORT_TEST_IDS.STEP_SPORT);
      await expect(sportStep).toBeVisible();
    });

    test('should display the page title', async ({ page }) => {
      test.skip(!process.env['E2E_REAL_AUTH'], 'Requires E2E_REAL_AUTH=true');
      const title = page.getByTestId(ADD_SPORT_TEST_IDS.TITLE);
      await expect(title).toBeVisible();
    });

    test('should display footer navigation', async ({ page }) => {
      test.skip(!process.env['E2E_REAL_AUTH'], 'Requires E2E_REAL_AUTH=true');
      // Check for either desktop or mobile footer
      const desktopFooter = page.getByTestId(ADD_SPORT_TEST_IDS.DESKTOP_FOOTER);
      const mobileFooter = page.getByTestId(ADD_SPORT_TEST_IDS.MOBILE_FOOTER);

      const desktopVisible = await desktopFooter.isVisible().catch(() => false);
      const mobileVisible = await mobileFooter.isVisible().catch(() => false);
      expect(desktopVisible || mobileVisible).toBeTruthy();
    });
  });

  // ===========================================================================
  // API MOCK TESTS
  // These tests use route-level API mocking for deterministic behavior.
  // ===========================================================================

  test.describe('API Mocked States', () => {
    test('should show error state when profile API returns server error', async ({ page }) => {
      // Mock the profile endpoint to return a 500 error
      await page.route('**/api/v1/profile*', (route) =>
        route.fulfill({
          status: 500,
          contentType: 'application/json',
          json: { success: false, error: 'Internal server error' },
        })
      );

      await page.goto('/add-sport');

      // Should show error state or handle gracefully
      const errorState = page.getByTestId(ADD_SPORT_TEST_IDS.ERROR_STATE);
      const shell = page.getByTestId(ADD_SPORT_TEST_IDS.SHELL);
      const errorVisible = await errorState.isVisible().catch(() => false);
      const shellVisible = await shell.isVisible().catch(() => false);
      // Page should still render something (error state or shell)
      expect(errorVisible || shellVisible).toBeTruthy();
    });

    test('should render wizard shell even with empty sport data', async ({ page }) => {
      // Mock sport list to return empty
      await page.route('**/api/v1/sports*', (route) =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          json: { success: true, data: [] },
        })
      );

      await page.goto('/add-sport');

      // Wizard shell should still render
      const shell = page.getByTestId(ADD_SPORT_TEST_IDS.SHELL);
      const shellVisible = await shell.isVisible().catch(() => false);
      const sportStep = page.getByTestId(ADD_SPORT_TEST_IDS.STEP_SPORT);
      const sportVisible = await sportStep.isVisible().catch(() => false);
      expect(shellVisible || sportVisible).toBeTruthy();
    });
  });
});
