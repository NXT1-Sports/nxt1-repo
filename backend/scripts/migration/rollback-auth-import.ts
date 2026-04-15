#!/usr/bin/env tsx
/**
 * Rollback Authentication Import
 * Deletes the 5 imported users from staging to prepare for re-import with passwords
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../.env') });

import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import * as fs from 'fs';
import * as path from 'path';

const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname);
const MAPPING_FILE = path.join(SCRIPT_DIR, 'user-uid-mapping.json');

// Initialize Staging Firebase
const stagingApp = initializeApp(
  {
    credential: cert({
      projectId: process.env.STAGING_FIREBASE_PROJECT_ID,
      clientEmail: process.env.STAGING_FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.STAGING_FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  },
  'staging'
);

const stagingAuth = getAuth(stagingApp);

async function rollbackAuthImport() {
  console.log('🔄 Rolling back authentication import...\n');

  // Read user UIDs from mapping file
  const mappingData = JSON.parse(fs.readFileSync(MAPPING_FILE, 'utf-8'));
  const users = mappingData.results || mappingData; // Handle both formats
  const userUIDs = users
    .filter((user: any) => user.uid && user.authExists) // Only users that exist in Auth
    .map((user: any) => user.uid);

  console.log(`📋  Found ${userUIDs.length} users to delete:\n`);

  let deletedCount = 0;
  let errorCount = 0;

  for (const uid of userUIDs) {
    try {
      // Check if user exists first
      const userRecord = await stagingAuth.getUser(uid);
      console.log(`🗑️  Deleting: ${userRecord.email || 'No email'} (${uid})`);

      await stagingAuth.deleteUser(uid);
      deletedCount++;
      console.log(`   ✅ Deleted successfully\n`);
    } catch (error: any) {
      if (error.code === 'auth/user-not-found') {
        console.log(`   ⚠️  User not found (already deleted or never imported)\n`);
      } else {
        console.error(`   ❌ Error deleting user ${uid}:`, error.message);
        errorCount++;
      }
    }
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 ROLLBACK SUMMARY');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log(`✅ Deleted: ${deletedCount} users`);
  console.log(`❌ Errors: ${errorCount} users`);
  console.log(`📝 Total: ${userUIDs.length} users\n`);

  if (deletedCount === userUIDs.length) {
    console.log('✅ All users deleted successfully!');
    console.log('💡 Next step: Re-import users with password hash:\n');
    console.log('   firebase auth:import auth-export-filtered.json \\');
    console.log('     --project nxt-1-staging-v2 \\');
    console.log('     --hash-algo=SCRYPT \\');
    console.log('     --rounds=8 \\');
    console.log('     --mem-cost=14 \\');
    console.log('     --salt-separator="Bw==" \\');
    console.log(
      '     --hash-key="Ul0yk3ZKlvEUhin6ujgLd7GczdL+Onl4IhvuclnmdXPzxMcTcM8RTUJJe7GArhaOUwA1evaSegm9yv+EOVIiTQ=="\n'
    );
  }
}

rollbackAuthImport()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
