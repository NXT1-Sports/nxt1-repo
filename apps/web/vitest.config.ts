/**
 * @fileoverview Vitest Configuration for @nxt1/web
 * @module @nxt1/web
 *
 * Unit testing configuration for the Angular web application.
 * Uses happy-dom environment for DOM testing with Angular components.
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

    // Use happy-dom for DOM access in tests (jsdom 28+ breaks on Node 22
    // due to @asamuzakjp/css-color top-level await in ESM)
    environment: 'happy-dom',

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
    alias: [
      // @nxt1/core subpath imports (must come before the exact match)
      {
        find: /^@nxt1\/core\/(.+)$/,
        replacement: resolve(__dirname, '../../packages/core/src/$1'),
      },
      { find: /^@nxt1\/core$/, replacement: resolve(__dirname, '../../packages/core/src') },
      // @nxt1/ui subpath imports (must come before the exact match)
      { find: /^@nxt1\/ui\/(.+)$/, replacement: resolve(__dirname, '../../packages/ui/src/$1') },
      { find: /^@nxt1\/ui$/, replacement: resolve(__dirname, '../../packages/ui/src') },
      // design-tokens has no src/ dir; point to package root so sub-paths
      // like /assets/icons resolve via directory index lookup
      {
        find: /^@nxt1\/design-tokens$/,
        replacement: resolve(__dirname, '../../packages/design-tokens'),
      },
      // Stub @ionic/angular/standalone so Node.js never loads the FESM bundle
      // (which uses ESM directory imports unsupported by Node.js). The mock
      // exports all symbols used across @nxt1/ui as minimal class stubs.
      {
        find: /^@ionic\/angular\/standalone$/,
        replacement: resolve(
          __dirname,
          '../../packages/ui/src/__vitest__/ionic-standalone.mock.ts'
        ),
      },
    ],
  },
});
