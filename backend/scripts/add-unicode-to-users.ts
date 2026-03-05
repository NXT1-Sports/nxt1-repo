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
  'add-unicode-' + Date.now()
);

const db = getFirestore(app);

// Generate unique 6-digit unicode
async function generateUniqueUnicode(): Promise<string> {
  let unicode: string;
  let isUnique = false;

  while (!isUnique) {
    unicode = Math.floor(100000 + Math.random() * 900000).toString();

    const existing = await db.collection('Users').where('unicode', '==', unicode).limit(1).get();

    if (existing.empty) {
      isUnique = true;
      return unicode;
    }
  }

  throw new Error('Failed to generate unique unicode');
}

async function addUnicodeToUsers() {
  const userIds = ['05naPoH3KWZftqsdZr7IVwxLHqo2', '6kjm7AJieFNWYkmTp2HOmYp4r8E3'];

  console.log('Adding unicode to users...\n');

  for (const uid of userIds) {
    const userRef = db.collection('Users').doc(uid);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      console.log(`❌ User not found: ${uid}\n`);
      continue;
    }

    const data = userDoc.data();

    // Check if already has unicode
    if (data?.unicode) {
      console.log(`✓ ${data.name || uid} already has unicode: ${data.unicode}\n`);
      continue;
    }

    // Generate and add unicode
    const unicode = await generateUniqueUnicode();
    await userRef.update({ unicode });

    console.log(`✓ Added unicode to ${data?.name || uid}`);
    console.log(`  Unicode: ${unicode}`);
    console.log(`  Profile URL: /profile/${unicode}\n`);
  }

  console.log('✅ Done!');
}

addUnicodeToUsers()
  .then(() => process.exit(0))
  .catch(console.error);
