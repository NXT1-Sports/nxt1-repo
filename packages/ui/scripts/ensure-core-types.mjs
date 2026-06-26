import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(scriptDir, '..');
const workspaceRoot = join(packageRoot, '..', '..');
const coreTypesPath = join(workspaceRoot, 'packages', 'core', 'dist', 'index.d.ts');

if (!existsSync(coreTypesPath)) {
  console.error(
    'Expected @nxt1/core declarations at packages/core/dist/index.d.ts. Build @nxt1/core before building @nxt1/ui.'
  );
  process.exit(1);
}