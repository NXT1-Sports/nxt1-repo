/**
 * @fileoverview Vitest Configuration for @nxt1/core
 * @module @nxt1/core
 *
 * Unit testing configuration for the core shared library.
 * Tests run in Node.js environment since this is a pure TypeScript library.
 *
 * @see https://vitest.dev/config/
 */

import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    // Project name (shown in reports)
    name: '@nxt1/core',

    // Use Node.js environment (no DOM needed for pure TypeScript)
    environment: 'node',

    // Enable globals (describe, it, expect without imports)
    globals: true,

    // Test file patterns
    include: ['src/**/*.spec.ts', 'src/**/*.test.ts'],

    // Exclude patterns
    exclude: ['node_modules', 'dist', '**/*.d.ts'],

    // Root directory
    root: __dirname,

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'json', 'html', 'lcov'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.spec.ts',
        'src/**/*.test.ts',
        'src/**/index.ts', // Barrel exports
        'src/**/*.d.ts',
      ],
      // Thresholds for CI - lowered for initial setup
      // TODO: Increase thresholds as more tests are added
      thresholds: {
        // Global thresholds (across all files)
        statements: 0,
        branches: 0,
        functions: 0,
        lines: 0,
        // Per-file thresholds for tested modules
        'src/analytics/**/*.ts': {
          statements: 70,
          branches: 50,
          functions: 70,
          lines: 70,
        },
      },
    },

    // Timeout for each test
    testTimeout: 10000,

    // Hook timeout
    hookTimeout: 10000,

    // Retry failed tests
    retry: 0,

    // Reporter configuration
    reporters: ['default'],

    // Output verbosity
    outputFile: {
      json: './coverage/test-results.json',
    },
  },

  // Path aliases (match tsconfig)
  resolve: {
    alias: {
      '@nxt1/core': resolve(__dirname, './src'),
    },
  },
});
