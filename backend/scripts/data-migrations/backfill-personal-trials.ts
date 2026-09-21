/**
 * @fileoverview Backfill missing personal wallet trial metadata for legacy users.
 *
 * This migration is intentionally conservative:
 * - only targets personal wallets (`Wallets/<userId>`) with balances already on file
 * - skips wallets that already have `trial` metadata
 * - preserves the current wallet balance instead of re-granting a default $100 credit amount
 * - sets a new active 30-day trial window anchored to the wallet's current balance / created time
 * - applies regardless of prior paid history — paid users still get the trial window
 *
 * Usage:
 *   npx tsx --tsconfig tsconfig.scripts.json scripts/data-migrations/backfill-personal-trials.ts --dry-run
 *   npx tsx --tsconfig tsconfig.scripts.json scripts/data-migrations/backfill-personal-trials.ts --target=production --user-id=<id> --commit
 */

import { fileURLToPath } from 'node:url';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { getArg, getTarget, hasFlag, initTargetApp } from '../migration/migration-utils.js';

const USERS_COLLECTION = 'Users';
const WALLETS_COLLECTION = 'Wallets';
const TRIAL_DURATION_DAYS = 30;

interface PersonalCandidate {
  readonly id: string;
  readonly walletPath: string;
  readonly walletExists: boolean;
  readonly hasTrial: boolean;
  readonly balanceCents: number;
  readonly activeBillingTarget?: {
    readonly ownerType?: string;
    readonly organizationId?: string;
    readonly teamId?: string;
  };
}

interface PersonalTrialBackfillInput {
  readonly walletExists: boolean;
  readonly hasTrial: boolean;
  readonly balanceCents: number;
}

export function shouldBackfillPersonalTrial({
  walletExists,
  hasTrial,
  balanceCents,
}: PersonalTrialBackfillInput): boolean {
  return walletExists && !hasTrial && balanceCents > 0;
}

export function buildPersonalWalletTrial(
  walletData: { readonly balanceCents?: number; readonly createdAt?: string },
  startedAt: Date = new Date()
): {
  readonly grantCents: number;
  readonly startedAt: string;
  readonly expiresAt: string;
  readonly status: 'active';
  readonly convertedAt: null;
  readonly conversionSource: null;
  readonly displayMode: 'credits';
} {
  const grantCents = typeof walletData.balanceCents === 'number' ? walletData.balanceCents : 0;

  return {
    grantCents,
    startedAt: startedAt.toISOString(),
    expiresAt: new Date(startedAt.getTime() + TRIAL_DURATION_DAYS * 86_400_000).toISOString(),
    status: 'active',
    convertedAt: null,
    conversionSource: null,
    displayMode: 'credits',
  };
}

function parseUserIds(): Set<string> {
  return new Set(
    (getArg('user-id') ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
  );
}

async function findCandidates(db: Firestore, userIds: Set<string>): Promise<PersonalCandidate[]> {
  const users = await db.collection(USERS_COLLECTION).get();
  const candidates: PersonalCandidate[] = [];

  for (const user of users.docs) {
    const userId = user.id;
    if (userIds.size > 0 && !userIds.has(userId)) {
      continue;
    }

    const userData = user.data() as
      | {
          activeBillingTarget?: {
            ownerType?: string;
            organizationId?: string;
            teamId?: string;
          };
        }
      | undefined;

    const activeBillingTarget = userData?.activeBillingTarget;
    const isOrganizationBilling =
      activeBillingTarget?.ownerType === 'organization' ||
      typeof activeBillingTarget?.organizationId === 'string' ||
      typeof activeBillingTarget?.teamId === 'string';

    if (isOrganizationBilling) {
      continue;
    }

    const walletRef = db.collection(WALLETS_COLLECTION).doc(userId);
    const wallet = await walletRef.get();
    const walletData = wallet.data();
    const balanceCents =
      typeof walletData?.['balanceCents'] === 'number' ? walletData['balanceCents'] : 0;
    const hasTrial = typeof walletData?.['trial'] === 'object' && walletData['trial'] !== null;

    candidates.push({
      id: userId,
      walletPath: walletRef.path,
      walletExists: wallet.exists,
      hasTrial,
      balanceCents,
      activeBillingTarget,
    });
  }

  return candidates;
}

async function main(): Promise<void> {
  const target = getTarget();
  const commit = hasFlag('commit');
  const userIds = parseUserIds();

  // --dry-run explicitly opts into a read-only production preview (no writes).
  if (target === 'production' && !commit && !hasFlag('dry-run')) {
    throw new Error('Production requires --commit or --dry-run. Refusing to run with neither.');
  }

  const { db } = initTargetApp();
  const candidates = await findCandidates(db, userIds);
  const missingTrial = candidates.filter((candidate) =>
    shouldBackfillPersonalTrial({
      walletExists: candidate.walletExists,
      hasTrial: candidate.hasTrial,
      balanceCents: candidate.balanceCents,
    })
  );

  console.log(`Target: ${target}`);
  console.log(`Mode: ${commit ? 'COMMIT' : 'DRY RUN'}`);
  console.log(`Users scanned: ${candidates.length}`);
  console.log(`Eligible personal wallet backfills: ${missingTrial.length}`);

  for (const candidate of missingTrial) {
    console.log(
      `  ${commit ? 'Backfilling' : 'Would backfill'} user=${candidate.id} ` +
        `balance=$${(candidate.balanceCents / 100).toFixed(2)} wallet=${candidate.walletPath}`
    );
  }

  if (!commit || missingTrial.length === 0) {
    return;
  }

  const now = new Date();
  const batch = db.batch();

  for (const candidate of missingTrial) {
    const walletRef = db.collection(WALLETS_COLLECTION).doc(candidate.id);
    batch.update(walletRef, {
      trial: buildPersonalWalletTrial(
        {
          balanceCents: candidate.balanceCents,
        },
        now
      ),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  await batch.commit();
  console.log(`Committed ${missingTrial.length} personal trial backfills.`);
}

const isDirectExecution =
  typeof process.argv[1] === 'string' && fileURLToPath(import.meta.url) === process.argv[1];

if (isDirectExecution) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
