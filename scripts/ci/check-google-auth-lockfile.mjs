#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const LOCKFILE_PATH = path.resolve(process.cwd(), 'package-lock.json');

const REQUIRED = {
  '@google-cloud/storage': [7, 21, 0],
  'google-auth-library': [10, 7, 0],
  gtoken: [8, 0, 0],
};

const OPTIONAL_ABSENT = new Set(['gtoken']);

function parseVersion(input) {
  const match = String(input).match(/(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function compareVersions(a, b) {
  for (let i = 0; i < 3; i += 1) {
    if (a[i] > b[i]) return 1;
    if (a[i] < b[i]) return -1;
  }
  return 0;
}

function packageNameFromLockPath(lockPath) {
  const match = String(lockPath).match(/node_modules\/((?:@[^/]+\/)?[^/]+)$/);
  return match?.[1] ?? null;
}

function collectLockfileVersions(lockfile, targetName) {
  const versions = new Set();
  const packages = lockfile?.packages;

  if (!packages || typeof packages !== 'object') return versions;

  for (const [lockPath, lockNode] of Object.entries(packages)) {
    if (!lockNode || typeof lockNode !== 'object') continue;

    const name = packageNameFromLockPath(lockPath);
    if (name !== targetName) continue;

    if (typeof lockNode.version === 'string') {
      versions.add(lockNode.version);
    }
  }

  return versions;
}

if (!fs.existsSync(LOCKFILE_PATH)) {
  console.error('Lockfile guard failed: package-lock.json not found');
  process.exit(1);
}

const lockfile = JSON.parse(fs.readFileSync(LOCKFILE_PATH, 'utf8'));
const failures = [];

for (const [pkg, minVersion] of Object.entries(REQUIRED)) {
  const versions = [...collectLockfileVersions(lockfile, pkg)].sort();

  if (versions.length === 0) {
    if (!OPTIONAL_ABSENT.has(pkg)) {
      failures.push(`${pkg}: not found in package-lock.json`);
    }
    continue;
  }

  const badVersions = versions.filter((version) => {
    const parsed = parseVersion(version);
    if (!parsed) return true;
    return compareVersions(parsed, minVersion) < 0;
  });

  if (badVersions.length > 0) {
    failures.push(
      `${pkg}: lockfile contains legacy versions [${badVersions.join(', ')}], requires >= ${minVersion.join('.')}`
    );
  }
}

if (failures.length > 0) {
  console.error('Google auth/storage lockfile guard failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('Google auth/storage lockfile guard passed.');