/**
 * @fileoverview Backfill missing organization wallet trial metadata.
 *
 * Existing wallet balances are preserved. The script only adds the missing
 * 30-day trial metadata to organization wallets that do not already have it,
 * regardless of prior paid history — paid orgs still get the trial window.
 *
 * Usage:
 *   npx tsx --tsconfig tsconfig.scripts.json scripts/data-migrations/backfill-organization-trials.ts --dry-run
 *   npx tsx --tsconfig tsconfig.scripts.json scripts/data-migrations/backfill-organization-trials.ts --target=production --organization-id=<id> --commit
 */

import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { getArg, getTarget, hasFlag, initTargetApp } from '../migration/migration-utils.js';

const ORGANIZATIONS_COLLECTION = 'Organizations';
const WALLETS_COLLECTION = 'Wallets';
const TRIAL_DURATION_DAYS = 30;
const DEFAULT_TRIAL_GRANT_CENTS = 10_000;

interface OrganizationCandidate {
  readonly id: string;
  readonly name: string;
  readonly walletPath: string;
  readonly walletExists: boolean;
  readonly hasTrial: boolean;
  readonly balanceCents: number;
}

function parseOrganizationIds(): Set<string> {
  return new Set(
    (getArg('organization-id') ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
  );
}

function parseOrganizationNames(): Set<string> {
  return new Set(
    (getArg('name') ?? '')
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean)
  );
}

function buildTrial(now: Date): Record<string, unknown> {
  return {
    grantCents: DEFAULT_TRIAL_GRANT_CENTS,
    startedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + TRIAL_DURATION_DAYS * 86_400_000).toISOString(),
    status: 'active',
    convertedAt: null,
    conversionSource: null,
    displayMode: 'credits',
  };
}

async function findCandidates(
  db: Firestore,
  organizationIds: Set<string>,
  organizationNames: Set<string>
): Promise<OrganizationCandidate[]> {
  const organizations = await db.collection(ORGANIZATIONS_COLLECTION).get();
  const candidates: OrganizationCandidate[] = [];

  for (const organization of organizations.docs) {
    const data = organization.data();
    const name = typeof data['name'] === 'string' ? data['name'] : organization.id;
    const nameLower = name.trim().toLowerCase();

    if (
      (organizationIds.size > 0 && !organizationIds.has(organization.id)) ||
      (organizationNames.size > 0 && !organizationNames.has(nameLower))
    ) {
      continue;
    }

    const walletRef = db.collection(WALLETS_COLLECTION).doc(`org:${organization.id}`);
    const wallet = await walletRef.get();
    const walletData = wallet.data();

    candidates.push({
      id: organization.id,
      name,
      walletPath: walletRef.path,
      walletExists: wallet.exists,
      hasTrial: typeof walletData?.['trial'] === 'object' && walletData['trial'] !== null,
      balanceCents:
        typeof walletData?.['balanceCents'] === 'number' ? walletData['balanceCents'] : 0,
    });
  }

  return candidates;
}

async function main(): Promise<void> {
  const target = getTarget();
  const commit = hasFlag('commit');
  const organizationIds = parseOrganizationIds();
  const organizationNames = parseOrganizationNames();

  // --dry-run explicitly opts into a read-only production preview (no writes).
  if (target === 'production' && !commit && !hasFlag('dry-run')) {
    throw new Error('Production requires --commit or --dry-run. Refusing to run with neither.');
  }

  const { db } = initTargetApp();
  const candidates = await findCandidates(db, organizationIds, organizationNames);
  const missingTrial = candidates.filter(
    (candidate) => candidate.walletExists && !candidate.hasTrial
  );
  const missingWallet = candidates.filter((candidate) => !candidate.walletExists);

  console.log(`Target: ${target}`);
  console.log(`Mode: ${commit ? 'COMMIT' : 'DRY RUN'}`);
  console.log(`Organizations scanned: ${candidates.length}`);
  console.log(`Wallets missing trial metadata: ${missingTrial.length}`);
  console.log(`Organizations without wallets (skipped): ${missingWallet.length}`);

  for (const candidate of missingTrial) {
    console.log(
      `  ${commit ? 'Backfilling' : 'Would backfill'} ${candidate.name} (${candidate.id}) ` +
        `balance=$${(candidate.balanceCents / 100).toFixed(2)} wallet=${candidate.walletPath}`
    );
  }

  if (!commit || missingTrial.length === 0) {
    return;
  }

  const now = new Date();
  const batch = db.batch();
  for (const candidate of missingTrial) {
    const walletRef = db.collection(WALLETS_COLLECTION).doc(`org:${candidate.id}`);
    batch.update(walletRef, {
      trial: buildTrial(now),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  await batch.commit();
  console.log(`Committed ${missingTrial.length} organization trial backfills.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
