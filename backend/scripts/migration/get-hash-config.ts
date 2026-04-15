#!/usr/bin/env tsx
/**
 * Get password hash configuration from legacy Firebase project
 * This is needed for auth:import to preserve password hashes
 */

import * as admin from 'firebase-admin';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

// Initialize Legacy Firebase app
const legacyApp = admin.initializeApp(
  {
    credential: admin.credential.cert({
      projectId: process.env.LEGACY_FIREBASE_PROJECT_ID,
      clientEmail: process.env.LEGACY_FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.LEGACY_FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
    projectId: process.env.LEGACY_FIREBASE_PROJECT_ID,
  },
  'legacy-get-hash'
);

async function getHashConfig() {
  try {
    console.log('📋 Lấy hash configuration từ legacy project...\n');

    // Try to get a sample user to check hash algorithm
    const listUsersResult = await admin.auth(legacyApp).listUsers(1);

    if (listUsersResult.users.length === 0) {
      console.log('❌ Không có users trong legacy project');
      process.exit(1);
    }

    const user = listUsersResult.users[0];

    console.log('✅ Sample user found:');
    console.log(`   UID: ${user.uid}`);
    console.log(`   Email: ${user.email || 'N/A'}`);

    // Firebase Admin SDK không expose hash config directly
    // Nhưng ta có thể reference Firebase SCRYPT defaults
    console.log('\n📌 Firebase SCRYPT Hash Configuration:');
    console.log('   Algorithm: SCRYPT');
    console.log('   Rounds (signer key rounds): 8');
    console.log('   Memory Cost: 14');
    console.log('   Hash Input Order: SALT_FIRST (default)');

    console.log('\n⚠️  Hash Key Required:');
    console.log('   The base64-encoded hash key (signer key) must be obtained from:');
    console.log('   Firebase Console → Project Settings → Service Accounts → Database Secrets');
    console.log('   OR legacy export with --format=JSON might include it');

    console.log('\n💡 Alternative: Try import without hash params first');
    console.log('   Firebase CLI might auto-detect from export file if it contains hash info');

    console.log('\n🔍 Checking export file for hash info...');

    // Try to read and parse auth-export.json
    const fs = await import('fs/promises');
    try {
      const exportPath = path.resolve(__dirname, 'auth-export.json');
      const exportData = JSON.parse(await fs.readFile(exportPath, 'utf-8'));

      // Check for various possible hash info fields
      const possibleFields = ['passwordHashInfo', 'hashConfig', 'hash_config', 'hashInfo'];
      let foundHashInfo = false;

      for (const field of possibleFields) {
        if (exportData[field]) {
          console.log(`\n✅ Found hash info in field: ${field}`);
          console.log(JSON.stringify(exportData[field], null, 2));
          foundHashInfo = true;
          break;
        }
      }

      if (!foundHashInfo) {
        console.log('❌ Export file không chứa hash configuration');
        console.log('   File structure:', Object.keys(exportData));
      }
    } catch (error) {
      console.error('❌ Không thể đọc auth-export.json:', (error as Error).message);
    }
  } catch (error) {
    console.error('❌ Lỗi:', (error as Error).message);
    process.exit(1);
  } finally {
    await legacyApp.delete();
  }
}

getHashConfig();
