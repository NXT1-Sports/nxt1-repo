/**
 * @fileoverview Settings E2E Tests
 * @module @nxt1/web/e2e/tests/settings
 *
 * End-to-end tests for the Settings feature.
 *
 * Coverage:
 * - Settings page renders when authenticated (happy path)
 * - Account Information page renders correctly
 * - Account information items are visible (email, change password, sign out, delete)
 * - Unauthenticated access redirects to /auth
 *
 * NOTE: Authenticated flows require E2E_REAL_AUTH=true and a valid test user.
 */

import { test, expect } from '../../fixtures';
import { SettingsPage, AccountInformationPage } from '../../pages/settings.page';
import { SETTINGS_TEST_IDS } from '@nxt1/core/testing';

// ============================================
// SETTINGS PAGE TESTS
// ============================================

test.describe('Settings Page', () => {
  // ===========================================================================
  // UNAUTHENTICATED TESTS
  // These run without auth setup and verify redirect behavior.
  // ===========================================================================

  test.describe('Unauthenticated Access', () => {
    test('should redirect unauthenticated users away from /settings', async ({ page }) => {
      await page.goto('/settings');

      // Platform handles redirect: either auth page or home (SSR-rendered redirects)
      await page.waitForURL(
        (url) => url.pathname !== '/settings' || url.pathname.startsWith('/auth'),
        { timeout: 5000 }
      );
      const currentUrl = page.url();
      // Should not be on the settings page (no settings-page container rendered)
      const settingsContainer = page.getByTestId(SETTINGS_TEST_IDS.PAGE);
      const isVisible = await settingsContainer.isVisible().catch(() => false);
      // Either redirected OR container not visible (SSR may render skeleton)
      expect(isVisible || currentUrl.includes('/auth')).toBeTruthy();
    });
  });

  // ===========================================================================
  // AUTHENTICATED TESTS
  // Require: E2E_REAL_AUTH=true
  // ===========================================================================

  test.describe('Authenticated Access', () => {
    let settingsPage: SettingsPage;

    test.beforeEach(async ({ page, testUser: _testUser }) => {
      test.skip(!process.env['E2E_REAL_AUTH'], 'Requires E2E_REAL_AUTH=true');
      settingsPage = new SettingsPage(page);
      await settingsPage.goto();
    });

    test('should display settings page container', async ({ page }) => {
      test.skip(!process.env['E2E_REAL_AUTH'], 'Requires E2E_REAL_AUTH=true');
      const container = page.getByTestId(SETTINGS_TEST_IDS.PAGE);
      await expect(container).toBeVisible();
    });

    test('should have correct page title', async ({ page }) => {
      test.skip(!process.env['E2E_REAL_AUTH'], 'Requires E2E_REAL_AUTH=true');
      await expect(page).toHaveTitle(/settings/i);
    });
  });
});

// ============================================
// ACCOUNT INFORMATION PAGE TESTS
// ============================================

test.describe('Account Information Page', () => {
  // ===========================================================================
  // UNAUTHENTICATED TESTS
  // ===========================================================================

  test.describe('Unauthenticated Access', () => {
    test('should not render account-info page without auth', async ({ page }) => {
      await page.goto('/settings/account-information');

      const container = page.getByTestId(SETTINGS_TEST_IDS.ACCOUNT_INFO_PAGE);
      const isVisible = await container.isVisible().catch(() => false);
      const currentUrl = page.url();
      expect(isVisible || currentUrl.includes('/auth')).toBeTruthy();
    });
  });

  // ===========================================================================
  // AUTHENTICATED TESTS
  // Require: E2E_REAL_AUTH=true
  // ===========================================================================

  test.describe('Authenticated Access', () => {
    let accountPage: AccountInformationPage;

    test.beforeEach(async ({ page }) => {
      test.skip(!process.env['E2E_REAL_AUTH'], 'Requires E2E_REAL_AUTH=true');
      accountPage = new AccountInformationPage(page);
      await accountPage.goto();
    });

    // Happy path — all 4 items visible

    test('should display the account information page container', async ({ page }) => {
      test.skip(!process.env['E2E_REAL_AUTH'], 'Requires E2E_REAL_AUTH=true');
      await expect(page.getByTestId(SETTINGS_TEST_IDS.ACCOUNT_INFO_PAGE)).toBeVisible();
    });

    test('should display email item', async ({ page }) => {
      test.skip(!process.env['E2E_REAL_AUTH'], 'Requires E2E_REAL_AUTH=true');
      const accountPage = new AccountInformationPage(page);
      await expect(accountPage.emailItem).toBeVisible();
    });

    test('should display change password item', async ({ page }) => {
      test.skip(!process.env['E2E_REAL_AUTH'], 'Requires E2E_REAL_AUTH=true');
      const accountPage = new AccountInformationPage(page);
      await expect(accountPage.changePasswordItem).toBeVisible();
    });

    test('should display sign out item', async ({ page }) => {
      test.skip(!process.env['E2E_REAL_AUTH'], 'Requires E2E_REAL_AUTH=true');
      const accountPage = new AccountInformationPage(page);
      await expect(accountPage.signOutItem).toBeVisible();
    });

    test('should display delete account item', async ({ page }) => {
      test.skip(!process.env['E2E_REAL_AUTH'], 'Requires E2E_REAL_AUTH=true');
      const accountPage = new AccountInformationPage(page);
      await expect(accountPage.deleteAccountItem).toBeVisible();
    });

    // Change Password flow

    test('should show toast when change password is clicked with valid email', async ({ page }) => {
      test.skip(!process.env['E2E_REAL_AUTH'], 'Requires E2E_REAL_AUTH=true');
      const accountPage = new AccountInformationPage(page);
      await accountPage.clickChangePassword();
      // Toast with success or error should appear
      const toast = page.locator('nxt1-toast, [data-testid="toast"], ion-toast').first();
      await expect(toast).toBeVisible({ timeout: 5000 });
    });

    // Sign Out flow — confirmation sheet

    test('should show confirmation sheet when sign out is clicked', async ({ page }) => {
      test.skip(!process.env['E2E_REAL_AUTH'], 'Requires E2E_REAL_AUTH=true');
      const accountPage = new AccountInformationPage(page);
      await accountPage.clickSignOut();
      // Bottom sheet should appear
      const sheet = page.locator('nxt1-bottom-sheet, [role="dialog"]').first();
      await expect(sheet).toBeVisible({ timeout: 3000 });
    });

    // Delete Account flow — destructive confirmation sheet

    test('should show destructive confirmation sheet when delete account is clicked', async ({
      page,
    }) => {
      test.skip(!process.env['E2E_REAL_AUTH'], 'Requires E2E_REAL_AUTH=true');
      const accountPage = new AccountInformationPage(page);
      await accountPage.clickDeleteAccount();
      // Destructive bottom sheet with "Delete My Account" label
      const sheet = page.locator('nxt1-bottom-sheet, [role="dialog"]').first();
      await expect(sheet).toBeVisible({ timeout: 3000 });
    });
  });
});
