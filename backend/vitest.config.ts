/**
 * @fileoverview Vitest Configuration for @nxt1/backend
 * @module @nxt1/backend
 *
 * Test configuration for the backend API server.
 * Currently configured to pass with no tests while backend is in development.
 */

import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'url';

const resolve = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@nxt1/core': resolve('../packages/core/src/index.ts'),
    },
  },
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
