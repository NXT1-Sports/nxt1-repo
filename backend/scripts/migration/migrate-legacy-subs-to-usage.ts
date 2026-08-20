#!/usr/bin/env npx tsx
/**
 * @fileoverview Phase 7 — Legacy Subscription → Usage Wallet Migration
 *
 * Converts active legacy Stripe subscriptions into one-time wallet credits on V2,
 * stores migration metadata for audit/idempotency, and optionally sets
 * cancel_at_period_end on legacy subscriptions.
 *
 * Core guarantees:
 * - Idempotent per legacy Stripe customer (BillingMigrations doc lock)
 * - Dry-run support
 * - Conservative grant aggregation (max by default)
 * - Auto top-up policy enforced as opt-in (disabled during migration)
 *
 * Usage examples:
 *   npx tsx scripts/migration/migrate-legacy-subs-to-usage.ts --dry-run --verbose
 *   npx tsx scripts/migration/migrate-legacy-subs-to-usage.ts --target=production --dry-run
 *   npx tsx scripts/migration/migrate-legacy-subs-to-usage.ts --target=production --cancel-at-period-end
 *
 * Optional env:
 *   LEGACY_STRIPE_SECRET_KEY=sk_live_...
 *   MIGRATION_LEGACY_PLAN_GRANT_MAP_JSON='{"price_abc":1200,"price_xyz":2500}'
 *   MIGRATION_GRANT_MULTIPLIER='1.0'
 *   MIGRATION_GRANT_CAP_CENTS='10000'
 *   MIGRATION_COHORT='2026-subscription-to-usage'
 */

import Stripe from 'stripe';
import { FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  initTargetApp,
  getArg,
  getLimit,
  hasFlag,
  isDryRun,
  isVerbose,
  ProgressReporter,
  printBanner,
  printSummary,
  writeReport,
  formatNum,
} from './migration-utils.js';
import { addWalletTopUp } from '../../src/modules/billing/budget.service.js';
import { COLLECTIONS as BILLING_COLLECTIONS } from '../../src/modules/billing/config.js';
import { createBillingPreferenceDocumentId } from '../../src/modules/billing/types/normalized-billing.types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

type GrantAggregation = 'max' | 'sum';

interface LegacySubscriptionCandidate {
  subscriptionId: string;
  customerId: string;
  email: string;
  currentPeriodEndIso?: string;
  cancelAtPeriodEnd: boolean;
  priceId?: string;
  unitAmountCents: number;
  inferredGrantCents: number;
}

interface UserMigrationCandidate {
  email: string;
  customerId: string;
  subscriptions: LegacySubscriptionCandidate[];
  grantCents: number;
  renewalEndsAtIso?: string;
}

interface MigrationReportRow {
  email: string;
  customerId: string;
  subscriptionIds: string[];
  mappedUid?: string;
  mappedUserId?: string;
  grantCents: number;
  renewalEndsAtIso?: string;
  status:
    | 'dry-run-eligible'
    | 'completed'
    | 'skipped-already-migrated'
    | 'skipped-missing-auth'
    | 'skipped-missing-user-doc'
    | 'failed';
  error?: string;
}

interface MigrationReport {
  timestamp: string;
  target: 'staging' | 'production';
  dryRun: boolean;
  options: {
    cancelAtPeriodEnd: boolean;
    createMissingAuthUsers: boolean;
    grantAggregation: GrantAggregation;
    grantMultiplier: number;
    grantCapCents: number;
    cohort: string;
    planMapKeys: string[];
    strictPlanMap: boolean;
  };
  totals: {
    activeSubscriptionsScanned: number;
    userCandidates: number;
    completed: number;
    dryRunEligible: number;
    alreadyMigrated: number;
    missingAuth: number;
    missingUserDoc: number;
    failed: number;
    cancelAtPeriodEndApplied: number;
    grantCentsTotal: number;
  };
  rows: MigrationReportRow[];
}

function shouldFinalizeProcessingWithoutTopUp(): boolean {
  return hasFlag('finalize-processing-without-topup');
}

/**
 * Default one-time grant map for known legacy subscription prices.
 * Values are in cents.
 */
const DEFAULT_LEGACY_PLAN_GRANT_MAP: Record<string, number> = {
  // Active legacy subscription prices observed in production Stripe.
  price_1SOMGAKBRB9aJio2BKSnjktc: 1200,
  price_1SOMH6KBRB9aJio2lR0W5PYp: 1200,
  price_1QeTFZKBRB9aJio2BNRwMqIK: 3500,
  price_1QIAX6KBRB9aJio2KYoWBtXy: 1200,
  price_1OqeaGKBRB9aJio2fBBHHZP5: 4550,
  price_1MwWYqKBRB9aJio2S7LInq4k: 6500,
};

function parseGrantMap(): Record<string, number> {
  const argMap = getArg('plan-map-json');
  const envMap = process.env['MIGRATION_LEGACY_PLAN_GRANT_MAP_JSON'];
  const raw = argMap || envMap;
  if (!raw) return { ...DEFAULT_LEGACY_PLAN_GRANT_MAP };

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const normalized: Record<string, number> = {};
    for (const [priceId, amount] of Object.entries(parsed)) {
      if (typeof amount === 'number' && Number.isFinite(amount) && amount > 0) {
        normalized[priceId] = Math.round(amount);
      }
    }
    return {
      ...DEFAULT_LEGACY_PLAN_GRANT_MAP,
      ...normalized,
    };
  } catch {
    throw new Error('Invalid JSON for --plan-map-json / MIGRATION_LEGACY_PLAN_GRANT_MAP_JSON');
  }
}

function isStrictPlanMapEnabled(): boolean {
  const raw = (getArg('strict-plan-map') || process.env['MIGRATION_STRICT_PLAN_MAP'] || 'true')
    .trim()
    .toLowerCase();

  return raw !== 'false' && raw !== '0' && raw !== 'no';
}

function getGrantAggregation(): GrantAggregation {
  const raw = (getArg('grant-aggregation') || process.env['MIGRATION_GRANT_AGGREGATION'] || 'max')
    .trim()
    .toLowerCase();
  return raw === 'sum' ? 'sum' : 'max';
}

function getGrantMultiplier(): number {
  const raw = getArg('grant-multiplier') || process.env['MIGRATION_GRANT_MULTIPLIER'] || '1';
  const value = Number.parseFloat(raw);
  if (!Number.isFinite(value) || value <= 0) return 1;
  return value;
}

function getGrantCapCents(): number {
  const raw = getArg('grant-cap-cents') || process.env['MIGRATION_GRANT_CAP_CENTS'] || '10000';
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value <= 0) return 10000;
  return value;
}

function resolveGrantCents(
  priceId: string | undefined,
  unitAmountCents: number,
  planMap: Record<string, number>,
  multiplier: number,
  capCents: number
): number {
  const mapped = priceId ? planMap[priceId] : undefined;
  const base = mapped ?? Math.max(0, Math.round(unitAmountCents * multiplier));
  const capped = Math.min(base, capCents);
  return Math.max(0, capped);
}

async function resolveCustomer(
  stripe: Stripe,
  customer: string | Stripe.Customer | Stripe.DeletedCustomer
): Promise<Stripe.Customer | null> {
  if (typeof customer === 'string') {
    const c = await stripe.customers.retrieve(customer);
    return c.deleted ? null : c;
  }
  if ('deleted' in customer && customer.deleted) return null;
  return customer;
}

function toIsoFromEpochSeconds(seconds?: number | null): string | undefined {
  if (!seconds || !Number.isFinite(seconds)) return undefined;
  return new Date(seconds * 1000).toISOString();
}

async function fetchActiveSubscriptionCandidates(
  stripe: Stripe,
  planMap: Record<string, number>,
  multiplier: number,
  capCents: number,
  limit: number
): Promise<{ subscriptions: LegacySubscriptionCandidate[]; scanned: number }> {
  const subscriptions: LegacySubscriptionCandidate[] = [];
  let scanned = 0;
  let startingAfter: string | undefined;

  while (true) {
    const page = await stripe.subscriptions.list({
      status: 'active',
      limit: 100,
      starting_after: startingAfter,
      expand: ['data.items.data.price', 'data.customer'],
    });

    if (page.data.length === 0) break;

    for (const sub of page.data) {
      scanned += 1;
      const customer = await resolveCustomer(stripe, sub.customer);
      const email = customer?.email?.trim().toLowerCase();
      if (!email) continue;

      const firstItem = sub.items.data[0];
      const unitAmountCents = firstItem?.price?.unit_amount ?? 0;
      const priceId = firstItem?.price?.id;
      const inferredGrantCents = resolveGrantCents(
        priceId,
        unitAmountCents,
        planMap,
        multiplier,
        capCents
      );

      subscriptions.push({
        subscriptionId: sub.id,
        customerId: customer.id,
        email,
        currentPeriodEndIso: toIsoFromEpochSeconds(sub.current_period_end),
        cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
        priceId,
        unitAmountCents,
        inferredGrantCents,
      });

      if (limit > 0 && subscriptions.length >= limit) {
        return { subscriptions, scanned };
      }
    }

    if (!page.has_more) break;
    startingAfter = page.data[page.data.length - 1]?.id;
  }

  return { subscriptions, scanned };
}

function aggregateByUser(
  candidates: LegacySubscriptionCandidate[],
  aggregation: GrantAggregation
): UserMigrationCandidate[] {
  const grouped = new Map<string, UserMigrationCandidate>();

  for (const sub of candidates) {
    const existing = grouped.get(sub.email);
    if (!existing) {
      grouped.set(sub.email, {
        email: sub.email,
        customerId: sub.customerId,
        subscriptions: [sub],
        grantCents: sub.inferredGrantCents,
        renewalEndsAtIso: sub.currentPeriodEndIso,
      });
      continue;
    }

    existing.subscriptions.push(sub);
    if (aggregation === 'sum') {
      existing.grantCents += sub.inferredGrantCents;
    } else {
      existing.grantCents = Math.max(existing.grantCents, sub.inferredGrantCents);
    }

    if (
      sub.currentPeriodEndIso &&
      (!existing.renewalEndsAtIso || sub.currentPeriodEndIso > existing.renewalEndsAtIso)
    ) {
      existing.renewalEndsAtIso = sub.currentPeriodEndIso;
    }
  }

  return [...grouped.values()].sort((a, b) => a.email.localeCompare(b.email));
}

async function findUserDocByEmail(
  db: FirebaseFirestore.Firestore,
  email: string
): Promise<FirebaseFirestore.QueryDocumentSnapshot | null> {
  const snap = await db.collection('Users').where('email', '==', email).limit(1).get();
  return snap.empty ? null : snap.docs[0]!;
}

async function main(): Promise<void> {
  printBanner('Phase 7: Legacy Subscription -> Usage Migration');

  const target = (getArg('target') === 'production' ? 'production' : 'staging') as
    'staging' | 'production';
  const cancelAtPeriodEnd = hasFlag('cancel-at-period-end');
  const createMissingAuthUsers = hasFlag('create-missing-auth-users');
  const grantAggregation = getGrantAggregation();
  const grantMultiplier = getGrantMultiplier();
  const grantCapCents = getGrantCapCents();
  const strictPlanMap = isStrictPlanMapEnabled();
  const finalizeProcessingWithoutTopUp = shouldFinalizeProcessingWithoutTopUp();
  const cohort =
    getArg('cohort') || process.env['MIGRATION_COHORT'] || '2026-subscription-to-usage';

  const legacyStripeKey =
    process.env['LEGACY_STRIPE_SECRET_KEY'] || process.env['STRIPE_SECRET_KEY'] || '';
  if (!legacyStripeKey) {
    throw new Error(
      'Missing LEGACY_STRIPE_SECRET_KEY (or STRIPE_SECRET_KEY) for legacy Stripe scan'
    );
  }

  const planMap = parseGrantMap();
  const stripe = new Stripe(legacyStripeKey, {
    apiVersion: '2026-02-25.clover',
    typescript: true,
  });

  const limit = getLimit();
  const { subscriptions, scanned } = await fetchActiveSubscriptionCandidates(
    stripe,
    planMap,
    grantMultiplier,
    grantCapCents,
    limit
  );

  if (strictPlanMap) {
    const unknownPriceIds = [
      ...new Set(
        subscriptions
          .map((s) => s.priceId)
          .filter((id): id is string => Boolean(id))
          .filter((id) => !(id in planMap))
      ),
    ];

    if (unknownPriceIds.length > 0) {
      throw new Error(
        `Strict plan map is enabled and found unmapped legacy price IDs: ${unknownPriceIds.join(', ')}. ` +
          `Add them via --plan-map-json or MIGRATION_LEGACY_PLAN_GRANT_MAP_JSON before running.`
      );
    }
  }

  const userCandidates = aggregateByUser(subscriptions, grantAggregation);

  const { app, db } = initTargetApp();
  const auth = getAuth(app);

  const report: MigrationReport = {
    timestamp: new Date().toISOString(),
    target,
    dryRun: isDryRun,
    options: {
      cancelAtPeriodEnd,
      createMissingAuthUsers,
      grantAggregation,
      grantMultiplier,
      grantCapCents,
      cohort,
      planMapKeys: Object.keys(planMap),
      strictPlanMap,
    },
    totals: {
      activeSubscriptionsScanned: scanned,
      userCandidates: userCandidates.length,
      completed: 0,
      dryRunEligible: 0,
      alreadyMigrated: 0,
      missingAuth: 0,
      missingUserDoc: 0,
      failed: 0,
      cancelAtPeriodEndApplied: 0,
      grantCentsTotal: 0,
    },
    rows: [],
  };

  const progress = new ProgressReporter('Migrating subscribers');

  for (let index = 0; index < userCandidates.length; index += 1) {
    const candidate = userCandidates[index]!;
    progress.tick(index + 1, userCandidates.length);

    const subscriptionIds = candidate.subscriptions.map((s) => s.subscriptionId);
    const priceIds = candidate.subscriptions
      .map((s) => s.priceId)
      .filter((id): id is string => Boolean(id));

    const row: MigrationReportRow = {
      email: candidate.email,
      customerId: candidate.customerId,
      subscriptionIds,
      grantCents: candidate.grantCents,
      renewalEndsAtIso: candidate.renewalEndsAtIso,
      status: 'failed',
    };

    try {
      let authUser: { uid: string } | null = null;
      try {
        const user = await auth.getUserByEmail(candidate.email);
        authUser = { uid: user.uid };
      } catch (error) {
        const code = (error as { code?: string })?.code;
        if (code === 'auth/user-not-found' && createMissingAuthUsers && !isDryRun) {
          const created = await auth.createUser({ email: candidate.email, emailVerified: false });
          authUser = { uid: created.uid };
        } else {
          row.status = 'skipped-missing-auth';
          report.totals.missingAuth += 1;
          report.rows.push(row);
          continue;
        }
      }

      if (!authUser) {
        row.status = 'skipped-missing-auth';
        report.totals.missingAuth += 1;
        report.rows.push(row);
        continue;
      }

      row.mappedUid = authUser.uid;

      const directUserDoc = await db.collection('Users').doc(authUser.uid).get();
      const userDoc = directUserDoc.exists
        ? directUserDoc
        : await findUserDocByEmail(db, candidate.email);

      if (!userDoc || !userDoc.exists) {
        row.status = 'skipped-missing-user-doc';
        report.totals.missingUserDoc += 1;
        report.rows.push(row);
        continue;
      }

      const userId = userDoc.id;
      row.mappedUserId = userId;

      const migrationDocId = `legacy-subscription-${candidate.customerId}`;
      const migrationRef = db.collection('BillingMigrations').doc(migrationDocId);
      const existingMigration = await migrationRef.get();
      const existingStatus = existingMigration.data()?.['migrationStatus'];

      if (existingMigration.exists && existingStatus === 'completed') {
        row.status = 'skipped-already-migrated';
        report.totals.alreadyMigrated += 1;
        report.rows.push(row);
        continue;
      }

      if (isDryRun) {
        row.status = 'dry-run-eligible';
        report.totals.dryRunEligible += 1;
        report.totals.grantCentsTotal += candidate.grantCents;
        report.rows.push(row);
        continue;
      }

      const shouldSkipTopUp =
        finalizeProcessingWithoutTopUp &&
        existingMigration.exists &&
        existingStatus === 'processing';

      await migrationRef.set(
        {
          migrationType: 'legacy_subscription_to_usage',
          migrationStatus: 'processing',
          migrationCohort: cohort,
          email: candidate.email,
          userId,
          authUid: authUser.uid,
          legacyStripeCustomerId: candidate.customerId,
          legacySubscriptionIds: subscriptionIds,
          legacyPriceIds: priceIds,
          migrationGrantAmountCents: candidate.grantCents,
          autoTopUpPolicy: 'opt_in',
          startedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      const topUp = shouldSkipTopUp
        ? { newBalance: -1, alreadyFinalized: true }
        : await addWalletTopUp(db, userId, candidate.grantCents, 'stripe', {
            initiatedByUserId: userId,
            checkoutSessionId: migrationDocId,
          });

      const preferenceRef = db
        .collection(BILLING_COLLECTIONS.BILLING_PREFERENCES)
        .doc(createBillingPreferenceDocumentId('individual', userId));

      const userMigrationFields: Record<string, unknown> = {
        legacyBillingSource: 'subscription',
        migrationCohort: cohort,
        migrationGrantedAt: new Date().toISOString(),
        migrationGrantAmountCents: candidate.grantCents,
        migrationStatus: 'completed',
        migrationGrantSource: shouldSkipTopUp
          ? 'one_time_credit_recovery_finalize'
          : 'one_time_credit',
        legacyStripeCustomerId: candidate.customerId,
        legacySubscriptionIds: subscriptionIds,
        legacyPriceIds: priceIds,
      };
      if (candidate.renewalEndsAtIso) {
        userMigrationFields['legacySubscriptionRenewalEndsAt'] = candidate.renewalEndsAtIso;
      }

      await Promise.all([
        preferenceRef.set(
          {
            autoTopUpEnabled: false,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        ),
        db.collection('Users').doc(userId).set(userMigrationFields, { merge: true }),
        migrationRef.set(
          {
            migrationStatus: 'completed',
            completedAt: FieldValue.serverTimestamp(),
            walletBalanceAfterCents:
              typeof topUp.newBalance === 'number' && topUp.newBalance >= 0
                ? topUp.newBalance
                : FieldValue.delete(),
            recoveryFinalizedWithoutTopUp: shouldSkipTopUp,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        ),
      ]);

      if (cancelAtPeriodEnd) {
        for (const sub of candidate.subscriptions) {
          if (sub.cancelAtPeriodEnd) continue;
          await stripe.subscriptions.update(sub.subscriptionId, { cancel_at_period_end: true });
          report.totals.cancelAtPeriodEndApplied += 1;
        }
      }

      row.status = 'completed';
      report.totals.completed += 1;
      report.totals.grantCentsTotal += candidate.grantCents;
      report.rows.push(row);
    } catch (error) {
      row.status = 'failed';
      row.error = error instanceof Error ? error.message : String(error);
      report.totals.failed += 1;
      report.rows.push(row);
      if (isVerbose) {
        console.error(`\n  ❌ Failed for ${candidate.email}: ${row.error}`);
      }
    }
  }

  progress.done(userCandidates.length);

  printSummary('Migration Results', [
    ['Active subscriptions scanned', formatNum(report.totals.activeSubscriptionsScanned)],
    ['User candidates', formatNum(report.totals.userCandidates)],
    ['Completed', formatNum(report.totals.completed)],
    ['Dry-run eligible', formatNum(report.totals.dryRunEligible)],
    ['Already migrated', formatNum(report.totals.alreadyMigrated)],
    ['Missing auth', formatNum(report.totals.missingAuth)],
    ['Missing user doc', formatNum(report.totals.missingUserDoc)],
    ['Failed', formatNum(report.totals.failed)],
    ['cancel_at_period_end updates', formatNum(report.totals.cancelAtPeriodEndApplied)],
    ['Total grant cents', formatNum(report.totals.grantCentsTotal)],
  ]);

  const stamp = new Date().toISOString().slice(0, 10);
  mkdirSync(resolve(__dirname, '../../reports/migration'), { recursive: true });
  writeReport(`legacy-subscriptions-to-usage-${stamp}.json`, report);
}

main().catch((error) => {
  console.error('\n❌ Migration failed:', error);
  process.exit(1);
});
