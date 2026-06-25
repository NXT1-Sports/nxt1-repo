import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(scriptDir, '..');
const workspaceRoot = join(packageRoot, '..', '..');
const coreTypesPath = join(workspaceRoot, 'packages', 'core', 'dist', 'index.d.ts');

const executable = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const result = spawnSync(executable, ['run', 'build', '--workspace=@nxt1/core'], {
  cwd: workspaceRoot,
  stdio: 'inherit',
  env: process.env,
});

if (result.error) {
  throw result.error;
}

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

if (!existsSync(coreTypesPath)) {
  console.error('Expected @nxt1/core declarations at packages/core/dist/index.d.ts after build.');
  process.exit(1);
}