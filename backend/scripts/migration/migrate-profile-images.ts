#!/usr/bin/env tsx
/**
 * Phase 4: Profile Images Migration
 * Copy user profile images from legacy Storage to staging-v2 and update Firestore URLs
 *
 * Usage:
 *   cd /Users/sotatek/Downloads/Source_Code/NXT1/nxt1-repo/backend
 *   npx tsx scripts/migration/migrate-profile-images.ts --dry-run
 *   npx tsx scripts/migration/migrate-profile-images.ts --apply
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../.env') });

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

// Initialize Legacy Firebase (for Firestore read)
const legacyApp = initializeApp(
  {
    credential: cert({
      projectId: process.env.LEGACY_FIREBASE_PROJECT_ID,
      clientEmail: process.env.LEGACY_FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.LEGACY_FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
    storageBucket: process.env.LEGACY_FIREBASE_STORAGE_BUCKET,
  },
  'legacy'
);

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

const legacyDb = getFirestore(legacyApp);
const stagingDb = getFirestore(stagingApp);
const stagingBucket = getStorage(stagingApp).bucket();

interface ImageInfo {
  originalUrl: string;
  path: string;
  newUrl?: string;
}

async function migrateImages() {
  const isDryRun = process.argv.includes('--dry-run');
  const mode = isDryRun ? '🔍 DRY-RUN' : '🔥 APPLY';

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`🖼️  PHASE 4: PROFILE IMAGES MIGRATION - ${mode}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Load target users
  const uidMappingPath = resolve(__dirname, './user-uid-mapping.json');
  const uidMapping = JSON.parse(readFileSync(uidMappingPath, 'utf-8'));
  const targetUsers = uidMapping.results.filter((r: any) => r.uid);

  console.log(`📋 Target users: ${targetUsers.length}\n`);

  let successCount = 0;
  let failCount = 0;
  let noImageCount = 0;
  let totalImagesCopied = 0;

  for (const target of targetUsers) {
    const uid = target.uid;
    const email = target.email;

    try {
      console.log(`\n📸 Processing: ${email}`);
      console.log(`   UID: ${uid}`);

      // Get user from LEGACY Firestore to see original images
      const legacyUserDoc = await legacyDb.collection('Users').doc(uid).get();

      if (!legacyUserDoc.exists) {
        console.log(`   ⚠️  User not found in legacy Firestore`);
        failCount++;
        continue;
      }

      const legacyData = legacyUserDoc.data()!;

      // Extract image URLs from legacy data
      const imageUrls: string[] = [];

      // Check profileImg (single image - old schema)
      if (legacyData.profileImg && typeof legacyData.profileImg === 'string') {
        imageUrls.push(legacyData.profileImg);
      }

      // Check profileImgs (array - if already migrated partially)
      if (legacyData.profileImgs && Array.isArray(legacyData.profileImgs)) {
        imageUrls.push(...legacyData.profileImgs);
      }

      // Remove duplicates
      const uniqueImageUrls = [...new Set(imageUrls)];

      if (uniqueImageUrls.length === 0) {
        console.log(`   ℹ️  No profile images to migrate`);
        noImageCount++;
        continue;
      }

      console.log(`   Found ${uniqueImageUrls.length} image(s) to migrate`);

      // Parse and copy each image
      const imageInfos: ImageInfo[] = [];

      for (const imgUrl of uniqueImageUrls) {
        console.log(`\n   🔗 Original: ${imgUrl}`);

        // Parse Firebase Storage URL
        // Format 1: https://firebasestorage.googleapis.com/v0/b/nxt-1-de054.appspot.com/o/path%2Fto%2Ffile.jpg?alt=media
        // Format 2: https://storage.googleapis.com/nxt-1-de054.appspot.com/path/to/file.jpg

        let filePath: string | null = null;

        // Try format 1 (Firebase Storage API)
        const match1 = imgUrl.match(/\/o\/([^?]+)/);
        if (match1) {
          filePath = decodeURIComponent(match1[1]);
        }

        // Try format 2 (GCS direct)
        if (!filePath) {
          const match2 = imgUrl.match(/storage\.googleapis\.com\/[^/]+\/(.+)$/);
          if (match2) {
            filePath = decodeURIComponent(match2[1]);
          }
        }

        if (!filePath) {
          console.log(`   ⚠️  Could not parse image URL, skipping`);
          continue;
        }

        console.log(`   📁 File path: ${filePath}`);

        imageInfos.push({
          originalUrl: imgUrl,
          path: filePath,
        });
      }

      if (imageInfos.length === 0) {
        console.log(`   ⚠️  No valid images to copy`);
        failCount++;
        continue;
      }

      // Copy images using gsutil
      const newImageUrls: string[] = [];
      let copiedCount = 0;

      for (const info of imageInfos) {
        const sourceUrl = `gs://${process.env.LEGACY_FIREBASE_STORAGE_BUCKET}/${info.path}`;
        const destUrl = `gs://${process.env.STAGING_FIREBASE_STORAGE_BUCKET}/${info.path}`;

        if (!isDryRun) {
          try {
            console.log(`   📤 Copying: ${info.path}...`);

            // Copy file
            execSync(`gsutil -m cp "${sourceUrl}" "${destUrl}"`, {
              stdio: 'pipe',
              encoding: 'utf-8',
            });

            // Make public (optional - depends on your storage rules)
            try {
              const file = stagingBucket.file(info.path);
              await file.makePublic();
            } catch (publicError) {
              // If makePublic fails, file might already be public or rules prevent it
              console.log(`   ℹ️  Could not make public (may already be accessible via rules)`);
            }

            // Generate new URL
            const newUrl = `https://firebasestorage.googleapis.com/v0/b/${process.env.STAGING_FIREBASE_STORAGE_BUCKET}/o/${encodeURIComponent(info.path)}?alt=media`;
            newImageUrls.push(newUrl);
            copiedCount++;

            console.log(`   ✅ Copied successfully`);
            console.log(`   🔗 New URL: ${newUrl}`);
          } catch (error: any) {
            console.error(`   ❌ Copy failed: ${error.message}`);
            // Keep original URL as fallback
            newImageUrls.push(info.originalUrl);
          }
        } else {
          console.log(`   🔍 Would copy: ${sourceUrl}`);
          console.log(`                → ${destUrl}`);
          const newUrl = `https://firebasestorage.googleapis.com/v0/b/${process.env.STAGING_FIREBASE_STORAGE_BUCKET}/o/${encodeURIComponent(info.path)}?alt=media`;
          newImageUrls.push(newUrl);
        }
      }

      // Update Firestore in staging with new URLs
      if (!isDryRun && newImageUrls.length > 0) {
        console.log(`\n   📝 Updating Firestore with ${newImageUrls.length} new URL(s)...`);

        await stagingDb.collection('users').doc(uid).update({
          profileImgs: newImageUrls,
          _imagesUpdatedAt: new Date(),
          _imagesMigratedFrom: 'nxt-1-de054',
        });

        console.log(`   ✅ Firestore updated`);
      } else if (isDryRun) {
        console.log(`\n   🔍 Would update Firestore with ${newImageUrls.length} URL(s)`);
      }

      totalImagesCopied += copiedCount;
      successCount++;

      console.log(`   ✅ User complete: ${copiedCount}/${imageInfos.length} images copied`);
    } catch (error: any) {
      console.error(`   ❌ Error processing ${email}: ${error.message}`);
      failCount++;
    }
  }

  console.log('\n' + '━'.repeat(70));
  console.log(`📊 MIGRATION SUMMARY - ${mode}`);
  console.log('━'.repeat(70));
  console.log(`\n👥 Users:`);
  console.log(`   ✅ Success: ${successCount}`);
  console.log(`   ❌ Failed: ${failCount}`);
  console.log(`   ℹ️  No images: ${noImageCount}`);
  console.log(`   📝 Total: ${targetUsers.length}`);
  console.log(`\n🖼️  Images:`);
  console.log(`   ✅ Copied: ${totalImagesCopied}`);
  console.log('');

  if (isDryRun) {
    console.log('💡 This was a DRY-RUN. No files were copied.');
    console.log('💡 Run with --apply to perform actual migration:\n');
    console.log('   npx tsx scripts/migration/migrate-profile-images.ts --apply\n');
  } else {
    console.log('✅ Image migration complete!');
    console.log('');
    console.log('💡 Next steps:');
    console.log('   1. Verify images in Firebase Console:');
    console.log('      https://console.firebase.google.com/project/nxt-1-staging-v2/storage');
    console.log('   2. Test image loading in staging app');
    console.log('   3. Run verification: npx tsx scripts/migration/verify-image-migration.ts\n');
  }
}

migrateImages()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n❌ Fatal error:', err);
    process.exit(1);
  });
