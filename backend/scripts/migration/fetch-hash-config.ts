#!/usr/bin/env npx tsx
/**
 * Fetch SCRYPT hash config from legacy Firebase project (nxt-1-de054)
 * Usage: npx tsx scripts/migration/fetch-hash-config.ts
 */
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../.env') });

import { initializeApp, cert } from 'firebase-admin/app';

const projectId = process.env['LEGACY_FIREBASE_PROJECT_ID']!;
const clientEmail = process.env['LEGACY_FIREBASE_CLIENT_EMAIL']!;
const privateKey = process.env['LEGACY_FIREBASE_PRIVATE_KEY']!.replace(/\\n/g, '\n');

const app = initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) }, 'hf');

async function main() {
  const cred = (app.options as any).credential;
  const t = await cred.getAccessToken();
  const at = t.access_token;

  // Try multiple endpoints
  const urls = [
    `https://identitytoolkit.googleapis.com/admin/v2/projects/${projectId}/config`,
    `https://identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:batchGet?maxResults=1`,
  ];

  for (const url of urls) {
    console.log(`\n🔍 GET ${url}`);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${at}` } });
    const d = (await res.json()) as any;
    const hc = d.signIn?.hashConfig ?? d.hashConfig ?? d.passwordHashConfig;
    if (hc) {
      console.log('\n✅ Hash config:\n', JSON.stringify(hc, null, 2));
      console.log('\n📋 firebase auth:import flags:');
      console.log(`  --hash-algo=${hc.algorithm}`);
      console.log(`  --hash-key=${hc.signerKey}`);
      if (hc.saltSeparator) console.log(`  --salt-separator=${hc.saltSeparator}`);
      if (hc.rounds) console.log(`  --rounds=${hc.rounds}`);
      if (hc.memCost) console.log(`  --mem-cost=${hc.memCost}`);
      return;
    }
    console.log('No hashConfig. Keys:', Object.keys(d).join(', '));
  }
}

main().catch(console.error);
