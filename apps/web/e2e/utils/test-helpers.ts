/**
 * @fileoverview Test Utilities
 * @module @nxt1/web/e2e/utils
 *
 * Common utility functions for E2E tests.
 */

import { Page, expect } from '@playwright/test';

// ===========================================================================
// DATA GENERATION
// ===========================================================================

/**
 * Generate a unique email address for test isolation
 */
export function generateTestEmail(prefix = 'e2e'): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `${prefix}-${timestamp}-${random}@test.nxt1.com`;
}

/**
 * Generate a secure password meeting requirements
 */
export function generateTestPassword(): string {
  return `Test${Date.now()}!`;
}

/**
 * Generate random string of specified length
 */
export function randomString(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Generate random display name
 */
export function generateDisplayName(): string {
  const firstNames = ['Test', 'E2E', 'Auto', 'Demo', 'Sample'];
  const lastNames = ['User', 'Account', 'Profile', 'Tester', 'Runner'];
  const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
  const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
  const suffix = Math.floor(Math.random() * 1000);
  return `${firstName} ${lastName}${suffix}`;
}

// ===========================================================================
// WAIT UTILITIES
// ===========================================================================

/**
 * Wait for a specific duration (use sparingly!)
 */
export async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wait for network to be idle
 */
export async function waitForNetworkIdle(page: Page, timeout = 30_000): Promise<void> {
  await page.waitForLoadState('networkidle', { timeout });
}

/**
 * Wait for all images to load
 */
export async function waitForImages(page: Page): Promise<void> {
  await page.evaluate(() => {
    return Promise.all(
      Array.from(document.images)
        .filter((img) => !img.complete)
        .map((img) => new Promise((resolve) => {
          img.onload = resolve;
          img.onerror = resolve;
        }))
    );
  });
}

// ===========================================================================
// ASSERTION HELPERS
// ===========================================================================

/**
 * Assert URL contains path
 */
export async function assertUrlContains(page: Page, path: string): Promise<void> {
  await expect(page).toHaveURL(new RegExp(path));
}

/**
 * Assert URL does not contain path
 */
export async function assertUrlDoesNotContain(page: Page, path: string): Promise<void> {
  const url = page.url();
  expect(url).not.toContain(path);
}

/**
 * Assert page has no console errors
 */
export function setupConsoleErrorCapture(page: Page): string[] {
  const errors: string[] = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
  });

  return errors;
}

/**
 * Assert no JavaScript errors in console
 */
export function assertNoConsoleErrors(errors: string[], ignorePatterns: RegExp[] = []): void {
  const filteredErrors = errors.filter((error) =>
    !ignorePatterns.some((pattern) => pattern.test(error))
  );

  expect(filteredErrors).toHaveLength(0);
}

// ===========================================================================
// NETWORK UTILITIES
// ===========================================================================

/**
 * Wait for specific API request to complete
 */
export async function waitForApiRequest(
  page: Page,
  urlPattern: string | RegExp,
  timeout = 30_000
): Promise<void> {
  await page.waitForResponse(
    (response) => {
      const url = response.url();
      if (typeof urlPattern === 'string') {
        return url.includes(urlPattern);
      }
      return urlPattern.test(url);
    },
    { timeout }
  );
}

/**
 * Mock API response
 */
export async function mockApiResponse(
  page: Page,
  urlPattern: string | RegExp,
  response: {
    status?: number;
    body?: unknown;
    headers?: Record<string, string>;
  }
): Promise<void> {
  await page.route(urlPattern, async (route) => {
    await route.fulfill({
      status: response.status ?? 200,
      contentType: 'application/json',
      body: JSON.stringify(response.body ?? {}),
      headers: response.headers,
    });
  });
}

/**
 * Block specific requests (e.g., analytics, ads)
 */
export async function blockRequests(
  page: Page,
  patterns: (string | RegExp)[]
): Promise<void> {
  for (const pattern of patterns) {
    await page.route(pattern, (route) => route.abort());
  }
}

// ===========================================================================
// STORAGE UTILITIES
// ===========================================================================

/**
 * Get item from localStorage
 */
export async function getLocalStorageItem(page: Page, key: string): Promise<string | null> {
  return page.evaluate((k) => localStorage.getItem(k), key);
}

/**
 * Set item in localStorage
 */
export async function setLocalStorageItem(page: Page, key: string, value: string): Promise<void> {
  await page.evaluate(({ k, v }) => localStorage.setItem(k, v), { k: key, v: value });
}

/**
 * Clear localStorage
 */
export async function clearLocalStorage(page: Page): Promise<void> {
  await page.evaluate(() => localStorage.clear());
}

/**
 * Get all cookies
 */
export async function getCookies(page: Page): Promise<{ name: string; value: string }[]> {
  const context = page.context();
  return context.cookies();
}

// ===========================================================================
// DEBUG UTILITIES
// ===========================================================================

/**
 * Log page state for debugging
 */
export async function logPageState(page: Page, label = 'Page State'): Promise<void> {
  console.log(`\n=== ${label} ===`);
  console.log(`URL: ${page.url()}`);
  console.log(`Title: ${await page.title()}`);

  const cookies = await getCookies(page);
  console.log(`Cookies: ${cookies.map((c) => c.name).join(', ')}`);

  console.log('==================\n');
}

/**
 * Take debug screenshot with timestamp
 */
export async function debugScreenshot(page: Page, name: string): Promise<void> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  await page.screenshot({
    path: `test-results/debug/${name}-${timestamp}.png`,
    fullPage: true,
  });
}
