#!/usr/bin/env npx tsx
/**
 * Migrate Auth for a single user (Auth only — password hash + providers).
 * Uses `firebase auth:export` from legacy to capture real SCRYPT hash,
 * then imports into the specified target project.
 *
 * Usage:
 *   cd backend
 *   npx tsx scripts/migration/migrate-single-user-auth.ts --uid=<UID> --target=staging
 *   npx tsx scripts/migration/migrate-single-user-auth.ts --uid=<UID> --target=production
 *   npx tsx scripts/migration/migrate-single-user-auth.ts --uid=<UID>   # defaults to staging
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { writeFileSync, unlinkSync, readFileSync } from 'fs';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../.env') });

// ── Parse args ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
function getArg(name: string): string | undefined {
  const flag = args.find((a) => a.startsWith(`--${name}=`));
  return flag ? flag.split('=').slice(1).join('=') : undefined;
}

const TARGET_UID = getArg('uid');
if (!TARGET_UID) {
  console.error('❌ --uid=<UID> is required');
  process.exit(1);
}

const targetEnv = getArg('target') || 'staging';
const LEGACY_PROJECT = 'nxt-1-de054';
const TARGET_PROJECT = targetEnv === 'production' ? 'nxt-1-v2' : 'nxt-1-staging-v2';

// ── SCRYPT hash config from legacy ───────────────────────────────────────────
const HASH_CONFIG = {
  algorithm: 'SCRYPT',
  signerKey:
    'Ul0yk3ZKlvEUhin6ujgLd7GczdL+Onl4IhvuclnmdXPzxMcTcM8RTUJJe7GArhaOUwA1evaSegm9yv+EOVIiTQ==',
  saltSeparator: 'Bw==',
  rounds: 8,
  memoryCost: 14,
};

async function main() {
  console.log('\n🔐 Auth Migration — single user');
  console.log(`   UID    : ${TARGET_UID}`);
  console.log(`   Target : ${targetEnv} (${TARGET_PROJECT})\n`);

  const legacyExportPath = resolve(__dirname, `./_legacy-auth-full-export-${TARGET_UID}.json`);
  const filteredExportPath = resolve(__dirname, `./_single-user-auth-export-${TARGET_UID}.json`);

  // 1. Export ALL Auth users from legacy via Firebase CLI (includes real SCRYPT hash)
  console.log(`📤 Exporting all Auth users from legacy (${LEGACY_PROJECT})...`);
  try {
    execSync(
      `firebase auth:export "${legacyExportPath}" --project ${LEGACY_PROJECT} --format=json`,
      { encoding: 'utf-8', stdio: 'pipe' }
    );
  } catch (err: any) {
    console.error('❌ Export from legacy failed:');
    if (err.stdout) console.log(err.stdout);
    if (err.stderr) console.error(err.stderr);
    process.exit(1);
  }
  console.log('✅ Legacy export done.\n');

  // 2. Filter for our UID
  const legacyExport = JSON.parse(readFileSync(legacyExportPath, 'utf-8'));
  const users: Record<string, unknown>[] = legacyExport.users || [];
  const targetUser = users.find((u: any) => u.localId === TARGET_UID);
  unlinkSync(legacyExportPath);

  if (!targetUser) {
    console.error(
      `❌ UID "${TARGET_UID}" not found in legacy export (${users.length} users total)`
    );
    process.exit(1);
  }

  const u = targetUser as any;
  console.log('✅ Found user in legacy export:');
  console.log(`   email        : ${u.email || '(none)'}`);
  console.log(
    `   providers    : ${(u.providerUserInfo || []).map((p: any) => p.providerId).join(', ') || '(none)'}`
  );
  console.log(
    `   passwordHash : ${u.passwordHash ? 'YES (' + String(u.passwordHash).substring(0, 20) + '...)' : 'NO'}`
  );
  console.log(`   salt         : ${u.salt || '(none)'}\n`);

  // Remove keys unsupported by firebase auth:import
  const cleanUser = { ...targetUser } as any;
  delete cleanUser.lastLoginAt;
  delete cleanUser.lastRefreshAt;

  writeFileSync(filteredExportPath, JSON.stringify({ users: [cleanUser] }, null, 2));

  // 3. Build hash flags (only when user has a password)
  const hasPassword = !!u.passwordHash;
  const hashFlags = hasPassword
    ? [
        `--hash-algo=${HASH_CONFIG.algorithm}`,
        `--hash-key=${HASH_CONFIG.signerKey}`,
        `--salt-separator=${HASH_CONFIG.saltSeparator}`,
        `--rounds=${HASH_CONFIG.rounds}`,
        `--mem-cost=${HASH_CONFIG.memoryCost}`,
      ].join(' ')
    : '';

  if (!hasPassword) {
    console.log('ℹ️  No password hash — OAuth-only user. Importing provider data only.\n');
  }

  // 4. Import into target
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`📥 Importing into ${targetEnv} (${TARGET_PROJECT})...`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  const cmd =
    `firebase auth:import "${filteredExportPath}" --project ${TARGET_PROJECT} ${hashFlags}`.trim();
  console.log(`   ${cmd}\n`);

  try {
    const output = execSync(cmd, { encoding: 'utf-8', stdio: 'pipe' });
    console.log(output);
    console.log(`✅ ${targetEnv}: import successful!\n`);
  } catch (err: any) {
    console.error(`❌ ${targetEnv}: import failed`);
    if (err.stdout) console.log(err.stdout);
    if (err.stderr) console.error(err.stderr);
    unlinkSync(filteredExportPath);
    process.exit(1);
  }

  unlinkSync(filteredExportPath);
  console.log('🧹 Cleaned up temp files.\nDone.');
  process.exit(0);
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
