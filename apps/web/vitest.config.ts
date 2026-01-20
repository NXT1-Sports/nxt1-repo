/**
 * @fileoverview Vitest Configuration for @nxt1/web
 * @module @nxt1/web
 *
 * Unit testing configuration for the Angular web application.
 * Uses jsdom environment for DOM testing with Angular components.
 *
 * Note: For Angular component testing, consider using:
 * - @analogjs/vitest-angular plugin for full Angular TestBed support
 * - Or keep simple unit tests without TestBed dependency
 *
 * @see https://vitest.dev/config/
 * @see https://analogjs.org/docs/features/testing/vitest
 */

import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    // Project name (shown in reports)
    name: '@nxt1/web',

    // Use jsdom for DOM access in tests
    environment: 'jsdom',

    // Enable globals (describe, it, expect without imports)
    globals: true,

    // Test file patterns
    include: ['src/**/*.spec.ts', 'src/**/*.test.ts'],

    // Exclude patterns
    exclude: ['node_modules', 'dist', '.angular', '**/*.d.ts', 'e2e/**'],

    // Root directory
    root: __dirname,

    // Setup files (run before each test file)
    setupFiles: ['./src/test-setup.ts'],

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'json', 'html'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.spec.ts',
        'src/**/*.test.ts',
        'src/**/index.ts',
        'src/**/*.d.ts',
        'src/main.ts',
        'src/main.server.ts',
        'src/polyfills.server.ts',
        'src/test-setup.ts',
        'src/environments/**',
      ],
    },

    // TypeScript type checking
    typecheck: {
      enabled: false, // Use tsc --noEmit separately for faster feedback
    },

    // Timeout for individual tests
    testTimeout: 10000,

    // Reporter configuration
    reporters: ['default'],
  },

  // Resolve aliases matching tsconfig paths
  resolve: {
    alias: {
      '@nxt1/core': resolve(__dirname, '../../packages/core/src'),
      '@nxt1/ui': resolve(__dirname, '../../packages/ui/src'),
      '@nxt1/design-tokens': resolve(__dirname, '../../packages/design-tokens/src'),
    },
  },
});
