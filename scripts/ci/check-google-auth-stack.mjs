#!/usr/bin/env node
import { execSync } from 'node:child_process';

const REQUIRED = {
  'firebase-admin': [14, 0, 0],
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

function collectVersions(node, pkgName, acc, currentName = '') {
  if (!node || typeof node !== 'object') return;

  if (currentName === pkgName && typeof node.version === 'string') {
    acc.add(node.version);
  }

  const deps = node.dependencies;
  if (!deps || typeof deps !== 'object') return;

  for (const [depName, depNode] of Object.entries(deps)) {
    collectVersions(depNode, pkgName, acc, depName);
  }
}

function getResolvedVersions(pkgName) {
  let output;
  try {
    output = execSync(`npm ls ${pkgName} --all --json --workspace=@nxt1/backend`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    if (error instanceof Error && 'stdout' in error && typeof error.stdout === 'string') {
      output = error.stdout;
    } else {
      throw error;
    }
  }

  const json = JSON.parse(output || '{}');
  const versions = new Set();

  collectVersions(json, pkgName, versions);
  const rootDep = json.dependencies?.[pkgName];
  if (rootDep?.version) versions.add(rootDep.version);

  return [...versions].sort();
}

const failures = [];

for (const [pkg, minVersion] of Object.entries(REQUIRED)) {
  const versions = getResolvedVersions(pkg);

  if (versions.length === 0) {
    if (!OPTIONAL_ABSENT.has(pkg)) {
      failures.push(`${pkg}: not resolved in backend dependency tree`);
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
      `${pkg}: found legacy versions [${badVersions.join(', ')}], requires >= ${minVersion.join('.')}`
    );
  }
}

if (failures.length > 0) {
  console.error('Google auth/storage dependency policy check failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('Google auth/storage dependency policy check passed.');
