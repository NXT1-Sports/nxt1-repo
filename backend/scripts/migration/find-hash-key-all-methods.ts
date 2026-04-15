#!/usr/bin/env tsx
/**
 * Comprehensive attempt to retrieve password hash key
 * Tries multiple methods to extract SCRYPT signer key
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { readFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../.env') });

console.log('🔑 Attempting to retrieve password hash key...\n');
console.log('Trying multiple methods:\n');

// Method 1: Check auth export file for hash config
console.log('━'.repeat(70));
console.log('METHOD 1: Parse auth-export.json for hash configuration');
console.log('━'.repeat(70));

try {
  const exportPath = resolve(__dirname, './auth-export.json');
  const exportData = JSON.parse(readFileSync(exportPath, 'utf-8'));

  console.log('✅ File loaded successfully');
  console.log(`   Users: ${exportData.users?.length || 'N/A'}`);

  // Check root level
  const topLevelKeys = Object.keys(exportData);
  console.log(`   Root keys: ${topLevelKeys.join(', ')}`);

  // Look for hash config in various locations
  const possibleHashFields = [
    'passwordHashInfo',
    'hashConfig',
    'hash_config',
    'hashInfo',
    'signerKey',
    'signer_key',
    'hashKey',
    'hash_key',
  ];

  let foundHashConfig = false;
  for (const field of possibleHashFields) {
    if (exportData[field]) {
      console.log(`\n✅ FOUND: ${field}`);
      console.log(JSON.stringify(exportData[field], null, 2));
      foundHashConfig = true;
    }
  }

  if (!foundHashConfig) {
    console.log('\n❌ No hash configuration found in export file');

    // Check first user for hash info
    if (exportData.users && exportData.users.length > 0) {
      const firstUser = exportData.users[0];
      console.log('\n📋 First user structure:');
      console.log(`   Keys: ${Object.keys(firstUser).join(', ')}`);

      if (firstUser.passwordHash && firstUser.salt) {
        console.log('\n   ✅ Users have passwordHash and salt');
        console.log(`   Sample hash: ${firstUser.passwordHash.substring(0, 40)}...`);
        console.log(`   Sample salt: ${firstUser.salt}`);
        console.log('\n   ⚠️  But missing signer key to decrypt!');
      }
    }
  }
} catch (error) {
  console.error(`❌ Method 1 failed: ${(error as Error).message}`);
}

// Method 2: Try Firebase CLI with different export formats
console.log('\n' + '━'.repeat(70));
console.log('METHOD 2: Firebase CLI export with verbose output');
console.log('━'.repeat(70));

try {
  console.log('\nTrying: firebase auth:export --help');
  const helpOutput = execSync('firebase auth:export --help', {
    encoding: 'utf-8',
    cwd: __dirname,
  });

  // Check if there's a flag to include hash config
  if (helpOutput.includes('hash') || helpOutput.includes('key')) {
    console.log('✅ Found hash-related options:');
    const lines = helpOutput
      .split('\n')
      .filter((l) => l.toLowerCase().includes('hash') || l.toLowerCase().includes('key'));
    lines.forEach((line) => console.log(`   ${line.trim()}`));
  } else {
    console.log('❌ No hash-related export options found');
  }
} catch (error) {
  console.error(`❌ Method 2 failed: ${(error as Error).message}`);
}

// Method 3: Check if gcloud has access to Identity Platform
console.log('\n' + '━'.repeat(70));
console.log('METHOD 3: Google Cloud Identity Platform API');
console.log('━'.repeat(70));

try {
  console.log('\nChecking gcloud configuration...');
  const currentProject = execSync('gcloud config get-value project 2>/dev/null', {
    encoding: 'utf-8',
  }).trim();

  console.log(`   Current project: ${currentProject || 'Not set'}`);

  if (currentProject !== process.env.LEGACY_FIREBASE_PROJECT_ID) {
    console.log(`\n⚙️  Setting project to: ${process.env.LEGACY_FIREBASE_PROJECT_ID}`);
    execSync(`gcloud config set project ${process.env.LEGACY_FIREBASE_PROJECT_ID}`, {
      stdio: 'pipe',
    });
  }

  console.log('\n📡 Trying to get Identity Platform config...');

  // Try to get GCIP config
  try {
    const gcipConfig = execSync(
      `gcloud alpha identity projects describe ${process.env.LEGACY_FIREBASE_PROJECT_ID} --format=json 2>&1`,
      { encoding: 'utf-8' }
    );

    console.log('✅ Response received:');
    const config = JSON.parse(gcipConfig);

    // Look for password config
    if (config.signInConfig || config.passwordHashConfig) {
      console.log('\n✅ FOUND PASSWORD HASH CONFIG:');
      console.log(JSON.stringify(config.signInConfig || config.passwordHashConfig, null, 2));
    } else {
      console.log('\n⚠️  Config retrieved but no password hash info');
      console.log('Available keys:', Object.keys(config).join(', '));
    }
  } catch (gcipError) {
    const errorMsg = (gcipError as any).message || String(gcipError);
    if (errorMsg.includes('not found') || errorMsg.includes('not enabled')) {
      console.log('❌ Identity Platform API not enabled or not available');
      console.log('\n💡 Enable it at:');
      console.log(
        `   https://console.cloud.google.com/marketplace/product/google/identitytoolkit.googleapis.com?project=${process.env.LEGACY_FIREBASE_PROJECT_ID}`
      );
    } else if (errorMsg.includes('not authorized') || errorMsg.includes('permission')) {
      console.log('❌ Permission denied - need Project Owner role');
    } else {
      console.log(`❌ GCIP query failed: ${errorMsg}`);
    }
  }
} catch (error) {
  console.error(`❌ Method 3 failed: ${(error as Error).message}`);
}

// Method 4: Direct REST API call
console.log('\n' + '━'.repeat(70));
console.log('METHOD 4: Firebase REST API (Identity Toolkit)');
console.log('━'.repeat(70));

console.log('\n📌 Manual API call required:');
console.log('\n1. Get OAuth token:');
console.log('   gcloud auth print-access-token');
console.log('\n2. Call Identity Toolkit API:');
console.log(`   curl -H "Authorization: Bearer <TOKEN>" \\`);
console.log(
  `     "https://identitytoolkit.googleapis.com/v1/projects/${process.env.LEGACY_FIREBASE_PROJECT_ID}/config"`
);

// Summary
console.log('\n' + '━'.repeat(70));
console.log('📋 SUMMARY & RECOMMENDATIONS');
console.log('━'.repeat(70));

console.log('\n💡 To preserve passwords, you need the SCRYPT signer key.');
console.log('\nBest options (in order):');
console.log('\n1. ⭐ Firebase Console → Project Settings → Service Accounts → Database Secrets');
console.log(
  '   URL: https://console.firebase.google.com/project/nxt-1-de054/settings/serviceaccounts/adminsdk'
);
console.log('\n2. 🔹 Contact Firebase Support');
console.log('   Request password hash signer key for migration');
console.log('   Typical response time: 2-5 business days');
console.log('\n3. 🔸 Use Identity Platform API (if enabled)');
console.log('   Requires Project Owner role');
console.log('\n4. 🔻 Accept trade-off: Migrate without passwords');
console.log('   3 users have Google OAuth (can login)');
console.log('   2 users need password reset');

console.log('\n' + '━'.repeat(70));
console.log('\n✅ Script completed. Check output above for any discovered keys.\n');
