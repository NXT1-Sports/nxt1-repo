/**
 * @fileoverview Seed Billing Pricing Config into Firestore
 * @module @nxt1/backend/scripts/seed-pricing-config
 *
 * Creates the `pricingConfig/default` document that controls how much
 * to charge users after an AI job completes:
 *   chargeAmount = actualHeliconeUSDCost × multiplier
 *
 * Usage:
 *   cd backend
 *   npx tsx scripts/seed-pricing-config.ts                   # write to production
 *   npx tsx scripts/seed-pricing-config.ts --env=staging     # write to staging
 *   npx tsx scripts/seed-pricing-config.ts --dry-run         # preview only
 *
 * Re-running is always safe (uses set with merge).
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../.env') });

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

// ─── CLI Args ──────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const getArg = (name: string) =>
  args
    .find((a) => a.startsWith(`--${name}=`))
    ?.split('=')
    .slice(1)
    .join('=') ?? null;
const hasFlag = (name: string) => args.includes(`--${name}`);

const useStaging = getArg('env') === 'staging';
const dryRun = hasFlag('dry-run');

// ─── Firebase Init ─────────────────────────────────────────────────────────
const projectId = useStaging
  ? process.env['STAGING_FIREBASE_PROJECT_ID']!
  : process.env['FIREBASE_PROJECT_ID']!;
const clientEmail = useStaging
  ? process.env['STAGING_FIREBASE_CLIENT_EMAIL']!
  : process.env['FIREBASE_CLIENT_EMAIL']!;
const privateKey = useStaging
  ? process.env['STAGING_FIREBASE_PRIVATE_KEY']!.replace(/\\n/g, '\n')
  : process.env['FIREBASE_PRIVATE_KEY']!.replace(/\\n/g, '\n');

if (!projectId || !clientEmail || !privateKey) {
  console.error('❌ Missing Firebase credentials in .env');
  console.error('   Required: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY');
  console.error(
    '   Staging:  STAGING_FIREBASE_PROJECT_ID, STAGING_FIREBASE_CLIENT_EMAIL, STAGING_FIREBASE_PRIVATE_KEY'
  );
  process.exit(1);
}

const appName = `seed-pricing-${Date.now()}`;
const app =
  getApps().find((a) => a.name === appName) ??
  initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) }, appName);
const db = getFirestore(app);

console.log(
  `\n🔥 Connected to Firebase: ${projectId} (${useStaging ? 'staging' : 'production'})\n`
);

// ─── Pricing Config ────────────────────────────────────────────────────────
//
// defaultMultiplier: 3.0  →  cost $0.10 → charge $0.30
//
// featureOverrides: override multiplier per feature slug.
// Feature slugs match the `payload.agent` field in AgentJobPayload.
//
// Examples:
//   "data-coordinator"           → default 3x
//   "recruiting-coordinator"     → same margin, analyst-level complexity
//   "brand-media-coordinator"    → higher because image gen costs more
//
const PRICING_CONFIG = {
  defaultMultiplier: 3.0,
  featureOverrides: {
    // Higher margin for media-heavy agents (image gen costs more)
    'brand-media-coordinator': 4.0,
    // Standard agents — rely on defaultMultiplier
    // 'data-coordinator': 3.0,
    // 'performance-coordinator': 3.0,
    // 'recruiting-coordinator': 3.0,
    // 'compliance-coordinator': 3.0,
    // 'general': 3.0,
  },
  updatedAt: new Date().toISOString(),
};

// ─── Main ──────────────────────────────────────────────────────────────────
async function main() {
  const docRef = db.collection('pricingConfig').doc('default');

  // Read existing
  const existing = await docRef.get();
  if (existing.exists) {
    console.log('📄 Existing pricingConfig/default:');
    console.log(JSON.stringify(existing.data(), null, 2));
    console.log();
  } else {
    console.log('📭 No existing pricingConfig/default — will create fresh.\n');
  }

  console.log('📝 Will write:');
  console.log(JSON.stringify(PRICING_CONFIG, null, 2));
  console.log();

  if (dryRun) {
    console.log('🔍 Dry-run mode — no changes written.');
    process.exit(0);
  }

  // Use set with merge so extra fields (if already present) are preserved
  await docRef.set(PRICING_CONFIG, { merge: true });

  // Verify
  const written = await docRef.get();
  console.log('✅ pricingConfig/default written successfully:');
  console.log(JSON.stringify(written.data(), null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ seed-pricing-config failed:', err);
    process.exit(1);
  });
