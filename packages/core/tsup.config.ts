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
  ],
  format: ['cjs', 'esm'],
  dts: {
    compilerOptions: {
      composite: false,
      incremental: false,
      isolatedModules: false,
    },
  },
  splitting: false,
  sourcemap: true,
  clean: true,
  outDir: 'dist',
  // Exclude Angular/Ionic dependent files - these have moved to @nxt1/ui
  external: ['@angular/*', '@ionic/*', 'ionicons'],
});
