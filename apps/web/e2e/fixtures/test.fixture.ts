/**
 * @fileoverview Custom Test Fixtures
 * @module @nxt1/web/e2e/fixtures
 *
 * Extended Playwright test fixtures for NXT1 E2E testing.
 * Provides pre-configured page objects and authentication state.
 *
 * @see https://playwright.dev/docs/test-fixtures
 */

import { test as base, expect, Page, BrowserContext } from '@playwright/test';
import { LoginPage, SignupPage, ForgotPasswordPage } from '../pages';

/**
 * Test user credentials loaded from environment
 */
export interface TestUser {
  email: string;
  password: string;
}

/**
 * Custom fixture types
 */
export interface TestFixtures {
  /** Login page object instance */
  loginPage: LoginPage;
  /** Signup page object instance */
  signupPage: SignupPage;
  /** Forgot password page object instance */
  forgotPasswordPage: ForgotPasswordPage;
  /** Primary test user credentials */
  testUser: TestUser;
  /** Secondary test user credentials */
  testUser2: TestUser;
}

/**
 * Worker-scoped fixtures (shared across tests in same worker)
 */
export interface WorkerFixtures {
  /** Browser context with authentication state */
  authenticatedContext: BrowserContext;
}

/**
 * Get test user from environment variables
 */
function getTestUser(suffix = ''): TestUser {
  const envSuffix = suffix ? `_${suffix}` : '';
  return {
    email:
      process.env[`E2E_TEST_USER${envSuffix}_EMAIL`] ||
      `e2e-test${suffix.toLowerCase()}@example.com`,
    password: process.env[`E2E_TEST_USER${envSuffix}_PASSWORD`] || 'TestPassword123!',
  };
}

/**
 * Extended test with custom fixtures
 *
 * @example
 * ```typescript
 * import { test, expect } from '@fixtures';
 *
 * test('login with valid credentials', async ({ loginPage, testUser }) => {
 *   await loginPage.gotoAndVerify();
 *   await loginPage.loginWithEmail(testUser);
 *   await loginPage.assertLoginSuccess();
 * });
 * ```
 */
export const test = base.extend<TestFixtures, WorkerFixtures>({
  // ===========================================================================
  // PAGE OBJECT FIXTURES
  // ===========================================================================

  /**
   * Login page fixture
   * Creates a new LoginPage instance for each test
   */
  loginPage: async ({ page }, use) => {
    const loginPage = new LoginPage(page);
    await use(loginPage);
  },

  /**
   * Signup page fixture
   * Creates a new SignupPage instance for each test
   */
  signupPage: async ({ page }, use) => {
    const signupPage = new SignupPage(page);
    await use(signupPage);
  },

  /**
   * Forgot password page fixture
   */
  forgotPasswordPage: async ({ page }, use) => {
    const forgotPasswordPage = new ForgotPasswordPage(page);
    await use(forgotPasswordPage);
  },

  // ===========================================================================
  // TEST DATA FIXTURES
  // ===========================================================================

  /**
   * Primary test user credentials
   */
  testUser: async ({ page: _page }, use) => {
    await use(getTestUser());
  },

  /**
   * Secondary test user for multi-user scenarios
   */
  testUser2: async ({ page: _page }, use) => {
    await use(getTestUser('2'));
  },

  // ===========================================================================
  // WORKER FIXTURES (Shared across tests)
  // ===========================================================================

  /**
   * Authenticated browser context
   * Shares authentication state across tests in the same worker
   */
  authenticatedContext: [
    async ({ browser }, use) => {
      // Try to load existing auth state
      const authFile = process.env['AUTH_STORAGE_STATE'] || '.auth/user.json';

      try {
        const context = await browser.newContext({
          storageState: authFile,
        });
        await use(context);
        await context.close();
      } catch {
        // If no auth state exists, create fresh context
        const context = await browser.newContext();
        await use(context);
        await context.close();
      }
    },
    { scope: 'worker' },
  ],
});

/**
 * Re-export expect for convenience
 */
export { expect };

/**
 * Re-export Page type for custom fixtures
 */
export type { Page, BrowserContext };
