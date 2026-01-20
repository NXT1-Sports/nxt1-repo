/**
 * @fileoverview Vitest Configuration for @nxt1/mobile
 * @module @nxt1/mobile
 *
 * Unit testing configuration for the Ionic/Capacitor mobile application.
 * Uses jsdom environment for DOM testing.
 *
 * @see https://vitest.dev/config/
 */

import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    // Project name (shown in reports)
    name: '@nxt1/mobile',

    // Use jsdom for DOM access in tests
    environment: 'jsdom',

    // Enable globals (describe, it, expect without imports)
    globals: true,

    // Test file patterns
    include: ['src/**/*.spec.ts', 'src/**/*.test.ts'],

    // Exclude patterns
    exclude: ['node_modules', 'dist', 'www', '.angular', '**/*.d.ts', 'android/**', 'ios/**'],

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
        'src/test-setup.ts',
        'src/environments/**',
      ],
    },

    // TypeScript type checking
    typecheck: {
      enabled: false,
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
