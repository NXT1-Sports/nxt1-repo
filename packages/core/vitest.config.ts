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
        // Exclude untested modules until tests are added
        'src/models/**/*.ts',
        'src/platform/**/*.ts',
        'src/validation/**/*.ts',
        'src/constants/**/*.ts',
        'src/helpers/**/*.ts',
        'src/api/**/*.ts',
        'src/storage/*-storage.ts', // Keep storage-adapter.ts
        'src/logging/**/*.ts',
      ],
      // Thresholds for CI - enforces minimum coverage
      thresholds: {
        // Per-module thresholds for tested modules
        'src/auth/**/*.ts': {
          statements: 20,
          branches: 80,
          functions: 95,
          lines: 20,
        },
        'src/analytics/**/*.ts': {
          statements: 20,
          branches: 20,
          functions: 50,
          lines: 20,
        },
        'src/cache/**/*.ts': {
          statements: 20,
          branches: 40,
          functions: 50,
          lines: 20,
        },
        'src/seo/**/*.ts': {
          statements: 20,
          branches: 70,
          functions: 80,
          lines: 20,
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
