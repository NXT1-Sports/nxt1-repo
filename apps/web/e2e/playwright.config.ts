/**
 * @fileoverview Playwright E2E Test Configuration
 * @module @nxt1/web/e2e
 *
 * Production-ready Playwright configuration for NXT1 web application.
 * Supports multiple browsers, environments, and CI/CD integration.
 *
 * @see https://playwright.dev/docs/test-configuration
 * @version 1.49.0
 */

import { defineConfig, devices } from '@playwright/test';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

/**
 * ESM-compatible __dirname equivalent
 */
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Load environment variables from .env file
 * Must be done before accessing process.env
 */
dotenv.config({ path: join(__dirname, '.env') });

/**
 * Environment configuration
 * Override with environment variables for different deployment targets
 */
const BASE_URL = process.env['E2E_BASE_URL'] || 'http://localhost:4500';
const CI = !!process.env['CI'];

/**
 * Auth storage state path for authenticated tests
 */
export const AUTH_STORAGE_STATE = join(__dirname, '.auth', 'user.json');

export default defineConfig({
  // ===========================================================================
  // TEST DISCOVERY
  // ===========================================================================
  testDir: './tests',
  testMatch: '**/*.spec.ts',

  // ===========================================================================
  // EXECUTION SETTINGS
  // ===========================================================================

  /**
   * Run tests in parallel across files
   * Workers are based on CPU cores in CI, limited locally for stability
   */
  fullyParallel: true,
  workers: CI ? '50%' : 4,

  /**
   * Fail fast on CI to save resources
   * Allow some failures locally for development
   */
  forbidOnly: CI,
  maxFailures: CI ? 10 : undefined,

  /**
   * Retry configuration
   * More retries in CI to handle flaky infrastructure
   */
  retries: CI ? 2 : 0,

  // ===========================================================================
  // REPORTING
  // ===========================================================================
  reporter: CI
    ? [
        ['github'],
        ['html', { outputFolder: 'playwright-report', open: 'never' }],
        ['junit', { outputFile: 'test-results/junit.xml' }],
      ]
    : [['list'], ['html', { outputFolder: 'playwright-report', open: 'on-failure' }]],

  /**
   * Output directory for test artifacts
   */
  outputDir: 'test-results',

  // ===========================================================================
  // GLOBAL SETTINGS
  // ===========================================================================
  use: {
    /**
     * Base URL for all navigation
     */
    baseURL: BASE_URL,

    /**
     * Tracing configuration
     * Capture trace on first retry for debugging
     */
    trace: 'on-first-retry',

    /**
     * Screenshot configuration
     * Only capture on failure to save storage
     */
    screenshot: 'only-on-failure',

    /**
     * Video configuration
     * Record on first retry for debugging flaky tests
     */
    video: 'on-first-retry',

    /**
     * Viewport size - Desktop default
     */
    viewport: { width: 1280, height: 720 },

    /**
     * Action timeouts
     */
    actionTimeout: 15_000,
    navigationTimeout: 30_000,

    /**
     * Ignore HTTPS errors for local development
     */
    ignoreHTTPSErrors: true,

    /**
     * Locale and timezone for consistent testing
     */
    locale: 'en-US',
    timezoneId: 'America/New_York',

    /**
     * Extra HTTP headers for all requests
     */
    extraHTTPHeaders: {
      'X-E2E-Test': 'true',
    },
  },

  // ===========================================================================
  // TIMEOUTS
  // ===========================================================================

  /**
   * Global test timeout
   * Increased for SSR pages that may take longer to load
   */
  timeout: 60_000,

  /**
   * Expect timeout for assertions
   */
  expect: {
    timeout: 10_000,

    /**
     * Visual regression testing configuration
     * @see https://playwright.dev/docs/test-snapshots
     */
    toHaveScreenshot: {
      // Allow small pixel differences for anti-aliasing
      maxDiffPixels: 100,

      // Maximum percentage of different pixels (fallback)
      maxDiffPixelRatio: 0.01,

      // Animation must be complete before screenshot
      animations: 'disabled',

      // Wait for fonts to load
      caret: 'hide',

      // Scale factor for screenshots
      scale: 'device',

      // Threshold for pixel color comparison (0-1)
      threshold: 0.2,
    },

    /**
     * Full page screenshot defaults
     */
    toMatchSnapshot: {
      maxDiffPixels: 100,
      maxDiffPixelRatio: 0.01,
    },
  },

  /**
   * Snapshot path configuration
   * Organizes screenshots by test name and browser
   */
  snapshotDir: './snapshots',
  snapshotPathTemplate: '{snapshotDir}/{testFileDir}/{testFileName}/{projectName}/{arg}{ext}',

  // ===========================================================================
  // PROJECTS (Browser configurations)
  // ===========================================================================
  projects: [
    // -------------------------------------------------------------------------
    // SETUP PROJECT - Authentication state
    // -------------------------------------------------------------------------
    {
      name: 'setup',
      testMatch: /global\.setup\.ts/,
      teardown: 'teardown',
    },
    {
      name: 'teardown',
      testMatch: /global\.teardown\.ts/,
    },

    // -------------------------------------------------------------------------
    // DESKTOP BROWSERS
    // -------------------------------------------------------------------------
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Use auth state for authenticated tests
        storageState: AUTH_STORAGE_STATE,
        // Disable web security for Firebase Auth (CORS issues with firebaseinstallations.googleapis.com)
        // This is required because Firebase SDK makes cross-origin requests that fail in headless Chrome
        launchOptions: {
          args: [
            '--disable-web-security',
            '--disable-features=IsolateOrigins,site-per-process',
            '--allow-running-insecure-content',
          ],
        },
      },
      dependencies: ['setup'],
    },
    {
      name: 'firefox',
      use: {
        ...devices['Desktop Firefox'],
        storageState: AUTH_STORAGE_STATE,
      },
      dependencies: ['setup'],
    },
    {
      name: 'webkit',
      use: {
        ...devices['Desktop Safari'],
        storageState: AUTH_STORAGE_STATE,
      },
      dependencies: ['setup'],
    },

    // -------------------------------------------------------------------------
    // MOBILE BROWSERS
    // -------------------------------------------------------------------------
    {
      name: 'mobile-chrome',
      use: {
        ...devices['Pixel 7'],
        storageState: AUTH_STORAGE_STATE,
      },
      dependencies: ['setup'],
    },
    {
      name: 'mobile-safari',
      use: {
        ...devices['iPhone 14'],
        storageState: AUTH_STORAGE_STATE,
      },
      dependencies: ['setup'],
    },

    // -------------------------------------------------------------------------
    // UNAUTHENTICATED TESTS (No setup dependency)
    // -------------------------------------------------------------------------
    {
      name: 'chromium-unauthenticated',
      testMatch: '**/auth/**/*.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
  ],

  // ===========================================================================
  // WEB SERVER
  // ===========================================================================
  webServer: {
    /**
     * Start the Angular dev server before tests
     * Reuse existing server if already running (don't kill it)
     */
    command: 'npm run dev -- --port 4500',
    cwd: join(__dirname, '..'), // Run from apps/web directory
    url: BASE_URL,
    reuseExistingServer: !CI, // Always start fresh in CI
    timeout: 120_000,
    // Don't pipe output when reusing server to avoid conflicts
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
