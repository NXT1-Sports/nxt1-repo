/**
 * Deletes Teams NOT in the unicode whitelist, and Organizations
 * not linked to any whitelisted team.
 *
 * Usage (run from backend/ directory):
 *   npx tsx scripts/delete-teams-and-orgs-by-unicode.ts                       # dry-run (production)
 *   npx tsx scripts/delete-teams-and-orgs-by-unicode.ts --target=staging      # dry-run (staging)
 *   npx tsx scripts/delete-teams-and-orgs-by-unicode.ts --commit              # delete (production)
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import type { DocumentReference } from 'firebase-admin/firestore';

const __dirname = dirname(fileURLToPath(import.meta.url));

const ALLOWED_UNICODES = new Set([
  '08397505',
  '14056669',
  '78433825',
  '27037384',
  '16930823',
  '16565627',
  '16833875',
  '85289271',
  '22659601',
  '30001369',
  '47078623',
  '86664157',
  '24585571',
  '23526795',
  '25488671',
  '61725236',
  '83793357',
  '96645206',
  '98013715',
  '23965033',
  '17229809',
  '89975589',
  '93110746',
  '64555145',
  '80763255',
  '37349591',
  '65281950',
  '73051132',
  '86819206',
  '88946357',
  '16749455',
]);

const args = process.argv.slice(2);
const dryRun = !args.includes('--commit');
const target = args.includes('--target=staging') ? 'staging' : 'production';
const BATCH_SIZE = 400;

// Load service account
const SA_PATHS: Record<string, string> = {
  production: resolve(__dirname, '../assets/nxt-1-admin-firebase-adminsdk-9m8cg-3cd10211f8.json'),
  staging: resolve(__dirname, '../assets/nxt-1-staging-v2-firebase-adminsdk-fbsvc-0e09aefb3e.json'),
};

const saPath = SA_PATHS[target];
const sa = JSON.parse(readFileSync(saPath, 'utf-8'));
const app = initializeApp({ credential: cert(sa) }, 'cleanup');
const db = getFirestore(app);

async function deleteInBatches(refs: DocumentReference[], label: string): Promise<void> {
  let deleted = 0;
  for (let i = 0; i < refs.length; i += BATCH_SIZE) {
    const chunk = refs.slice(i, i + BATCH_SIZE);
    const batch = db.batch();
    for (const ref of chunk) batch.delete(ref);
    await batch.commit();
    deleted += chunk.length;
    console.log(`  ${label}: ${deleted}/${refs.length} deleted`);
  }
}

async function main(): Promise<void> {
  console.log('');
  console.log('===========================================================');
  console.log('  Delete Teams & Organizations - unicode whitelist cleanup');
  console.log(`  Target: ${target.toUpperCase()}`);
  console.log(`  Mode  : ${dryRun ? 'DRY RUN (no writes)' : 'COMMIT MODE - data will be deleted'}`);
  console.log(`  Allowed unicodes: ${ALLOWED_UNICODES.size}`);
  console.log('===========================================================');
  console.log('');

  console.log('Fetching all Teams...');
  const teamsSnapshot = await db.collection('Teams').get();
  console.log(`  Total teams in Firestore: ${teamsSnapshot.size}`);

  const teamsToDelete: DocumentReference[] = [];
  const keepOrgIds = new Set<string>();

  for (const doc of teamsSnapshot.docs) {
    const data = doc.data();
    const unicode: string | undefined = data['unicode'];
    const orgId: string | undefined = data['organizationId'];

    if (unicode && ALLOWED_UNICODES.has(unicode)) {
      if (orgId) keepOrgIds.add(orgId);
    } else {
      teamsToDelete.push(doc.ref);
      console.log(
        `  [${dryRun ? 'DRY' : 'DEL'}] team ${doc.id} | unicode=${unicode ?? '(none)'} | ${data['teamName'] ?? ''}`
      );
    }
  }

  console.log('');
  console.log(`  Teams to keep   : ${teamsSnapshot.size - teamsToDelete.length}`);
  console.log(`  Teams to delete : ${teamsToDelete.length}`);
  console.log(`  Org IDs to keep : ${keepOrgIds.size}`);
  console.log('');

  console.log('Fetching all Organizations...');
  const orgsSnapshot = await db.collection('Organizations').get();
  console.log(`  Total organizations in Firestore: ${orgsSnapshot.size}`);

  const orgsToDelete: DocumentReference[] = [];

  for (const doc of orgsSnapshot.docs) {
    if (!keepOrgIds.has(doc.id)) {
      orgsToDelete.push(doc.ref);
      console.log(`  [${dryRun ? 'DRY' : 'DEL'}] org  ${doc.id} | ${doc.data()['name'] ?? ''}`);
    }
  }

  console.log('');
  console.log(`  Organizations to keep   : ${orgsSnapshot.size - orgsToDelete.length}`);
  console.log(`  Organizations to delete : ${orgsToDelete.length}`);
  console.log('');

  if (dryRun) {
    console.log('DRY RUN complete. Re-run with --commit to apply.');
    return;
  }

  console.log('Deleting teams...');
  await deleteInBatches(teamsToDelete, 'Teams');

  console.log('Deleting organizations...');
  await deleteInBatches(orgsToDelete, 'Organizations');

  console.log('');
  console.log(
    `Done. Deleted ${teamsToDelete.length} teams and ${orgsToDelete.length} organizations.`
  );
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
