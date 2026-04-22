#!/usr/bin/env npx tsx
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: resolve(__dirname, '../../.env') });

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const saPath = resolve(
  __dirname,
  '../../../../nxt1-backend/assets/nxt-1-de054-firebase-adminsdk-w01w0-2bab8ae108.json'
);
const sa = JSON.parse(readFileSync(saPath, 'utf-8'));
const app = initializeApp({ credential: cert(sa) }, 'count');
const db = getFirestore(app);

const totalSnap = await db.collection('Posts').count().get();
const videoSnap = await db
  .collection('Posts')
  .where('type', 'in', ['video', 'highlight'])
  .count()
  .get();

console.log('Total Posts (legacy) :', totalSnap.data().count);
console.log('Video/Highlight posts:', videoSnap.data().count);
console.log('Image/Other posts    :', totalSnap.data().count - videoSnap.data().count);
