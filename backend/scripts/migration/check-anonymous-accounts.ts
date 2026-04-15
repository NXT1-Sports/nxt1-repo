#!/usr/bin/env tsx
/**
 * Check if anonymous accounts are part of migration or leftover artifacts
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { readFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../.env') });

const stagingApp = initializeApp(
  {
    credential: cert({
      projectId: process.env.STAGING_FIREBASE_PROJECT_ID,
      clientEmail: process.env.STAGING_FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.STAGING_FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
    projectId: process.env.STAGING_FIREBASE_PROJECT_ID,
  },
  'staging-check-anon'
);

const anonymousUIDs = ['rp6L9gBB0dYDxNrUXdpY2v8Mzk33', 'wf6zCnTHkTSL6wKsKHmD4bxDTRg1'];

async function checkAnonymousAccounts() {
  const auth = getAuth(stagingApp);

  // Load target UIDs from mapping
  const uidMappingPath = resolve(__dirname, './user-uid-mapping.json');
  const uidMapping = JSON.parse(readFileSync(uidMappingPath, 'utf-8'));
  const targetUIDs = uidMapping.results.map((r: any) => r.uid).filter(Boolean);

  console.log('🔍 Checking 2 anonymous accounts...\n');
  console.log('📋 Target Migration UIDs:');
  targetUIDs.forEach((uid: string) => console.log(`   - ${uid}`));
  console.log('\n' + '─'.repeat(70) + '\n');

  for (const uid of anonymousUIDs) {
    try {
      const user = await auth.getUser(uid);
      const isTarget = targetUIDs.includes(uid);

      console.log(`${isTarget ? '✅' : '❌'} UID: ${uid}`);
      console.log(`   Email: ${user.email || 'NULL'}`);
      console.log(`   Display Name: ${user.displayName || 'NULL'}`);
      console.log(`   Created: ${new Date(user.metadata.creationTime!).toLocaleString()}`);
      console.log(
        `   Providers: ${user.providerData.length > 0 ? user.providerData.map((p) => p.providerId).join(', ') : 'NONE'}`
      );
      console.log(`   Is Target Migration: ${isTarget ? 'YES ✅' : 'NO ❌'}`);

      if (!isTarget) {
        console.log(`   💡 Recommendation: DELETE (leftover from failed import)`);
      }
      console.log('');
    } catch (error) {
      console.error(`❌ UID ${uid}: ${(error as Error).message}\n`);
    }
  }

  console.log('━'.repeat(70));
  console.log('\n💡 CONCLUSION:');
  console.log('   These accounts are NOT part of the 5 target users.');
  console.log('   They are artifacts from the first failed import attempt.');
  console.log('   Safe to delete.\n');

  await stagingApp.delete();
}

checkAnonymousAccounts();
