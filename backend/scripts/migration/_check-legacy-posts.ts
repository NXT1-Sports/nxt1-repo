import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: resolve(__dirname, '../../.env') });

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const req = createRequire(import.meta.url);
const sa = req(
  '../../../../nxt1-backend/assets/nxt-1-de054-firebase-adminsdk-w01w0-2bab8ae108.json'
);
const app = initializeApp({ credential: cert(sa) }, 'chk-legacy');
const db = getFirestore(app);

// 1. Top-level Posts collection
const topSnap = await db.collection('Posts').limit(5).get();
console.log('\n=== Top-level Posts collection ===');
console.log('Docs found:', topSnap.size);
if (!topSnap.empty) {
  const d = topSnap.docs[0].data();
  console.log('Doc ID:', topSnap.docs[0].id);
  console.log('Fields:', Object.keys(d).sort().join(', '));
  console.log('userId:', d['userId']);
  console.log('type:', d['type']);
}

// 2. Subcollection Users/{uid}/Posts
const userSnap = await db.collection('Users').limit(1).get();
if (!userSnap.empty) {
  const uid = userSnap.docs[0].id;
  const subSnap = await db.collection('Users').doc(uid).collection('Posts').limit(3).get();
  console.log('\n=== Users/{uid}/Posts subcollection ===');
  console.log('User:', uid);
  console.log('Docs found:', subSnap.size);
  if (!subSnap.empty) {
    const d = subSnap.docs[0].data();
    console.log('Doc ID:', subSnap.docs[0].id);
    console.log('Fields:', Object.keys(d).sort().join(', '));
  }
}

process.exit(0);
