/**
 * @fileoverview Vitest Configuration for @nxt1/backend
 * @module @nxt1/backend
 *
 * Test configuration for the backend API server.
 * Currently configured to pass with no tests while backend is in development.
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    passWithNoTests: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.{test,spec}.ts', 'src/**/*.d.ts'],
    },
  },
});
