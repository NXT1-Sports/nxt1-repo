/**
 * @fileoverview Global Teardown
 * @module @nxt1/web/e2e
 *
 * Runs once after all tests complete.
 * Cleanup authentication state and test artifacts.
 */

import { FullConfig } from '@playwright/test';
import path from 'path';
import fs from 'fs';

/**
 * Global teardown function
 * Performs cleanup after all tests complete
 */
async function globalTeardown(_config: FullConfig): Promise<void> {
  console.log('🧹 Running global teardown...');

  // Optionally clean up auth state in CI
  if (process.env.CI) {
    const authFile = path.join(__dirname, '.auth', 'user.json');

    if (fs.existsSync(authFile)) {
      fs.unlinkSync(authFile);
      console.log('   Cleaned up auth state');
    }
  }

  // Add any additional cleanup here:
  // - Delete test data created during tests
  // - Close database connections
  // - Clean up temporary files

  console.log('✅ Teardown complete');
}

export default globalTeardown;
