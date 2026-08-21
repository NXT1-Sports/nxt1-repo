/**
 * @fileoverview Repair the remaining targeted B2C/B2B Notion lifecycle drift.
 *
 * Replays only the audited stale records through the canonical lifecycle services.
 * Archived canonical page references are cleared before replay so the existing
 * services can recreate or update the correct Notion row.
 *
 * Usage:
 *   cd backend && npx tsx scripts/repair-targeted-notion-lifecycle-drift.ts --dry-run
 *   cd backend && npx tsx scripts/repair-targeted-notion-lifecycle-drift.ts --scope=b2c
 *   cd backend && npx tsx scripts/repair-targeted-notion-lifecycle-drift.ts --scope=b2b
 */

import 'dotenv/config';
import { execSync } from 'node:child_process';
import { FieldValue } from 'firebase-admin/firestore';

if (!process.env['NOTION_API_TOKEN']) {
  process.env['NOTION_API_TOKEN'] = 'ntn_b38264946492oyCJBDyZyII01etd90y3sByx28xZPJ2buq';
}
if (!process.env['PRODUCTION_NOTION_B2C_USERS_DATABASE_ID']) {
  process.env['PRODUCTION_NOTION_B2C_USERS_DATABASE_ID'] = '9bbfe296a14a4a0a8eac2c45cb796b4b';
}
if (!process.env['NOTION_SIGNUP_DASHBOARD_ENABLED']) {
  process.env['NOTION_SIGNUP_DASHBOARD_ENABLED'] = 'true';
}

if (!process.env['FIREBASE_PRIVATE_KEY'] || !process.env['FIREBASE_CLIENT_EMAIL']) {
  try {
    const clientEmail = execSync(
      'gcloud secrets versions access latest --secret=FIREBASE_CLIENT_EMAIL --project=nxt-1-v2',
      { encoding: 'utf8' }
    ).trim();
    const privateKey = execSync(
      'gcloud secrets versions access latest --secret=FIREBASE_PRIVATE_KEY --project=nxt-1-v2',
      { encoding: 'utf8' }
    ).trim();
    if (clientEmail && privateKey) {
      process.env['FIREBASE_PROJECT_ID'] = 'nxt-1-v2';
      process.env['FIREBASE_CLIENT_EMAIL'] = clientEmail;
      process.env['FIREBASE_PRIVATE_KEY'] = privateKey;
    }
  } catch {
    // Best effort loading from gcloud Secret Manager.
  }
}

type RuntimeEnvironment = 'production' | 'staging';
type RepairScope = 'all' | 'b2c' | 'b2b';
type B2CExpectedStage =
  | 'Onboarding Completed'
  | 'Usage Started'
  | 'Expansion / Pricing'
  | 'Organization Mode';
type B2BExpectedStage = 'Onboarding Completed' | 'Churned';
type B2CStateKey =
  | 'accountStarted'
  | 'usageStarted'
  | 'trialCreditsFinished'
  | 'closedWon'
  | 'expansionPricing'
  | 'organizationMode'
  | 'closedLost'
  | 'churned';

interface CliArgs {
  readonly isDryRun: boolean;
  readonly environment: RuntimeEnvironment;
  readonly scope: RepairScope;
}

interface B2CTarget {
  readonly userId: string;
  readonly expectedStage: B2CExpectedStage;
  readonly repairMode: 'archived-canonical-page' | 'live-stage-mismatch';
}

interface B2BTarget {
  readonly userId: string;
  readonly expectedStage: B2BExpectedStage;
  readonly repairMode: 'archived-canonical-page' | 'live-stage-mismatch';
}

interface RepairOutcome {
  readonly userId: string;
  readonly scope: 'b2c' | 'b2b';
  readonly expectedStage: string;
  readonly outcome: 'repaired' | 'verified-existing' | 'skipped' | 'failed';
  readonly detail: string;
  readonly pageId?: string;
}

const B2C_STATE_KEYS: readonly B2CStateKey[] = [
  'accountStarted',
  'usageStarted',
  'trialCreditsFinished',
  'closedWon',
  'expansionPricing',
  'organizationMode',
  'closedLost',
  'churned',
];

const B2C_TARGETS: readonly B2CTarget[] = [
  {
    userId: '0KSwG8P9A7Zf5oPh2k4FZ79SPZb2',
    expectedStage: 'Usage Started',
    repairMode: 'live-stage-mismatch',
  },
  {
    userId: '0LFQhXgNZea1lDW2AJ7HMEcMjcs1',
    expectedStage: 'Usage Started',
    repairMode: 'live-stage-mismatch',
  },
  {
    userId: '0Q9a4EDT6mS9KqmOEqaFsgguVj02',
    expectedStage: 'Usage Started',
    repairMode: 'live-stage-mismatch',
  },
  {
    userId: 'GusUyLal1GTjMIARSX0a74cBo3m2',
    expectedStage: 'Onboarding Completed',
    repairMode: 'live-stage-mismatch',
  },
  {
    userId: 'bAVEP6JUoLepjERJD6bjY1wuEFB2',
    expectedStage: 'Onboarding Completed',
    repairMode: 'live-stage-mismatch',
  },
  {
    userId: 'lHA7MUFucmNnphpK8tkIw1l92KD3',
    expectedStage: 'Onboarding Completed',
    repairMode: 'live-stage-mismatch',
  },
  {
    userId: '01ceXKC8nCR9miFewWhrFFssBZm2',
    expectedStage: 'Expansion / Pricing',
    repairMode: 'archived-canonical-page',
  },
  {
    userId: '027yrbdzPgdj4wXEO885ouxp7vo2',
    expectedStage: 'Usage Started',
    repairMode: 'archived-canonical-page',
  },
  {
    userId: '02GYMfLhaIaATUN7BIymNKa5JMu2',
    expectedStage: 'Organization Mode',
    repairMode: 'archived-canonical-page',
  },
  {
    userId: '17IOF0HR2rRKcY2AyI0yNyvcj3v1',
    expectedStage: 'Onboarding Completed',
    repairMode: 'archived-canonical-page',
  },
  {
    userId: 'Gf9KUBqXxPcOX5rMRl2WOIaYKvr2',
    expectedStage: 'Usage Started',
    repairMode: 'archived-canonical-page',
  },
  {
    userId: 'LVYSiDBsWfQn71zGhh1JHkPXkZ43',
    expectedStage: 'Onboarding Completed',
    repairMode: 'archived-canonical-page',
  },
  {
    userId: 'MxQHGSNx8CbRJU1cMkB29YFN7Jo1',
    expectedStage: 'Usage Started',
    repairMode: 'archived-canonical-page',
  },
  {
    userId: 'nSbNUWyYJZg7Q4ywxjjSHiAlni42',
    expectedStage: 'Usage Started',
    repairMode: 'archived-canonical-page',
  },
];

const B2B_TARGETS: readonly B2BTarget[] = [
  {
    userId: '00ZdF1ZEH2b3z2GvV7G603CTozp1',
    expectedStage: 'Onboarding Completed',
    repairMode: 'archived-canonical-page',
  },
  {
    userId: '2txOfDdAXbYd0GixOfME418fBJC3',
    expectedStage: 'Onboarding Completed',
    repairMode: 'archived-canonical-page',
  },
  {
    userId: '6E6ToYI8gGUPTPpntnLrXrw9R3K3',
    expectedStage: 'Onboarding Completed',
    repairMode: 'archived-canonical-page',
  },
  {
    userId: 'BlIHKjP5tYhE5VxkGUfNT48bzkB2',
    expectedStage: 'Onboarding Completed',
    repairMode: 'archived-canonical-page',
  },
  {
    userId: 'GkFZOZbbTuNgOMnonaSGKeC9rWT2',
    expectedStage: 'Onboarding Completed',
    repairMode: 'archived-canonical-page',
  },
  {
    userId: 'd9uyA6HtCPVFxsp4r6QN5sdAuI92',
    expectedStage: 'Onboarding Completed',
    repairMode: 'archived-canonical-page',
  },
  {
    userId: 'fA53y2SKTqazvhqy8vCTHosIKNa2',
    expectedStage: 'Onboarding Completed',
    repairMode: 'archived-canonical-page',
  },
  {
    userId: 'lN6HSmpDupY8kwwi7DeKzZ3gX6T2',
    expectedStage: 'Onboarding Completed',
    repairMode: 'archived-canonical-page',
  },
  {
    userId: 'ryC0CTkNy0TEOge3mfIYPVeW7a12',
    expectedStage: 'Onboarding Completed',
    repairMode: 'archived-canonical-page',
  },
  {
    userId: 'tvn6C7zmTLQIwVa1OPi7LD7ip3C2',
    expectedStage: 'Onboarding Completed',
    repairMode: 'archived-canonical-page',
  },
  {
    userId: 'vCvoeZqvy3Xiu7koWIxKJkZqD0V2',
    expectedStage: 'Onboarding Completed',
    repairMode: 'archived-canonical-page',
  },
  {
    userId: 'wichh0LeYjgaomxc794bHWDONzu1',
    expectedStage: 'Onboarding Completed',
    repairMode: 'archived-canonical-page',
  },
  {
    userId: 'MTd6GxvvLNdsyt70rGtbNrSKXzG3',
    expectedStage: 'Churned',
    repairMode: 'live-stage-mismatch',
  },
  {
    userId: 'uXAgzkqQWkPPhV2a3OD4JUTwco43',
    expectedStage: 'Onboarding Completed',
    repairMode: 'live-stage-mismatch',
  },
];

function report(message: string, details?: Record<string, unknown>): void {
  console.info(message);
  if (details) {
    console.info(JSON.stringify(details, null, 2));
  }
}

function parseCliArgs(): CliArgs {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');
  const envArg = args.find((arg) => arg.startsWith('--env='));
  const scopeArg = args.find((arg) => arg.startsWith('--scope='));
  const rawScope = scopeArg?.split('=')[1];
  const scope: RepairScope = rawScope === 'b2c' || rawScope === 'b2b' ? rawScope : 'all';

  return {
    isDryRun,
    environment: envArg?.split('=')[1] === 'staging' ? 'staging' : 'production',
    scope,
  };
}

function compactText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function toDate(value: unknown): Date | undefined {
  if (!value) return undefined;
  if (value instanceof Date) return value;

  if (typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }

  if (typeof value === 'object') {
    const candidate = value as { toDate?: () => Date; seconds?: number; _seconds?: number };
    if (typeof candidate.toDate === 'function') {
      return candidate.toDate();
    }
    const seconds =
      typeof candidate.seconds === 'number'
        ? candidate.seconds
        : typeof candidate._seconds === 'number'
          ? candidate._seconds
          : undefined;
    return typeof seconds === 'number' ? new Date(seconds * 1000) : undefined;
  }

  return undefined;
}

function getNestedRecord(
  source: Record<string, unknown> | undefined,
  ...path: readonly string[]
): Record<string, unknown> | undefined {
  let current: unknown = source;

  for (const segment of path) {
    if (!current || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }

  return current && typeof current === 'object' ? (current as Record<string, unknown>) : undefined;
}

function resolveB2CState(
  user: Record<string, unknown>,
  key: B2CStateKey
): Record<string, unknown> | undefined {
  return getNestedRecord(user, 'lifecycle', 'b2cUsers', key);
}

function resolveLatestPersonalUsageContext(
  latestUsage: {
    feature?: string;
    unitCostSnapshot?: number;
    metadata?: Record<string, unknown>;
  } | null,
  state: Record<string, unknown> | undefined
): { operationId?: string; feature?: string; chargeAmountCents?: number } {
  const operationId =
    compactText(latestUsage?.metadata?.['operationId']) ?? compactText(state?.['operationId']);
  const feature = compactText(latestUsage?.feature) ?? compactText(state?.['feature']);
  const chargeAmountCents =
    typeof state?.['amountCents'] === 'number' && state['amountCents'] > 0
      ? (state['amountCents'] as number)
      : typeof latestUsage?.unitCostSnapshot === 'number' && latestUsage.unitCostSnapshot > 0
        ? latestUsage.unitCostSnapshot
        : undefined;

  return { operationId, feature, chargeAmountCents };
}

function resolveLatestPersonalFundingContext(
  payment: { amountPaid?: number; type?: string } | null,
  state: Record<string, unknown> | undefined
): { amountCents?: number; source?: 'stripe_checkout' | 'iap_topup' } {
  const stateSource = compactText(state?.['source']);
  const source =
    stateSource === 'iap_topup'
      ? 'iap_topup'
      : payment?.type?.toLowerCase().includes('iap')
        ? 'iap_topup'
        : stateSource === 'stripe_checkout' || payment
          ? 'stripe_checkout'
          : undefined;

  const amountCents =
    typeof state?.['amountCents'] === 'number' && state['amountCents'] > 0
      ? (state['amountCents'] as number)
      : typeof payment?.amountPaid === 'number' && payment.amountPaid > 0
        ? payment.amountPaid
        : undefined;

  return { amountCents, source };
}

function resolveOrganizationId(user: Record<string, unknown>): string | undefined {
  const organizationModeState = resolveB2CState(user, 'organizationMode');
  const sports = Array.isArray(user['sports'])
    ? (user['sports'] as Array<Record<string, unknown>>)
    : [];
  const activeSportIndex =
    typeof user['activeSportIndex'] === 'number' && user['activeSportIndex'] >= 0
      ? user['activeSportIndex']
      : 0;
  const activeSport = sports[activeSportIndex] ?? sports[0];
  const activeTeam = getNestedRecord(activeSport, 'team');

  return (
    compactText(organizationModeState?.['organizationId']) ??
    compactText(activeTeam?.['organizationId']) ??
    compactText(user['organizationId'])
  );
}

async function clearB2CCanonicalPageRefs(
  db: FirebaseFirestore.Firestore,
  userId: string
): Promise<void> {
  const payload: Record<string, unknown> = {};

  for (const key of B2C_STATE_KEYS) {
    payload[`lifecycle.b2cUsers.${key}.pageId`] = FieldValue.delete();
    payload[`lifecycle.b2cUsers.${key}.pageUrl`] = FieldValue.delete();
  }

  await db.collection('Users').doc(userId).set(payload, { merge: true });
}

async function resetSignupLifecycleState(
  db: FirebaseFirestore.Firestore,
  userId: string,
  reason: string
): Promise<void> {
  await db.collection('Users').doc(userId).update({
    'lifecycle.signup.notionDashboard.status': FieldValue.delete(),
    'lifecycle.signup.notionDashboard.idempotencyKey': FieldValue.delete(),
    'lifecycle.signup.notionDashboard.environment': FieldValue.delete(),
    'lifecycle.signup.notionDashboard.queuedAt': FieldValue.delete(),
    'lifecycle.signup.notionDashboard.processingStartedAt': FieldValue.delete(),
    'lifecycle.signup.notionDashboard.leaseExpiresAt': FieldValue.delete(),
    'lifecycle.signup.notionDashboard.lastAttemptAt': FieldValue.delete(),
    'lifecycle.signup.notionDashboard.nextAttemptAt': FieldValue.delete(),
    'lifecycle.signup.notionDashboard.attemptCount': FieldValue.delete(),
    'lifecycle.signup.notionDashboard.createdAt': FieldValue.delete(),
    'lifecycle.signup.notionDashboard.pageId': FieldValue.delete(),
    'lifecycle.signup.notionDashboard.pageUrl': FieldValue.delete(),
    'lifecycle.signup.notionDashboard.failedPermanentAt': FieldValue.delete(),
    'lifecycle.signup.notionDashboard.lastError': reason,
  });
}

async function resetB2BChurnState(
  db: FirebaseFirestore.Firestore,
  userId: string,
  reason: string
): Promise<void> {
  await db.collection('Users').doc(userId).update({
    'lifecycle.sales.churned.status': 'failed',
    'lifecycle.sales.churned.queuedAt': FieldValue.delete(),
    'lifecycle.sales.churned.processingStartedAt': FieldValue.delete(),
    'lifecycle.sales.churned.createdAt': FieldValue.delete(),
    'lifecycle.sales.churned.pageId': FieldValue.delete(),
    'lifecycle.sales.churned.pageUrl': FieldValue.delete(),
    'lifecycle.sales.churned.lastError': reason,
  });
}

async function verifyB2CStage(input: {
  readonly db: FirebaseFirestore.Firestore;
  readonly userId: string;
  readonly stateKey: B2CStateKey;
  readonly expectedStage: B2CExpectedStage;
  readonly assertNotionPageStatus: typeof import('../src/services/marketing/integrations/notion/notion-client.service.js').assertNotionPageStatus;
  readonly getNotionB2CUsersConfig: typeof import('../src/services/marketing/integrations/notion/notion-client.service.js').getNotionB2CUsersConfig;
  readonly environment: RuntimeEnvironment;
}): Promise<{ ok: boolean; pageId?: string; detail: string }> {
  const snap = await input.db.collection('Users').doc(input.userId).get();
  if (!snap.exists) {
    return { ok: false, detail: 'user-missing-after-repair' };
  }

  const user = (snap.data() ?? {}) as Record<string, unknown>;
  const pageId = compactText(resolveB2CState(user, input.stateKey)?.['pageId']);
  if (!pageId) {
    return { ok: false, detail: `missing-pageId:${input.stateKey}` };
  }

  await input.assertNotionPageStatus({
    config: input.getNotionB2CUsersConfig(input.environment),
    pageId,
    expectedStatus: input.expectedStage,
  });

  return { ok: true, pageId, detail: 'verified' };
}

async function verifyB2BStage(input: {
  readonly db: FirebaseFirestore.Firestore;
  readonly userId: string;
  readonly expectedStage: B2BExpectedStage;
  readonly pagePath: 'lifecycle.signup.notionDashboard.pageId' | 'lifecycle.sales.churned.pageId';
  readonly assertNotionPageStatus: typeof import('../src/services/marketing/integrations/notion/notion-client.service.js').assertNotionPageStatus;
  readonly getNotionSignupDashboardConfig: typeof import('../src/services/marketing/integrations/notion/notion-client.service.js').getNotionSignupDashboardConfig;
}): Promise<{ ok: boolean; pageId?: string; detail: string }> {
  const snap = await input.db.collection('Users').doc(input.userId).get();
  if (!snap.exists) {
    return { ok: false, detail: 'user-missing-after-repair' };
  }

  const pageId = compactText(snap.get(input.pagePath) as unknown);
  if (!pageId) {
    return { ok: false, detail: `missing-pageId:${input.pagePath}` };
  }

  await input.assertNotionPageStatus({
    config: input.getNotionSignupDashboardConfig('production'),
    pageId,
    expectedStatus: input.expectedStage,
  });

  return { ok: true, pageId, detail: 'verified' };
}

function mapB2CStageToStateKey(stage: B2CExpectedStage): B2CStateKey {
  switch (stage) {
    case 'Onboarding Completed':
      return 'accountStarted';
    case 'Usage Started':
      return 'usageStarted';
    case 'Expansion / Pricing':
      return 'expansionPricing';
    case 'Organization Mode':
      return 'organizationMode';
  }
}

async function run(): Promise<void> {
  const { isDryRun, environment, scope } = parseCliArgs();
  process.env['NODE_ENV'] = environment === 'production' ? 'production' : 'development';

  const { ensureMongoDBConnected } = await import('../src/config/database.config.js');
  const { runWithMongoEnvironmentScope } =
    await import('../src/middleware/mongo/mongo-scope.context.js');
  const { UsageEventModel } = await import('../src/models/analytics/usage-event.model.js');
  const { PaymentLogModel } = await import('../src/models/billing/payment-log.model.js');
  const { db } = await import('../src/utils/firebase.js');
  const { logger } = await import('../src/utils/logger.js');
  const notionClient =
    await import('../src/services/marketing/integrations/notion/notion-client.service.js');
  const b2cLifecycle = await import('../src/services/marketing/lifecycle/b2c-users.service.js');
  const signupLifecycle =
    await import('../src/services/marketing/lifecycle/signup-notion-dashboard.service.js');
  const churnLifecycle =
    await import('../src/services/marketing/lifecycle/churned-notion-dashboard.service.js');

  await ensureMongoDBConnected();

  logger.info('[RepairTargetedNotionLifecycleDrift] Starting repair run', {
    isDryRun,
    environment,
    scope,
  });
  report('[RepairTargetedNotionLifecycleDrift] Starting repair run', {
    isDryRun,
    environment,
    scope,
    b2cTargetCount: scope === 'b2b' ? 0 : B2C_TARGETS.length,
    b2bTargetCount: scope === 'b2c' ? 0 : B2B_TARGETS.length,
  });

  const outcomes: RepairOutcome[] = [];

  await runWithMongoEnvironmentScope(environment, async () => {
    if (scope !== 'b2b') {
      for (const target of B2C_TARGETS) {
        const stateKey = mapB2CStageToStateKey(target.expectedStage);
        const snap = await db.collection('Users').doc(target.userId).get();
        if (!snap.exists) {
          outcomes.push({
            userId: target.userId,
            scope: 'b2c',
            expectedStage: target.expectedStage,
            outcome: 'failed',
            detail: 'missing-user',
          });
          continue;
        }

        const user = (snap.data() ?? {}) as Record<string, unknown>;

        if (isDryRun) {
          outcomes.push({
            userId: target.userId,
            scope: 'b2c',
            expectedStage: target.expectedStage,
            outcome: 'skipped',
            detail: `dry-run:${target.repairMode}`,
          });
          continue;
        }

        try {
          if (target.repairMode === 'archived-canonical-page') {
            await clearB2CCanonicalPageRefs(db, target.userId);
          }

          let result:
            | Awaited<ReturnType<typeof b2cLifecycle.reupsertB2CUsersAccountStartedEntry>>
            | Awaited<ReturnType<typeof b2cLifecycle.recordB2CUsersUsageStartedEntry>>
            | Awaited<ReturnType<typeof b2cLifecycle.recordB2CUsersExpansionPricingEntry>>
            | Awaited<ReturnType<typeof b2cLifecycle.recordB2CUsersOrganizationModeEntry>>;

          if (target.expectedStage === 'Onboarding Completed') {
            result = await b2cLifecycle.reupsertB2CUsersAccountStartedEntry({
              db,
              userId: target.userId,
              environment,
            });
          } else if (target.expectedStage === 'Usage Started') {
            const latestUsage = await UsageEventModel.findOne({
              billedOwnerType: 'individual',
              billedOwnerId: target.userId,
            })
              .sort({ createdAt: -1 })
              .select({ feature: 1, unitCostSnapshot: 1, metadata: 1 })
              .lean<{
                feature?: string;
                unitCostSnapshot?: number;
                metadata?: Record<string, unknown>;
              }>()
              .exec();

            const usageInput = resolveLatestPersonalUsageContext(
              latestUsage,
              resolveB2CState(user, 'usageStarted')
            );

            if (
              !usageInput.operationId ||
              !usageInput.feature ||
              !usageInput.chargeAmountCents ||
              usageInput.chargeAmountCents <= 0
            ) {
              outcomes.push({
                userId: target.userId,
                scope: 'b2c',
                expectedStage: target.expectedStage,
                outcome: 'failed',
                detail: 'missing-usage-replay-input',
              });
              continue;
            }

            result = await b2cLifecycle.recordB2CUsersUsageStartedEntry({
              db,
              userId: target.userId,
              environment,
              operationId: usageInput.operationId,
              feature: usageInput.feature,
              chargeAmountCents: usageInput.chargeAmountCents,
            });
          } else if (target.expectedStage === 'Expansion / Pricing') {
            const latestPayment = await PaymentLogModel.findOne({
              userId: target.userId,
              status: 'PAID',
              amountPaid: { $gt: 0 },
              $or: [
                { organizationId: { $exists: false } },
                { organizationId: null },
                { organizationId: '' },
              ],
            })
              .sort({ createdAt: -1 })
              .select({ amountPaid: 1, type: 1 })
              .lean<{ amountPaid?: number; type?: string }>()
              .exec();

            const fundingInput = resolveLatestPersonalFundingContext(
              latestPayment,
              resolveB2CState(user, 'expansionPricing')
            );

            if (!fundingInput.amountCents || !fundingInput.source) {
              outcomes.push({
                userId: target.userId,
                scope: 'b2c',
                expectedStage: target.expectedStage,
                outcome: 'failed',
                detail: 'missing-expansion-replay-input',
              });
              continue;
            }

            result = await b2cLifecycle.recordB2CUsersExpansionPricingEntry({
              db,
              userId: target.userId,
              environment,
              amountCents: fundingInput.amountCents,
              source: fundingInput.source,
            });
          } else {
            const organizationId = resolveOrganizationId(user);
            if (!organizationId) {
              outcomes.push({
                userId: target.userId,
                scope: 'b2c',
                expectedStage: target.expectedStage,
                outcome: 'failed',
                detail: 'missing-organization-id',
              });
              continue;
            }

            result = await b2cLifecycle.recordB2CUsersOrganizationModeEntry({
              db,
              userId: target.userId,
              environment,
              organizationId,
            });
          }

          try {
            const verification = await verifyB2CStage({
              db,
              userId: target.userId,
              stateKey,
              expectedStage: target.expectedStage,
              assertNotionPageStatus: notionClient.assertNotionPageStatus,
              getNotionB2CUsersConfig: notionClient.getNotionB2CUsersConfig,
              environment,
            });

            outcomes.push({
              userId: target.userId,
              scope: 'b2c',
              expectedStage: target.expectedStage,
              outcome:
                result.status === 'created' || result.status === 'existing'
                  ? 'repaired'
                  : 'verified-existing',
              detail: `${target.repairMode}:${result.status}:${verification.detail}`,
              pageId: verification.pageId,
            });
          } catch (error) {
            outcomes.push({
              userId: target.userId,
              scope: 'b2c',
              expectedStage: target.expectedStage,
              outcome: 'failed',
              detail:
                error instanceof Error
                  ? `verification-failed:${error.message}`
                  : `verification-failed:${String(error)}`,
            });
          }
        } catch (error) {
          outcomes.push({
            userId: target.userId,
            scope: 'b2c',
            expectedStage: target.expectedStage,
            outcome: 'failed',
            detail: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    if (scope !== 'b2c') {
      for (const target of B2B_TARGETS) {
        const snap = await db.collection('Users').doc(target.userId).get();
        if (!snap.exists) {
          outcomes.push({
            userId: target.userId,
            scope: 'b2b',
            expectedStage: target.expectedStage,
            outcome: 'failed',
            detail: 'missing-user',
          });
          continue;
        }

        const user = (snap.data() ?? {}) as Record<string, unknown>;

        if (isDryRun) {
          outcomes.push({
            userId: target.userId,
            scope: 'b2b',
            expectedStage: target.expectedStage,
            outcome: 'skipped',
            detail: `dry-run:${target.repairMode}`,
          });
          continue;
        }

        try {
          if (target.expectedStage === 'Onboarding Completed') {
            await resetSignupLifecycleState(
              db,
              target.userId,
              `manual-repair:${target.repairMode}`
            );

            const queued = await signupLifecycle.enqueueSignupNotionDashboardEntry({
              db,
              userId: target.userId,
              environment,
            });

            const processed =
              queued.status === 'queued'
                ? await signupLifecycle.processSignupNotionDashboardEntry({
                    db,
                    userId: target.userId,
                    environment,
                  })
                : {
                    userId: target.userId,
                    outcome: 'skipped' as const,
                    reason: queued.reason,
                  };

            try {
              const verification = await verifyB2BStage({
                db,
                userId: target.userId,
                expectedStage: target.expectedStage,
                pagePath: 'lifecycle.signup.notionDashboard.pageId',
                assertNotionPageStatus: notionClient.assertNotionPageStatus,
                getNotionSignupDashboardConfig: notionClient.getNotionSignupDashboardConfig,
              });

              outcomes.push({
                userId: target.userId,
                scope: 'b2b',
                expectedStage: target.expectedStage,
                outcome:
                  processed.outcome === 'created' || processed.outcome === 'existing'
                    ? 'repaired'
                    : 'verified-existing',
                detail: `${target.repairMode}:${processed.outcome}:${verification.detail}`,
                pageId: verification.pageId,
              });
            } catch (error) {
              outcomes.push({
                userId: target.userId,
                scope: 'b2b',
                expectedStage: target.expectedStage,
                outcome: 'failed',
                detail:
                  error instanceof Error
                    ? `verification-failed:${error.message}`
                    : `verification-failed:${String(error)}`,
              });
            }
          } else {
            const churnState = getNestedRecord(user, 'lifecycle', 'sales', 'churned');
            const organizationId = compactText(churnState?.['organizationId']);
            const email = compactText(user['email']);
            const lastPaidAt = toDate(churnState?.['lastPaidAt']);
            const zeroBalanceSinceAt = toDate(churnState?.['zeroBalanceSinceAt']);
            const balanceCents =
              typeof churnState?.['balanceCents'] === 'number'
                ? (churnState['balanceCents'] as number)
                : undefined;
            const graceDays =
              typeof churnState?.['graceDays'] === 'number'
                ? (churnState['graceDays'] as number)
                : undefined;

            if (!organizationId || !email || !lastPaidAt || !zeroBalanceSinceAt) {
              outcomes.push({
                userId: target.userId,
                scope: 'b2b',
                expectedStage: target.expectedStage,
                outcome: 'failed',
                detail: 'missing-b2b-churn-replay-input',
              });
              continue;
            }

            await resetB2BChurnState(db, target.userId, `manual-repair:${target.repairMode}`);

            const result = await churnLifecycle.recordChurnedNotionDashboardEntry({
              db,
              organizationId,
              userId: target.userId,
              email,
              lastPaidAt,
              zeroBalanceSinceAt,
              balanceCents: balanceCents ?? 0,
              graceDays,
            });

            try {
              const verification = await verifyB2BStage({
                db,
                userId: target.userId,
                expectedStage: target.expectedStage,
                pagePath: 'lifecycle.sales.churned.pageId',
                assertNotionPageStatus: notionClient.assertNotionPageStatus,
                getNotionSignupDashboardConfig: notionClient.getNotionSignupDashboardConfig,
              });

              outcomes.push({
                userId: target.userId,
                scope: 'b2b',
                expectedStage: target.expectedStage,
                outcome: result.status === 'created' ? 'repaired' : 'verified-existing',
                detail: `${target.repairMode}:${result.status}:${verification.detail}`,
                pageId: verification.pageId,
              });
            } catch (error) {
              outcomes.push({
                userId: target.userId,
                scope: 'b2b',
                expectedStage: target.expectedStage,
                outcome: 'failed',
                detail:
                  error instanceof Error
                    ? `verification-failed:${error.message}`
                    : `verification-failed:${String(error)}`,
              });
            }
          }
        } catch (error) {
          outcomes.push({
            userId: target.userId,
            scope: 'b2b',
            expectedStage: target.expectedStage,
            outcome: 'failed',
            detail: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }
  });

  const summary = {
    total: outcomes.length,
    repaired: outcomes.filter((item) => item.outcome === 'repaired').length,
    verifiedExisting: outcomes.filter((item) => item.outcome === 'verified-existing').length,
    skipped: outcomes.filter((item) => item.outcome === 'skipped').length,
    failed: outcomes.filter((item) => item.outcome === 'failed').length,
    failures: outcomes.filter((item) => item.outcome === 'failed'),
  };

  logger.info('[RepairTargetedNotionLifecycleDrift] Repair run complete', summary);
  report('[RepairTargetedNotionLifecycleDrift] Repair run complete', summary);
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(
      '[RepairTargetedNotionLifecycleDrift] Fatal error',
      error instanceof Error ? error.message : String(error)
    );
    process.exit(1);
  });
