/**
 * @fileoverview Copy AppConfig/pricingConfig from staging (nxt-1-staging-v2) → production (nxt-1-v2).
 *
 * Dry-run by default. Pass --commit to write to production.
 *
 * Usage:
 *   tsx --tsconfig tsconfig.scripts.json scripts/config/copy-pricing-config-staging-to-prod.ts
 *   tsx --tsconfig tsconfig.scripts.json scripts/config/copy-pricing-config-staging-to-prod.ts --commit
 */

import { config as loadDotenv } from 'dotenv';
import admin from 'firebase-admin';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const backendRoot = resolve(scriptDir, '..', '..');
loadDotenv({ path: resolve(backendRoot, '.env') });
loadDotenv({ path: resolve(backendRoot, '.env.local'), override: true });

const APP_CONFIG_COLLECTION = 'AppConfig';
const PRICING_CONFIG_DOC = 'pricingConfig';

const EXPECTED_PROJECT_IDS = {
  staging: 'nxt-1-staging-v2',
  production: 'nxt-1-v2',
} as const;

const args = process.argv.slice(2);
const commit = args.includes('--commit');

function getOrInitFirestore(env: 'staging' | 'production'): admin.firestore.Firestore {
  const appName = env === 'production' ? 'pricing-copy-prod-v2' : 'pricing-copy-staging-v2';
  const existing = admin.apps.find((app) => app?.name === appName);
  if (existing) {
    return existing.firestore();
  }

  const prefix = env === 'production' ? 'FIREBASE' : 'STAGING_FIREBASE';
  const projectId = process.env[`${prefix}_PROJECT_ID`]?.trim();
  const clientEmail = process.env[`${prefix}_CLIENT_EMAIL`]?.trim();
  const privateKey = process.env[`${prefix}_PRIVATE_KEY`]?.replace(/\\n/g, '\n');

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      `Missing ${prefix}_PROJECT_ID / ${prefix}_CLIENT_EMAIL / ${prefix}_PRIVATE_KEY in backend .env`
    );
  }

  if (projectId !== EXPECTED_PROJECT_IDS[env]) {
    throw new Error(
      `Safety check failed: expected ${env} project "${EXPECTED_PROJECT_IDS[env]}" but .env has "${projectId}"`
    );
  }

  const app = admin.initializeApp(
    { credential: admin.credential.cert({ projectId, clientEmail, privateKey }), projectId },
    appName
  );
  return app.firestore();
}

async function main(): Promise<void> {
  console.log('=== Copy AppConfig/pricingConfig: staging → production ===');
  console.log(
    `Mode: ${commit ? '✅ COMMIT (will write to production)' : '🔍 DRY RUN (pass --commit to apply)'}\n`
  );

  // ── 1. Read from staging ──────────────────────────────────────────────────
  const stagingDb = getOrInitFirestore('staging');
  const stagingSnap = await stagingDb
    .collection(APP_CONFIG_COLLECTION)
    .doc(PRICING_CONFIG_DOC)
    .get();

  if (!stagingSnap.exists) {
    console.error(`❌ AppConfig/${PRICING_CONFIG_DOC} not found in staging. Nothing to copy.`);
    process.exit(1);
  }

  const stagingData = stagingSnap.data()!;
  console.log(`📥 Staging AppConfig/${PRICING_CONFIG_DOC}:`);
  console.log(JSON.stringify(stagingData, null, 2));

  // ── 2. Read current prod value for comparison ─────────────────────────────
  const prodDb = getOrInitFirestore('production');
  const prodSnap = await prodDb.collection(APP_CONFIG_COLLECTION).doc(PRICING_CONFIG_DOC).get();

  if (prodSnap.exists) {
    console.log(`\n📤 Current production AppConfig/${PRICING_CONFIG_DOC}:`);
    console.log(JSON.stringify(prodSnap.data(), null, 2));
  } else {
    console.log(
      `\n📤 Production AppConfig/${PRICING_CONFIG_DOC} does not exist yet (will be created).`
    );
  }

  // ── 3. Write to production (or skip on dry-run) ───────────────────────────
  if (!commit) {
    console.log('\n⏭️  Dry run — no changes written. Re-run with --commit to apply.');
    return;
  }

  const payload = {
    ...stagingData,
    updatedAt: new Date().toISOString(),
  };

  await prodDb
    .collection(APP_CONFIG_COLLECTION)
    .doc(PRICING_CONFIG_DOC)
    .set(payload, { merge: false });

  console.log(`\n✅ AppConfig/${PRICING_CONFIG_DOC} written to production (nxt-1-v2).`);
  console.log('   Backend picks up the new config within 5 minutes (in-memory cache TTL).');
}

main().catch((err) => {
  console.error('❌ Script failed:', err);
  process.exit(1);
});
