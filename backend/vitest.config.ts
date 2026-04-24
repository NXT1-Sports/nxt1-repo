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
    alias: [
      // Must come before the root alias — maps to the actual source file
      {
        find: '@nxt1/core/errors/express',
        replacement: resolve('../packages/core/src/errors/express.middleware.ts'),
      },
      // Generic root alias — subpath imports like @nxt1/core/models resolve to
      // packages/core/src/models/index.ts automatically via directory resolution
      {
        find: '@nxt1/core',
        replacement: resolve('../packages/core/src'),
      },
      {
        find: '@nxt1/cache',
        replacement: resolve('../packages/cache/src'),
      },
    ],
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    passWithNoTests: true,
    setupFiles: ['reflect-metadata', './src/test-setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.{test,spec}.ts', 'src/**/*.d.ts'],
    },
  },
});
