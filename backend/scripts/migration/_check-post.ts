import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(import.meta.dirname, '../../.env') });

import { initializeApp } from 'firebase-admin/app';
import { cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const app = initializeApp(
  {
    credential: cert({
      projectId: process.env.PRODUCTION_FIREBASE_PROJECT_ID,
      clientEmail: process.env.PRODUCTION_FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.PRODUCTION_FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  },
  'check-' + Date.now()
);

const db = getFirestore(app);
const uid = 'spv7hCTJAhVntE4hWynqaVFp2a12';
// Posts are written to top-level Posts collection with userId field
const snap = await db.collection('Posts').where('userId', '==', uid).limit(6).get();

for (const doc of snap.docs) {
  const d = doc.data();
  const isVideo = d.type === 'video' || !!d.cloudflareVideoId;
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`Post: ${doc.id}  [${isVideo ? '📹 VIDEO' : '🖼 IMAGE'}]`);
  console.log('═'.repeat(70));
  for (const k of Object.keys(d).sort()) {
    const v = d[k];
    let str: string;
    if (v && typeof v === 'object' && 'toDate' in v) {
      str = v.toDate().toISOString();
    } else if (typeof v === 'object' && v !== null) {
      str = JSON.stringify(v);
    } else {
      str = String(v);
    }
    if (str.length > 150) str = str.substring(0, 147) + '...';
    console.log(`  ${k.padEnd(32)}: ${str}`);
  }
}

process.exit(0);
