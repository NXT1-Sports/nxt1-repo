import { defineConfig } from 'tsup';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/models/index.ts',
    'src/constants/index.ts',
    'src/api/index.ts',
    'src/helpers/index.ts',
    'src/validation/index.ts',
    'src/auth/index.ts',
    'src/storage/index.ts',
    'src/platform/index.ts',
    'src/analytics/index.ts',
    'src/cache/index.ts',
    'src/errors/index.ts',
    'src/errors/express.middleware.ts',
    'src/logging/index.ts',
    'src/testing/index.ts', // Shared testing infrastructure
    'src/geolocation/index.ts', // Geolocation helpers
    'src/crashlytics/index.ts', // Firebase Crashlytics adapter
    'src/feed/index.ts', // Feed types and interfaces
    'src/create-post/index.ts', // Create post types and interfaces
    'src/onboarding/index.ts', // Onboarding navigation and link-drop types
  ],
  format: ['cjs', 'esm'],
  dts: false,
  // Enable splitting to deduplicate shared code across entry points
  // This prevents dual-package issues where classes like NxtApiError
  // get bundled multiple times causing instanceof checks to fail
  splitting: true,
  sourcemap: true,
  clean: !process.argv.includes('--watch'),
  outDir: 'dist',
  // Exclude Angular/Ionic dependent files - these have moved to @nxt1/ui
  external: ['@angular/*', '@ionic/*', 'ionicons'],
});
