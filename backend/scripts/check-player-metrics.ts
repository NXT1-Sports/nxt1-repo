/**
 * One-time check: Does PlayerMetrics root collection exist in production?
 * And do legacy metrics subcollections still exist?
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { initializeApp, cert, type ServiceAccount } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const __dirname = dirname(fileURLToPath(import.meta.url));

const sa = JSON.parse(
  readFileSync(
    resolve(__dirname, '../assets/nxt-1-admin-firebase-adminsdk-9m8cg-3cd10211f8.json'),
    'utf-8'
  )
) as ServiceAccount;
initializeApp({ credential: cert(sa) });
const db = getFirestore();

async function main() {
  console.log('Project: nxt-1-v2 (production)\n');

  // 1. Check PlayerMetrics root collection
  const pmSnap = await db.collection('PlayerMetrics').limit(5).get();
  console.log('=== PlayerMetrics (root collection) ===');
  console.log('Exists / has docs:', !pmSnap.empty);
  console.log('Docs found (limit 5):', pmSnap.size);
  if (!pmSnap.empty) {
    for (const doc of pmSnap.docs) {
      console.log(' -', doc.id, '| keys:', Object.keys(doc.data()).join(', '));
    }
  }

  // 2. Check legacy subcollection Users/{uid}/sports/{sid}/metrics
  console.log('\n=== Legacy metrics subcollections (sample 10 users) ===');
  const usersSnap = await db.collection('Users').limit(10).get();
  let usersWithLegacy = 0;
  let totalLegacyDocs = 0;

  for (const userDoc of usersSnap.docs) {
    const sportsSnap = await db
      .collection('Users')
      .doc(userDoc.id)
      .collection('sports')
      .limit(10)
      .get();

    for (const sportDoc of sportsSnap.docs) {
      const metricsSnap = await db
        .collection('Users')
        .doc(userDoc.id)
        .collection('sports')
        .doc(sportDoc.id)
        .collection('metrics')
        .limit(10)
        .get();

      if (!metricsSnap.empty) {
        usersWithLegacy++;
        totalLegacyDocs += metricsSnap.size;
        console.log(
          ` - User ${userDoc.id} / sport ${sportDoc.id}: ${metricsSnap.size} metric docs`
        );
      }
    }
  }

  console.log(`\nUsers with legacy subcollection metrics: ${usersWithLegacy}`);
  console.log(`Total legacy metric docs found: ${totalLegacyDocs}`);

  console.log('\n=== Conclusion ===');
  if (pmSnap.empty && totalLegacyDocs === 0) {
    console.log('No metrics data at all — neither migrated nor legacy.');
  } else if (pmSnap.empty && totalLegacyDocs > 0) {
    console.log('Migration NOT run: legacy subcollections exist but PlayerMetrics is EMPTY.');
  } else if (!pmSnap.empty && totalLegacyDocs > 0) {
    console.log('Migration PARTIAL: PlayerMetrics exists AND legacy subcollections still exist.');
  } else {
    console.log('Migration complete: PlayerMetrics exists, no legacy subcollections found.');
  }
}

main().catch(console.error);
