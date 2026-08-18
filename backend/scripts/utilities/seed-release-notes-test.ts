/**
 * Seed a test release note into Firestore so you can preview the What's New modal
 * without shipping a real release.
 *
 * Usage (staging — default):
 *   tsx --tsconfig tsconfig.scripts.json scripts/utilities/seed-release-notes-test.ts
 *
 * Usage (production):
 *   tsx --tsconfig tsconfig.scripts.json scripts/utilities/seed-release-notes-test.ts --target=production
 *
 * After running, clear your browser localStorage key and reload:
 *   localStorage.removeItem('nxt1_last_seen_release')
 *   location.reload()
 */

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const isProduction = args.includes('--target=production');
const isDryRun = args.includes('--dry-run');

const TEST_VERSION = '99.0.0-preview';
const TEST_ID = `v${TEST_VERSION}`;

const SA_PATHS = {
  staging: resolve(__dirname, '../../assets/nxt-1-staging-v2-ae4fac811aa4.json'),
  production: resolve(__dirname, '../../assets/nxt-1-v2-firebase-adminsdk.json'),
};

function initFirestore() {
  const target = isProduction ? 'production' : 'staging';
  const saPath = process.env['GOOGLE_APPLICATION_CREDENTIALS'] ?? SA_PATHS[target];

  const appName = `seed-release-notes-${target}`;

  try {
    return getFirestore(getApps().find((a) => a.name === appName)!);
  } catch {
    // fall through to initialize
  }

  const sa = JSON.parse(readFileSync(saPath, 'utf-8'));
  const app = initializeApp({ credential: cert(sa) }, appName);
  return getFirestore(app);
}

const TEST_NOTE = {
  id: TEST_ID,
  version: TEST_VERSION,
  title: 'Agent X Film Analysis & Performance Boosts',
  summary:
    'Your AI has new eyes. Agent X can now analyze full-game film, break down plays automatically, and run 50% faster across the board.',
  releaseDate: new Date().toISOString(),
  badgeTag: 'Preview',
  ctaLabel: "What's New",
  ctaRoute: '/agent-x',
  isPublished: true,
  categories: {
    features: [
      'Agent X can now analyze full-game film and auto-tag key plays',
      'New Play Diagram Builder — draw and share Xs and Os from chat',
      'Weekly Playbook now surfaces opponent-specific prep recommendations',
      'Batch email outreach now supports personalized per-recipient variables',
    ],
    enhancements: [
      '50% faster video timeline loading on large film libraries',
      'Smoother sheet transitions and haptic feedback on mobile',
      'Operations Log now groups related tasks under collapsible cards',
      'Agent X response streaming latency reduced by 30%',
    ],
    fixes: [
      'Fixed push notification deep-link routing on iOS 18',
      'Resolved duplicate team post appearing after approval',
      'Fixed occasional white flash on dark-mode modal open',
    ],
  },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

async function main() {
  const target = isProduction ? 'production' : 'staging';
  console.log(`\n🚀 Seeding test release note to ${target} Firestore`);
  console.log(`   Document: SystemReleaseNotes/${TEST_ID}`);

  if (isDryRun) {
    console.log('\n[DRY RUN] Would write:');
    console.log(JSON.stringify(TEST_NOTE, null, 2));
    return;
  }

  const db = initFirestore();
  await db.collection('SystemReleaseNotes').doc(TEST_ID).set(TEST_NOTE);

  console.log('\n✅ Test release note seeded!');
  console.log('\nTo see the modal:');
  console.log('  1. Open browser devtools console on your local/staging app');
  console.log("  2. Run: localStorage.removeItem('nxt1_last_seen_release')");
  console.log("  3. Reload the page — the What's New modal will pop after 1.5s");
  console.log('\nTo clean up:');
  console.log(`  Run the same script with --delete flag, or delete`);
  console.log(`  SystemReleaseNotes/${TEST_ID} in Firebase console`);
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
