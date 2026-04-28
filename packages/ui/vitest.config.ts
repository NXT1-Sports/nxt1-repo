import { resolve } from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: '@nxt1/ui',
    environment: 'happy-dom',
    globals: true,
    include: ['src/**/*.spec.ts', 'src/**/*.test.ts'],
    exclude: ['node_modules', 'dist', '**/*.d.ts'],
    root: __dirname,
    setupFiles: ['./src/test-setup.ts'],
    typecheck: {
      enabled: false,
    },
    testTimeout: 10000,
    reporters: ['default'],
  },
  resolve: {
    alias: [
      {
        find: /^@nxt1\/core\/(.+)$/,
        replacement: resolve(__dirname, '../core/src/$1'),
      },
      { find: /^@nxt1\/core$/, replacement: resolve(__dirname, '../core/src') },
      {
        find: /^@nxt1\/ui\/(.+)$/,
        replacement: resolve(__dirname, './src/$1'),
      },
      { find: /^@nxt1\/ui$/, replacement: resolve(__dirname, './src') },
      {
        find: /^@nxt1\/design-tokens$/,
        replacement: resolve(__dirname, '../design-tokens'),
      },
      {
        find: /^@ionic\/angular\/standalone$/,
        replacement: resolve(__dirname, './src/__vitest__/ionic-standalone.mock.ts'),
      },
    ],
  },
});
