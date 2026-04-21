/**
 * Inspect PlayerMetrics docs on staging to determine origin:
 * - Created by migrate-metrics-to-root.ts (legacy subcol migration)?
 * - Created by write_combine_metrics Agent X tool (live user sync)?
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { initializeApp, cert, type ServiceAccount } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const __dirname = dirname(fileURLToPath(import.meta.url));

const sa = JSON.parse(
  readFileSync(
    resolve(__dirname, '../assets/nxt-1-staging-v2-firebase-adminsdk-fbsvc-0e09aefb3e.json'),
    'utf-8'
  )
) as ServiceAccount;
initializeApp({ credential: cert(sa) });
const db = getFirestore();

async function main() {
  console.log('Project: nxt-1-staging-v2\n');

  // 1. Count total PlayerMetrics docs
  const PAGE_SIZE = 200;
  let total = 0;
  let lastDoc: FirebaseFirestore.QueryDocumentSnapshot | undefined;

  // Track origin signals
  const origins: Record<string, number> = {};
  const providers: Record<string, number> = {};
  const sampleDocs: {
    id: string;
    keys: string[];
    provider?: string;
    source?: string;
    migrationId?: string;
  }[] = [];

  console.log('Scanning PlayerMetrics...');
  while (true) {
    let q = db.collection('PlayerMetrics').limit(PAGE_SIZE) as FirebaseFirestore.Query;
    if (lastDoc) q = q.startAfter(lastDoc);
    const snap = await q.get();
    if (snap.empty) break;

    for (const doc of snap.docs) {
      total++;
      const data = doc.data();

      // Signals from migration script: sets 'provider' = 'legacy_migration', 'migrationId'
      const provider = String(data['provider'] ?? data['source'] ?? 'unknown');
      providers[provider] = (providers[provider] ?? 0) + 1;

      // migrationId field is added by migrate-metrics-to-root.ts
      const hasMigrationId = 'migrationId' in data;
      const hasMigrationSource = provider === 'legacy_migration';
      const origin =
        hasMigrationId || hasMigrationSource ? 'migration_script' : 'agent_x_or_manual';
      origins[origin] = (origins[origin] ?? 0) + 1;

      if (sampleDocs.length < 10) {
        sampleDocs.push({
          id: doc.id,
          keys: Object.keys(data),
          provider,
          source: data['source'] as string | undefined,
          migrationId: data['migrationId'] as string | undefined,
        });
      }
    }

    lastDoc = snap.docs[snap.docs.length - 1];
    if (snap.size < PAGE_SIZE) break;
  }

  console.log(`\n=== PlayerMetrics total: ${total} docs ===\n`);

  console.log('--- Origin breakdown ---');
  for (const [k, v] of Object.entries(origins)) {
    console.log(` ${k}: ${v}`);
  }

  console.log('\n--- Provider/source field values ---');
  for (const [k, v] of Object.entries(providers)) {
    console.log(` "${k}": ${v}`);
  }

  console.log('\n--- Sample docs (first 10) ---');
  for (const d of sampleDocs) {
    console.log(` ID: ${d.id}`);
    console.log(`   provider: ${d.provider} | source: ${d.source} | migrationId: ${d.migrationId}`);
    console.log(`   keys: [${d.keys.join(', ')}]`);
  }

  // 2. Check legacy subcollections still exist?
  console.log('\n=== Legacy metrics subcollections (sample 20 users) ===');
  const usersSnap = await db.collection('Users').limit(20).get();
  let usersWithLegacy = 0;
  for (const userDoc of usersSnap.docs) {
    const sportsSnap = await db
      .collection('Users')
      .doc(userDoc.id)
      .collection('sports')
      .limit(5)
      .get();
    for (const sportDoc of sportsSnap.docs) {
      const mSnap = await db
        .collection('Users')
        .doc(userDoc.id)
        .collection('sports')
        .doc(sportDoc.id)
        .collection('metrics')
        .limit(1)
        .get();
      if (!mSnap.empty) {
        usersWithLegacy++;
        console.log(` - User ${userDoc.id} / sport ${sportDoc.id}: legacy metrics found`);
      }
    }
  }
  if (usersWithLegacy === 0) console.log(' None found in sample.');

  console.log('\n=== Conclusion ===');
  if (total === 0) {
    console.log('No PlayerMetrics data at all.');
  } else {
    const migCount = origins['migration_script'] ?? 0;
    const agentCount = origins['agent_x_or_manual'] ?? 0;
    if (migCount > 0 && agentCount === 0) {
      console.log('ALL docs appear to be from migration script.');
    } else if (agentCount > 0 && migCount === 0) {
      console.log(
        'ALL docs appear to be from Agent X / live user updates (NOT from migration script).'
      );
    } else {
      console.log(`MIXED: ${migCount} from migration, ${agentCount} from Agent X / live.`);
    }
  }
}

main().catch(console.error);
