/**
 * @fileoverview Phase 2, Step 6: Filter Auth Export
 *
 * This script filters the exported Firebase Auth users (from Firebase CLI)
 * to only include our target users.
 *
 * Prerequisites:
 *   1. Run Firebase CLI export first:
 *      firebase auth:export auth-export.json --project nxt-1-de054 --format=json
 *
 *   2. Then run this script:
 *      cd /Users/sotatek/Downloads/Source_Code/NXT1/nxt1-repo/backend
 *      npx tsx scripts/migration/filter-auth-export.ts
 *
 * Output:
 *   - auth-export-filtered.json (ready for import to staging-v2)
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Load target users ────────────────────────────────────────────────────────
const targetUsersPath = resolve(__dirname, './target-users.json');
const targetUsers = JSON.parse(readFileSync(targetUsersPath, 'utf-8'));
const targetEmails: string[] = targetUsers.targetEmails;

// Load UID mapping from check-users-exist.ts output
const uidMappingPath = resolve(__dirname, './user-uid-mapping.json');
const uidMapping = JSON.parse(readFileSync(uidMappingPath, 'utf-8'));
const targetUids = uidMapping.results
  .filter((r: any) => r.uid && r.authExists)
  .map((r: any) => r.uid);

console.log('\n🎯 Target users for auth migration:');
console.log(`   Emails: ${targetEmails.length}`);
console.log(`   UIDs with Auth: ${targetUids.length}`);
targetUids.forEach((uid: string, i: number) => {
  const user = uidMapping.results.find((r: any) => r.uid === uid);
  console.log(`   ${i + 1}. ${user.email} → ${uid}`);
});

// ─── Load Firebase CLI auth export ───────────────────────────────────────────
const authExportPath = resolve(__dirname, './auth-export.json');

let authExport: any;
try {
  authExport = JSON.parse(readFileSync(authExportPath, 'utf-8'));
  console.log(`\n📥 Loaded auth export: ${authExport.users?.length || 0} total users`);
} catch (error) {
  console.error('\n❌ Error: auth-export.json not found!');
  console.error('   Please run Firebase CLI export first:');
  console.error('   firebase auth:export auth-export.json --project nxt-1-de054 --format=json');
  process.exit(1);
}

// ─── Filter by target UIDs ────────────────────────────────────────────────────
const filteredUsers = authExport.users.filter((user: any) => {
  return targetUids.includes(user.localId);
});

console.log(`\n🔍 Filtering...`);
console.log(`   Found: ${filteredUsers.length}/${targetUids.length} target users in export`);

if (filteredUsers.length === 0) {
  console.error('\n❌ No matching users found in auth export!');
  console.error('   Check if UIDs match between Firestore and Auth export.');
  process.exit(1);
}

// Log filtered users
console.log('\n✅ Filtered users:');
filteredUsers.forEach((user: any, i: number) => {
  const mappedUser = uidMapping.results.find((r: any) => r.uid === user.localId);
  console.log(`   ${i + 1}. ${user.email || mappedUser?.email || 'N/A'} (${user.localId})`);
  if (user.passwordHash) {
    console.log(`      Password hash: ✅ Present (will be preserved)`);
  }
  console.log(
    `      Providers: ${user.providerUserInfo?.map((p: any) => p.providerId).join(', ') || 'password'}`
  );
});

// ─── Write filtered export ────────────────────────────────────────────────────
const filteredExport = {
  users: filteredUsers,
};

const outputPath = resolve(__dirname, './auth-export-filtered.json');
writeFileSync(outputPath, JSON.stringify(filteredExport, null, 2));

console.log(`\n💾 Filtered export saved to: auth-export-filtered.json`);
console.log(`\n✅ Ready for import! Run:`);
console.log(`   firebase auth:import auth-export-filtered.json \\`);
console.log(`     --project nxt-1-staging-v2 \\`);
console.log(`     --hash-algo=SCRYPT \\`);
console.log(`     --hash-key=<key from export>`);
console.log(`\n   (The hash-key will be in the auth-export.json file)`);
