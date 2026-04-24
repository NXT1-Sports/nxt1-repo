/**
 * @fileoverview Budget Service
 * @module @nxt1/backend/modules/billing
 *
 * Manages hierarchical spending budgets with three tiers:
 *   1. Organization — master budget for the paying entity (e.g., a high school)
 *   2. Team — optional sub-allocation within an organization
 *   3. Individual — personal budget for users without an org
 *
 * Two-tier budget gate:
 *   - If a user belongs to an org, check the team sub-limit first (if set),
 *     then check the organization master budget.
 *   - If a user is individual, check their personal budget only.
 *
 * Spend is recorded at both the team allocation level AND the org master level
 * simultaneously to keep aggregates consistent.
 *
 * Threshold alerts (50% / 80% / 100%) fire for both team admins (sub-limit)
 * and org admins (master budget).
 */

import type { Firestore } from 'firebase-admin/firestore';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { logger } from '../../utils/logger.js';
import { COLLECTIONS } from './config.js';
import { getPlatformConfig } from './platform-config.service.js';
import { getRuntimeEnvironment } from '../../config/runtime-environment.js';
import {
  createBillingOwnerKey,
  createBillingPreferenceDocumentId,
  createPeriodKey,
  createPeriodLedgerDocumentId,
  createWalletDocumentId,
  parseBillingOwnerKey,
  type BillingState,
  type BillingEntity,
  type BillingPreferenceDocument,
  type OrganizationBudgetDocument,
  type PaymentProvider,
  type PeriodLedgerDocument,
  type TeamBudgetAllocation,
  type WalletDocument,
  type WalletHold,
  type WalletHoldResult,
  DEFAULT_INDIVIDUAL_BUDGET,
  DEFAULT_INDIVIDUAL_STARTER_BALANCE,
  DEFAULT_ORGANIZATION_BUDGET,
  DEFAULT_ORGANIZATION_STARTER_BALANCE,
} from './types/index.js';
import { NOTIFICATION_TYPES, type NotificationType } from '@nxt1/core';
import type {
  BudgetInterval,
  BillingMode,
  BillingOwnerType,
  BillingTargetReference,
} from '@nxt1/core/usage';

interface NormalizedBillingDocuments {
  readonly wallet: WalletDocument;
  readonly billingPreference: BillingPreferenceDocument;
  readonly periodLedger: PeriodLedgerDocument;
}

interface NormalizedBillingRefs {
  readonly walletRef: FirebaseFirestore.DocumentReference;
  readonly billingPreferenceRef: FirebaseFirestore.DocumentReference;
  readonly periodLedgerRef: FirebaseFirestore.DocumentReference;
}

interface NormalizedBillingDocumentsForTransaction {
  readonly refs: NormalizedBillingRefs;
  readonly docs: NormalizedBillingDocuments;
}

interface BillingUserRoutingRecord {
  readonly activeBillingTarget?: BillingTargetReference;
}

interface CreditsLowAlert {
  readonly title: string;
  readonly priority: 'high' | 'normal';
  readonly updates: {
    readonly creditsNotified80?: boolean;
    readonly creditsNotified50?: boolean;
    readonly creditsNotified25?: boolean;
  };
}

interface CheckoutTopUpOptions {
  readonly checkoutSessionId?: string;
  readonly initiatedByUserId?: string;
  readonly notificationVariant?: 'standard' | 'auto_topup';
}

interface WalletEmptyNotificationOptions {
  readonly organizationId?: string;
  readonly userIdsToExclude?: readonly string[];
}

interface AutoTopUpTriggerResult {
  readonly status: 'not_attempted' | 'in_progress' | 'succeeded' | 'failed';
  readonly reason?:
    | 'unsupported_provider'
    | 'disabled'
    | 'invalid_configuration'
    | 'balance_above_threshold'
    | 'lock_held'
    | 'missing_customer'
    | 'missing_payment_method'
    | 'charge_failed'
    | 'unexpected_error';
}

export type WalletBalanceAlertKind = 'none' | 'wallet_empty' | 'credits_threshold' | 'low_balance';

const DEFAULT_BUDGET_INTERVAL: BudgetInterval = 'monthly';

const BUDGET_INTERVAL_PRIORITY: Record<BudgetInterval, number> = {
  daily: 0,
  weekly: 1,
  monthly: 2,
};

function getBudgetInterval(interval?: string | null): BudgetInterval {
  if (interval === 'daily' || interval === 'weekly' || interval === 'monthly') {
    return interval;
  }

  return DEFAULT_BUDGET_INTERVAL;
}

function getBudgetIntervalLabel(interval?: string | null): string {
  const normalizedInterval = getBudgetInterval(interval);
  return normalizedInterval.charAt(0).toUpperCase() + normalizedInterval.slice(1);
}

function buildOrganizationBillingTarget(
  organizationId: string,
  teamId?: string,
  source: BillingTargetReference['source'] = 'organization'
): BillingTargetReference {
  return {
    ownerId: organizationId,
    ownerType: 'organization',
    organizationId,
    teamId,
    source,
  };
}

function buildPersonalBillingTarget(
  userId: string,
  organizationId?: string,
  teamId?: string,
  source: BillingTargetReference['source'] = 'default',
  userSelected = false
): BillingTargetReference {
  return {
    ownerId: userId,
    ownerType: 'individual',
    organizationId,
    teamId,
    source,
    ...(userSelected ? { userSelected: true } : {}),
  };
}

function isExplicitPersonalBillingTarget(
  target: BillingTargetReference | undefined
): target is BillingTargetReference {
  return (
    target?.ownerType === 'individual' &&
    target.source === 'personal' &&
    target.userSelected === true &&
    (typeof target.organizationId === 'string' || typeof target.teamId === 'string')
  );
}

function getNormalizedBillingRefs(
  db: Firestore,
  ownerType: BillingOwnerType,
  ownerId: string,
  periodKey: string
): NormalizedBillingRefs {
  return {
    walletRef: db.collection(COLLECTIONS.WALLETS).doc(createWalletDocumentId(ownerType, ownerId)),
    billingPreferenceRef: db
      .collection(COLLECTIONS.BILLING_PREFERENCES)
      .doc(createBillingPreferenceDocumentId(ownerType, ownerId)),
    periodLedgerRef: db
      .collection(COLLECTIONS.PERIOD_LEDGERS)
      .doc(createPeriodLedgerDocumentId(ownerType, ownerId, periodKey)),
  };
}

async function getLatestMonthlyBudget(
  db: Firestore,
  ownerType: BillingOwnerType,
  ownerId: string,
  fallbackBudget: number
): Promise<number> {
  const snapshot = await db
    .collection(COLLECTIONS.PERIOD_LEDGERS)
    .where('ownerType', '==', ownerType)
    .where('ownerId', '==', ownerId)
    .orderBy('periodStart', 'desc')
    .limit(1)
    .get();

  if (snapshot.empty) {
    return fallbackBudget;
  }

  const existingBudget = snapshot.docs[0]?.data()['monthlyBudget'];
  return typeof existingBudget === 'number' && existingBudget >= 0
    ? existingBudget
    : fallbackBudget;
}

async function ensureNormalizedBillingOwner(
  db: Firestore,
  target: BillingTargetReference,
  options?: { billingOwnerUid?: string }
): Promise<NormalizedBillingDocuments> {
  const starterWalletConfigPromise = getStarterWalletConfig(db);
  const initialRefs = getNormalizedBillingRefs(db, target.ownerType, target.ownerId, 'pending');
  const [walletSnap, preferenceSnap, starterWalletConfig] = await Promise.all([
    initialRefs.walletRef.get(),
    initialRefs.billingPreferenceRef.get(),
    starterWalletConfigPromise,
  ]);

  const budgetInterval = getBudgetInterval(preferenceSnap.data()?.['budgetInterval'] as string);
  const { periodKey, periodStart, periodEnd } = getCurrentPeriodWindow(budgetInterval);
  const refs = getNormalizedBillingRefs(db, target.ownerType, target.ownerId, periodKey);
  const periodLedgerSnap = await refs.periodLedgerRef.get();

  const writes: Array<Promise<unknown>> = [];
  const now = FieldValue.serverTimestamp();
  const defaultWalletBalance =
    target.ownerType === 'organization'
      ? starterWalletConfig.organizationAmountCents
      : starterWalletConfig.individualAmountCents;
  const defaultMonthlyBudget =
    target.ownerType === 'organization' ? DEFAULT_ORGANIZATION_BUDGET : DEFAULT_INDIVIDUAL_BUDGET;

  if (!walletSnap.exists) {
    writes.push(
      refs.walletRef.set(
        {
          id: refs.walletRef.id,
          ownerId: target.ownerId,
          ownerType: target.ownerType,
          balanceCents: defaultWalletBalance,
          pendingHoldsCents: 0,
          creditsAlertBaselineCents: defaultWalletBalance,
          creditsNotified80: false,
          creditsNotified50: false,
          creditsNotified25: false,
          iapLowBalanceNotified: false,
          totalReferralRewardsCents: 0,
          schemaVersion: 1,
          createdAt: now,
          updatedAt: now,
        },
        { merge: true }
      )
    );
  }

  if (!preferenceSnap.exists) {
    writes.push(
      refs.billingPreferenceRef.set(
        {
          id: refs.billingPreferenceRef.id,
          ownerId: target.ownerId,
          ownerType: target.ownerType,
          paymentProvider: 'stripe',
          billingOwnerUid: options?.billingOwnerUid,
          budgetName: undefined,
          budgetAlertsEnabled: false,
          budgetInterval: DEFAULT_BUDGET_INTERVAL,
          hardStop: true,
          autoTopUpEnabled: false,
          autoTopUpThresholdCents: 0,
          autoTopUpAmountCents: 0,
          autoTopUpInProgress: false,
          schemaVersion: 1,
          createdAt: now,
          updatedAt: now,
        },
        { merge: true }
      )
    );
  } else if (options?.billingOwnerUid && !preferenceSnap.data()?.['billingOwnerUid']) {
    writes.push(
      refs.billingPreferenceRef.set(
        {
          billingOwnerUid: options.billingOwnerUid,
          updatedAt: now,
        },
        { merge: true }
      )
    );
  }

  if (!periodLedgerSnap.exists) {
    const monthlyBudget = await getLatestMonthlyBudget(
      db,
      target.ownerType,
      target.ownerId,
      defaultMonthlyBudget
    );
    writes.push(
      refs.periodLedgerRef.set(
        {
          id: refs.periodLedgerRef.id,
          ownerId: target.ownerId,
          ownerType: target.ownerType,
          periodKey,
          periodStart,
          periodEnd,
          monthlyBudget,
          currentPeriodSpend: 0,
          notified50: false,
          notified80: false,
          notified100: false,
          schemaVersion: 1,
          createdAt: now,
          updatedAt: now,
        },
        { merge: true }
      )
    );
  }

  if (writes.length > 0) {
    await Promise.all(writes);
  }

  const [walletDoc, preferenceDoc, periodLedgerDoc] = await Promise.all([
    refs.walletRef.get(),
    refs.billingPreferenceRef.get(),
    refs.periodLedgerRef.get(),
  ]);

  return {
    wallet: walletDoc.data() as WalletDocument,
    billingPreference: preferenceDoc.data() as BillingPreferenceDocument,
    periodLedger: periodLedgerDoc.data() as PeriodLedgerDocument,
  };
}

async function getNormalizedBillingDocuments(
  db: Firestore,
  target: BillingTargetReference
): Promise<NormalizedBillingDocuments | null> {
  const initialRefs = getNormalizedBillingRefs(db, target.ownerType, target.ownerId, 'pending');
  const [walletDoc, preferenceDoc] = await Promise.all([
    initialRefs.walletRef.get(),
    initialRefs.billingPreferenceRef.get(),
  ]);

  const budgetInterval = getBudgetInterval(preferenceDoc.data()?.['budgetInterval'] as string);
  const { periodKey } = getCurrentPeriodWindow(budgetInterval);
  const refs = getNormalizedBillingRefs(db, target.ownerType, target.ownerId, periodKey);
  const periodLedgerDoc = await refs.periodLedgerRef.get();

  if (!walletDoc.exists || !preferenceDoc.exists || !periodLedgerDoc.exists) {
    return null;
  }

  return {
    wallet: walletDoc.data() as WalletDocument,
    billingPreference: preferenceDoc.data() as BillingPreferenceDocument,
    periodLedger: periodLedgerDoc.data() as PeriodLedgerDocument,
  };
}

async function getNormalizedBillingDocumentsForTransaction(
  txn: FirebaseFirestore.Transaction,
  db: Firestore,
  target: BillingTargetReference
): Promise<NormalizedBillingDocumentsForTransaction | null> {
  const initialRefs = getNormalizedBillingRefs(db, target.ownerType, target.ownerId, 'pending');
  const [walletDoc, preferenceDoc] = await Promise.all([
    txn.get(initialRefs.walletRef),
    txn.get(initialRefs.billingPreferenceRef),
  ]);

  const budgetInterval = getBudgetInterval(preferenceDoc.data()?.['budgetInterval'] as string);
  const { periodKey } = getCurrentPeriodWindow(budgetInterval);
  const refs = getNormalizedBillingRefs(db, target.ownerType, target.ownerId, periodKey);
  const periodLedgerDoc = await txn.get(refs.periodLedgerRef);

  if (!walletDoc.exists || !preferenceDoc.exists || !periodLedgerDoc.exists) {
    return null;
  }

  return {
    refs,
    docs: {
      wallet: walletDoc.data() as WalletDocument,
      billingPreference: preferenceDoc.data() as BillingPreferenceDocument,
      periodLedger: periodLedgerDoc.data() as PeriodLedgerDocument,
    },
  };
}

function projectBillingState(
  userId: string,
  target: BillingTargetReference,
  documents: NormalizedBillingDocuments
): BillingState {
  const billingEntity: BillingEntity =
    target.ownerType === 'organization' ? 'organization' : 'individual';

  return {
    userId,
    billingOwnerUid: documents.billingPreference.billingOwnerUid,
    teamId: target.teamId,
    organizationId: target.organizationId,
    billingMode: target.ownerType === 'organization' ? 'organization' : 'personal',
    billingEntity,
    budgetInterval: getBudgetInterval(documents.billingPreference.budgetInterval),
    monthlyBudget: documents.periodLedger.monthlyBudget ?? 0,
    currentPeriodSpend: documents.periodLedger.currentPeriodSpend ?? 0,
    periodStart: documents.periodLedger.periodStart,
    periodEnd: documents.periodLedger.periodEnd,
    notified50: documents.periodLedger.notified50 ?? false,
    notified80: documents.periodLedger.notified80 ?? false,
    notified100: documents.periodLedger.notified100 ?? false,
    iapLowBalanceNotified: documents.wallet.iapLowBalanceNotified ?? false,
    budgetAlertsEnabled: documents.billingPreference.budgetAlertsEnabled ?? false,
    creditsAlertBaselineCents: documents.wallet.creditsAlertBaselineCents,
    totalReferralRewards: documents.wallet.totalReferralRewardsCents,
    creditsNotified80: documents.wallet.creditsNotified80 ?? false,
    creditsNotified50: documents.wallet.creditsNotified50 ?? false,
    creditsNotified25: documents.wallet.creditsNotified25 ?? false,
    hardStop: documents.billingPreference.hardStop,
    paymentProvider: documents.billingPreference.paymentProvider,
    walletBalanceCents: documents.wallet.balanceCents ?? 0,
    pendingHoldsCents: documents.wallet.pendingHoldsCents ?? 0,
    budgetName: documents.billingPreference.budgetName,
    autoTopUpEnabled: documents.billingPreference.autoTopUpEnabled ?? false,
    autoTopUpThresholdCents: documents.billingPreference.autoTopUpThresholdCents,
    autoTopUpAmountCents: documents.billingPreference.autoTopUpAmountCents,
    autoTopUpInProgress: documents.billingPreference.autoTopUpInProgress ?? false,
    autoTopUpLockedAt: documents.billingPreference.autoTopUpLockedAt,
    createdAt: documents.wallet.createdAt,
    updatedAt: documents.wallet.updatedAt,
  };
}

async function getStoredBillingTarget(
  db: Firestore,
  userId: string
): Promise<BillingTargetReference> {
  const userDoc = await db.collection('Users').doc(userId).get();
  const userData = (userDoc.data() ?? {}) as BillingUserRoutingRecord;
  return userData.activeBillingTarget ?? buildPersonalBillingTarget(userId);
}

async function setActiveBillingTarget(
  db: Firestore,
  userId: string,
  target: BillingTargetReference
): Promise<void> {
  await db.collection('Users').doc(userId).set(
    {
      activeBillingTarget: target,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

async function getBillingStateForTarget(
  db: Firestore,
  userId: string,
  target: BillingTargetReference
): Promise<BillingState | null> {
  const documents = await getNormalizedBillingDocuments(db, target);
  if (!documents) {
    return null;
  }

  return projectBillingState(userId, target, documents);
}

export async function getPersonalBillingSummary(
  db: Firestore,
  userId: string
): Promise<BillingState | null> {
  const activeTarget = await getStoredBillingTarget(db, userId);
  const personalTarget = buildPersonalBillingTarget(
    userId,
    activeTarget.organizationId,
    activeTarget.teamId
  );
  return getBillingStateForTarget(db, userId, personalTarget);
}

// ============================================
// BILLING CONTEXT MANAGEMENT
// ============================================

/**
 * Get the resolved billing state for a user.
 * Returns null if none exists yet.
 */
export async function getBillingState(db: Firestore, userId: string): Promise<BillingState | null> {
  if (userId.startsWith('org:')) {
    const { ownerId, ownerType } = parseBillingOwnerKey(userId);
    const target = buildOrganizationBillingTarget(ownerId, undefined, 'organization');
    return getBillingStateForTarget(db, createBillingOwnerKey(ownerType, ownerId), target);
  }

  const target = await getStoredBillingTarget(db, userId);
  return getBillingStateForTarget(db, userId, target);
}

function getCurrentPeriodWindow(
  interval: BudgetInterval = DEFAULT_BUDGET_INTERVAL,
  now: Date = new Date()
): {
  periodKey: string;
  periodStart: string;
  periodEnd: string;
} {
  const normalizedInterval = getBudgetInterval(interval);
  let periodStart: string;
  let periodEnd: string;

  if (normalizedInterval === 'daily') {
    periodStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0)
    ).toISOString();
    periodEnd = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999)
    ).toISOString();
  } else if (normalizedInterval === 'weekly') {
    const start = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0)
    );
    const day = start.getUTCDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    start.setUTCDate(start.getUTCDate() + diffToMonday);
    const end = new Date(start);
    end.setUTCDate(start.getUTCDate() + 6);
    end.setUTCHours(23, 59, 59, 999);
    periodStart = start.toISOString();
    periodEnd = end.toISOString();
  } else {
    periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
    periodEnd = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999)
    ).toISOString();
  }

  return {
    periodKey: createPeriodKey(periodStart, now, normalizedInterval),
    periodStart,
    periodEnd,
  };
}

type OrganizationBudgetTargetType = 'organization' | 'team';

function createOrganizationBudgetDocumentId(
  organizationId: string,
  targetType: OrganizationBudgetTargetType,
  targetId: string,
  budgetInterval: BudgetInterval
): string {
  return `${organizationId}:${targetType}:${targetId}:${getBudgetInterval(budgetInterval)}`;
}

function getOrganizationBudgetRef(
  db: Firestore,
  organizationId: string,
  targetType: OrganizationBudgetTargetType,
  targetId: string,
  budgetInterval: BudgetInterval
): FirebaseFirestore.DocumentReference {
  return db
    .collection(COLLECTIONS.ORGANIZATION_BUDGETS)
    .doc(createOrganizationBudgetDocumentId(organizationId, targetType, targetId, budgetInterval));
}

async function alignOrganizationBudgetToCurrentWindow(
  docRef: FirebaseFirestore.DocumentReference,
  budget: OrganizationBudgetDocument
): Promise<OrganizationBudgetDocument> {
  const normalizedInterval = getBudgetInterval(budget.budgetInterval);
  const currentWindow = getCurrentPeriodWindow(normalizedInterval);

  if (
    budget.periodStart === currentWindow.periodStart &&
    budget.periodEnd === currentWindow.periodEnd
  ) {
    return {
      ...budget,
      budgetInterval: normalizedInterval,
    };
  }

  await docRef.set(
    {
      budgetInterval: normalizedInterval,
      currentPeriodSpend: 0,
      periodStart: currentWindow.periodStart,
      periodEnd: currentWindow.periodEnd,
      notified50: false,
      notified80: false,
      notified100: false,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return {
    ...budget,
    budgetInterval: normalizedInterval,
    currentPeriodSpend: 0,
    periodStart: currentWindow.periodStart,
    periodEnd: currentWindow.periodEnd,
    notified50: false,
    notified80: false,
    notified100: false,
  };
}

export async function getOrganizationBudgetDocuments(
  db: Firestore,
  organizationId: string
): Promise<OrganizationBudgetDocument[]> {
  const snapshot = await db
    .collection(COLLECTIONS.ORGANIZATION_BUDGETS)
    .where('organizationId', '==', organizationId)
    .get();

  return Promise.all(
    snapshot.docs.map((doc) =>
      alignOrganizationBudgetToCurrentWindow(doc.ref, {
        id: doc.id,
        ...doc.data(),
      } as unknown as OrganizationBudgetDocument)
    )
  );
}

async function getApplicableOrganizationBudgetDocuments(
  db: Firestore,
  organizationId: string,
  teamId?: string
): Promise<{
  readonly organizationBudgets: readonly OrganizationBudgetDocument[];
  readonly teamBudgets: readonly OrganizationBudgetDocument[];
}> {
  const budgets = await getOrganizationBudgetDocuments(db, organizationId);
  const sortByInterval = (left: OrganizationBudgetDocument, right: OrganizationBudgetDocument) =>
    BUDGET_INTERVAL_PRIORITY[left.budgetInterval] - BUDGET_INTERVAL_PRIORITY[right.budgetInterval];
  return {
    organizationBudgets: budgets
      .filter(
        (budget) => budget.targetType === 'organization' && budget.targetId === organizationId
      )
      .sort(sortByInterval),
    teamBudgets: teamId
      ? budgets
          .filter((budget) => budget.targetType === 'team' && budget.targetId === teamId)
          .sort(sortByInterval)
      : [],
  };
}

async function upsertOrganizationBudgetDocument(
  db: Firestore,
  organizationId: string,
  targetType: OrganizationBudgetTargetType,
  targetId: string,
  budgetLimit: number,
  budgetInterval: BudgetInterval,
  hardStop: boolean
): Promise<void> {
  const normalizedInterval = getBudgetInterval(budgetInterval);
  const { periodStart, periodEnd } = getCurrentPeriodWindow(normalizedInterval);
  const ref = getOrganizationBudgetRef(
    db,
    organizationId,
    targetType,
    targetId,
    normalizedInterval
  );
  const snapshot = await ref.get();
  const now = FieldValue.serverTimestamp();

  await ref.set(
    {
      id: ref.id,
      organizationId,
      targetType,
      targetId,
      budgetInterval: normalizedInterval,
      budgetLimit,
      hardStop,
      currentPeriodSpend: snapshot.exists ? (snapshot.data()?.['currentPeriodSpend'] ?? 0) : 0,
      periodStart,
      periodEnd,
      notified50: false,
      notified80: false,
      notified100: false,
      ...(snapshot.exists ? { updatedAt: now } : { createdAt: now, updatedAt: now }),
    },
    { merge: true }
  );
}

async function deleteOrganizationBudgetDocument(
  db: Firestore,
  organizationId: string,
  targetType: OrganizationBudgetTargetType,
  targetId: string,
  budgetInterval: BudgetInterval
): Promise<void> {
  const normalizedInterval = getBudgetInterval(budgetInterval);
  const ref = getOrganizationBudgetRef(
    db,
    organizationId,
    targetType,
    targetId,
    normalizedInterval
  );

  await ref.delete();
}

async function getNormalizedBillingStateView(
  db: Firestore,
  userId: string
): Promise<BillingState | null> {
  return getBillingState(db, userId);
}

/**
 * Read-only billing summary projected from normalized billing documents.
 */
export async function getBillingSummary(
  db: Firestore,
  userId: string
): Promise<BillingState | null> {
  return getNormalizedBillingStateView(db, userId);
}

/**
 * Ensure a user's normalized billing state exists.
 *
 * Resolution order:
 *   1. If a teamId is provided, look up the team's organizationId.
 *   2. If the organization has an explicit billing owner → billingEntity = 'organization'.
 *   3. Otherwise → billingEntity = 'individual'.
 */
export async function ensureUserBillingState(
  db: Firestore,
  userId: string,
  teamId?: string
): Promise<BillingState> {
  const teamDoc = teamId ? await db.collection('Teams').doc(teamId).get() : null;
  const teamData = teamDoc?.data();
  const effectiveTeamId = teamId;
  const candidateOrganizationId = teamData?.['organizationId'] as string | undefined;

  let organizationTarget: BillingTargetReference | null = null;
  if (candidateOrganizationId) {
    const orgDoc = await db.collection('Organizations').doc(candidateOrganizationId).get();
    const orgData = orgDoc.data();
    const orgHasBilling = !!orgData?.['billing']?.['subscriptionId'];

    if (orgHasBilling) {
      const billingOwnerUid = await getOrganizationBillingOwnerUid(db, candidateOrganizationId);

      organizationTarget = buildOrganizationBillingTarget(candidateOrganizationId, effectiveTeamId);
      await ensureNormalizedBillingOwner(db, organizationTarget, {
        billingOwnerUid: billingOwnerUid,
      });
    }
  }

  const personalTarget = buildPersonalBillingTarget(
    userId,
    organizationTarget?.organizationId,
    effectiveTeamId
  );
  await ensureNormalizedBillingOwner(db, personalTarget);

  const userDoc = await db.collection('Users').doc(userId).get();
  const userData = (userDoc.data() ?? {}) as BillingUserRoutingRecord;

  let activeTarget = userData.activeBillingTarget;
  if (!activeTarget) {
    activeTarget = organizationTarget ?? personalTarget;
    await setActiveBillingTarget(db, userId, activeTarget);
  } else if (!organizationTarget && activeTarget.ownerType === 'organization') {
    activeTarget = personalTarget;
    await setActiveBillingTarget(db, userId, activeTarget);
  } else if (organizationTarget && activeTarget.ownerType === 'individual') {
    activeTarget = buildPersonalBillingTarget(
      userId,
      organizationTarget.organizationId,
      effectiveTeamId,
      isExplicitPersonalBillingTarget(activeTarget) ? 'personal' : 'default',
      isExplicitPersonalBillingTarget(activeTarget)
    );
    await setActiveBillingTarget(db, userId, activeTarget);
  }

  const context = await getBillingStateForTarget(db, userId, activeTarget);
  if (!context) {
    throw new Error(`Failed to create billing state for ${userId}`);
  }

  logger.info('[ensureUserBillingState] Ensured normalized billing state', {
    userId,
    ownerId: activeTarget.ownerId,
    ownerType: activeTarget.ownerType,
    organizationId: activeTarget.organizationId,
  });

  return context;
}

function getCreditsLowAlert(data: BillingState, newBalance: number): CreditsLowAlert | null {
  const baseline = data.creditsAlertBaselineCents ?? 0;
  if (baseline <= 0) return null;

  if (newBalance <= baseline * 0.25 && !data.creditsNotified25) {
    return {
      title: 'Only 25% of your wallet credits remain',
      priority: 'high',
      updates: {
        creditsNotified80: true,
        creditsNotified50: true,
        creditsNotified25: true,
      },
    };
  }

  if (newBalance <= baseline * 0.5 && !data.creditsNotified50) {
    return {
      title: "You've used half your wallet credits",
      priority: 'normal',
      updates: {
        creditsNotified80: true,
        creditsNotified50: true,
      },
    };
  }

  if (newBalance <= baseline * 0.8 && !data.creditsNotified80) {
    return {
      title: 'Heads up - 80% of your wallet credits remain',
      priority: 'normal',
      updates: {
        creditsNotified80: true,
      },
    };
  }

  return null;
}

export function determinePostDeductionWalletAlertKind(
  newBalance: number,
  shouldNotifyLow: boolean,
  hasCreditsLowAlert: boolean,
  autoTopUpResult: AutoTopUpTriggerResult = { status: 'not_attempted' }
): WalletBalanceAlertKind {
  if (autoTopUpResult.status === 'succeeded' || autoTopUpResult.status === 'in_progress') {
    return 'none';
  }

  if (newBalance <= 0) {
    return 'wallet_empty';
  }

  if (hasCreditsLowAlert) {
    return 'credits_threshold';
  }

  if (shouldNotifyLow) {
    return 'low_balance';
  }

  return 'none';
}

async function dispatchWalletEmptyNotification(db: Firestore, userId: string): Promise<void> {
  const { dispatch } = await import('../../services/communications/notification.service.js');

  await dispatch(db, {
    userId,
    type: NOTIFICATION_TYPES.WALLET_EMPTY,
    title: 'Wallet Empty',
    body: 'Your wallet is empty. Add funds in Settings → Usage to keep using Agent X.',
    deepLink: '/usage?section=overview',
    priority: 'high',
    source: { userName: 'NXT1 Billing' },
  }).catch((err: unknown) => {
    logger.error('[dispatchWalletEmptyNotification] Failed to send wallet-empty alert', {
      error: err,
      userId,
    });
  });
}

async function dispatchOrganizationWalletEmptyNotifications(
  db: Firestore,
  organizationId: string,
  adminIds: readonly string[]
): Promise<void> {
  if (adminIds.length === 0) return;

  const { dispatch } = await import('../../services/communications/notification.service.js');

  await Promise.allSettled(
    adminIds.map((adminId) =>
      dispatch(db, {
        userId: adminId,
        type: NOTIFICATION_TYPES.ORG_WALLET_EMPTY,
        title: 'Organization Wallet Empty',
        body: "Your organization's wallet is empty. Add funds in Settings → Usage to keep your team running.",
        deepLink: '/usage?section=overview',
        priority: 'high',
        source: { userName: 'NXT1 Billing' },
        data: { organizationId },
      })
    )
  );
}

async function notifyOrganizationMembersWalletEmpty(
  db: Firestore,
  organizationId: string,
  options: WalletEmptyNotificationOptions = {}
): Promise<void> {
  const { dispatch } = await import('../../services/communications/notification.service.js');
  const excluded = new Set(options.userIdsToExclude ?? []);

  const usersSnap = await db
    .collection('Users')
    .where('activeBillingTarget.organizationId', '==', organizationId)
    .where('activeBillingTarget.source', '==', 'organization')
    .get();

  if (usersSnap.empty) return;

  const recipientIds = usersSnap.docs
    .map((doc) => doc.id)
    .filter((userId) => userId && !excluded.has(userId));

  if (recipientIds.length === 0) return;

  await Promise.allSettled(
    recipientIds.map((memberId) =>
      dispatch(db, {
        userId: memberId,
        type: NOTIFICATION_TYPES.ORG_WALLET_EMPTY,
        title: 'Organization Wallet Empty',
        body: "Your organization's wallet is empty. Switch to personal billing in Settings → Usage to keep using Agent X.",
        deepLink: '/usage?section=overview',
        priority: 'high',
        source: { userName: 'NXT1 Billing' },
        data: { organizationId },
      })
    )
  );

  logger.info('[notifyOrganizationMembersWalletEmpty] Notifications dispatched', {
    organizationId,
    recipientCount: recipientIds.length,
  });
}

async function notifyOrganizationMembersWalletRefilled(
  db: Firestore,
  organizationId: string,
  newBalanceCents: number
): Promise<void> {
  const { dispatch } = await import('../../services/communications/notification.service.js');

  const usersSnap = await db
    .collection('Users')
    .where('activeBillingTarget.organizationId', '==', organizationId)
    .where('activeBillingTarget.source', '==', 'personal')
    .get();

  if (usersSnap.empty) return;

  const balanceDollars = (newBalanceCents / 100).toFixed(2);

  await Promise.allSettled(
    usersSnap.docs.map((doc) => {
      const memberId = doc.id;
      if (!memberId) return Promise.resolve();

      return dispatch(db, {
        userId: memberId,
        type: NOTIFICATION_TYPES.ORG_WALLET_REFILLED,
        title: 'Org Wallet Refilled',
        body:
          `Your organization's wallet has been topped up ($${balanceDollars}). ` +
          'You can switch back to org billing now.',
        deepLink: '/usage?section=overview',
        source: { userName: 'NXT1 Billing' },
        data: {
          organizationId,
          newBalanceCents: String(newBalanceCents),
        },
      });
    })
  );

  logger.info('[notifyOrganizationMembersWalletRefilled] Notifications dispatched', {
    organizationId,
    recipientCount: usersSnap.size,
    newBalanceCents,
  });
}

async function dispatchCreditsLowThresholdNotification(
  db: Firestore,
  userId: string,
  creditsLowAlert: CreditsLowAlert,
  newBalance: number
): Promise<void> {
  const { dispatch } = await import('../../services/communications/notification.service.js');

  await dispatch(db, {
    userId,
    type: NOTIFICATION_TYPES.CREDITS_LOW,
    title: creditsLowAlert.title,
    body:
      `You have $${(Math.max(0, newBalance) / 100).toFixed(2)} remaining in wallet credits. ` +
      'Add funds in Settings → Usage to keep using Agent X without interruption.',
    deepLink: '/usage?section=overview',
    priority: creditsLowAlert.priority,
    source: { userName: 'NXT1 Billing' },
  }).catch((err: unknown) => {
    logger.error('[dispatchCreditsLowThresholdNotification] Failed to send credits-low alert', {
      error: err,
      userId,
    });
  });
}

async function dispatchLowBalanceNotification(
  db: Firestore,
  userId: string,
  newBalance: number
): Promise<void> {
  const { dispatch } = await import('../../services/communications/notification.service.js');

  await dispatch(db, {
    userId,
    type: NOTIFICATION_TYPES.CREDITS_LOW,
    title: 'Wallet Balance Low',
    body: `Your wallet balance is $${(Math.max(0, newBalance) / 100).toFixed(2)}. Add funds in Settings → Usage to continue using Agent X.`,
    deepLink: '/usage',
    priority: 'high',
    source: { userName: 'NXT1 Billing' },
  }).catch((err: unknown) => {
    logger.error('[dispatchLowBalanceNotification] Failed to send low-balance alert', {
      error: err,
      userId,
    });
  });
}

async function dispatchOrganizationCreditsLowThresholdNotifications(
  db: Firestore,
  organizationId: string,
  adminIds: readonly string[],
  creditsLowAlert: CreditsLowAlert,
  newBalance: number
): Promise<void> {
  if (adminIds.length === 0) return;

  const { dispatch } = await import('../../services/communications/notification.service.js');

  await Promise.allSettled(
    adminIds.map((adminId) =>
      dispatch(db, {
        userId: adminId,
        type: NOTIFICATION_TYPES.CREDITS_LOW,
        title: creditsLowAlert.title,
        body:
          `Your organization's wallet has $${(Math.max(0, newBalance) / 100).toFixed(2)} remaining. ` +
          'Add funds in Settings → Usage to keep your team running.',
        deepLink: '/usage?section=overview',
        priority: creditsLowAlert.priority,
        source: { userName: 'NXT1 Billing' },
        data: { organizationId },
      })
    )
  );
}

async function dispatchOrganizationLowBalanceNotifications(
  db: Firestore,
  organizationId: string,
  adminIds: readonly string[],
  newBalance: number
): Promise<void> {
  if (adminIds.length === 0) return;

  const { dispatch } = await import('../../services/communications/notification.service.js');

  await Promise.allSettled(
    adminIds.map((adminId) =>
      dispatch(db, {
        userId: adminId,
        type: NOTIFICATION_TYPES.CREDITS_LOW,
        title: 'Organization Wallet Low',
        body:
          `Your organization's AI wallet balance is $${(Math.max(0, newBalance) / 100).toFixed(2)}. ` +
          'Add funds in Settings → Usage to keep your team running.',
        deepLink: '/usage',
        priority: 'high',
        source: { userName: 'NXT1 Billing' },
        data: { organizationId },
      })
    )
  );
}

async function handleIndividualPostDeductionNotifications(
  db: Firestore,
  userId: string,
  newBalance: number,
  shouldNotifyLow: boolean,
  creditsLowAlert: CreditsLowAlert | null
): Promise<void> {
  const ctxData = await getPersonalBillingSummary(db, userId);
  const autoTopUpResult = ctxData
    ? await triggerAutoTopUpIfEnabled(db, userId, ctxData, newBalance)
    : ({ status: 'not_attempted' } satisfies AutoTopUpTriggerResult);

  const alertKind = determinePostDeductionWalletAlertKind(
    newBalance,
    shouldNotifyLow,
    Boolean(creditsLowAlert),
    autoTopUpResult
  );

  if (alertKind === 'none') {
    if (autoTopUpResult.status === 'succeeded' || autoTopUpResult.status === 'in_progress') {
      logger.info('[handleIndividualPostDeductionNotifications] Suppressed balance alert', {
        userId,
        newBalance,
        autoTopUpStatus: autoTopUpResult.status,
        reason: autoTopUpResult.reason,
      });
    }
    return;
  }

  if (alertKind === 'wallet_empty') {
    await dispatchWalletEmptyNotification(db, userId);
    return;
  }

  if (alertKind === 'credits_threshold' && creditsLowAlert) {
    await dispatchCreditsLowThresholdNotification(db, userId, creditsLowAlert, newBalance);
    return;
  }

  if (alertKind === 'low_balance') {
    await dispatchLowBalanceNotification(db, userId, newBalance);
  }
}

async function handleOrganizationPostDeductionNotifications(
  db: Firestore,
  organizationId: string,
  billingOwnerUid: string | undefined,
  orgContext: BillingState | null,
  adminIds: readonly string[],
  newBalance: number,
  shouldNotifyLow: boolean,
  creditsLowAlert: CreditsLowAlert | null
): Promise<void> {
  const autoTopUpResult =
    billingOwnerUid && orgContext
      ? await triggerAutoTopUpIfEnabled(db, billingOwnerUid, orgContext, newBalance, {
          organizationId,
        })
      : ({ status: 'not_attempted' } satisfies AutoTopUpTriggerResult);

  const alertKind = determinePostDeductionWalletAlertKind(
    newBalance,
    shouldNotifyLow,
    Boolean(creditsLowAlert),
    autoTopUpResult
  );

  if (alertKind === 'none') {
    if (autoTopUpResult.status === 'succeeded' || autoTopUpResult.status === 'in_progress') {
      logger.info('[handleOrganizationPostDeductionNotifications] Suppressed balance alert', {
        organizationId,
        newBalance,
        autoTopUpStatus: autoTopUpResult.status,
        reason: autoTopUpResult.reason,
      });
    }
    return;
  }

  if (alertKind === 'wallet_empty') {
    await Promise.all([
      dispatchOrganizationWalletEmptyNotifications(db, organizationId, adminIds),
      notifyOrganizationMembersWalletEmpty(db, organizationId, {
        userIdsToExclude: adminIds,
      }),
    ]);
    return;
  }

  if (alertKind === 'credits_threshold' && creditsLowAlert) {
    await dispatchOrganizationCreditsLowThresholdNotifications(
      db,
      organizationId,
      adminIds,
      creditsLowAlert,
      newBalance
    );
    return;
  }

  if (alertKind === 'low_balance') {
    await dispatchOrganizationLowBalanceNotifications(db, organizationId, adminIds, newBalance);
  }
}

function areBudgetAlertsEnabled(data: BillingState): boolean {
  if (data.budgetAlertsEnabled === true) return true;

  // Preserve org budgets that were explicitly configured before this flag existed.
  if (data.billingEntity === 'organization') {
    return data.budgetName !== 'Starter budget';
  }

  return false;
}

async function getOrganizationAdminIds(
  db: Firestore,
  organizationId: string
): Promise<readonly string[]> {
  const orgDoc = await db.collection('Organizations').doc(organizationId).get();
  const orgData = orgDoc.data();
  const adminIds = ((orgData?.['admins'] as Array<{ userId?: string }> | undefined) ?? [])
    .map((admin) => admin.userId)
    .filter((adminId): adminId is string => typeof adminId === 'string' && adminId.length > 0);

  if (adminIds.length > 0) return adminIds;

  const ownerId = orgData?.['ownerId'];
  return typeof ownerId === 'string' && ownerId.length > 0 ? [ownerId] : [];
}

async function getOrganizationBillingOwnerUid(
  db: Firestore,
  organizationId: string
): Promise<string | undefined> {
  const orgDoc = await db.collection('Organizations').doc(organizationId).get();
  const orgData = orgDoc.data();
  const billingOwnerUid = orgData?.['billingOwnerUid'];

  if (typeof billingOwnerUid === 'string' && billingOwnerUid.length > 0) {
    return billingOwnerUid;
  }

  const admins = (
    (orgData?.['admins'] as Array<{ userId?: string; role?: string }> | undefined) ?? []
  ).filter((admin): admin is { userId: string; role?: string } => {
    return typeof admin.userId === 'string' && admin.userId.length > 0;
  });
  const directorUid = admins.find((admin) => admin.role === 'director')?.userId;

  if (directorUid) {
    return directorUid;
  }

  if (admins.length > 0) {
    return admins[0]!.userId;
  }

  const ownerId = orgData?.['ownerId'];

  if (typeof ownerId === 'string' && ownerId.length > 0) {
    return ownerId;
  }

  return undefined;
}

export async function hasConfiguredOrganizationBilling(
  db: Firestore,
  organizationId: string
): Promise<boolean> {
  return (await getOrganizationAdminIds(db, organizationId)).length > 0;
}

function extractOrganizationAdminUserIds(admins: unknown): string[] {
  if (!Array.isArray(admins)) {
    return [];
  }

  return Array.from(
    new Set(
      admins
        .map((admin) =>
          typeof admin === 'object' && admin !== null && 'userId' in admin
            ? (admin['userId'] as string | undefined)
            : undefined
        )
        .filter((userId): userId is string => typeof userId === 'string' && userId.length > 0)
    )
  );
}

async function findOrganizationIdForAdminUser(
  db: Firestore,
  userId: string
): Promise<string | undefined> {
  const organizationSnapshot = await db.collection('Organizations').get();
  const matchingDoc = organizationSnapshot.docs.find((doc) =>
    extractOrganizationAdminUserIds(doc.data()?.['admins']).includes(userId)
  );

  return matchingDoc?.id;
}

// ============================================
// BUDGET CHECK (TWO-TIER PRE-TASK GATE)
// ============================================

export interface BudgetCheckResult {
  /** Whether the user can proceed with the task */
  allowed: boolean;
  /** Reason for denial (if not allowed) */
  reason?: string;
  /** Current spend in cents */
  currentSpend: number;
  /** Budget limit in cents */
  budget: number;
  /** Percentage of budget used */
  percentUsed: number;
  /** Who is paying */
  billingEntity: BillingEntity;
  /**
   * When true, the calling user is an org roster member whose org wallet is empty.
   * The frontend can surface a "Use my personal wallet?" prompt inline.
   */
  canSwitchToPersonal?: boolean;
}

/**
 * Check whether a user's budget allows a new task to proceed.
 * Called BEFORE recording a usage event.
 *
 * Two-tier enforcement for organization billing:
 *   1. Check team sub-allocation (if one exists and has a limit > 0).
 *   2. Check organization master budget.
 *   If either gate fails, the task is rejected.
 *
 * Individual billing checks the user's personal budget only.
 */
export async function checkBudget(
  db: Firestore,
  userId: string,
  costCents: number,
  teamId?: string
): Promise<BudgetCheckResult> {
  const ctx = await ensureUserBillingState(db, userId, teamId);

  // ── Individual billing: always gate against available wallet credits ──
  if (ctx.billingEntity === 'individual') {
    return checkWalletBudget(ctx, costCents);
  }

  // ── Organization billing: two-tier check ──
  const orgId = ctx.organizationId;
  const effectiveTeamId = ctx.teamId;

  if (orgId) {
    const { teamBudgets, organizationBudgets } = await getApplicableOrganizationBudgetDocuments(
      db,
      orgId,
      effectiveTeamId
    );

    for (const teamBudget of teamBudgets) {
      if (teamBudget.budgetLimit <= 0) {
        continue;
      }

      const intervalLabel = getBudgetIntervalLabel(teamBudget.budgetInterval);
      const projectedSpend = teamBudget.currentPeriodSpend + costCents;
      const percentUsed = Math.round((projectedSpend / teamBudget.budgetLimit) * 100);

      if (projectedSpend > teamBudget.budgetLimit) {
        return {
          allowed: false,
          reason:
            `Team ${intervalLabel} budget of $${(teamBudget.budgetLimit / 100).toFixed(2)} reached. ` +
            'Ask your Athletic Director to increase the team allocation.',
          currentSpend: teamBudget.currentPeriodSpend,
          budget: teamBudget.budgetLimit,
          percentUsed,
          billingEntity: 'organization',
        };
      }
    }

    for (const organizationBudget of organizationBudgets) {
      if (organizationBudget.budgetLimit <= 0) {
        continue;
      }

      const projectedSpend = organizationBudget.currentPeriodSpend + costCents;
      const percentUsed = Math.round((projectedSpend / organizationBudget.budgetLimit) * 100);

      if (organizationBudget.hardStop && projectedSpend > organizationBudget.budgetLimit) {
        const intervalLabel = getBudgetIntervalLabel(organizationBudget.budgetInterval);
        return {
          allowed: false,
          reason:
            `${intervalLabel[0]!.toUpperCase()}${intervalLabel.slice(1)} budget of $${(organizationBudget.budgetLimit / 100).toFixed(2)} reached. ` +
            'Increase your organization budget to continue.',
          currentSpend: organizationBudget.currentPeriodSpend,
          budget: organizationBudget.budgetLimit,
          percentUsed,
          billingEntity: 'organization',
        };
      }
    }
  }

  // Tier 2: Check organization master wallet balance
  const orgCtx = orgId ? await getOrgBillingState(db, orgId) : null;

  const masterCtx = orgCtx ?? ctx;
  const result = checkWalletBudget(masterCtx, costCents, 'organization');
  // Signal to the frontend that this roster member can switch to their personal wallet
  if (!result.allowed) {
    result.canSwitchToPersonal = true;
  }
  return result;
}

/**
 * Single-tier budget check (shared by individual and org master).
 */
function checkSingleTierBudget(ctx: BillingState, costCents: number): BudgetCheckResult {
  const pendingHolds = ctx.pendingHoldsCents ?? 0;
  const projectedSpend = ctx.currentPeriodSpend + pendingHolds + costCents;
  const percentUsed =
    ctx.monthlyBudget > 0 ? Math.round((projectedSpend / ctx.monthlyBudget) * 100) : 0;

  if (ctx.hardStop && projectedSpend > ctx.monthlyBudget) {
    const intervalLabel = getBudgetIntervalLabel(ctx.budgetInterval);
    return {
      allowed: false,
      reason:
        `${intervalLabel[0]!.toUpperCase()}${intervalLabel.slice(1)} budget of $${(ctx.monthlyBudget / 100).toFixed(2)} reached. ` +
        'Increase your budget in Settings → Usage to continue.',
      currentSpend: ctx.currentPeriodSpend,
      budget: ctx.monthlyBudget,
      percentUsed,
      billingEntity: ctx.billingEntity,
    };
  }

  return {
    allowed: true,
    currentSpend: ctx.currentPeriodSpend,
    budget: ctx.monthlyBudget,
    percentUsed,
    billingEntity: ctx.billingEntity,
  };
}

/**
 * IAP wallet budget check.
 * Instead of monthly spend vs budget, we check if the prepaid wallet has enough
 * **available** funds (balance minus pending holds).
 */
function checkWalletBudget(
  ctx: BillingState,
  costCents: number,
  billingEntity: BillingEntity = 'individual'
): BudgetCheckResult {
  const walletBalance = ctx.walletBalanceCents ?? 0;
  const pendingHolds = ctx.pendingHoldsCents ?? 0;
  const availableBalance = walletBalance - pendingHolds;

  const isOrg = billingEntity === 'organization';

  if (availableBalance < costCents) {
    const reason = isOrg
      ? `Organization wallet balance of $${(availableBalance / 100).toFixed(2)} (available) is insufficient. ` +
        'An admin can add funds in Settings → Usage.'
      : `Wallet balance of $${(availableBalance / 100).toFixed(2)} (available) is insufficient. ` +
        'Add funds in Settings → Usage to continue.';

    return {
      allowed: false,
      reason,
      currentSpend: 0,
      budget: availableBalance,
      percentUsed: 100,
      billingEntity,
      canSwitchToPersonal: isOrg,
    };
  }

  return {
    allowed: true,
    currentSpend: 0,
    budget: availableBalance,
    percentUsed: 0,
    billingEntity,
  };
}

/**
 * Check budget using an already-resolved billing state.
 *
 * Use this when the caller already has a fresh billing state from
 * `resolveBillingTarget()` — avoids a redundant Firestore read that
 * `checkBudget()` would otherwise need to perform.
 */
export function checkBudgetFromContext(
  ctx: BillingState,
  costCents: number = 0
): BudgetCheckResult {
  if (ctx.billingEntity === 'individual') {
    return checkWalletBudget(ctx, costCents, 'individual');
  }
  if (ctx.billingEntity === 'organization') {
    return checkWalletBudget(ctx, costCents, 'organization');
  }
  return checkSingleTierBudget(ctx, costCents);
}

// ============================================
// SPEND RECORDING & ALERT DISPATCH
// ============================================

/**
 * Record spend against a user's billing state and fire threshold alerts.
 * Called AFTER a usage event is successfully queued / billed.
 *
 * For organization billing, spend is recorded at three levels:
 *   1. Individual user context (for per-user tracking)
 *   2. Team allocation (if one exists)
 *   3. Organization master budget
 */
export async function recordSpend(
  db: Firestore,
  userId: string,
  costCents: number,
  teamId?: string
): Promise<void> {
  if (!Number.isInteger(costCents) || costCents <= 0) {
    throw new Error(`Invalid costCents: ${costCents}`);
  }

  const ctx = await ensureUserBillingState(db, userId, teamId);

  // ── Prepaid wallet (individual IAP or Stripe pre-paid wallet) ──
  // Both IAP and Stripe wallet users have a real walletBalanceCents balance that
  // must be decremented on each spend. walletBalanceCents > 0 is the determinant —
  // a Stripe user who has purchased credits is effectively a wallet user.
  if (ctx.paymentProvider === 'iap') {
    await deductWallet(db, userId, costCents);
    return;
  }

  // Stripe wallet: individual user who has pre-paid credits (walletBalanceCents > 0)
  if (ctx.billingEntity === 'individual' && (ctx.walletBalanceCents ?? 0) > 0) {
    await deductWallet(db, userId, costCents);
    return;
  }

  if (ctx.billingEntity === 'organization') {
    // Org billing: deduct from the org wallet and record per-user spend
    const organizationId = ctx.organizationId;
    const effectiveTeamId = ctx.teamId ?? teamId;
    if (organizationId) {
      await deductOrgWallet(db, organizationId, userId, effectiveTeamId, costCents);
    } else {
      // Fallback to spend increment if no wallet entity found
      await updateSpend(db, userId, costCents);
    }
    return;
  }

  // ── Post-paid individual (Stripe metered) ──
  await updateSpend(db, userId, costCents);
}

/**
 * Record spend for an org-billed user across all three levels, bypassing
 * getOrCreateBillingContext so a stale individual billing context does not
 * prevent the org master budget from being incremented.
 *
 * Levels updated:
 *   1. User's own billing context  (per-user spend analytics)
 *   2. Team sub-allocation         (if teamId provided and allocation exists)
 *   3. Organization master budget  (currentPeriodSpend on the org billing context)
 */
export async function recordOrgSpend(
  db: Firestore,
  userId: string,
  organizationId: string,
  teamId: string | undefined,
  costCents: number
): Promise<void> {
  if (!Number.isInteger(costCents) || costCents <= 0) return;

  await Promise.all([
    updateSpend(db, userId, costCents), // per-user spend tracking only — org alerts via updateOrgSpend → checkAndNotifyOrg
    ...(teamId ? [updateTeamAllocationSpend(db, teamId, costCents)] : []),
    updateOrgSpend(db, organizationId, costCents),
  ]);
}

/**
 * Increment current period spend for a user and check thresholds.
 */
async function updateSpend(db: Firestore, userId: string, costCents: number): Promise<void> {
  const context = await getBillingState(db, userId);
  if (!context) return;

  const target =
    context.billingEntity === 'organization' && context.organizationId
      ? buildOrganizationBillingTarget(context.organizationId, context.teamId)
      : buildPersonalBillingTarget(userId, context.organizationId, context.teamId);

  const documents = await ensureNormalizedBillingOwner(db, target);
  const { periodKey } = getCurrentPeriodWindow();
  const refs = getNormalizedBillingRefs(db, target.ownerType, target.ownerId, periodKey);
  const updates: Record<string, unknown> = {
    currentPeriodSpend: FieldValue.increment(costCents),
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (target.ownerType === 'organization') {
    const pct =
      documents.periodLedger.monthlyBudget > 0
        ? Math.round(
            ((documents.periodLedger.currentPeriodSpend + costCents) /
              documents.periodLedger.monthlyBudget) *
              100
          )
        : 0;
    await checkAndNotifyOrg(
      db,
      target.ownerId,
      pct,
      projectBillingState(`org:${target.ownerId}`, target, documents),
      updates
    );
  }

  await refs.periodLedgerRef.update(updates);
}

/**
 * Deduct from an IAP user's prepaid wallet balance.
 *
 * Uses a Firestore transaction to atomically:
 *   1. Read current balance
 *   2. Verify sufficient funds (prevents negative balance)
 *   3. Decrement walletBalanceCents and increment currentPeriodSpend
 *
 * Fires a low-balance alert when balance drops below the configured threshold
 * (default $2.00, via `AppConfig/billing.lowBalanceThresholdCents`).
 * Uses a separate `iapLowBalanceNotified` flag — distinct from Stripe's notified100.
 */
async function deductWallet(db: Firestore, userId: string, costCents: number): Promise<void> {
  const config = await getPlatformConfig(db);
  const storedTarget = await getStoredBillingTarget(db, userId);
  const personalTarget = buildPersonalBillingTarget(
    userId,
    storedTarget.organizationId,
    storedTarget.teamId
  );
  await ensureNormalizedBillingOwner(db, personalTarget);

  const { newBalance, shouldNotifyLow, creditsLowAlert } = await db.runTransaction(async (txn) => {
    const owner = await getNormalizedBillingDocumentsForTransaction(txn, db, personalTarget);
    if (!owner) {
      logger.error('[deductWallet] Billing context not found', { userId, costCents });
      throw new Error(`Billing context not found for user ${userId}`);
    }

    const currentBalance = owner.docs.wallet.balanceCents ?? 0;

    if (currentBalance < costCents) {
      throw new Error(
        `Insufficient wallet balance: $${(currentBalance / 100).toFixed(2)} < $${(costCents / 100).toFixed(2)}`
      );
    }

    const nextBalance = currentBalance - costCents;
    const nextShouldNotifyLow =
      nextBalance < config.lowBalanceThresholdCents && !owner.docs.wallet.iapLowBalanceNotified;
    const nextCreditsLowAlert = getCreditsLowAlert(
      projectBillingState(userId, personalTarget, owner.docs),
      nextBalance
    );

    const walletUpdates: Record<string, unknown> = {
      balanceCents: FieldValue.increment(-costCents),
      updatedAt: FieldValue.serverTimestamp(),
    };
    const periodLedgerUpdates: Record<string, unknown> = {
      currentPeriodSpend: FieldValue.increment(costCents),
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (nextCreditsLowAlert) {
      Object.assign(walletUpdates, nextCreditsLowAlert.updates);
    }

    if (nextShouldNotifyLow) {
      walletUpdates['iapLowBalanceNotified'] = true;
    }

    txn.update(owner.refs.walletRef, walletUpdates);
    txn.update(owner.refs.periodLedgerRef, periodLedgerUpdates);
    return {
      newBalance: nextBalance,
      shouldNotifyLow: nextShouldNotifyLow,
      creditsLowAlert: nextCreditsLowAlert,
    };
  });

  logger.info('[deductWallet] Wallet deducted', { userId, costCents, newBalance });

  handleIndividualPostDeductionNotifications(
    db,
    userId,
    newBalance,
    shouldNotifyLow,
    creditsLowAlert
  ).catch((err: unknown) => {
    logger.error('[deductWallet] Failed to finalize post-deduction notifications', {
      error: err,
      userId,
    });
  });
}

// ============================================
// ORGANIZATION WALLET OPERATIONS
// ============================================

/**
 * Atomically deduct from an organization master wallet AND record
 * per-user + team-allocation spend in a single logical operation.
 *
 * Steps:
 *   1. Locate the org billing context by organizationId.
 *   2. Transactionally decrement walletBalanceCents and increment currentPeriodSpend.
 *   3. In parallel: update user's own spend context and team sub-allocation (if any).
 *   4. If the new wallet balance crosses the low-balance threshold, dispatch an alert
 *      to the organization admin.
 *
 * Throws if the wallet balance is insufficient (caller should have already called
 * checkBudget / checkWalletBudget before recording spend).
 */
export async function deductOrgWallet(
  db: Firestore,
  organizationId: string,
  userId: string,
  teamId: string | undefined,
  costCents: number
): Promise<void> {
  const config = await getPlatformConfig(db);
  const orgTarget = buildOrganizationBillingTarget(organizationId, teamId);
  await ensureNormalizedBillingOwner(db, orgTarget, {
    billingOwnerUid: await getOrganizationBillingOwnerUid(db, organizationId),
  });
  const { newBalance, shouldNotifyLow, creditsLowAlert } = await db.runTransaction(async (txn) => {
    const owner = await getNormalizedBillingDocumentsForTransaction(txn, db, orgTarget);
    if (!owner) {
      logger.warn('[deductOrgWallet] Org billing context not found, falling back to updateSpend', {
        organizationId,
        userId,
        costCents,
      });
      throw new Error(`Org billing context not found for ${organizationId}`);
    }

    const currentBalance = owner.docs.wallet.balanceCents ?? 0;

    if (currentBalance < costCents) {
      throw new Error(
        `Insufficient org wallet balance: $${(currentBalance / 100).toFixed(2)} < $${(costCents / 100).toFixed(2)}`
      );
    }

    const nextBalance = currentBalance - costCents;
    const nextShouldNotifyLow =
      nextBalance < config.lowBalanceThresholdCents && !owner.docs.wallet.iapLowBalanceNotified;
    const nextCreditsLowAlert = getCreditsLowAlert(
      projectBillingState(`org:${organizationId}`, orgTarget, owner.docs),
      nextBalance
    );

    const walletUpdates: Record<string, unknown> = {
      balanceCents: FieldValue.increment(-costCents),
      updatedAt: FieldValue.serverTimestamp(),
    };
    const periodLedgerUpdates: Record<string, unknown> = {
      currentPeriodSpend: FieldValue.increment(costCents),
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (nextCreditsLowAlert) {
      Object.assign(walletUpdates, nextCreditsLowAlert.updates);
    }

    if (nextShouldNotifyLow) {
      walletUpdates['iapLowBalanceNotified'] = true;
    }

    txn.update(owner.refs.walletRef, walletUpdates);
    txn.update(owner.refs.periodLedgerRef, periodLedgerUpdates);
    return {
      newBalance: nextBalance,
      shouldNotifyLow: nextShouldNotifyLow,
      creditsLowAlert: nextCreditsLowAlert,
    };
  });

  logger.info('[deductOrgWallet] Org wallet deducted', {
    organizationId,
    userId,
    costCents,
    newBalance,
  });

  const orgAdminIds = await getOrganizationAdminIds(db, organizationId);

  // Update team sub-allocation spend
  const teamUpdate = teamId ? updateTeamAllocationSpend(db, teamId, costCents) : Promise.resolve();

  await Promise.all([teamUpdate]).catch((err: unknown) => {
    logger.error('[deductOrgWallet] Failed to update per-user or team spend', {
      error: err,
      organizationId,
      userId,
    });
  });
  const orgContext = await getOrgBillingState(db, organizationId);
  const billingOwnerUid = orgContext?.billingOwnerUid ?? orgAdminIds[0];

  handleOrganizationPostDeductionNotifications(
    db,
    organizationId,
    billingOwnerUid,
    orgContext,
    orgAdminIds,
    newBalance,
    shouldNotifyLow,
    creditsLowAlert
  ).catch((err: unknown) => {
    logger.error('[deductOrgWallet] Failed to finalize post-deduction notifications', {
      error: err,
      organizationId,
    });
  });
}

// ============================================
// AUTO TOP-UP TRIGGER
// ============================================

/**
 * Trigger an automatic Stripe wallet reload if the user has auto top-up enabled
 * and the new balance has dropped below their configured threshold.
 *
 * This is intentionally fire-and-forget — callers should never await it so a slow
 * Stripe API call never delays spend recording. All errors are caught internally.
 *
 * Guards against double-firing via `autoTopUpInProgress` on the billing preference doc.
 * Uses `confirm: true, off_session: true` PaymentIntent — no 3DS challenge possible.
 * If the card requires additional authentication, the charge fails and a failure
 * notification is sent to prompt the user to re-enter their card.
 *
 * @param db        Firestore instance
 * @param userId    The billing state owner (individual uid, or org admin uid for orgs)
 * @param ctx       The BillingState snapshot read just before calling this function
 * @param newBalance The wallet balance AFTER the deduction that triggered this check
 * @param orgOptions When the billing state is org-owned, pass { organizationId } so the
 *                   wallet credit goes to the org wallet instead of the individual.
 */
async function triggerAutoTopUpIfEnabled(
  db: Firestore,
  userId: string,
  ctx: BillingState,
  newBalance: number,
  orgOptions?: { organizationId: string }
): Promise<AutoTopUpTriggerResult> {
  // ── Guard: only Stripe users; IAP is controlled by Apple ──
  if (ctx.paymentProvider !== 'stripe') {
    return { status: 'not_attempted', reason: 'unsupported_provider' };
  }

  // ── Guard: auto top-up must be enabled and configured ──
  if (!ctx.autoTopUpEnabled) {
    return { status: 'not_attempted', reason: 'disabled' };
  }
  const thresholdCents = ctx.autoTopUpThresholdCents ?? 0;
  const amountCents = ctx.autoTopUpAmountCents ?? 0;
  if (thresholdCents <= 0 || amountCents <= 0) {
    return { status: 'not_attempted', reason: 'invalid_configuration' };
  }

  // ── Guard: balance must actually be below threshold ──
  if (newBalance >= thresholdCents) {
    return { status: 'not_attempted', reason: 'balance_above_threshold' };
  }

  // ── Guard: acquire in-progress lock atomically to prevent double-fire ──
  // Use a transaction to set the flag only when it is currently false/undefined.
  const billingTarget = orgOptions?.organizationId
    ? buildOrganizationBillingTarget(orgOptions.organizationId, ctx.teamId)
    : buildPersonalBillingTarget(userId, ctx.organizationId, ctx.teamId);
  const { periodKey } = getCurrentPeriodWindow();
  const refs = getNormalizedBillingRefs(
    db,
    billingTarget.ownerType,
    billingTarget.ownerId,
    periodKey
  );
  const docRef = refs.billingPreferenceRef;

  let lockAcquired = false;
  await db.runTransaction(async (txn) => {
    const doc = await txn.get(docRef);
    if (!doc.exists) {
      throw new Error('Billing preferences not found for auto top-up');
    }
    const data = doc.data() as BillingPreferenceDocument;
    if (data.autoTopUpInProgress) {
      // Check for stale lock — if locked more than 5 minutes ago the process likely
      // crashed before the finally block could release it. Treat as expired.
      const STALE_LOCK_MS = 5 * 60 * 1000;
      const lockedAt = data.autoTopUpLockedAt?.toMillis?.() ?? null;
      const isStale = lockedAt !== null && Date.now() - lockedAt > STALE_LOCK_MS;
      if (!isStale) {
        // Lock is fresh — another in-flight charge owns it
        return;
      }
      // Stale lock detected — log and take over
      logger.warn('[triggerAutoTopUpIfEnabled] Stale lock detected — recovering', {
        userId,
        lockedAt,
        ageMsec: lockedAt ? Date.now() - lockedAt : null,
      });
    }
    txn.update(docRef, {
      autoTopUpInProgress: true,
      autoTopUpLockedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    lockAcquired = true;
  });

  if (!lockAcquired) {
    logger.info('[triggerAutoTopUpIfEnabled] Lock already held — skipping duplicate trigger', {
      userId,
    });
    return { status: 'in_progress', reason: 'lock_held' };
  }

  logger.info('[triggerAutoTopUpIfEnabled] Auto top-up triggered', {
    userId,
    newBalance,
    thresholdCents,
    amountCents,
    isOrg: !!orgOptions,
  });

  const environment = getRuntimeEnvironment();

  try {
    // ── Resolve Stripe customer and default payment method ──
    const stripeCustomerLookupKey = orgOptions?.organizationId
      ? `org:${orgOptions.organizationId}`
      : userId;

    const customerSnap = await db
      .collection(COLLECTIONS.STRIPE_CUSTOMERS)
      .where('userId', '==', stripeCustomerLookupKey)
      .where('environment', '==', environment)
      .limit(1)
      .get();

    if (customerSnap.empty) {
      logger.warn('[triggerAutoTopUpIfEnabled] No Stripe customer found — cannot auto charge', {
        userId,
        stripeCustomerLookupKey,
      });
      return { status: 'failed', reason: 'missing_customer' };
    }

    const { stripeCustomerId } = customerSnap.docs[0]!.data() as { stripeCustomerId: string };

    const { chargeOffSession, getDefaultCardPaymentMethodId } = await import('./stripe.service.js');
    const defaultPm = await getDefaultCardPaymentMethodId(stripeCustomerId, environment);

    if (!defaultPm) {
      logger.warn('[triggerAutoTopUpIfEnabled] No default payment method — cannot auto charge', {
        userId,
        stripeCustomerId,
      });
      await sendAutoTopUpFailureNotification(db, userId, 'no_payment_method', amountCents);
      return { status: 'failed', reason: 'missing_payment_method' };
    }

    // ── Charge the card ──
    const idempotencyKey = `auto-topup-${billingTarget.ownerType}:${billingTarget.ownerId}-${Date.now()}`;
    const description = orgOptions
      ? `NXT1 Organization Wallet Auto Top-Up ($${(amountCents / 100).toFixed(2)})`
      : `NXT1 Wallet Auto Top-Up ($${(amountCents / 100).toFixed(2)})`;

    const result = await chargeOffSession(
      stripeCustomerId,
      defaultPm,
      amountCents,
      description,
      idempotencyKey,
      environment
    );

    if (result.success && result.paymentIntentId) {
      // ── Credit the wallet ──
      if (orgOptions?.organizationId) {
        await addFundsToOrgWallet(db, orgOptions.organizationId, amountCents, 'auto_topup');
      } else {
        await addWalletTopUp(db, userId, amountCents, 'stripe', {
          notificationVariant: 'auto_topup',
        });
      }

      // ── Write a PaymentLog entry so it appears in payment history ──
      const { PaymentLogModel } = await import('../../models/billing/payment-log.model.js');
      await PaymentLogModel.findOneAndUpdate(
        { invoiceId: result.paymentIntentId },
        {
          $setOnInsert: {
            invoiceId: result.paymentIntentId,
            customerId: stripeCustomerId,
            userId,
            organizationId: orgOptions?.organizationId,
            amountDue: amountCents / 100,
            amountPaid: amountCents / 100,
            currency: 'usd',
            status: 'PAID',
            type: 'auto_wallet_topup',
            receiptUrl: result.receiptUrl ?? null,
            rawEvent: {
              type: 'auto_wallet_topup',
              paymentIntentId: result.paymentIntentId,
              amountCents,
              userId,
              organizationId: orgOptions?.organizationId ?? null,
            },
            createdAt: new Date(),
          },
        },
        { upsert: true }
      ).catch((err: unknown) => {
        // Non-fatal — wallet was credited successfully; only audit log is affected
        logger.error('[triggerAutoTopUpIfEnabled] Failed to write PaymentLog', {
          error: err,
          userId,
        });
      });

      logger.info('[triggerAutoTopUpIfEnabled] Auto top-up succeeded', {
        userId,
        amountCents,
        paymentIntentId: result.paymentIntentId,
      });
      return { status: 'succeeded' };
    } else {
      logger.error('[triggerAutoTopUpIfEnabled] Stripe charge failed', {
        userId,
        amountCents,
        errorCode: result.errorCode,
        error: result.error,
      });

      // ── Write a failed PaymentLog entry ──
      const { PaymentLogModel } = await import('../../models/billing/payment-log.model.js');
      const failedId = result.paymentIntentId ?? `auto-topup-failed-${userId}-${Date.now()}`;
      await PaymentLogModel.findOneAndUpdate(
        { invoiceId: failedId },
        {
          $setOnInsert: {
            invoiceId: failedId,
            customerId: stripeCustomerId,
            userId,
            organizationId: orgOptions?.organizationId,
            amountDue: amountCents / 100,
            amountPaid: 0,
            currency: 'usd',
            status: 'FAILED',
            type: 'auto_wallet_topup',
            rawEvent: {
              type: 'auto_wallet_topup_failed',
              errorCode: result.errorCode,
              error: result.error,
              amountCents,
              userId,
            },
            createdAt: new Date(),
          },
        },
        { upsert: true }
      ).catch((err: unknown) => {
        logger.error('[triggerAutoTopUpIfEnabled] Failed to write failed PaymentLog', {
          error: err,
          userId,
        });
      });

      await sendAutoTopUpFailureNotification(db, userId, 'failed', amountCents);
      return { status: 'failed', reason: 'charge_failed' };
    }
  } catch (err: unknown) {
    logger.error('[triggerAutoTopUpIfEnabled] Unexpected error during auto top-up', {
      error: err,
      userId,
    });
    return { status: 'failed', reason: 'unexpected_error' };
  } finally {
    // Always release the lock — whether success, failure, or unexpected error
    await releaseAutoTopUpLock(docRef).catch((err: unknown) => {
      logger.error('[triggerAutoTopUpIfEnabled] Failed to release lock', { error: err, userId });
    });
  }
}

/** Release the `autoTopUpInProgress` lock on a billing preference document. */
async function releaseAutoTopUpLock(docRef: FirebaseFirestore.DocumentReference): Promise<void> {
  await docRef.update({
    autoTopUpInProgress: false,
    autoTopUpLockedAt: FieldValue.delete(),
    updatedAt: FieldValue.serverTimestamp(),
  });
}

/** Send an auto top-up failure notification to the user. */
async function sendAutoTopUpFailureNotification(
  db: Firestore,
  userId: string,
  outcome: 'failed' | 'no_payment_method',
  amountCents: number
): Promise<void> {
  const { dispatch } = await import('../../services/communications/notification.service.js');
  const amountStr = `$${(amountCents / 100).toFixed(2)}`;

  const messages: Record<
    typeof outcome,
    { title: string; body: string; type: NotificationType; priority: 'high' | 'normal' }
  > = {
    failed: {
      title: 'Auto Top-Up Failed',
      body: `We couldn't reload your wallet with ${amountStr}. Please add funds manually in Settings → Usage.`,
      type: NOTIFICATION_TYPES.PAYMENT_FAILED,
      priority: 'high',
    },
    no_payment_method: {
      title: 'Auto Top-Up Failed',
      body: `No saved payment method found. Add a card in Settings → Usage to enable auto top-up.`,
      type: NOTIFICATION_TYPES.PAYMENT_FAILED,
      priority: 'high',
    },
  };

  const msg = messages[outcome];
  await dispatch(db, {
    userId,
    type: msg.type,
    title: msg.title,
    body: msg.body,
    deepLink: '/usage',
    priority: msg.priority,
    source: { userName: 'NXT1 Billing' },
  }).catch((err: unknown) => {
    logger.error('[sendAutoTopUpFailureNotification] Failed to send notification', {
      error: err,
      userId,
      outcome,
    });
  });
}

/**
 * Add funds to an organization's prepaid wallet.
 * Called after a verified Stripe Checkout session or approved invoice payment.
 *
 * - Atomically increments `walletBalanceCents` on the org master billing context.
 * - Resets low-balance notification flags.
 * - Returns the new balance for downstream logging / webhook response.
 */
export async function addFundsToOrgWallet(
  db: Firestore,
  organizationId: string,
  amountCents: number,
  source:
    | 'stripe_checkout'
    | 'invoice_payment'
    | 'manual_credit'
    | 'direct_charge'
    | 'auto_topup' = 'stripe_checkout',
  options?: CheckoutTopUpOptions
): Promise<{ newBalance: number; alreadyFinalized: boolean }> {
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new Error(
      `[addFundsToOrgWallet] amountCents must be a positive integer, got ${amountCents}`
    );
  }

  const orgTarget = buildOrganizationBillingTarget(organizationId);
  await ensureNormalizedBillingOwner(db, orgTarget, {
    billingOwnerUid: await getOrganizationBillingOwnerUid(db, organizationId),
  });
  const checkoutFinalizationRef = options?.checkoutSessionId
    ? db.collection(COLLECTIONS.CHECKOUT_SESSION_FINALIZATIONS).doc(options.checkoutSessionId)
    : null;
  const { newBalance, alreadyFinalized } = await db.runTransaction(async (txn) => {
    const owner = await getNormalizedBillingDocumentsForTransaction(txn, db, orgTarget);
    if (!owner) {
      throw new Error(`Org billing context not found for ${organizationId}`);
    }

    if (checkoutFinalizationRef) {
      const finalizationSnap = await txn.get(checkoutFinalizationRef);
      if (finalizationSnap.exists) {
        return { newBalance: owner.docs.wallet.balanceCents ?? 0, alreadyFinalized: true };
      }
    }

    const currentBalance = owner.docs.wallet.balanceCents ?? 0;
    const nextBalance = currentBalance + amountCents;

    txn.update(owner.refs.walletRef, {
      balanceCents: FieldValue.increment(amountCents),
      iapLowBalanceNotified: false,
      creditsAlertBaselineCents: nextBalance,
      creditsNotified80: false,
      creditsNotified50: false,
      creditsNotified25: false,
      updatedAt: FieldValue.serverTimestamp(),
    });
    txn.update(owner.refs.billingPreferenceRef, {
      paymentProvider: 'stripe',
      updatedAt: FieldValue.serverTimestamp(),
    });

    if (checkoutFinalizationRef) {
      txn.create(checkoutFinalizationRef, {
        sessionId: checkoutFinalizationRef.id,
        type: 'org_wallet_topup',
        organizationId,
        initiatedByUserId: options?.initiatedByUserId ?? null,
        amountCents,
        walletDocumentId: owner.refs.walletRef.id,
        newBalanceCents: nextBalance,
        source,
        createdAt: FieldValue.serverTimestamp(),
      });
    }

    return { newBalance: nextBalance, alreadyFinalized: false };
  });

  logger.info('[addFundsToOrgWallet] Org wallet funded', {
    organizationId,
    amountCents,
    newBalance,
    source,
    checkoutSessionId: options?.checkoutSessionId,
    alreadyFinalized,
  });

  if (alreadyFinalized) {
    return { newBalance, alreadyFinalized };
  }

  const adminIds = await getOrganizationAdminIds(db, organizationId);
  if (adminIds.length > 0) {
    const { dispatch } = await import('../../services/communications/notification.service.js');
    const title =
      source === 'auto_topup' ? 'Organization Wallet Auto-Reloaded' : 'Organization Credits Added';
    const body =
      source === 'auto_topup'
        ? `Your organization's wallet was automatically reloaded with $${(amountCents / 100).toFixed(2)}. New balance: $${(newBalance / 100).toFixed(2)}.`
        : `$${(amountCents / 100).toFixed(2)} was added to your organization's wallet. New balance: $${(newBalance / 100).toFixed(2)}.`;

    await Promise.allSettled(
      adminIds.map((adminId) =>
        dispatch(db, {
          userId: adminId,
          type: NOTIFICATION_TYPES.CREDITS_ADDED,
          title,
          body,
          deepLink: '/usage?section=overview',
          source: { userName: 'NXT1 Billing' },
          data: { organizationId },
        })
      )
    );
  }

  if (source === 'auto_topup') {
    await notifyOrganizationMembersWalletRefilled(db, organizationId, newBalance);
  }

  return { newBalance, alreadyFinalized };
}

// ============================================
// IAP WALLET REFUND
// ============================================

/**
 * Deduct wallet funds as a result of an Apple IAP refund.
 *
 * Unlike deductWallet() (which throws on insufficient balance, used for feature spending),
 * this function caps the deduction at zero — a refund on an already-consumed balance
 * still completes without error. If the billing context is missing, the call is a no-op
 * (user may have been deleted) and a warning is logged.
 *
 * Called exclusively by the Apple S2S webhook REFUND handler.
 */
export async function processWalletRefund(
  db: Firestore,
  userId: string,
  amountCents: number
): Promise<void> {
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new Error(
      `[processWalletRefund] amountCents must be a positive integer, got ${amountCents}`
    );
  }

  const storedTarget = await getStoredBillingTarget(db, userId);
  const personalTarget = buildPersonalBillingTarget(
    userId,
    storedTarget.organizationId,
    storedTarget.teamId
  );
  await ensureNormalizedBillingOwner(db, personalTarget);
  const context = await getPersonalBillingSummary(db, userId);

  if (!context) {
    logger.warn('[processWalletRefund] Billing context not found — nothing to deduct', {
      userId,
      amountCents,
    });
    return; // Graceful no-op — user may have been deleted
  }

  await db.runTransaction(async (txn) => {
    const owner = await getNormalizedBillingDocumentsForTransaction(txn, db, personalTarget);
    if (!owner) {
      return;
    }

    const currentBalance = owner.docs.wallet.balanceCents ?? 0;
    // Cap deduction at current balance — wallet cannot go negative on a refund
    const deduction = Math.min(amountCents, currentBalance);

    txn.update(owner.refs.walletRef, {
      balanceCents: FieldValue.increment(-deduction),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });

  logger.info('[processWalletRefund] Wallet refund deducted', { userId, amountCents });
}

// ============================================
// IAP WALLET TOP-UP
// ============================================

/**
 * Add funds to an individual user's prepaid wallet.
 * Called after a verified wallet top-up (Apple IAP or Stripe Checkout).
 *
 * - Atomically increments `walletBalanceCents`.
 * - Sets `paymentProvider` to the given provider ('iap' or 'stripe').
 * - Resets budget notification flags so the user doesn't see stale "low balance" alerts.
 */
export async function addWalletTopUp(
  db: Firestore,
  userId: string,
  amountCents: number,
  provider: PaymentProvider = 'iap',
  options?: CheckoutTopUpOptions
): Promise<{ newBalance: number; alreadyFinalized: boolean }> {
  if (amountCents <= 0) {
    throw new Error('Top-up amount must be positive');
  }

  // Read the stored billing target first so we can preserve the user's
  // organizationId/teamId context on the personal target.
  // NOTE: We intentionally do NOT call ensureUserBillingState() here.
  // That function can overwrite activeBillingTarget to 'individual' when
  // it is called without a teamId (because it finds no org and concludes
  // the user is no longer in an org). For org admins doing an IAP top-up
  // this would silently switch them to personal billing mode.
  // ensureNormalizedBillingOwner() below is sufficient to create missing
  // billing documents without touching activeBillingTarget.
  const storedTarget = await getStoredBillingTarget(db, userId);
  const personalTarget = buildPersonalBillingTarget(
    userId,
    storedTarget.organizationId,
    storedTarget.teamId
  );
  await ensureNormalizedBillingOwner(db, personalTarget);
  const { periodKey } = getCurrentPeriodWindow();
  const refs = getNormalizedBillingRefs(
    db,
    personalTarget.ownerType,
    personalTarget.ownerId,
    periodKey
  );
  const checkoutFinalizationRef = options?.checkoutSessionId
    ? db.collection(COLLECTIONS.CHECKOUT_SESSION_FINALIZATIONS).doc(options.checkoutSessionId)
    : null;
  const { newBalance, alreadyFinalized } = await db.runTransaction(async (txn) => {
    const [walletSnap, finalizationSnap] = await Promise.all([
      txn.get(refs.walletRef),
      checkoutFinalizationRef ? txn.get(checkoutFinalizationRef) : Promise.resolve(null),
    ]);

    const currentBalance = (walletSnap.data() as WalletDocument | undefined)?.balanceCents ?? 0;
    if (finalizationSnap?.exists) {
      return { newBalance: currentBalance, alreadyFinalized: true };
    }

    const nextBalance = currentBalance + amountCents;

    txn.update(refs.walletRef, {
      balanceCents: FieldValue.increment(amountCents),
      iapLowBalanceNotified: false,
      creditsAlertBaselineCents: nextBalance,
      creditsNotified80: false,
      creditsNotified50: false,
      creditsNotified25: false,
      updatedAt: FieldValue.serverTimestamp(),
    });
    txn.update(refs.billingPreferenceRef, {
      paymentProvider: provider,
      updatedAt: FieldValue.serverTimestamp(),
    });
    txn.update(refs.periodLedgerRef, {
      notified50: false,
      notified80: false,
      notified100: false,
      updatedAt: FieldValue.serverTimestamp(),
    });

    if (checkoutFinalizationRef) {
      txn.create(checkoutFinalizationRef, {
        sessionId: checkoutFinalizationRef.id,
        type: 'wallet_topup',
        userId,
        initiatedByUserId: options?.initiatedByUserId ?? userId,
        amountCents,
        walletDocumentId: refs.walletRef.id,
        newBalanceCents: nextBalance,
        source: provider,
        createdAt: FieldValue.serverTimestamp(),
      });
    }

    return { newBalance: nextBalance, alreadyFinalized: false };
  });

  logger.info('[addWalletTopUp] Wallet topped up', {
    userId,
    amountCents,
    newBalance,
    checkoutSessionId: options?.checkoutSessionId,
    alreadyFinalized,
  });

  if (!alreadyFinalized) {
    await dispatchCreditsAddedNotification(
      db,
      userId,
      amountCents,
      newBalance,
      options?.notificationVariant ?? 'standard'
    );
  }

  return { newBalance, alreadyFinalized };
}

/**
 * Increment current period spend for an organization master budget and check thresholds.
 */
async function updateOrgSpend(
  db: Firestore,
  organizationId: string,
  costCents: number
): Promise<void> {
  const { organizationBudgets } = await getApplicableOrganizationBudgetDocuments(
    db,
    organizationId
  );

  await Promise.all(
    organizationBudgets.map(async (budget) => {
      const ref = getOrganizationBudgetRef(
        db,
        organizationId,
        'organization',
        organizationId,
        budget.budgetInterval
      );
      const newSpend = budget.currentPeriodSpend + costCents;
      const updates: Record<string, unknown> = {
        currentPeriodSpend: FieldValue.increment(costCents),
        updatedAt: FieldValue.serverTimestamp(),
      };
      const pct = budget.budgetLimit > 0 ? Math.round((newSpend / budget.budgetLimit) * 100) : 0;

      await checkAndNotifyOrganizationBudgetDoc(db, organizationId, pct, budget, updates);
      await ref.update(updates);
    })
  );
}

/**
 * Increment current period spend for a team allocation and check sub-limit thresholds.
 */
async function updateTeamAllocationSpend(
  db: Firestore,
  teamId: string,
  costCents: number
): Promise<void> {
  const snapshot = await db
    .collection(COLLECTIONS.ORGANIZATION_BUDGETS)
    .where('targetType', '==', 'team')
    .where('targetId', '==', teamId)
    .get();

  if (snapshot.empty) return;

  await Promise.all(
    snapshot.docs.map(async (doc) => {
      const budget = await alignOrganizationBudgetToCurrentWindow(doc.ref, {
        id: doc.id,
        ...doc.data(),
      } as unknown as OrganizationBudgetDocument);

      const newSpend = budget.currentPeriodSpend + costCents;
      const updates: Record<string, unknown> = {
        currentPeriodSpend: FieldValue.increment(costCents),
        updatedAt: FieldValue.serverTimestamp(),
      };

      if (budget.budgetLimit > 0) {
        const pct = Math.round((newSpend / budget.budgetLimit) * 100);
        await checkAndNotifyTeam(
          db,
          teamId,
          pct,
          {
            teamId,
            organizationId: budget.organizationId,
            budgetInterval: budget.budgetInterval,
            monthlyLimit: budget.budgetLimit,
            currentPeriodSpend: budget.currentPeriodSpend,
            periodStart: budget.periodStart,
            periodEnd: budget.periodEnd,
            notified50: budget.notified50,
            notified80: budget.notified80,
            notified100: budget.notified100,
            createdAt: budget.createdAt,
            updatedAt: budget.updatedAt,
          },
          updates
        );
      }

      await doc.ref.update(updates);
    })
  );
}

// ============================================
// ALERT DISPATCH HELPERS
// ============================================

async function checkAndNotifyOrganizationBudgetDoc(
  db: Firestore,
  organizationId: string,
  pct: number,
  budget: OrganizationBudgetDocument,
  updates: Record<string, unknown>
): Promise<void> {
  const { dispatch } = await import('../../services/communications/notification.service.js');

  const orgDoc = await db.collection('Organizations').doc(organizationId).get();
  const orgData = orgDoc.data();
  const admins = (orgData?.['admins'] as Array<{ userId: string }>) ?? [];
  const adminIds = admins.map((admin) => admin.userId).filter(Boolean);

  if (adminIds.length === 0) {
    const ownerId = orgData?.['ownerId'] as string | undefined;
    if (ownerId) adminIds.push(ownerId);
  }

  if (adminIds.length === 0) return;

  let title = '';
  let body = '';
  let priority: 'high' | 'normal' = 'normal';
  let flagKey = '';
  const intervalLabel = getBudgetIntervalLabel(budget.budgetInterval);

  if (pct >= 100 && !budget.notified100) {
    title = 'Organization Budget Reached';
    body = `Your organization has reached its ${intervalLabel} budget of $${(budget.budgetLimit / 100).toFixed(2)}. Increase the limit to continue.`;
    priority = 'high';
    flagKey = 'notified100';
  } else if (pct >= 80 && !budget.notified80) {
    title = 'Organization Budget — 80%';
    body = `Your organization has used 80% of the $${(budget.budgetLimit / 100).toFixed(2)} ${intervalLabel} budget.`;
    flagKey = 'notified80';
  } else if (pct >= 50 && !budget.notified50) {
    title = 'Organization Budget — 50%';
    body = `Your organization has used 50% of the $${(budget.budgetLimit / 100).toFixed(2)} ${intervalLabel} budget.`;
    flagKey = 'notified50';
  }

  if (!flagKey) return;

  updates[flagKey] = true;

  for (const adminId of adminIds) {
    await dispatch(db, {
      userId: adminId,
      type: NOTIFICATION_TYPES.BUDGET_WARNING,
      title,
      body,
      deepLink: '/usage',
      priority,
      source: { userName: 'NXT1 Billing' },
    }).catch((err: unknown) => {
      logger.error('[checkAndNotifyOrganizationBudgetDoc] Failed to send org alert', {
        error: err,
        adminId,
        organizationId,
        budgetId: budget.id,
      });
    });
  }
}

/**
 * Check threshold percentages and notify organization admins.
 */
async function checkAndNotifyOrg(
  db: Firestore,
  organizationId: string,
  pct: number,
  ctx: BillingState,
  updates: Record<string, unknown>
): Promise<void> {
  if (!areBudgetAlertsEnabled(ctx)) return;

  const { dispatch } = await import('../../services/communications/notification.service.js');

  // Get org admins
  const orgDoc = await db.collection('Organizations').doc(organizationId).get();
  const orgData = orgDoc.data();
  const admins = (orgData?.['admins'] as Array<{ userId: string }>) ?? [];
  const adminIds = admins.map((a) => a.userId).filter(Boolean);

  if (adminIds.length === 0) {
    // Fallback to ownerId
    const ownerId = orgData?.['ownerId'] as string | undefined;
    if (ownerId) adminIds.push(ownerId);
  }

  if (adminIds.length === 0) return;

  let title = '';
  let body = '';
  let priority: 'high' | 'normal' = 'normal';
  let flagKey = '';
  const intervalLabel = getBudgetIntervalLabel(ctx.budgetInterval);

  if (pct >= 100 && !ctx.notified100) {
    title = 'Organization Budget Reached';
    body = `Your organization has reached its ${intervalLabel} budget of $${(ctx.monthlyBudget / 100).toFixed(2)}. Increase the limit to continue.`;
    priority = 'high';
    flagKey = 'notified100';
  } else if (pct >= 80 && !ctx.notified80) {
    title = 'Organization Budget — 80%';
    body = `Your organization has used 80% of the $${(ctx.monthlyBudget / 100).toFixed(2)} ${intervalLabel} budget.`;
    flagKey = 'notified80';
  } else if (pct >= 50 && !ctx.notified50) {
    title = 'Organization Budget — 50%';
    body = `Your organization has used 50% of the $${(ctx.monthlyBudget / 100).toFixed(2)} ${intervalLabel} budget.`;
    flagKey = 'notified50';
  }

  if (!flagKey) return;

  updates[flagKey] = true;

  for (const adminId of adminIds) {
    await dispatch(db, {
      userId: adminId,
      type: NOTIFICATION_TYPES.BUDGET_WARNING,
      title,
      body,
      deepLink: '/usage',
      priority,
      source: { userName: 'NXT1 Billing' },
    }).catch((err: unknown) => {
      logger.error('[checkAndNotifyOrg] Failed to send org alert', {
        error: err,
        adminId,
        organizationId,
      });
    });
  }
}

/**
 * Check threshold percentages and notify team admins for sub-allocation limits.
 */
async function checkAndNotifyTeam(
  db: Firestore,
  teamId: string,
  pct: number,
  allocation: TeamBudgetAllocation,
  updates: Record<string, unknown>
): Promise<void> {
  const { dispatch } = await import('../../services/communications/notification.service.js');

  const teamDoc = await db.collection('Teams').doc(teamId).get();
  const teamData = teamDoc.data();
  const adminIds: string[] = Array.isArray(teamData?.['adminIds'])
    ? (teamData!['adminIds'] as string[])
    : teamData?.['createdBy']
      ? [teamData['createdBy'] as string]
      : [];

  if (adminIds.length === 0) return;

  const limitStr = `$${(allocation.monthlyLimit / 100).toFixed(2)}`;
  const intervalLabel = getBudgetIntervalLabel(allocation.budgetInterval);
  let title = '';
  let body = '';
  let priority: 'high' | 'normal' = 'normal';
  let flagKey = '';

  if (pct >= 100 && !allocation.notified100) {
    title = 'Team Budget Allocation Reached';
    body = `Your team has reached its ${intervalLabel} allocation of ${limitStr}. Contact your Athletic Director for more.`;
    priority = 'high';
    flagKey = 'notified100';
  } else if (pct >= 80 && !allocation.notified80) {
    title = 'Team Budget — 80%';
    body = `Your team has used 80% of its ${limitStr} ${intervalLabel} allocation.`;
    flagKey = 'notified80';
  } else if (pct >= 50 && !allocation.notified50) {
    title = 'Team Budget — 50%';
    body = `Your team has used 50% of its ${limitStr} ${intervalLabel} allocation.`;
    flagKey = 'notified50';
  }

  if (!flagKey) return;

  updates[flagKey] = true;

  const notificationType =
    flagKey === 'notified100'
      ? NOTIFICATION_TYPES.BUDGET_REACHED
      : NOTIFICATION_TYPES.BUDGET_WARNING;

  for (const adminId of adminIds) {
    await dispatch(db, {
      userId: adminId,
      type: notificationType,
      title,
      body,
      deepLink: '/usage',
      priority,
      source: { userName: 'NXT1 Billing' },
    }).catch((err: unknown) => {
      logger.error('[checkAndNotifyTeam] Failed to send team alert', {
        error: err,
        adminId,
        teamId,
      });
    });
  }
}

// ============================================
// BILLING TARGET RESOLUTION (DIRECTOR → ORG)
// ============================================

/**
 * Resolved billing target — tells callers which userId / context to query
 * when fetching usage events, payment history, Stripe customers, etc.
 *
 * NOTE: `context` is always fetched fresh (not cached) to avoid stale
 * `currentPeriodSpend` / `walletBalanceCents` on the dashboard.
 */
export interface ResolvedBillingTarget {
  /** Whether this is an organization or individual billing target */
  type: 'organization' | 'individual';
  /** The userId to query in billing collections (e.g. `org:{orgId}` or personal uid) */
  billingUserId: string;
  /** The resolved billing context (always fresh — never cached) */
  context: BillingState;
  /** Organization ID (only for type === 'organization') */
  organizationId?: string;
  /** Team IDs belonging to the organization (only for type === 'organization') */
  teamIds?: string[];
}

/**
 * Cached resolution mapping — lightweight, does NOT include the billing state
 * itself. The billing state is fetched fresh on every call to avoid showing stale
 * spend/wallet data on the dashboard.
 */
interface CachedBillingResolution {
  type: 'organization' | 'individual';
  billingUserId: string;
  organizationId?: string;
  teamIds?: string[];
  expiresAt: number;
}

// In-memory cache for billing target resolution (5 min TTL)
// Only caches the mapping (role → org/individual), NOT the live billing state.
const billingResolutionCache = new Map<string, CachedBillingResolution>();

/** Evict a user's billing resolution cache entry (call after billing mode changes). */
export function evictBillingResolutionCache(userId: string): void {
  billingResolutionCache.delete(userId);
}
const BILLING_RESOLUTION_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const BILLING_RESOLUTION_CACHE_MAX_SIZE = 10_000; // Prevent unbounded growth

/**
 * Resolve the correct billing target for a user.
 *
 * Directors always route to their organization's billing context.
 * Athletes, coaches, staff, and other roster members on org-billed teams
 * also route to the organization's billing context.
 * Everyone else falls back to their personal individual billing context.
 *
 * Resolution order:
 *   1. Check in-memory cache (5 min TTL).
 *   2. Read the user doc from `Users` to check their `role`.
 *   3. Query `RosterEntries` for any active membership → `organizationId`.
 *   4. If role is `director`, ALWAYS route to org billing.
 *      If role is anything else with an active org membership, route to org billing.
 *   5. Otherwise, fallback to the user's personal billing context.
 */
export async function resolveBillingTarget(
  db: Firestore,
  userId: string,
  options?: { billingMode?: BillingMode }
): Promise<ResolvedBillingTarget> {
  const storedTarget = await getStoredBillingTarget(db, userId);
  const hasStoredPersonalSelection = isExplicitPersonalBillingTarget(storedTarget);
  const hasStoredOrganizationTarget =
    storedTarget.ownerType === 'organization' && typeof storedTarget.organizationId === 'string';
  const shouldUsePersonalBilling =
    options?.billingMode === 'personal' || (!options?.billingMode && hasStoredPersonalSelection);

  if (shouldUsePersonalBilling) {
    billingResolutionCache.delete(userId);
    const personalTarget = buildPersonalBillingTarget(
      userId,
      storedTarget.organizationId,
      storedTarget.teamId
    );
    await ensureNormalizedBillingOwner(db, personalTarget);
    const ctx = await getBillingStateForTarget(db, userId, personalTarget);
    if (!ctx) {
      throw new Error(`Personal billing context not found for ${userId}`);
    }
    return {
      type: 'individual',
      billingUserId: userId,
      context: ctx,
      organizationId: personalTarget.organizationId,
      teamIds: personalTarget.teamId ? [personalTarget.teamId] : undefined,
    };
  }

  if (storedTarget.ownerType === 'organization' && storedTarget.organizationId) {
    const organizationAdminIds = await getOrganizationAdminIds(db, storedTarget.organizationId);

    if (organizationAdminIds.length === 0) {
      const personalTarget = buildPersonalBillingTarget(
        userId,
        storedTarget.organizationId,
        storedTarget.teamId
      );
      await ensureNormalizedBillingOwner(db, personalTarget);
      await setActiveBillingTarget(db, userId, personalTarget);
      logger.info(
        '[resolveBillingTarget] Stored org billing target has no admins; falling back to personal',
        {
          userId,
          organizationId: storedTarget.organizationId,
        }
      );
    } else {
      const orgTarget = buildOrganizationBillingTarget(
        storedTarget.organizationId,
        storedTarget.teamId,
        'organization'
      );
      const billingOwnerUid = await getOrganizationBillingOwnerUid(db, storedTarget.organizationId);
      await ensureNormalizedBillingOwner(
        db,
        orgTarget,
        billingOwnerUid ? { billingOwnerUid } : undefined
      );
      const ctx = await getBillingStateForTarget(db, userId, orgTarget);
      if (!ctx) {
        throw new Error(
          `Organization billing context not found for ${storedTarget.organizationId}`
        );
      }

      const teamsSnap = await db
        .collection('Teams')
        .where('organizationId', '==', storedTarget.organizationId)
        .get();
      const teamIds = teamsSnap.docs.map((doc) => doc.id);
      if (storedTarget.teamId && !teamIds.includes(storedTarget.teamId)) {
        teamIds.push(storedTarget.teamId);
      }

      return {
        type: 'organization',
        billingUserId: `org:${storedTarget.organizationId}`,
        context: ctx,
        organizationId: storedTarget.organizationId,
        teamIds,
      };
    }
  }

  // ── Check resolution cache (mapping only, NOT the live context) ──
  const cached = billingResolutionCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) {
    // Always fetch fresh context to get current spend/wallet balance
    const freshCtx =
      cached.type === 'organization' && cached.organizationId
        ? ((await getOrgBillingState(db, cached.organizationId)) ??
          (await ensureUserBillingState(db, userId)))
        : await ensureUserBillingState(db, userId);

    return {
      type: cached.type,
      billingUserId: cached.billingUserId,
      context: freshCtx,
      organizationId: cached.organizationId,
      teamIds: cached.teamIds,
    };
  }

  // ── Evict expired entries if cache is getting large ──
  if (billingResolutionCache.size > BILLING_RESOLUTION_CACHE_MAX_SIZE) {
    const now = Date.now();
    for (const [key, entry] of billingResolutionCache) {
      if (entry.expiresAt <= now) billingResolutionCache.delete(key);
    }
  }

  // ── Read user role ──
  const userDoc = await db.collection('Users').doc(userId).get();
  const userData = userDoc.data();
  const role = userData?.['role'] as string | undefined;

  // ── Try to resolve to an organization (directors always, others via roster) ──
  const orgTarget = await resolveUserOrgTarget(db, userId, role);
  const resolvedOrgTargetId = orgTarget?.organizationId;
  if (orgTarget && resolvedOrgTargetId) {
    if (!options?.billingMode && !hasStoredPersonalSelection && !hasStoredOrganizationTarget) {
      await setActiveBillingTarget(
        db,
        userId,
        buildOrganizationBillingTarget(resolvedOrgTargetId, orgTarget.teamIds?.[0], 'organization')
      );
    }

    billingResolutionCache.set(userId, {
      type: orgTarget.type,
      billingUserId: orgTarget.billingUserId,
      organizationId: orgTarget.organizationId,
      teamIds: orgTarget.teamIds,
      expiresAt: Date.now() + BILLING_RESOLUTION_CACHE_TTL_MS,
    });
    return orgTarget;
  }

  // Director without an active org — log a warning
  if (role === 'director' || role === 'coach') {
    logger.warn(
      '[resolveBillingTarget] Director/Coach has no active organization, falling back to individual',
      { userId, role }
    );
  }

  // ── Athletes / Coaches on org-billed teams ────────────────────────────
  // Non-director users (athletes, coaches) may belong to an org-billed team.
  // In that case their AI usage should be gated against the org budget and
  // charged to the org's Stripe customer — not treated as individual IAP.
  //
  // Resolution: find the user's active roster entry → look up its team →
  // check if the org has billing enabled → create/return org billing target
  // using the athlete's own context (which has teamId for sub-limit tracking).
  if (role !== 'director') {
    const athleteTarget = await resolveAthleteOrgTarget(db, userId);
    const resolvedAthleteOrgId = athleteTarget?.organizationId;
    if (athleteTarget && resolvedAthleteOrgId) {
      if (!options?.billingMode && !hasStoredPersonalSelection && !hasStoredOrganizationTarget) {
        await setActiveBillingTarget(
          db,
          userId,
          buildOrganizationBillingTarget(
            resolvedAthleteOrgId,
            athleteTarget.teamIds?.[0],
            'organization'
          )
        );
      }

      billingResolutionCache.set(userId, {
        type: athleteTarget.type,
        billingUserId: athleteTarget.billingUserId,
        organizationId: athleteTarget.organizationId,
        teamIds: athleteTarget.teamIds,
        expiresAt: Date.now() + BILLING_RESOLUTION_CACHE_TTL_MS,
      });
      return athleteTarget;
    }
  }

  // ── Fallback: individual billing ──
  const ctx = await ensureUserBillingState(db, userId);
  const target: ResolvedBillingTarget = {
    type: 'individual',
    billingUserId: userId,
    context: ctx,
  };

  billingResolutionCache.set(userId, {
    type: 'individual',
    billingUserId: userId,
    expiresAt: Date.now() + BILLING_RESOLUTION_CACHE_TTL_MS,
  });

  return target;
}

/**
 * Internal: Resolve an athlete/coach's organization target.
 *
 * Non-director users (athletes, coaches) on an org-billed team should have
 * their AI usage charged to the organization, not treated as individual.
 *
 * Strategy:
 *   1. Find the user's active roster entry to get their teamId.
 *   2. Look up the team's organizationId and verify the org has an explicit billing owner.
 *   3. If org-billed, ensure the athlete's billing context is created with
 *      the correct teamId (so spend attribution walks the 3-tier hierarchy).
 *   4. Return type='organization' with the org's Stripe customer userId
 *      (`org:{orgId}`) but context = the athlete's own context (which tracks
 *      teamId for team sub-limit enforcement).
 *
 * Returns null if the user is not on an org-billed team (fallback to individual).
 */
async function resolveAthleteOrgTarget(
  db: Firestore,
  userId: string
): Promise<ResolvedBillingTarget | null> {
  // Step 1: find active roster entry to get the user's team
  const rosterSnap = await db
    .collection('RosterEntries')
    .where('userId', '==', userId)
    .where('status', '==', 'active')
    .limit(1)
    .get();

  if (rosterSnap.empty) return null;

  const rosterData = rosterSnap.docs[0]!.data();
  const teamId = rosterData['teamId'] as string | undefined;
  const organizationId = rosterData['organizationId'] as string | undefined;

  if (!teamId) return null;

  // Step 2: check if the team's org has admins, which enables org billing.
  const teamDoc = await db.collection('Teams').doc(teamId).get();
  const teamData = teamDoc.data();

  const orgId = organizationId ?? (teamData?.['organizationId'] as string | undefined);

  if (!orgId) return null;

  const organizationAdminIds = await getOrganizationAdminIds(db, orgId);

  if (organizationAdminIds.length === 0) return null;

  const athletePersonalTarget = buildPersonalBillingTarget(userId, orgId, teamId);
  const athleteOrganizationTarget = buildOrganizationBillingTarget(orgId, teamId);
  const billingOwnerUid = await getOrganizationBillingOwnerUid(db, orgId);
  await ensureNormalizedBillingOwner(db, athletePersonalTarget);
  await ensureNormalizedBillingOwner(
    db,
    athleteOrganizationTarget,
    billingOwnerUid ? { billingOwnerUid } : undefined
  );

  const userDoc = await db.collection('Users').doc(userId).get();
  const userData = (userDoc.data() ?? {}) as BillingUserRoutingRecord;
  if (
    !userData.activeBillingTarget ||
    userData.activeBillingTarget.ownerType !== 'individual' ||
    !isExplicitPersonalBillingTarget(userData.activeBillingTarget)
  ) {
    await setActiveBillingTarget(db, userId, athleteOrganizationTarget);
  } else {
    await setActiveBillingTarget(db, userId, {
      ...buildPersonalBillingTarget(userId, orgId, teamId, 'personal', true),
    });
  }

  const athleteCtx = await getBillingStateForTarget(db, userId, athleteOrganizationTarget);
  if (!athleteCtx) {
    return null;
  }

  const billingUserId = `org:${orgId}`;

  // Fetch all team IDs for this org so the usage dashboard can query
  // UsageEvents across the entire organization (same as resolveUserOrgTarget).
  // Without this, fetchUsageEvents falls through to the individual query path
  // and queries `userId == 'org:{orgId}'` — which matches zero events.
  let teamIds: string[] = [teamId];
  if (orgId) {
    const teamsSnap = await db.collection('Teams').where('organizationId', '==', orgId).get();
    teamIds = teamsSnap.docs.map((doc) => doc.id);
    // Ensure the athlete's own team is always included
    if (!teamIds.includes(teamId)) teamIds.push(teamId);
  }

  logger.info('[resolveBillingTarget] Resolved athlete to organization billing', {
    userId,
    teamId,
    organizationId: orgId,
    billingUserId,
    teamCount: teamIds.length,
  });

  return {
    type: 'organization',
    billingUserId,
    context: athleteCtx,
    organizationId: orgId,
    teamIds,
  };
}

/**
 * Internal: Resolve a user's organization billing target.
 *
 * Directors are ALWAYS routed to their organization's billing context.
 * Athletes, coaches, and other roster members on org-billed teams are
 * also routed to the organization's billing context.
 * Everyone else falls back to their individual billing context.
 *
 * Returns null if no qualifying organization is found.
 */
async function resolveUserOrgTarget(
  db: Firestore,
  userId: string,
  role: string | undefined
): Promise<ResolvedBillingTarget | null> {
  // Strategy 1: Look up via RosterEntries — find any active org membership.
  const rosterSnap = await db
    .collection('RosterEntries')
    .where('userId', '==', userId)
    .where('status', '==', 'active')
    .limit(1)
    .get();

  let organizationId: string | undefined;

  if (!rosterSnap.empty) {
    organizationId = rosterSnap.docs[0]!.data()['organizationId'] as string | undefined;
  }

  // Strategy 2: Fallback to explicit organization admin membership.
  // Admin membership is sourced from Organizations.admins; adminUserIds is a
  // derived index for queryability and legacy docs fall back to an in-memory scan.
  if (!organizationId) {
    organizationId = await findOrganizationIdForAdminUser(db, userId);
  }

  // Strategy 2.5: Fallback for directors and coaches — check organizations.ownerId
  // Coaches are set as ownerId during onboarding (same as directors).
  if (!organizationId && (role === 'director' || role === 'coach')) {
    const orgSnap = await db
      .collection('Organizations')
      .where('ownerId', '==', userId)
      .limit(1)
      .get();

    if (!orgSnap.empty) {
      organizationId = orgSnap.docs[0]!.id;
    }
  }

  // Strategy 3: Fallback for coaches — RosterEntry teamId → Team.organizationId
  // If the coach has an active roster entry with a teamId but no organizationId
  // on the entry itself, look up the org via the team document.
  if (!organizationId && role === 'coach' && !rosterSnap.empty) {
    const teamId = rosterSnap.docs[0]!.data()['teamId'] as string | undefined;
    if (teamId) {
      const teamDoc = await db.collection('Teams').doc(teamId).get();
      organizationId = teamDoc.data()?.['organizationId'] as string | undefined;
    }
  }

  if (!organizationId) {
    return null;
  }

  const organizationAdminIds = await getOrganizationAdminIds(db, organizationId);

  if (organizationAdminIds.length === 0) {
    return null;
  }

  // Fetch all teams for this organization
  const teamsSnap = await db
    .collection('Teams')
    .where('organizationId', '==', organizationId)
    .get();
  const teamIds = teamsSnap.docs.map((doc) => doc.id);

  // Fetch or create the org billing context
  await ensureOrgBillingState(db, organizationId);
  const orgCtx = await getOrgBillingState(db, organizationId);

  if (!orgCtx) {
    logger.error('[resolveUserOrgTarget] Failed to create org billing context', {
      organizationId,
      userId,
    });
    return null;
  }

  logger.info('[resolveUserOrgTarget] Resolved user to organization billing', {
    userId,
    role,
    organizationId,
    teamCount: teamIds.length,
  });

  return {
    type: 'organization',
    billingUserId: `org:${organizationId}`,
    context: orgCtx,
    organizationId,
    teamIds,
  };
}

// ============================================
// CONTEXT LOOKUP HELPERS
// ============================================

/**
 * Get the organization-level master billing context.
 */
async function getOrgBillingState(
  db: Firestore,
  organizationId: string
): Promise<BillingState | null> {
  const target = buildOrganizationBillingTarget(organizationId);
  return getBillingStateForTarget(db, `org:${organizationId}`, target);
}

// ============================================
// CONTEXT CREATION HELPERS
// ============================================

/**
 * Create an organization-level master billing context.
 */
async function ensureOrgBillingState(db: Firestore, organizationId: string): Promise<void> {
  const organizationAdminIds = await getOrganizationAdminIds(db, organizationId);
  if (organizationAdminIds.length === 0) {
    throw new Error(`Organization ${organizationId} does not have any admins`);
  }
  const organizationTarget = buildOrganizationBillingTarget(organizationId);
  const billingOwnerUid = await getOrganizationBillingOwnerUid(db, organizationId);
  await ensureNormalizedBillingOwner(
    db,
    organizationTarget,
    billingOwnerUid ? { billingOwnerUid } : undefined
  );

  logger.info('[createOrgBillingContext] Created org billing context', {
    organizationId,
    adminCount: organizationAdminIds.length,
    hasBillingOwnerUid: Boolean(billingOwnerUid),
  });
}

// ============================================
// BUDGET UPDATE (USER-FACING)
// ============================================

/**
 * Update a user's monthly budget limit.
 * Only the account owner can call this.
 */
export async function updateBudget(
  db: Firestore,
  userId: string,
  newBudgetCents: number,
  budgetInterval: BudgetInterval = DEFAULT_BUDGET_INTERVAL,
  hardStop?: boolean
): Promise<void> {
  if (newBudgetCents < 0) {
    throw new Error('Budget cannot be negative');
  }

  await ensureUserBillingState(db, userId);
  const target = await resolveBillingTarget(db, userId, { billingMode: 'organization' });

  if (target.type !== 'organization' || !target.organizationId) {
    throw new Error('Individual budgets are not supported');
  }

  const normalizedInterval = getBudgetInterval(budgetInterval);
  await upsertOrganizationBudgetDocument(
    db,
    target.organizationId,
    'organization',
    target.organizationId,
    newBudgetCents,
    normalizedInterval,
    hardStop ?? false
  );

  logger.info('[updateBudget] Budget updated', {
    userId,
    newBudgetCents,
    budgetInterval: normalizedInterval,
    billingEntity: 'organization',
  });
}

/**
 * Update an organization's master monthly budget.
 * Only org admins can call this.
 */
export async function updateOrgBudget(
  db: Firestore,
  organizationId: string,
  newBudgetCents: number,
  budgetInterval: BudgetInterval = DEFAULT_BUDGET_INTERVAL,
  hardStop?: boolean
): Promise<void> {
  if (newBudgetCents < 0) {
    throw new Error('Budget cannot be negative');
  }

  await ensureOrgBillingState(db, organizationId);
  const normalizedInterval = getBudgetInterval(budgetInterval);
  await upsertOrganizationBudgetDocument(
    db,
    organizationId,
    'organization',
    organizationId,
    newBudgetCents,
    normalizedInterval,
    hardStop ?? false
  );

  logger.info('[updateOrgBudget] Org budget updated', {
    organizationId,
    newBudgetCents,
    budgetInterval: normalizedInterval,
  });
}

/**
 * Update a team's sub-allocation within an organization.
 * Only org admins can call this.
 */
export async function updateTeamAllocation(
  db: Firestore,
  teamId: string,
  organizationId: string,
  newLimitCents: number,
  budgetInterval: BudgetInterval = DEFAULT_BUDGET_INTERVAL
): Promise<void> {
  if (newLimitCents < 0) {
    throw new Error('Team allocation cannot be negative');
  }

  const normalizedInterval = getBudgetInterval(budgetInterval);
  await upsertOrganizationBudgetDocument(
    db,
    organizationId,
    'team',
    teamId,
    newLimitCents,
    normalizedInterval,
    true
  );

  logger.info('[updateTeamAllocation] Team allocation updated', {
    teamId,
    organizationId,
    newLimitCents,
    budgetInterval: normalizedInterval,
  });
}

/**
 * Delete an organization's master budget for a specific cadence.
 * Removes the persisted OrganizationBudgets document entirely.
 */
export async function deleteOrgBudget(
  db: Firestore,
  organizationId: string,
  budgetInterval: BudgetInterval = DEFAULT_BUDGET_INTERVAL
): Promise<void> {
  await ensureOrgBillingState(db, organizationId);

  const normalizedInterval = getBudgetInterval(budgetInterval);
  await deleteOrganizationBudgetDocument(
    db,
    organizationId,
    'organization',
    organizationId,
    normalizedInterval
  );

  logger.info('[deleteOrgBudget] Org budget deleted', {
    organizationId,
    budgetInterval: normalizedInterval,
  });
}

/**
 * Delete a team's sub-allocation for a specific cadence.
 * Removes the persisted OrganizationBudgets document entirely.
 */
export async function deleteTeamAllocation(
  db: Firestore,
  teamId: string,
  organizationId: string,
  budgetInterval: BudgetInterval = DEFAULT_BUDGET_INTERVAL
): Promise<void> {
  const normalizedInterval = getBudgetInterval(budgetInterval);
  await deleteOrganizationBudgetDocument(db, organizationId, 'team', teamId, normalizedInterval);

  logger.info('[deleteTeamAllocation] Team allocation deleted', {
    teamId,
    organizationId,
    budgetInterval: normalizedInterval,
  });
}

// ============================================
// TEAM ALLOCATION QUERIES (FOR DASHBOARD)
// ============================================

/**
 * Get all team allocations for an organization.
 * Used by the dashboard to show the AD how each team is spending.
 */
export async function getOrgTeamAllocations(
  db: Firestore,
  organizationId: string
): Promise<TeamBudgetAllocation[]> {
  const budgets = await getOrganizationBudgetDocuments(db, organizationId);
  return budgets
    .filter((budget) => budget.targetType === 'team')
    .map((budget) => ({
      teamId: budget.targetId,
      organizationId: budget.organizationId,
      budgetInterval: budget.budgetInterval,
      monthlyLimit: budget.budgetLimit,
      currentPeriodSpend: budget.currentPeriodSpend,
      periodStart: budget.periodStart,
      periodEnd: budget.periodEnd,
      notified50: budget.notified50,
      notified80: budget.notified80,
      notified100: budget.notified100,
      createdAt: budget.createdAt,
      updatedAt: budget.updatedAt,
    }));
}

// ============================================
// PERIOD RESET (Called by scheduled function)
// ============================================

/**
 * Reset all normalized billing ledgers and team allocations for a new monthly period.
 * Should be called by a Cloud Function on the 1st of each month.
 */
export async function resetMonthlyBudgets(db: Firestore): Promise<number> {
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();
  const periodKey = createPeriodKey(periodStart);

  let totalCount = 0;

  const preferenceSnap = await db.collection(COLLECTIONS.BILLING_PREFERENCES).get();
  let batch = db.batch();
  let batchCount = 0;

  for (const doc of preferenceSnap.docs) {
    const data = doc.data() as BillingPreferenceDocument;
    const ownerType = data.ownerType;
    const ownerId = data.ownerId;
    const refs = getNormalizedBillingRefs(db, ownerType, ownerId, periodKey);
    const defaultMonthlyBudget =
      ownerType === 'organization' ? DEFAULT_ORGANIZATION_BUDGET : DEFAULT_INDIVIDUAL_BUDGET;
    const monthlyBudget = await getLatestMonthlyBudget(
      db,
      ownerType,
      ownerId,
      defaultMonthlyBudget
    );

    batch.set(
      refs.periodLedgerRef,
      {
        id: refs.periodLedgerRef.id,
        ownerId,
        ownerType,
        periodKey,
        currentPeriodSpend: 0,
        monthlyBudget,
        periodStart,
        periodEnd,
        notified50: false,
        notified80: false,
        notified100: false,
        schemaVersion: 1,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    totalCount++;
    batchCount++;

    if (batchCount >= 450) {
      await batch.commit();
      batch = db.batch();
      batchCount = 0;
    }
  }

  if (batchCount > 0) {
    await batch.commit();
  }

  // Reset team allocations
  const allocSnap = await db.collection(COLLECTIONS.TEAM_BUDGET_ALLOCATIONS).get();
  batch = db.batch();
  batchCount = 0;

  for (const doc of allocSnap.docs) {
    batch.update(doc.ref, {
      currentPeriodSpend: 0,
      periodStart,
      periodEnd,
      notified50: false,
      notified80: false,
      notified100: false,
      updatedAt: FieldValue.serverTimestamp(),
    });
    totalCount++;
    batchCount++;

    if (batchCount >= 450) {
      await batch.commit();
      batch = db.batch();
      batchCount = 0;
    }
  }

  if (batchCount > 0) {
    await batch.commit();
  }

  logger.info('[resetMonthlyBudgets] Reset complete', { totalCount });
  return totalCount;
}

// ============================================
// WALLET HOLDS (Gas-Station Pre-Auth)
// ============================================

/** Default hold expiry — used only when dynamic config is unavailable */
const DEFAULT_HOLD_EXPIRY_MS = 10 * 60 * 1000;

function resolveWalletHoldTarget(hold: WalletHold): BillingTargetReference {
  if (hold.ownerId && hold.ownerType) {
    return {
      ownerId: hold.ownerId,
      ownerType: hold.ownerType,
      organizationId: hold.organizationId,
      teamId: hold.teamId,
      source: hold.ownerType === 'organization' ? 'organization' : 'personal',
    };
  }

  if (hold.organizationId) {
    return buildOrganizationBillingTarget(hold.organizationId, hold.teamId);
  }

  return buildPersonalBillingTarget(hold.userId, hold.organizationId, hold.teamId);
}

/**
 * Create a wallet hold — atomically reserve funds for an in-flight AI operation.
 *
 * This prevents race conditions where N parallel requests all pass the balance
 * check and then overdraw the wallet. The hold increases `pendingHoldsCents`
 * on the billing context and creates a `WalletHolds` document for tracking.
 *
 * @param db Firestore instance
 * @param userId User's Firebase UID
 * @param estimatedCostCents Worst-case cost from `estimateMaxCost()`
 * @param jobId Unique job identifier for correlation
 * @param feature The feature being used (for audit trail)
 * @returns Hold result with holdId if successful
 */
export async function createWalletHold(
  db: Firestore,
  userId: string,
  estimatedCostCents: number,
  jobId: string,
  feature: string
): Promise<WalletHoldResult> {
  if (estimatedCostCents <= 0) {
    return { success: false, reason: 'Estimated cost must be positive' };
  }

  let holdId = '';
  let availableBalance = 0;
  const billingTarget = await getStoredBillingTarget(db, userId);
  const config = await getPlatformConfig(db);
  const holdExpiryMs = config.holdExpiryMs || DEFAULT_HOLD_EXPIRY_MS;
  const expiresAt = Timestamp.fromMillis(Date.now() + holdExpiryMs);
  await ensureNormalizedBillingOwner(db, billingTarget);

  try {
    await db.runTransaction(async (txn) => {
      const owner = await getNormalizedBillingDocumentsForTransaction(txn, db, billingTarget);

      if (!owner) {
        throw new Error('Billing context not found');
      }

      const walletBalance = owner.docs.wallet.balanceCents ?? 0;
      const pendingHolds = owner.docs.wallet.pendingHoldsCents ?? 0;
      availableBalance = walletBalance - pendingHolds;

      if (availableBalance < estimatedCostCents) {
        const balanceLabel =
          billingTarget.ownerType === 'organization'
            ? 'organization wallet balance'
            : 'available balance';
        throw new Error(
          `Insufficient ${balanceLabel}: $${(availableBalance / 100).toFixed(2)} < $${(estimatedCostCents / 100).toFixed(2)}`
        );
      }

      const holdRef = db.collection(COLLECTIONS.WALLET_HOLDS).doc();
      holdId = holdRef.id;

      txn.set(holdRef, {
        id: holdId,
        userId,
        ownerId: billingTarget.ownerId,
        ownerType: billingTarget.ownerType,
        ...(billingTarget.organizationId ? { organizationId: billingTarget.organizationId } : {}),
        ...(billingTarget.teamId ? { teamId: billingTarget.teamId } : {}),
        amountCents: estimatedCostCents,
        status: 'active',
        jobId,
        feature,
        createdAt: FieldValue.serverTimestamp(),
        expiresAt,
      });

      txn.update(owner.refs.walletRef, {
        pendingHoldsCents: FieldValue.increment(estimatedCostCents),
        updatedAt: FieldValue.serverTimestamp(),
      });
    });

    logger.info('[createWalletHold] Hold created', {
      holdId,
      userId,
      estimatedCostCents,
      jobId,
      feature,
    });

    return {
      success: true,
      holdId,
      availableBalance: availableBalance - estimatedCostCents,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create hold';
    logger.warn('[createWalletHold] Hold rejected', {
      userId,
      estimatedCostCents,
      reason: message,
    });
    return { success: false, reason: message, availableBalance };
  }
}

/**
 * Capture a wallet hold — deduct the actual cost and release the remaining hold.
 *
 * Called after an AI operation completes with the real cost from `resolveAICost()`.
 * The actual cost is always ≤ the hold amount (estimates are conservative).
 *
 * Lifecycle:
 *   1. Release the full hold amount from `pendingHoldsCents`
 *   2. Deduct the actual cost from `walletBalanceCents`
 *   3. Mark the hold document as 'captured'
 *
 * @param db Firestore instance
 * @param holdId The hold document ID from `createWalletHold()`
 * @param actualCostCents The real cost after LLM execution
 */
export async function captureWalletHold(
  db: Firestore,
  holdId: string,
  actualCostCents: number
): Promise<void> {
  if (actualCostCents < 0) {
    throw new Error('Actual cost cannot be negative');
  }

  const holdRef = db.collection(COLLECTIONS.WALLET_HOLDS).doc(holdId);
  let teamId: string | undefined;
  let capturedOwnerType: BillingOwnerType | null = null;

  await db.runTransaction(async (txn) => {
    const holdDoc = await txn.get(holdRef);

    if (!holdDoc.exists) {
      throw new Error(`Wallet hold ${holdId} not found`);
    }

    const hold = holdDoc.data() as WalletHold;
    teamId = hold.teamId;
    const billingTarget = resolveWalletHoldTarget(hold);
    capturedOwnerType = billingTarget.ownerType;

    if (hold.status !== 'active') {
      throw new Error(`Wallet hold ${holdId} is already ${hold.status}`);
    }

    const owner = await getNormalizedBillingDocumentsForTransaction(txn, db, billingTarget);

    if (!owner) {
      throw new Error(`Billing context not found for user ${hold.userId}`);
    }

    txn.update(owner.refs.walletRef, {
      pendingHoldsCents: FieldValue.increment(-hold.amountCents),
      balanceCents: FieldValue.increment(-actualCostCents),
      updatedAt: FieldValue.serverTimestamp(),
    });

    txn.update(owner.refs.periodLedgerRef, {
      currentPeriodSpend: FieldValue.increment(actualCostCents),
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Mark hold as captured
    txn.update(holdRef, {
      status: 'captured',
      capturedAmountCents: actualCostCents,
      resolvedAt: FieldValue.serverTimestamp(),
    });
  });

  if (capturedOwnerType === 'organization' && actualCostCents > 0 && teamId) {
    await updateTeamAllocationSpend(db, teamId, actualCostCents);
  }

  logger.info('[captureWalletHold] Hold captured', { holdId, actualCostCents });
}

/**
 * Release a wallet hold without charging — used when an AI operation fails
 * or is cancelled. Returns the full hold amount to the available balance.
 *
 * @param db Firestore instance
 * @param holdId The hold document ID from `createWalletHold()`
 */
export async function releaseWalletHold(db: Firestore, holdId: string): Promise<void> {
  const holdRef = db.collection(COLLECTIONS.WALLET_HOLDS).doc(holdId);

  await db.runTransaction(async (txn) => {
    const holdDoc = await txn.get(holdRef);

    if (!holdDoc.exists) {
      throw new Error(`Wallet hold ${holdId} not found`);
    }

    const hold = holdDoc.data() as WalletHold;

    if (hold.status !== 'active') {
      logger.warn('[releaseWalletHold] Hold already resolved', {
        holdId,
        status: hold.status,
      });
      return;
    }

    const billingTarget = resolveWalletHoldTarget(hold);
    const owner = await getNormalizedBillingDocumentsForTransaction(txn, db, billingTarget);

    if (!owner) {
      throw new Error(`Billing context not found for user ${hold.userId}`);
    }

    txn.update(owner.refs.walletRef, {
      pendingHoldsCents: FieldValue.increment(-hold.amountCents),
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Mark hold as released
    txn.update(holdRef, {
      status: 'released',
      resolvedAt: FieldValue.serverTimestamp(),
    });
  });

  logger.info('[releaseWalletHold] Hold released', { holdId });
}

/**
 * Expire stale wallet holds that were never captured or released.
 * Called by a scheduled Cloud Function to prevent permanently locked funds.
 *
 * @param db Firestore instance
 * @returns Number of expired holds
 */
export async function expireStaleHolds(db: Firestore): Promise<number> {
  const config = await getPlatformConfig(db);
  const holdExpiryMs = config.holdExpiryMs || DEFAULT_HOLD_EXPIRY_MS;
  const cutoff = new Date(Date.now() - holdExpiryMs);

  const [expiresAtSnapshot, legacySnapshot] = await Promise.all([
    db
      .collection(COLLECTIONS.WALLET_HOLDS)
      .where('status', '==', 'active')
      .where('expiresAt', '<=', Timestamp.now())
      .limit(200)
      .get(),
    db
      .collection(COLLECTIONS.WALLET_HOLDS)
      .where('status', '==', 'active')
      .where('createdAt', '<', cutoff)
      .limit(200)
      .get(),
  ]);

  const holdDocs = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
  for (const doc of expiresAtSnapshot.docs) {
    holdDocs.set(doc.id, doc);
  }
  for (const doc of legacySnapshot.docs) {
    holdDocs.set(doc.id, doc);
  }

  if (holdDocs.size === 0) return 0;

  let expiredCount = 0;
  let totalReleasedCents = 0;
  let legacyFallbackCount = 0;
  const batch = db.batch();

  const holdsByOwner = new Map<
    string,
    { target: BillingTargetReference; totalHeldCents: number }
  >();

  for (const doc of holdDocs.values()) {
    const hold = doc.data() as WalletHold;

    if (!hold.expiresAt) {
      legacyFallbackCount++;
    }

    batch.update(doc.ref, {
      status: 'expired',
      resolvedAt: FieldValue.serverTimestamp(),
    });

    const target = resolveWalletHoldTarget(hold);
    const targetKey = `${target.ownerType}:${target.ownerId}`;
    const existing = holdsByOwner.get(targetKey);
    holdsByOwner.set(targetKey, {
      target,
      totalHeldCents: (existing?.totalHeldCents ?? 0) + hold.amountCents,
    });

    expiredCount++;
    totalReleasedCents += hold.amountCents;
  }

  await batch.commit();

  for (const { target, totalHeldCents } of holdsByOwner.values()) {
    const { periodKey } = getCurrentPeriodWindow();
    const refs = getNormalizedBillingRefs(db, target.ownerType, target.ownerId, periodKey);
    await refs.walletRef.set(
      {
        pendingHoldsCents: FieldValue.increment(-totalHeldCents),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }

  logger.info('[expireStaleHolds] Expired stale holds', {
    expiredCount,
    totalReleasedCents,
    legacyFallbackCount,
  });
  return expiredCount;
}

// ============================================
// REFERRAL REWARDS
// ============================================

/**
 * Default amount credited to the referrer's wallet when a new user signs up (in cents).
 * The live value is read from `AppConfig/referralReward` in Firestore so it can be
 * adjusted without a deployment. This constant is the fallback only.
 */
export const REFERRAL_REWARD_CENTS = 500; // $5.00
export const MAX_REFERRAL_REWARDS = 20;
export const NEW_USER_MAX_AGE_MINUTES = 30;

/** Firestore collection that holds global app configuration knobs. */
const APP_CONFIG_COLLECTION = 'AppConfig';
const REFERRAL_REWARDS_COLLECTION = 'ReferralRewards';

/** AppConfig document holding starter wallet amounts for newly created billing contexts. */
const STARTER_WALLETS_DOC_ID = 'starterWallets';

interface StarterWalletConfig {
  readonly individualAmountCents: number;
  readonly organizationAmountCents: number;
}

/**
 * Read starter wallet amounts from Firestore.
 * Document path: `AppConfig/starterWallets` →
 * `{ individualAmountCents: number, organizationAmountCents: number }`.
 * Falls back to the built-in defaults if the doc is missing or invalid.
 */
async function getStarterWalletConfig(db: Firestore): Promise<StarterWalletConfig> {
  try {
    const snap = await db.collection(APP_CONFIG_COLLECTION).doc(STARTER_WALLETS_DOC_ID).get();
    const data = snap.data();
    const individualAmount = data?.['individualAmountCents'];
    const organizationAmount = data?.['organizationAmountCents'];

    return {
      individualAmountCents:
        typeof individualAmount === 'number' && individualAmount >= 0
          ? individualAmount
          : DEFAULT_INDIVIDUAL_STARTER_BALANCE,
      organizationAmountCents:
        typeof organizationAmount === 'number' && organizationAmount >= 0
          ? organizationAmount
          : DEFAULT_ORGANIZATION_STARTER_BALANCE,
    };
  } catch {
    return {
      individualAmountCents: DEFAULT_INDIVIDUAL_STARTER_BALANCE,
      organizationAmountCents: DEFAULT_ORGANIZATION_STARTER_BALANCE,
    };
  }
}

/**
 * Read the current referral reward amount from Firestore.
 * Document path: `AppConfig/referralReward` → `{ amountCents: number }`.
 * Falls back to REFERRAL_REWARD_CENTS if the doc is missing or has no valid value.
 */
export async function getReferralRewardCents(db: Firestore): Promise<number> {
  try {
    const snap = await db.collection(APP_CONFIG_COLLECTION).doc('referralReward').get();
    const data = snap.data();
    const amount = data?.['amountCents'];
    if (typeof amount === 'number' && amount > 0) return amount;
  } catch {
    // Non-fatal — fall through to default
  }
  return REFERRAL_REWARD_CENTS;
}

export interface WalletTopUpResult {
  success: boolean;
  newBalanceCents: number;
  error?: string;
}

async function dispatchCreditsAddedNotification(
  db: Firestore,
  userId: string,
  amountCents: number,
  newBalance: number,
  notificationVariant: 'standard' | 'auto_topup' = 'standard'
): Promise<void> {
  const { dispatch } = await import('../../services/communications/notification.service.js');
  const title = notificationVariant === 'auto_topup' ? 'Wallet Auto-Reloaded' : 'Credits Added';
  const body =
    notificationVariant === 'auto_topup'
      ? `Your wallet was automatically reloaded with $${(amountCents / 100).toFixed(2)}. New balance: $${(newBalance / 100).toFixed(2)}.`
      : `$${(amountCents / 100).toFixed(2)} was added to your wallet. New balance: $${(newBalance / 100).toFixed(2)}.`;

  await dispatch(db, {
    userId,
    type: NOTIFICATION_TYPES.CREDITS_ADDED,
    title,
    body,
    deepLink: '/usage?section=overview',
    source: { userName: 'NXT1 Billing' },
  }).catch((err: unknown) => {
    logger.error('[addWalletTopUp] Failed to send credits-added notification', {
      error: err,
      userId,
    });
  });
}

/**
 * Credit a referral reward to the referring user's Agent X wallet.
 *
 * Uses `ReferralRewards` collection for idempotency — each (referrerId, newUserId)
 * pair can only be rewarded once. Safe to call multiple times for the same pair.
 *
 * Writes to the normalized wallet balance (the single source of truth)
 * via `addWalletTopUp`.
 *
 * The reward amount is read live from `AppConfig/referralReward` in Firestore so
 * it can be updated without a deployment. Falls back to REFERRAL_REWARD_CENTS.
 *
 * @param db        Firestore instance
 * @param referrerId  The UID of the user who sent the invite
 * @param newUserId   The UID of the newly signed-up user
 */
export async function creditReferralReward(
  db: Firestore,
  referrerId: string,
  newUserId: string
): Promise<WalletTopUpResult> {
  const amountCents = await getReferralRewardCents(db);
  if (amountCents <= 0) {
    return { success: false, newBalanceCents: 0, error: 'Amount must be positive' };
  }

  if (referrerId === newUserId) {
    return { success: false, newBalanceCents: 0, error: 'Cannot reward self-referral' };
  }

  // Idempotency key: one reward per (referrer, newUser) pair
  const idempotencyKey = `referral_${referrerId}_${newUserId}`;
  const rewardRef = db.collection(REFERRAL_REWARDS_COLLECTION).doc(idempotencyKey);

  try {
    const personalTarget = buildPersonalBillingTarget(referrerId);
    const { periodKey } = getCurrentPeriodWindow();
    const refs = getNormalizedBillingRefs(
      db,
      personalTarget.ownerType,
      personalTarget.ownerId,
      periodKey
    );

    let result: WalletTopUpResult = {
      success: false,
      newBalanceCents: 0,
      error: 'Referral reward transaction did not complete',
    };
    let credited = false;

    await db.runTransaction(async (txn) => {
      const rewardSnap = await txn.get(rewardRef);
      const walletSnap = await txn.get(refs.walletRef);
      const walletData = walletSnap.exists ? (walletSnap.data() as WalletDocument) : null;
      const currentBalance = walletData?.balanceCents ?? 0;

      if (rewardSnap.exists) {
        logger.info('[creditReferralReward] Already processed (idempotent)', {
          referrerId,
          newUserId,
        });
        result = {
          success: true,
          newBalanceCents: currentBalance,
        };
        return;
      }

      const totalReferralRewards = walletData?.totalReferralRewardsCents ?? 0;
      if (totalReferralRewards >= MAX_REFERRAL_REWARDS) {
        logger.info('[creditReferralReward] Referral reward cap reached', {
          referrerId,
          newUserId,
          totalReferralRewards,
          maxReferralRewards: MAX_REFERRAL_REWARDS,
        });
        result = {
          success: false,
          newBalanceCents: currentBalance,
          error: 'Referral reward limit reached',
        };
        return;
      }

      const newBalance = currentBalance + amountCents;
      const nextReferralRewards = totalReferralRewards + 1;
      const walletUpdate = {
        balanceCents: newBalance,
        creditsAlertBaselineCents: newBalance,
        creditsNotified80: false,
        creditsNotified50: false,
        creditsNotified25: false,
        totalReferralRewardsCents: nextReferralRewards,
        updatedAt: FieldValue.serverTimestamp(),
      };

      if (walletSnap.exists) {
        txn.update(refs.walletRef, walletUpdate);
      } else {
        txn.set(refs.walletRef, {
          id: createWalletDocumentId(personalTarget.ownerType, personalTarget.ownerId),
          ownerId: personalTarget.ownerId,
          ownerType: personalTarget.ownerType,
          pendingHoldsCents: 0,
          ...walletUpdate,
          createdAt: FieldValue.serverTimestamp(),
        });
      }

      txn.set(rewardRef, {
        referrerId,
        newUserId,
        amountCents,
        processedAt: FieldValue.serverTimestamp(),
        type: 'referral_reward',
      });

      credited = true;
      result = { success: true, newBalanceCents: newBalance };
    });

    if (credited) {
      logger.info('[creditReferralReward] Referral reward credited', {
        referrerId,
        newUserId,
        amountCents,
        newBalanceCents: result.newBalanceCents,
      });
      await dispatchCreditsAddedNotification(db, referrerId, amountCents, result.newBalanceCents);
    }

    return result;
  } catch (error) {
    logger.error('[creditReferralReward] Referral reward failed', {
      referrerId,
      newUserId,
      amountCents,
      error,
    });
    return {
      success: false,
      newBalanceCents: 0,
      error: error instanceof Error ? error.message : 'Failed to credit referral reward',
    };
  }
}
