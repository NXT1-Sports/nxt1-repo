/**
 * @fileoverview Vitest Workspace Configuration
 * @module nxt1-workspace
 *
 * Root workspace configuration for running tests across all packages.
 * Each package has its own vitest.config.ts for package-specific settings.
 *
 * Usage:
 * - npm test              - Run all tests via turbo
 * - npm run test:core     - Run @nxt1/core tests only
 * - npm run test:watch    - Run tests in watch mode
 * - npm run test:coverage - Run tests with coverage report
 *
 * @see https://vitest.dev/guide/workspace.html
 */

import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  // Package libraries
  'packages/*/vitest.config.ts',

  // Applications (web, mobile)
  'apps/*/vitest.config.ts',

  // Backend API
  'backend/vitest.config.ts',
]);
