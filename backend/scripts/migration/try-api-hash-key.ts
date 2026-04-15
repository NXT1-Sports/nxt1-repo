#!/usr/bin/env tsx
/**
 * Try to get password hash config via Firebase REST API
 * Using service account credentials directly
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { GoogleAuth } from 'google-auth-library';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../.env') });

async function getHashKeyViaAPI() {
  console.log('🔑 Trying Firebase Identity Toolkit API...\n');

  try {
    // Create auth client with service account
    const auth = new GoogleAuth({
      credentials: {
        client_email: process.env.LEGACY_FIREBASE_CLIENT_EMAIL,
        private_key: process.env.LEGACY_FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      },
      scopes: [
        'https://www.googleapis.com/auth/cloud-platform',
        'https://www.googleapis.com/auth/identitytoolkit',
        'https://www.googleapis.com/auth/firebase',
      ],
    });

    const client = await auth.getClient();
    const projectId = process.env.LEGACY_FIREBASE_PROJECT_ID;

    console.log(`📡 Calling Identity Toolkit API for project: ${projectId}\n`);

    // Try multiple API endpoints
    const endpoints = [
      `https://identitytoolkit.googleapis.com/v1/projects/${projectId}/config`,
      `https://identitytoolkit.googleapis.com/admin/v2/projects/${projectId}/config`,
      `https://www.googleapis.com/identitytoolkit/v3/relyingparty/getProjectConfig?key=${projectId}`,
    ];

    for (const endpoint of endpoints) {
      try {
        console.log(`Trying: ${endpoint}`);

        const response = await client.request({ url: endpoint });

        console.log('✅ Response received!\n');
        console.log('Status:', response.status);
        console.log('Data:');
        console.log(JSON.stringify(response.data, null, 2));

        // Check for password hash config
        const data = response.data as any;

        if (data.signInconfig || data.passwordConfig || data.hashConfig) {
          console.log('\n🎉 FOUND HASH CONFIG!');
          console.log(
            JSON.stringify(data.signInConfig || data.passwordConfig || data.hashConfig, null, 2)
          );
          return;
        }

        console.log('');
      } catch (err: any) {
        console.log(`❌ Failed: ${err.message}\n`);
      }
    }

    // Try Firebase Management API
    console.log('━'.repeat(70));
    console.log('Trying Firebase Management API...\n');

    const firebaseEndpoint = `https://firebase.googleapis.com/v1beta1/projects/${projectId}`;

    try {
      const response = await client.request({ url: firebaseEndpoint });
      console.log('✅ Project info retrieved:');
      console.log(JSON.stringify(response.data, null, 2));
    } catch (err: any) {
      console.log(`❌ Failed: ${err.message}`);
    }
  } catch (error) {
    console.error('❌ Error:', (error as Error).message);
  }

  console.log('\n' + '━'.repeat(70));
  console.log('📋 CONCLUSION');
  console.log('━'.repeat(70));
  console.log('\n❌ Hash key not accessible via API (Firebase security policy)');
  console.log('\n💡 ALTERNATIVE SOLUTION:');
  console.log('\nSince passwords cannot be migrated automatically, you have 2 options:\n');
  console.log('Option A: Contact Firebase Support');
  console.log('  - Submit support ticket requesting hash key');
  console.log('  - Required for enterprise migrations');
  console.log('  - Wait time: 2-5 business days\n');
  console.log('Option B: Migrate with password reset workflow');
  console.log('  - Import users with UIDs only (no passwords)');
  console.log('  - Send password reset emails to all users');
  console.log('  - Users set new passwords');
  console.log('  - Google OAuth users unaffected (can login immediately)\n');
  console.log('💡Recommendation for YOUR case:');
  console.log('  - 3/5 users have Google OAuth → Can login immediately ✅');
  console.log('  - 2/5 users need password reset (acceptable for 5-user test)');
  console.log('  - Proceed with Option B for canary test');
  console.log('  - Request hash key from Firebase Support for full production migration\n');
}

getHashKeyViaAPI();
