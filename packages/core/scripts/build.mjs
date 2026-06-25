import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const packageRoot = fileURLToPath(new URL('..', import.meta.url));
const lockDir = join(packageRoot, '.build.lock');
const lockMetaPath = join(lockDir, 'owner.json');
const staleLockMs = 10 * 60 * 1000;

function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readLockMeta() {
  try {
    return JSON.parse(readFileSync(lockMetaPath, 'utf8'));
  } catch {
    return null;
  }
}

async function acquireBuildLock() {
  const startedWaitingAt = Date.now();

  while (true) {
    try {
      mkdirSync(lockDir);
      writeFileSync(
        lockMetaPath,
        JSON.stringify(
          {
            pid: process.pid,
            startedAt: new Date().toISOString(),
            command: process.argv.join(' '),
          },
          null,
          2
        )
      );
      return;
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;

      const meta = readLockMeta();
      const startedAt = meta?.startedAt ? Date.parse(meta.startedAt) : NaN;
      const stale = Number.isNaN(startedAt) || Date.now() - startedAt > staleLockMs;
      const ownerAlive = isProcessAlive(meta?.pid);

      if (!ownerAlive || stale) {
        rmSync(lockDir, { recursive: true, force: true });
        continue;
      }

      if (Date.now() - startedWaitingAt > 1_000) {
        const owner = meta?.pid ? `pid ${meta.pid}` : 'another process';
        console.log(`⏳ Waiting for @nxt1/core build lock held by ${owner}...`);
      }
      await delay(250);
    }
  }
}

function releaseBuildLock() {
  const meta = readLockMeta();
  if (!meta || meta.pid === process.pid) {
    rmSync(lockDir, { recursive: true, force: true });
  }
}

function run(command, args) {
  const executable = process.platform === 'win32' ? `${command}.cmd` : command;
  const result = spawnSync(executable, args, {
    cwd: packageRoot,
    env: process.env,
    shell: false,
    stdio: 'inherit',
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

await acquireBuildLock();

try {
  rmSync(join(packageRoot, 'dist'), { recursive: true, force: true });
  run('tsup', []);
  rmSync(join(packageRoot, 'dist', '.tsbuildinfo'), { force: true });
  run('tsc', [
    '--emitDeclarationOnly',
    '--declaration',
    '--declarationMap',
    '--project',
    'tsconfig.json',
  ]);
  run('node', ['scripts/fix-dist-imports.mjs']);
} finally {
  releaseBuildLock();
}
