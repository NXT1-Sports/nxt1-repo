/**
 * @fileoverview Normalize User documents — remove dead/legacy fields
 *
 * Fields removed (root-level on User doc):
 *   _counters, verifiedMetrics, profileCompleteness, username,
 *   dismissedPrompts, isShowedHowCollegeCreditWorks, isShowedFirstOpenCampaigns,
 *   hasSeenFeedbackModal, showedTrialMessage, showedHearAbout
 *
 * Usage:
 *   # Dry-run single user (by email)
 *   npx tsx scripts/normalize-user-docs.ts --email=ngocsonxx98@gmail.com
 *
 *   # Commit single user
 *   npx tsx scripts/normalize-user-docs.ts --email=ngocsonxx98@gmail.com --commit
 *
 *   # Dry-run ALL users on staging
 *   npx tsx scripts/normalize-user-docs.ts --target=staging
 *
 *   # Commit ALL users on production
 *   npx tsx scripts/normalize-user-docs.ts --commit
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { initializeApp, cert, type ServiceAccount } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── CLI Args ─────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const getArg = (name: string) =>
  args
    .find((a) => a.startsWith(`--${name}=`))
    ?.split('=')
    .slice(1)
    .join('=') ?? null;

const isCommit = args.includes('--commit');
const target = getArg('target') ?? 'production';
const emailFilter = getArg('email') ?? null;

// ─── Firebase Init ────────────────────────────────────────────────────────────
const SA_MAP: Record<string, string> = {
  production: '../assets/nxt-1-admin-firebase-adminsdk-9m8cg-3cd10211f8.json',
  staging: '../assets/nxt-1-staging-v2-firebase-adminsdk-fbsvc-0e09aefb3e.json',
};

const saPath = SA_MAP[target];
if (!saPath) {
  console.error(`Unknown --target="${target}". Use "production" or "staging".`);
  process.exit(1);
}

const sa = JSON.parse(readFileSync(resolve(__dirname, saPath), 'utf-8')) as ServiceAccount;
initializeApp({ credential: cert(sa) });
const db = getFirestore();

// ─── Fields to remove ─────────────────────────────────────────────────────────
const FIELDS_TO_REMOVE = [
  '_counters',
  'verifiedMetrics',
  'profileCompleteness',
  'username',
  'dismissedPrompts',
  'isShowedHowCollegeCreditWorks',
  'isShowedFirstOpenCampaigns',
  'hasSeenFeedbackModal',
  'showedTrialMessage',
  'showedHearAbout',
] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function buildDeleteUpdate(): Record<string, FieldValue> {
  const update: Record<string, FieldValue> = {};
  for (const field of FIELDS_TO_REMOVE) {
    update[field] = FieldValue.delete();
  }
  return update;
}

function extractPresentFields(data: Record<string, unknown>): string[] {
  return FIELDS_TO_REMOVE.filter((f) => f in data);
}

function printUserSummary(
  docId: string,
  email: string | undefined,
  present: string[],
  action: 'DRY-RUN' | 'DELETED'
) {
  if (present.length === 0) {
    console.log(`  [SKIP] ${email ?? docId} — no dead fields found`);
    return;
  }
  console.log(`  [${action}] ${email ?? docId} (${docId})`);
  console.log(`    Fields: ${present.join(', ')}`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const projectLabel = target === 'staging' ? 'nxt-1-staging-v2' : 'nxt-1-v2 (production)';
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║         Normalize User Docs — Remove Dead Fields ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log(`  Project : ${projectLabel}`);
  console.log(`  Mode    : ${isCommit ? '⚠️  COMMIT (writes enabled)' : 'DRY-RUN (no writes)'}`);
  if (emailFilter) console.log(`  Filter  : email = ${emailFilter}`);
  console.log(`  Removing: ${FIELDS_TO_REMOVE.join(', ')}\n`);

  const PAGE_SIZE = 200;
  const BATCH_SIZE = 400;
  let usersScanned = 0;
  let usersWithDeadFields = 0;
  let usersUpdated = 0;
  let lastDoc: FirebaseFirestore.QueryDocumentSnapshot | undefined;

  const updatePayload = buildDeleteUpdate();

  while (true) {
    // Build query
    let query: FirebaseFirestore.Query = db.collection('Users');

    if (emailFilter) {
      // Single user by email
      query = query.where('email', '==', emailFilter).limit(1);
    } else {
      query = query.limit(PAGE_SIZE);
      if (lastDoc) query = query.startAfter(lastDoc);
    }

    const snap = await query.get();
    if (snap.empty) {
      if (emailFilter) {
        console.log(`  ❌ No user found with email: ${emailFilter}`);
      }
      break;
    }

    const batch = db.batch();
    let batchCount = 0;

    for (const doc of snap.docs) {
      usersScanned++;
      const data = doc.data() as Record<string, unknown>;
      const email = data['email'] as string | undefined;
      const present = extractPresentFields(data);

      if (present.length === 0) {
        printUserSummary(doc.id, email, present, 'DRY-RUN');
        continue;
      }

      usersWithDeadFields++;
      printUserSummary(doc.id, email, present, isCommit ? 'DELETED' : 'DRY-RUN');

      if (isCommit) {
        batch.update(doc.ref, updatePayload);
        batchCount++;

        if (batchCount >= BATCH_SIZE) {
          await batch.commit();
          usersUpdated += batchCount;
          batchCount = 0;
        }
      }
    }

    // Commit remaining batch
    if (isCommit && batchCount > 0) {
      await batch.commit();
      usersUpdated += batchCount;
    }

    lastDoc = snap.docs[snap.docs.length - 1];

    // If filtering by email or fetched fewer than PAGE_SIZE, we're done
    if (emailFilter || snap.size < PAGE_SIZE) break;
  }

  // ─── Summary ────────────────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════════');
  console.log('  Summary');
  console.log('══════════════════════════════════════════════════');
  console.log(`  Users scanned       : ${usersScanned}`);
  console.log(`  Users with dead fields : ${usersWithDeadFields}`);
  if (isCommit) {
    console.log(`  Users updated       : ${usersUpdated}`);
  } else {
    console.log(`  (Dry-run — rerun with --commit to apply)`);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
