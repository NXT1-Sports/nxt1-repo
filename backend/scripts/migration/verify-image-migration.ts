#!/usr/bin/env tsx
/**
 * Verify Image Migration
 * Check that profile images were copied and URLs updated correctly
 *
 * Usage:
 *   cd /Users/sotatek/Downloads/Source_Code/NXT1/nxt1-repo/backend
 *   npx tsx scripts/migration/verify-image-migration.ts
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';
import fetch from 'node-fetch';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../.env') });

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

// Initialize Staging Firebase
const stagingApp = initializeApp(
  {
    credential: cert({
      projectId: process.env.STAGING_FIREBASE_PROJECT_ID,
      clientEmail: process.env.STAGING_FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.STAGING_FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
    storageBucket: process.env.STAGING_FIREBASE_STORAGE_BUCKET,
  },
  'staging'
);

const stagingDb = getFirestore(stagingApp);
const stagingBucket = getStorage(stagingApp).bucket();

async function verifyImageMigration() {
  console.log('\n🔍 VERIFYING IMAGE MIGRATION\n');

  // Load target users
  const uidMappingPath = resolve(__dirname, './user-uid-mapping.json');
  const uidMapping = JSON.parse(readFileSync(uidMappingPath, 'utf-8'));
  const targetUsers = uidMapping.results.filter((r: any) => r.uid);

  console.log(`📋 Checking ${targetUsers.length} users...\n`);

  let usersWithImages = 0;
  let usersWithoutImages = 0;
  let totalImagesChecked = 0;
  let totalImagesWorking = 0;
  let totalImagesBroken = 0;

  for (const target of targetUsers) {
    const uid = target.uid;
    const email = target.email;

    try {
      console.log(`\n📸 ${email}`);
      console.log(`   UID: ${uid}`);

      // Get user from staging Firestore
      const userDoc = await stagingDb.collection('users').doc(uid).get();

      if (!userDoc.exists) {
        console.log(`   ⚠️  User not found in staging Firestore`);
        continue;
      }

      const userData = userDoc.data()!;
      const profileImgs = userData.profileImgs || [];

      if (profileImgs.length === 0) {
        console.log(`   ℹ️  No profile images`);
        usersWithoutImages++;
        continue;
      }

      console.log(`   Found ${profileImgs.length} image(s) in Firestore\n`);
      usersWithImages++;

      // Check each image
      for (let i = 0; i < profileImgs.length; i++) {
        const imgUrl = profileImgs[i];
        totalImagesChecked++;

        // Check if URL points to staging bucket
        const isStagingBucket = imgUrl.includes(
          process.env.STAGING_FIREBASE_STORAGE_BUCKET || 'nxt-1-staging-v2'
        );
        const isLegacyBucket = imgUrl.includes('nxt-1-de054');

        console.log(`   Image ${i + 1}:`);
        console.log(`      URL: ${imgUrl.substring(0, 80)}...`);
        console.log(
          `      Bucket: ${isStagingBucket ? '✅ STAGING' : isLegacyBucket ? '⚠️  LEGACY' : '❓ UNKNOWN'}`
        );

        // Try to access the image
        try {
          const response = await fetch(imgUrl, { method: 'HEAD' });

          if (response.ok) {
            console.log(`      Status: ✅ ${response.status} - Image accessible`);
            totalImagesWorking++;
          } else {
            console.log(`      Status: ❌ ${response.status} - Image not accessible`);
            totalImagesBroken++;
          }
        } catch (error: any) {
          console.log(`      Status: ❌ Network error - ${error.message}`);
          totalImagesBroken++;
        }
      }
    } catch (error: any) {
      console.error(`   ❌ Error: ${error.message}`);
    }
  }

  console.log('\n' + '━'.repeat(70));
  console.log('📊 VERIFICATION SUMMARY');
  console.log('━'.repeat(70));
  console.log(`\n👥 Users:`);
  console.log(`   ✅ With images: ${usersWithImages}`);
  console.log(`   ℹ️  Without images: ${usersWithoutImages}`);
  console.log(`   📝 Total: ${targetUsers.length}`);
  console.log(`\n🖼️  Images:`);
  console.log(`   ✅ Working: ${totalImagesWorking}/${totalImagesChecked}`);
  console.log(`   ❌ Broken: ${totalImagesBroken}/${totalImagesChecked}`);
  console.log('');

  if (totalImagesBroken > 0) {
    console.log('⚠️  Some images are not accessible. Check:');
    console.log('   1. Storage bucket permissions');
    console.log('   2. CORS configuration');
    console.log('   3. File paths in gsutil');
    console.log('');
  } else if (totalImagesChecked > 0) {
    console.log('✅ All images verified and working!');
    console.log('');
  }

  console.log('💡 Manual verification:');
  console.log('   1. Login to staging app with migrated user');
  console.log('   2. Check profile images display correctly');
  console.log('   3. Verify URLs point to staging bucket\n');
}

verifyImageMigration()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n❌ Fatal error:', err);
    process.exit(1);
  });
