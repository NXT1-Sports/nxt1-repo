#!/usr/bin/env node
/**
 * @fileoverview Sync app version from root package.json into all environment files.
 *
 * Reads the version from the root package.json and updates every
 * `appVersion` and `version` field in the web and mobile environment files.
 *
 * Suffix rules:
 *   environment.ts         → {version}-dev
 *   environment.staging.ts → {version}
 *   environment.prod.ts    → {version}
 *
 * Usage:
 *   node scripts/sync-version.mjs          # auto-detect from package.json
 *   node scripts/sync-version.mjs 2.1.0    # explicit version override
 *
 * This script is called automatically by the npm `version` lifecycle hook
 * and by the GitHub Actions release workflow.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// ---------------------------------------------------------------------------
// 1. Determine the version
// ---------------------------------------------------------------------------
const explicitVersion = process.argv[2];
let version;

if (explicitVersion) {
  version = explicitVersion;
} else {
  const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf-8'));
  version = pkg.version;
}

if (!version) {
  console.error('❌ Could not determine version');
  process.exit(1);
}

console.log(`📦 Syncing appVersion → ${version}`);

// ---------------------------------------------------------------------------
// 2. Define all environment files and their suffixes
// ---------------------------------------------------------------------------
const targets = [
  // Web
  { file: 'apps/web/src/environments/environment.ts', suffix: '-dev' },
  { file: 'apps/web/src/environments/environment.staging.ts', suffix: '' },
  { file: 'apps/web/src/environments/environment.prod.ts', suffix: '' },
  // Mobile
  { file: 'apps/mobile/src/environments/environment.ts', suffix: '-dev' },
  { file: 'apps/mobile/src/environments/environment.staging.ts', suffix: '' },
  { file: 'apps/mobile/src/environments/environment.prod.ts', suffix: '' },
];

// ---------------------------------------------------------------------------
// 3. Regex replacements — matches both active and commented-out lines
// ---------------------------------------------------------------------------
//   appVersion: '...'   or   version: '...'   (with optional leading //)
const APP_VERSION_RE = /(\/\/\s*)?(\bappVersion:\s*')([^']*?)(')/g;
const VERSION_RE = /(\/\/\s*)?(\bversion:\s*')([^']*?)(')/g;

let updated = 0;

for (const { file, suffix } of targets) {
  const abs = resolve(ROOT, file);
  if (!existsSync(abs)) {
    console.log(`   ⏭  skipped (not found): ${file}`);
    continue;
  }

  const newVersion = `${version}${suffix}`;
  let content = readFileSync(abs, 'utf-8');
  let changed = false;

  content = content.replace(APP_VERSION_RE, (match, commentPrefix, pre, _oldVal, post) => {
    changed = true;
    return `${commentPrefix ?? ''}${pre}${newVersion}${post}`;
  });

  content = content.replace(VERSION_RE, (match, commentPrefix, pre, _oldVal, post) => {
    changed = true;
    return `${commentPrefix ?? ''}${pre}${newVersion}${post}`;
  });

  if (changed) {
    writeFileSync(abs, content);
    console.log(`   ✅ ${file} → ${newVersion}`);
    updated++;
  } else {
    console.log(`   ⚠️  no appVersion/version field found: ${file}`);
  }
}

console.log(`\n✅ Done — updated ${updated} file(s)`);
