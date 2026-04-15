/**
 * @fileoverview Phase 1 (Production): Filter Auth Export for nxt-1-v2
 *
 * Reads the full Firebase Auth export (auth-export.json), removes any user
 * whose email contains "test" or "demo" (case-insensitive), and writes the
 * cleaned export to auth-export-filtered-prod.json — ready to import into
 * the production project nxt-1-v2.
 *
 * Prerequisites:
 *   1. Export ALL users from legacy nxt-1-de054:
 *      firebase auth:export auth-export.json --project nxt-1-de054 --format=json
 *
 *   2. Run this script:
 *      cd /Users/sotatek/Downloads/Source_Code/NXT1/nxt1-repo/backend
 *      npx tsx scripts/migration/filter-auth-export-prod.ts
 *      npx tsx scripts/migration/filter-auth-export-prod.ts --dry-run
 *
 *   3. Import to production:
 *      firebase auth:import auth-export-filtered-prod.json \
 *        --project nxt-1-v2 \
 *        --hash-algo=SCRYPT \
 *        --hash-key=<base64-key-from-auth-export.json>
 *
 * Output:
 *   - auth-export-filtered-prod.json
 *   - filter-report-prod.json (summary)
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const isDryRun = process.argv.includes('--dry-run');

// ─── Filter Logic ─────────────────────────────────────────────────────────────

function isTestOrDemoEmail(email: string): boolean {
  const lower = email.toLowerCase();
  return lower.includes('test') || lower.includes('demo');
}

// ─── Load auth export ─────────────────────────────────────────────────────────

const authExportPath = resolve(__dirname, './auth-export.json');

let authExport: any;
try {
  authExport = JSON.parse(readFileSync(authExportPath, 'utf-8'));
} catch {
  console.error('\n❌ auth-export.json not found! Export first:');
  console.error('   firebase auth:export auth-export.json --project nxt-1-de054 --format=json');
  process.exit(1);
}

const allUsers: any[] = authExport.users ?? [];
console.log(`\n📥 Loaded auth-export.json: ${allUsers.length} total users`);

// ─── Filter ───────────────────────────────────────────────────────────────────

const excluded: any[] = [];
const included: any[] = [];

for (const user of allUsers) {
  const email: string = user.email ?? user.providerUserInfo?.[0]?.email ?? '';
  if (!email || isTestOrDemoEmail(email)) {
    excluded.push({ localId: user.localId, email: email || '(no email)' });
  } else {
    included.push(user);
  }
}

console.log(`\n🔍 Filter results:`);
console.log(`   ✅ Included (clean):  ${included.length}`);
console.log(`   ❌ Excluded (test/demo + no-email): ${excluded.length}`);

// ─── Show excluded samples ────────────────────────────────────────────────────

console.log(`\n🗑️  Excluded users (first 20):`);
excluded.slice(0, 20).forEach((u, i) => {
  console.log(`   ${i + 1}. ${u.email} (${u.localId})`);
});
if (excluded.length > 20) {
  console.log(`   ... and ${excluded.length - 20} more (see filter-report-prod.json)`);
}

// ─── Hash algo info ───────────────────────────────────────────────────────────

const hashAlgo = authExport.hashAlgorithm;
const hashKey = authExport.base64EncodedHashKey;
const saltSeparator = authExport.base64EncodedSaltSeparator;

if (hashAlgo) {
  console.log(`\n🔑 Hash algorithm: ${hashAlgo}`);
  if (hashKey) {
    console.log(`   Base64 key: ${hashKey}`);
    console.log(`\n   ℹ️  Import command:`);
    console.log(`   firebase auth:import auth-export-filtered-prod.json \\`);
    console.log(`     --project nxt-1-v2 \\`);
    console.log(`     --hash-algo=SCRYPT \\`);
    console.log(`     --hash-key=${hashKey} \\`);
    if (saltSeparator) {
      console.log(`     --salt-separator=${saltSeparator}`);
    }
  }
}

if (isDryRun) {
  console.log(`\n⚠️  DRY RUN — no files written.`);
  process.exit(0);
}

// ─── Write filtered export ────────────────────────────────────────────────────

const filteredExport = {
  kind: authExport.kind,
  hashAlgorithm: authExport.hashAlgorithm,
  base64EncodedHashKey: authExport.base64EncodedHashKey,
  base64EncodedSaltSeparator: authExport.base64EncodedSaltSeparator,
  rounds: authExport.rounds,
  memCost: authExport.memCost,
  users: included,
};

const outputPath = resolve(__dirname, './auth-export-filtered-prod.json');
writeFileSync(outputPath, JSON.stringify(filteredExport, null, 2));
console.log(`\n💾 Saved: auth-export-filtered-prod.json (${included.length} users)`);

// ─── Write report ─────────────────────────────────────────────────────────────

const report = {
  timestamp: new Date().toISOString(),
  sourceFile: 'auth-export.json',
  outputFile: 'auth-export-filtered-prod.json',
  targetProject: 'nxt-1-v2',
  totalUsersInExport: allUsers.length,
  includedUsers: included.length,
  excludedUsers: excluded.length,
  excludedList: excluded,
};

const reportPath = resolve(__dirname, './filter-report-prod.json');
writeFileSync(reportPath, JSON.stringify(report, null, 2));
console.log(`📄 Report:  filter-report-prod.json`);
console.log(`\n✅ Done! Next step: import to nxt-1-v2 using the command above.`);
