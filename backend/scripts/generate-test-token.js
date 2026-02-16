#!/usr/bin/env node
/**
 * Generate Firebase Custom Token for API Testing
 * Usage: node generate-test-token.js [userId]
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function generateToken() {
  try {
    // Get userId from command line or use default
    const userId = process.argv[2] || 'test-user-id';

    // Initialize Firebase Admin (production)
    const serviceAccountPath =
      process.env.FIREBASE_SERVICE_ACCOUNT ||
      join(__dirname, '../assets/nxt-1-de054-firebase-adminsdk-w01w0-2bab8ae108.json');

    const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));

    const app = initializeApp(
      {
        credential: cert(serviceAccount),
      },
      'token-generator'
    );

    // Generate custom token
    const customToken = await getAuth(app).createCustomToken(userId);

    console.log('\n✅ Firebase Custom Token Generated:');
    console.log('─'.repeat(80));
    console.log(customToken);
    console.log('─'.repeat(80));
    console.log('\nUsage in curl:');
    console.log(
      `curl -H "Authorization: Bearer ${customToken}" http://localhost:3000/api/v1/teams/user/my-teams`
    );
    console.log(
      '\n⚠️  Note: This is a CUSTOM token. You need to exchange it for an ID token first.'
    );
    console.log('Or use it directly if your backend accepts custom tokens.\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error generating token:', error.message);
    process.exit(1);
  }
}

generateToken();
