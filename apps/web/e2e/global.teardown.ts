/**
 * @fileoverview Global Teardown
 * @module @nxt1/web/e2e
 *
 * Runs once after all tests complete.
 * Cleanup authentication state and test artifacts.
 *
 * Uses the Playwright project-based teardown API (1.37+):
 * - Matched via `testMatch: /global\.teardown\.ts/` in playwright.config.ts
 * - Triggered by the `setup` project's `teardown: 'teardown'` option
 */

import { test as teardown } from '@playwright/test';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import path from 'path';
import fs from 'fs';

// ESM-compatible __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const AUTH_FILE = path.join(__dirname, '.auth', 'user.json');

teardown('global teardown', async () => {
  console.log('🧹 Running global teardown...');

  // Optionally clean up auth state in CI
  if (process.env['CI']) {
    if (fs.existsSync(AUTH_FILE)) {
      fs.unlinkSync(AUTH_FILE);
      console.log('   Cleaned up auth state');
    }
  }

  // Add any additional cleanup here:
  // - Delete test data created during tests
  // - Close database connections
  // - Clean up temporary files

  console.log('✅ Teardown complete');
});
