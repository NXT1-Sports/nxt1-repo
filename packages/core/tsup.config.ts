import { defineConfig } from 'tsup';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Post-build: add .js extensions to relative imports in ESM output.
 * Node.js ESM requires explicit file extensions, but esbuild code splitting
 * emits bare specifiers like `from './error.types'`.
 */
async function fixEsmImports(dir: string): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      await fixEsmImports(fullPath);
    } else if (entry.name.endsWith('.js')) {
      const content = await readFile(fullPath, 'utf-8');
      const fixed = content.replace(
        /((?:from|import)\s*['"])(\.\.?\/[^'"]+?)(['"])/g,
        (_match, prefix: string, path: string, suffix: string) => {
          // Skip if already has a known file extension
          if (/\.(js|cjs|mjs|json|css|wasm|node)$/.test(path)) {
            return `${prefix}${path}${suffix}`;
          }
          return `${prefix}${path}.js${suffix}`;
        }
      );
      if (fixed !== content) {
        await writeFile(fullPath, fixed, 'utf-8');
      }
    }
  }
}

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
    'src/posts/index.ts', // Post types and interfaces
    'src/onboarding/index.ts', // Onboarding navigation and link-drop types
    'src/platforms/index.ts', // Platform registry, types, and favicon utilities
    'src/performance/index.ts', // Performance tracing abstraction
    'src/ai/index.ts', // AI definitions
    'src/team-profile/index.ts', // Team profile types and API
  ],
  format: ['cjs', 'esm'],
  outExtension({ format }) {
    return { js: format === 'cjs' ? '.cjs' : '.js' };
  },
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
  async onSuccess() {
    await fixEsmImports('dist');
    console.log('✅ Fixed ESM relative import extensions');
  },
});
