#!/usr/bin/env npx tsx
/**
 * Verify team logo migration results.
 *
 * Usage:
 *   npx tsx backend/scripts/migration/verify-team-logos.ts --target=production
 *   npx tsx backend/scripts/migration/verify-team-logos.ts --target=staging
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../.env') });

import { readFileSync } from 'node:fs';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import type { Bucket } from '@google-cloud/storage';

// ─── CLI args ────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const getArg = (name: string) => {
  const found = argv.find((a) => a.startsWith(`--${name}=`));
  return found ? found.slice(`--${name}=`.length) : null;
};
const TARGET: 'staging' | 'production' =
  getArg('target') === 'production' ? 'production' : 'staging';

const SA_MAP = {
  staging: resolve(
    __dirname,
    '../../assets/nxt-1-staging-v2-firebase-adminsdk-fbsvc-0e09aefb3e.json'
  ),
  production: resolve(
    __dirname,
    '../../assets/nxt-1-admin-firebase-adminsdk-9m8cg-3cd10211f8.json'
  ),
};
const BUCKET_MAP = {
  staging: 'nxt-1-staging-v2.firebasestorage.app',
  production: 'nxt-1-v2.firebasestorage.app',
};

const APP_NAME = `verify-team-logos-${TARGET}`;
if (!getApps().find((a) => a.name === APP_NAME)) {
  const sa = JSON.parse(readFileSync(SA_MAP[TARGET], 'utf-8'));
  initializeApp({ credential: cert(sa), storageBucket: BUCKET_MAP[TARGET] }, APP_NAME);
}

const { getApp } = await import('firebase-admin/app');
const app = getApp(APP_NAME);
const db = getFirestore(app);
const bucket: Bucket = getStorage(app).bucket();

console.log('');
console.log('═══════════════════════════════════════════════════════════');
console.log('  Team Logo Migration Verification');
console.log(`  Target: ${TARGET.toUpperCase()} (${BUCKET_MAP[TARGET]})`);
console.log('═══════════════════════════════════════════════════════════');

// ─── 1. Count files still at legacy path ────────────────────────────────────
console.log('\n[1] Checking legacy path Teams/TeamLogos/ ...');
const [legacyFiles] = await bucket.getFiles({ prefix: 'Teams/TeamLogos/' });
const realLegacy = legacyFiles.filter((f) => {
  if (f.name.endsWith('/')) return false;
  const after = f.name.slice('Teams/TeamLogos/'.length);
  return !after.startsWith('ResizeImages/') && !after.includes('/thumbs/');
});
console.log(`  Legacy files remaining : ${realLegacy.length}`);
if (realLegacy.length > 0 && realLegacy.length <= 10) {
  realLegacy.forEach((f) => console.log(`    - ${f.name}`));
} else if (realLegacy.length > 10) {
  realLegacy.slice(0, 5).forEach((f) => console.log(`    - ${f.name}`));
  console.log(`    ... and ${realLegacy.length - 5} more`);
}

// ─── 2. Count files at new path ──────────────────────────────────────────────
console.log('\n[2] Checking new paths Teams/{teamId}/logo/ ...');
const [newFiles] = await bucket.getFiles({ prefix: 'Teams/' });
const logoFiles = newFiles.filter((f) => {
  const parts = f.name.split('/');
  // Must be Teams/{teamId}/logo/{filename}
  return parts.length === 4 && parts[0] === 'Teams' && parts[2] === 'logo' && parts[3] !== '';
});
console.log(`  Files at Teams/{teamId}/logo/ : ${logoFiles.length}`);

// Show unique teamIds
const teamIds = [...new Set(logoFiles.map((f) => f.name.split('/')[1]))];
console.log(`  Unique teams with logo files  : ${teamIds.length}`);
if (teamIds.length <= 15) {
  teamIds.forEach((id) => {
    const count = logoFiles.filter((f) => f.name.split('/')[1] === id).length;
    console.log(`    - ${id} (${count} file${count > 1 ? 's' : ''})`);
  });
} else {
  teamIds.slice(0, 10).forEach((id) => {
    const count = logoFiles.filter((f) => f.name.split('/')[1] === id).length;
    console.log(`    - ${id} (${count} file${count > 1 ? 's' : ''})`);
  });
  console.log(`    ... and ${teamIds.length - 10} more teams`);
}

// ─── 3. Firestore spot-check ─────────────────────────────────────────────────
console.log('\n[3] Firestore Teams docs with updated logoUrl ...');
const BUCKET_NAME = BUCKET_MAP[TARGET];
const newUrlPrefix = `https://firebasestorage.googleapis.com/v0/b/${BUCKET_NAME}/o/Teams%2F`;

// Teams where logoUrl starts with new path pattern (encoded slash)
// We query for logoUrl >= newUrlPrefix and < newUrlPrefix + '\uf8ff'
const snap = await db
  .collection('Teams')
  .where('logoUrl', '>=', newUrlPrefix)
  .where('logoUrl', '<', newUrlPrefix + '\uf8ff')
  .limit(200)
  .get();

const updatedDocs = snap.docs.filter((d) => {
  const url: string = d.data()['logoUrl'] ?? '';
  // Must match Teams/{teamId}/logo/ pattern (encoded as Teams%2F{teamId}%2Flogo%2F)
  return url.includes('%2Flogo%2F');
});
console.log(`  Teams docs with new logoUrl   : ${updatedDocs.size ?? updatedDocs.length}`);

// Sample check: 5 random docs
if (updatedDocs.length > 0) {
  console.log('  Sample (up to 5):');
  updatedDocs.slice(0, 5).forEach((d) => {
    const data = d.data();
    const url: string = data['logoUrl'] ?? '';
    // Decode for readability
    const decoded = decodeURIComponent(url.split('/o/')[1]?.split('?')[0] ?? url);
    console.log(`    teamId=${d.id}`);
    console.log(`      logoUrl path: ${decoded}`);
  });
}

// ─── 4. Cross-check: teamIds with GCS logo but outdated Firestore ─────────────
console.log('\n[4] Cross-check: teams with logo file but old Firestore logoUrl ...');
let mismatch = 0;
const sampleMismatch: string[] = [];
for (const teamId of teamIds.slice(0, 50)) {
  const docSnap = await db.collection('Teams').doc(teamId).get();
  if (!docSnap.exists) continue;
  const logoUrl: string = docSnap.data()?.['logoUrl'] ?? '';
  if (!logoUrl.includes('%2Flogo%2F') && !logoUrl.includes('/logo/')) {
    mismatch++;
    if (sampleMismatch.length < 5) sampleMismatch.push(teamId);
  }
}
if (mismatch === 0) {
  console.log('  ✓  All spot-checked teams have updated Firestore logoUrl');
} else {
  console.log(
    `  ⚠  ${mismatch} team(s) (of first 50 checked) have logo file but old Firestore url`
  );
  sampleMismatch.forEach((id) => console.log(`    - teamId=${id}`));
}

// ─── Summary ─────────────────────────────────────────────────────────────────
console.log('');
console.log('═══════════════════════════════════════════════════════════');
console.log('  Result');
console.log('═══════════════════════════════════════════════════════════');
console.log(`  Legacy files left        : ${realLegacy.length}`);
console.log(`  Files at new path        : ${logoFiles.length}`);
console.log(`  Teams updated in FS      : ${updatedDocs.length}`);
console.log(`  Firestore mismatches     : ${mismatch} (of first 50 checked)`);
console.log('═══════════════════════════════════════════════════════════');
console.log('');

process.exit(0);
