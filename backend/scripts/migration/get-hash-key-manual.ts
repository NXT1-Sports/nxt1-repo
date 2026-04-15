#!/usr/bin/env tsx
/**
 * Attempt to get password hash configuration via Firebase Admin SDK
 * This might expose the hash algorithm parameters
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../.env') });

async function tryGetHashConfig() {
  console.log('🔍 Attempting to retrieve hash configuration...\n');

  // Method 1: Check if service account JSON has it
  const serviceAccountPath = '../../.env';
  console.log('Method 1: Checking environment variables...');
  console.log(`   LEGACY_FIREBASE_PROJECT_ID: ${process.env.LEGACY_FIREBASE_PROJECT_ID}`);

  // Check if there's a service account JSON file
  const possiblePaths = [
    '../../../nxt1-backend/assets/nxt-1-de054-firebase-adminsdk-w01w0-2bab8ae108.json',
    '/Users/sotatek/Downloads/Source_Code/NXT1/nxt1-backend/assets/nxt-1-de054-firebase-adminsdk-w01w0-2bab8ae108.json',
  ];

  console.log('\nMethod 2: Checking service account JSON files...');
  for (const path of possiblePaths) {
    try {
      const fullPath = resolve(__dirname, path);
      const content = JSON.parse(readFileSync(fullPath, 'utf-8'));
      console.log(`✅ Found: ${path}`);

      // Check if it has hash key
      const checkFields = ['hash_key', 'hashKey', 'signerKey', 'signer_key', 'password_hash_key'];
      let found = false;
      for (const field of checkFields) {
        if (content[field]) {
          console.log(`   ✅ Found ${field}: ${content[field].substring(0, 20)}...`);
          found = true;
        }
      }
      if (!found) {
        console.log('   ❌ No hash key found in JSON');
      }
    } catch (e) {
      // Skip
    }
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📋 MANUAL STEPS REQUIRED:\n');
  console.log('1. Go to: https://console.cloud.google.com/customer-identity/providers');
  console.log('2. Select project: nxt-1-de054');
  console.log('3. Click "Password" provider');
  console.log('4. Look for "Hash configuration" or "Signer key"\n');

  console.log('Alternative approach:');
  console.log(
    '1. Go to: https://console.firebase.google.com/project/nxt-1-de054/settings/serviceaccounts/adminsdk'
  );
  console.log('2. Look for "Database secrets" section');
  console.log('3. Copy the first key (base64 encoded)\n');

  console.log('💡 If not visible, you may need Project Owner role or contact Firebase support.');
}

tryGetHashConfig();
