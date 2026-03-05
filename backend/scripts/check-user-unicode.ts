import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env') });

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const projectId = process.env['STAGING_FIREBASE_PROJECT_ID']!;
const clientEmail = process.env['STAGING_FIREBASE_CLIENT_EMAIL']!;
const privateKey = process.env['STAGING_FIREBASE_PRIVATE_KEY']!.replace(/\\n/g, '\n');

const app = initializeApp(
  {
    credential: cert({ projectId, clientEmail, privateKey }),
  },
  'check-unicode-' + Date.now()
);

const db = getFirestore(app);

async function checkUsers() {
  const userIds = ['05naPoH3KWZftqsdZr7IVwxLHqo2', '6kjm7AJieFNWYkmTp2HOmYp4r8E3'];

  console.log('Checking users for unicode field...\n');

  for (const uid of userIds) {
    const userDoc = await db.collection('Users').doc(uid).get();
    if (userDoc.exists) {
      const data = userDoc.data();
      console.log(`👤 User: ${data?.name || uid}`);
      console.log(`   Unicode: ${data?.unicode || '❌ MISSING'}`);
      console.log(`   Username: ${data?.username || '❌ MISSING'}`);
      console.log(`   ID: ${uid}\n`);
    } else {
      console.log(`❌ User not found: ${uid}\n`);
    }
  }
}

checkUsers()
  .then(() => process.exit(0))
  .catch(console.error);
