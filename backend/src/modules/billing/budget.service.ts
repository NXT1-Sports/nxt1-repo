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
import { FieldValue } from 'firebase-admin/firestore';
import { logger } from '../../utils/logger.js';
import { COLLECTIONS } from './config.js';
import { getPlatformConfig } from './platform-config.service.js';
import { getRuntimeEnvironment } from '../../config/runtime-environment.js';
import {
  type BillingContext,
  type BillingEntity,
  type PaymentProvider,
  type TeamBudgetAllocation,
  type WalletHold,
  type WalletHoldResult,
  DEFAULT_INDIVIDUAL_BUDGET,
  DEFAULT_INDIVIDUAL_STARTER_BALANCE,
  DEFAULT_ORGANIZATION_BUDGET,
  DEFAULT_ORGANIZATION_STARTER_BALANCE,
} from './types/index.js';
import { NOTIFICATION_TYPES } from '@nxt1/core';
import type { NotificationType } from '@nxt1/core';

type CreditsAlertFlag = 'creditsNotified80' | 'creditsNotified50' | 'creditsNotified25';

interface CreditsLowAlert {
  readonly title: string;
  readonly priority: 'normal' | 'high';
  readonly updates: Partial<Record<CreditsAlertFlag, boolean>>;
}

interface BillingContextRecord {
  readonly ref: FirebaseFirestore.DocumentReference;
  readonly data: BillingContext;
}

function getBillingContextRef(
  db: Firestore,
  billingUserId: string
): FirebaseFirestore.DocumentReference {
  return db.collection(COLLECTIONS.BILLING_CONTEXTS).doc(billingUserId);
}

async function getBillingContextRecord(
  db: Firestore,
  billingUserId: string
): Promise<BillingContextRecord | null> {
  const docRef = getBillingContextRef(db, billingUserId);
  const doc = await docRef.get();

  if (!doc.exists) return null;

  return {
    ref: docRef,
    data: doc.data() as BillingContext,
  };
}

async function getBillingContextRecordForTransaction(
  txn: FirebaseFirestore.Transaction,
  db: Firestore,
  billingUserId: string
): Promise<BillingContextRecord | null> {
  const docRef = getBillingContextRef(db, billingUserId);
  const doc = await txn.get(docRef);

  if (!doc.exists) return null;

  return {
    ref: docRef,
    data: doc.data() as BillingContext,
  };
}

// ============================================
// BILLING CONTEXT MANAGEMENT
// ============================================

/**
 * Get the billing context for a user.
 * Returns null if none exists (caller should call `getOrCreateBillingContext`).
 */
export async function getBillingContext(
  db: Firestore,
  userId: string
): Promise<BillingContext | null> {
  const record = await getBillingContextRecord(db, userId);
  return record?.data ?? null;
}

/**
 * Get or create a billing context for a user.
 *
 * Resolution order:
 *   1. If a teamId is provided, look up the team's organizationId.
 *   2. If the organization exists and has billing enabled → billingEntity = 'organization'.
 *   3. Otherwise → billingEntity = 'individual'.
 */
export async function getOrCreateBillingContext(
  db: Firestore,
  userId: string,
  teamId?: string
): Promise<BillingContext> {
  const existing = await getBillingContext(db, userId);
  if (existing) return existing;

  // Determine billing entity by walking the hierarchy
  let billingEntity: BillingEntity = 'individual';
  let effectiveTeamId = teamId;
  let organizationId: string | undefined;

  if (teamId) {
    const teamDoc = await db.collection('Teams').doc(teamId).get();
    const teamData = teamDoc.data();
    effectiveTeamId = teamId;

    // Check for organization-level billing
    const orgId = teamData?.['organizationId'] as string | undefined;
    if (orgId) {
      const orgDoc = await db.collection('Organizations').doc(orgId).get();
      const orgData = orgDoc.data();

      const orgHasBilling = !!orgData?.['billing']?.['subscriptionId'];

      if (orgHasBilling) {
        billingEntity = 'organization';
        organizationId = orgId;
      }
    }
  }

  const budget =
    billingEntity === 'individual' ? DEFAULT_INDIVIDUAL_BUDGET : DEFAULT_ORGANIZATION_BUDGET;
  const starterWalletConfig = await getStarterWalletConfig(db);
  const starterWalletBalance =
    billingEntity === 'individual' ? starterWalletConfig.individualAmountCents : 0;
  const creditsAlertBaseline =
    billingEntity === 'individual' ? starterWalletConfig.individualAmountCents : 0;

  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();

  const context: Omit<BillingContext, 'createdAt' | 'updatedAt'> = {
    userId,
    teamId: effectiveTeamId,
    organizationId,
    billingEntity,
    monthlyBudget: budget,
    budgetName: undefined,
    currentPeriodSpend: 0,
    personalCurrentPeriodSpend: 0,
    orgCurrentPeriodSpend: 0,
    periodStart,
    periodEnd,
    notified50: false,
    notified80: false,
    notified100: false,
    iapLowBalanceNotified: false,
    budgetAlertsEnabled: false,
    creditsAlertBaselineCents: creditsAlertBaseline,
    creditsNotified80: false,
    creditsNotified50: false,
    creditsNotified25: false,
    hardStop: true,
    paymentProvider: 'stripe',
    walletBalanceCents: starterWalletBalance,
    pendingHoldsCents: 0,
  };

  const ts = FieldValue.serverTimestamp();
  await getBillingContextRef(db, userId).set({
    ...context,
    createdAt: ts,
    updatedAt: ts,
  });

  logger.info('[getOrCreateBillingContext] Created billing context', {
    userId,
    billingEntity,
    organizationId,
    monthlyBudget: budget,
  });

  return context as BillingContext;
}

function getCreditsLowAlert(data: BillingContext, newBalance: number): CreditsLowAlert | null {
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

function areBudgetAlertsEnabled(data: BillingContext): boolean {
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
  const ctx = await getOrCreateBillingContext(db, userId, teamId);

  // ── Individual billing: always gate against available wallet credits ──
  if (ctx.billingEntity === 'individual') {
    return checkWalletBudget(ctx, costCents);
  }

  // ── Organization billing: two-tier check ──
  const orgId = ctx.organizationId;
  const effectiveTeamId = ctx.teamId;

  // Tier 1: Check team sub-allocation (if it exists)
  if (effectiveTeamId) {
    const allocation = await getTeamAllocation(db, effectiveTeamId);
    if (allocation && allocation.monthlyLimit > 0) {
      const teamProjected = allocation.currentPeriodSpend + costCents;
      const teamPct =
        allocation.monthlyLimit > 0
          ? Math.round((teamProjected / allocation.monthlyLimit) * 100)
          : 0;

      if (teamProjected > allocation.monthlyLimit) {
        return {
          allowed: false,
          reason:
            `Team sub-limit of $${(allocation.monthlyLimit / 100).toFixed(2)} reached. ` +
            'Ask your Athletic Director to increase the team allocation.',
          currentSpend: allocation.currentPeriodSpend,
          budget: allocation.monthlyLimit,
          percentUsed: teamPct,
          billingEntity: 'organization',
        };
      }
    }
  }

  // Tier 2: Check organization master wallet balance
  const orgCtx = orgId ? await getOrgBillingContext(db, orgId) : null;

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
function checkSingleTierBudget(ctx: BillingContext, costCents: number): BudgetCheckResult {
  const pendingHolds = ctx.pendingHoldsCents ?? 0;
  const projectedSpend = ctx.currentPeriodSpend + pendingHolds + costCents;
  const percentUsed =
    ctx.monthlyBudget > 0 ? Math.round((projectedSpend / ctx.monthlyBudget) * 100) : 0;

  if (ctx.hardStop && projectedSpend > ctx.monthlyBudget) {
    return {
      allowed: false,
      reason:
        `Monthly budget of $${(ctx.monthlyBudget / 100).toFixed(2)} reached. ` +
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
  ctx: BillingContext,
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
 * Check budget using an already-resolved BillingContext.
 *
 * Use this when the caller already has a fresh context from
 * `resolveBillingTarget()` — avoids a redundant Firestore read that
 * `checkBudget()` would perform via `getOrCreateBillingContext()`.
 */
export function checkBudgetFromContext(
  ctx: BillingContext,
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
 * Record spend against a user's billing context and fire threshold alerts.
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

  const ctx = await getOrCreateBillingContext(db, userId, teamId);

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
  const record = await getBillingContextRecord(db, userId);
  if (!record) return;

  const { ref: docRef, data } = record;

  const updates: Record<string, unknown> = {
    currentPeriodSpend: FieldValue.increment(costCents),
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (data.billingEntity === 'organization') {
    updates['orgCurrentPeriodSpend'] = FieldValue.increment(costCents);
  } else {
    updates['personalCurrentPeriodSpend'] = FieldValue.increment(costCents);
  }

  // Budget alerts are only for explicit org/team budgets.
  // Wallet credit alerts for both individuals and orgs flow through wallet paths.

  await docRef.update(updates);
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
  const record = await getBillingContextRecord(db, userId);

  if (!record) {
    logger.error('[deductWallet] Billing context not found', { userId, costCents });
    throw new Error(`Billing context not found for user ${userId}`);
  }

  const docRef = record.ref;
  const { newBalance, shouldNotifyLow, creditsLowAlert } = await db.runTransaction(async (txn) => {
    const doc = await txn.get(docRef);
    const data = doc.data() as BillingContext;
    const currentBalance = data.walletBalanceCents ?? 0;

    if (currentBalance < costCents) {
      throw new Error(
        `Insufficient wallet balance: $${(currentBalance / 100).toFixed(2)} < $${(costCents / 100).toFixed(2)}`
      );
    }

    const nextBalance = currentBalance - costCents;
    const nextShouldNotifyLow =
      nextBalance < config.lowBalanceThresholdCents && !data.iapLowBalanceNotified;
    const nextCreditsLowAlert = getCreditsLowAlert(data, nextBalance);

    const updates: Record<string, unknown> = {
      walletBalanceCents: FieldValue.increment(-costCents),
      currentPeriodSpend: FieldValue.increment(costCents),
      personalCurrentPeriodSpend: FieldValue.increment(costCents),
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (nextCreditsLowAlert) {
      Object.assign(updates, nextCreditsLowAlert.updates);
    }

    if (nextShouldNotifyLow) {
      updates['iapLowBalanceNotified'] = true;
    }

    txn.update(docRef, updates);
    return {
      newBalance: nextBalance,
      shouldNotifyLow: nextShouldNotifyLow,
      creditsLowAlert: nextCreditsLowAlert,
    };
  });

  logger.info('[deductWallet] Wallet deducted', { userId, costCents, newBalance });

  if (creditsLowAlert) {
    const { dispatch } = await import('../../services/notification.service.js');
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
      logger.error('[deductWallet] Failed to send credits-low threshold alert', {
        error: err,
        userId,
      });
    });
  }

  if (shouldNotifyLow && !creditsLowAlert) {
    const { dispatch } = await import('../../services/notification.service.js');
    await dispatch(db, {
      userId,
      type: NOTIFICATION_TYPES.CREDITS_LOW,
      title: 'Wallet Balance Low',
      body: `Your wallet balance is $${(Math.max(0, newBalance) / 100).toFixed(2)}. Add funds in Settings → Usage to continue using Agent X.`,
      deepLink: '/usage',
      priority: 'high',
      source: { userName: 'NXT1 Billing' },
    }).catch((err: unknown) => {
      logger.error('[deductWallet] Failed to send low-balance alert', { error: err, userId });
    });
  }

  // Fire auto top-up if the user configured it — non-blocking, never delays the spend recording.
  // Re-read the full doc from the snapshot so we have the autoTopUp settings.
  const ctxData = record.data;
  triggerAutoTopUpIfEnabled(db, userId, ctxData, newBalance).catch((err: unknown) => {
    logger.error('[deductWallet] Auto top-up trigger failed', { error: err, userId });
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

  // Locate org master billing context
  const record = await getBillingContextRecord(db, `org:${organizationId}`);

  if (!record) {
    // Org billing context not found — fall back gracefully to per-user spend tracking
    logger.warn('[deductOrgWallet] Org billing context not found, falling back to updateSpend', {
      organizationId,
      userId,
      costCents,
    });
    await updateSpend(db, userId, costCents);
    return;
  }

  const docRef = record.ref;
  const { newBalance, shouldNotifyLow, creditsLowAlert } = await db.runTransaction(async (txn) => {
    const doc = await txn.get(docRef);
    const data = doc.data() as BillingContext;
    const currentBalance = data.walletBalanceCents ?? 0;

    if (currentBalance < costCents) {
      throw new Error(
        `Insufficient org wallet balance: $${(currentBalance / 100).toFixed(2)} < $${(costCents / 100).toFixed(2)}`
      );
    }

    const nextBalance = currentBalance - costCents;
    const nextShouldNotifyLow =
      nextBalance < config.lowBalanceThresholdCents && !data.iapLowBalanceNotified;
    const nextCreditsLowAlert = getCreditsLowAlert(data, nextBalance);

    const updates: Record<string, unknown> = {
      walletBalanceCents: FieldValue.increment(-costCents),
      currentPeriodSpend: FieldValue.increment(costCents),
      orgCurrentPeriodSpend: FieldValue.increment(costCents),
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (nextCreditsLowAlert) {
      Object.assign(updates, nextCreditsLowAlert.updates);
    }

    if (nextShouldNotifyLow) {
      updates['iapLowBalanceNotified'] = true;
    }

    txn.update(docRef, updates);
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

  if (creditsLowAlert && orgAdminIds.length > 0) {
    const { dispatch } = await import('../../services/notification.service.js');
    await Promise.allSettled(
      orgAdminIds.map((adminId) =>
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

  // Update per-user spend (analytics only — no threshold alerts at this level)
  const perUserUpdate = updateSpend(db, userId, costCents);
  // Update team sub-allocation spend
  const teamUpdate = teamId ? updateTeamAllocationSpend(db, teamId, costCents) : Promise.resolve();

  await Promise.all([perUserUpdate, teamUpdate]).catch((err: unknown) => {
    // Non-fatal: master wallet deducted successfully — only analytics is affected
    logger.error('[deductOrgWallet] Failed to update per-user or team spend', {
      error: err,
      organizationId,
      userId,
    });
  });

  if (shouldNotifyLow && !creditsLowAlert && orgAdminIds.length > 0) {
    const { dispatch } = await import('../../services/notification.service.js');
    await Promise.allSettled(
      orgAdminIds.map((adminId) =>
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

  // Fire org auto top-up if configured — non-blocking.
  const billingOwnerUid = record.data.billingOwnerUid ?? orgAdminIds[0];
  if (billingOwnerUid) {
    const orgCtxData = record.data;
    triggerAutoTopUpIfEnabled(db, billingOwnerUid, orgCtxData, newBalance, {
      organizationId,
    }).catch((err: unknown) => {
      logger.error('[deductOrgWallet] Auto top-up trigger failed', {
        error: err,
        organizationId,
      });
    });
  }
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
 * Guards against double-firing via `autoTopUpInProgress` flag on BillingContext.
 * Uses `confirm: true, off_session: true` PaymentIntent — no 3DS challenge possible.
 * If the card requires additional authentication, the charge fails and a failure
 * notification is sent to prompt the user to re-enter their card.
 *
 * @param db        Firestore instance
 * @param userId    The billing context owner (individual uid, or org admin uid for orgs)
 * @param ctx       The BillingContext snapshot read just before calling this function
 * @param newBalance The wallet balance AFTER the deduction that triggered this check
 * @param orgOptions When the billing context is an org, pass { organizationId } so the
 *                   wallet credit goes to the org wallet instead of the individual.
 */
async function triggerAutoTopUpIfEnabled(
  db: Firestore,
  userId: string,
  ctx: BillingContext,
  newBalance: number,
  orgOptions?: { organizationId: string }
): Promise<void> {
  // ── Guard: only Stripe users; IAP is controlled by Apple ──
  if (ctx.paymentProvider !== 'stripe') return;

  // ── Guard: auto top-up must be enabled and configured ──
  if (!ctx.autoTopUpEnabled) return;
  const thresholdCents = ctx.autoTopUpThresholdCents ?? 0;
  const amountCents = ctx.autoTopUpAmountCents ?? 0;
  if (thresholdCents <= 0 || amountCents <= 0) return;

  // ── Guard: balance must actually be below threshold ──
  if (newBalance >= thresholdCents) return;

  // ── Guard: acquire in-progress lock atomically to prevent double-fire ──
  // Use a transaction to set the flag only when it is currently false/undefined.
  const billingContextKey = orgOptions?.organizationId
    ? `org:${orgOptions.organizationId}`
    : userId;
  const record = await getBillingContextRecord(db, billingContextKey);
  if (!record) {
    logger.warn('[triggerAutoTopUpIfEnabled] Billing context disappeared', { userId });
    return;
  }
  const docRef = record.ref;

  let lockAcquired = false;
  await db.runTransaction(async (txn) => {
    const doc = await txn.get(docRef);
    const data = doc.data() as BillingContext;
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
    return;
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
    const customerSnap = await db
      .collection(COLLECTIONS.STRIPE_CUSTOMERS)
      .where('userId', '==', userId)
      .where('environment', '==', environment)
      .limit(1)
      .get();

    if (customerSnap.empty) {
      logger.warn('[triggerAutoTopUpIfEnabled] No Stripe customer found — cannot auto charge', {
        userId,
      });
      await releaseAutoTopUpLock(docRef);
      return;
    }

    const { stripeCustomerId } = customerSnap.docs[0]!.data() as { stripeCustomerId: string };

    // Retrieve customer from Stripe to get the current default payment method
    const { getStripeClient } = await import('./stripe.service.js');
    const stripe = getStripeClient(environment);
    const customer = await stripe.customers.retrieve(stripeCustomerId);

    if (!customer || (customer as { deleted?: boolean }).deleted) {
      logger.warn('[triggerAutoTopUpIfEnabled] Stripe customer deleted', {
        userId,
        stripeCustomerId,
      });
      await releaseAutoTopUpLock(docRef);
      return;
    }

    const defaultPm =
      typeof (customer as { invoice_settings?: { default_payment_method?: unknown } })
        .invoice_settings?.default_payment_method === 'string'
        ? ((customer as { invoice_settings: { default_payment_method: string } }).invoice_settings
            .default_payment_method as string)
        : ((
            customer as {
              invoice_settings?: { default_payment_method?: { id?: string } };
            }
          ).invoice_settings?.default_payment_method?.id ?? null);

    if (!defaultPm) {
      logger.warn('[triggerAutoTopUpIfEnabled] No default payment method — cannot auto charge', {
        userId,
        stripeCustomerId,
      });
      await releaseAutoTopUpLock(docRef);
      // Notify user so they know why the auto top-up didn't fire
      await sendAutoTopUpNotification(db, userId, 'no_payment_method', amountCents);
      return;
    }

    // ── Charge the card ──
    const idempotencyKey = `auto-topup-${billingContextKey}-${Date.now()}`;
    const description = orgOptions
      ? `NXT1 Organization Wallet Auto Top-Up ($${(amountCents / 100).toFixed(2)})`
      : `NXT1 Wallet Auto Top-Up ($${(amountCents / 100).toFixed(2)})`;

    const { chargeOffSession } = await import('./stripe.service.js');
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
        await addFundsToOrgWallet(db, orgOptions.organizationId, amountCents, 'stripe_checkout');
      } else {
        await addWalletTopUp(db, userId, amountCents, 'stripe');
      }

      // ── Write a PaymentLog entry so it appears in payment history ──
      const { PaymentLogModel } = await import('../../models/payment-log.model.js');
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

      await sendAutoTopUpNotification(db, userId, 'success', amountCents);
    } else {
      logger.error('[triggerAutoTopUpIfEnabled] Stripe charge failed', {
        userId,
        amountCents,
        errorCode: result.errorCode,
        error: result.error,
      });

      // ── Write a failed PaymentLog entry ──
      const { PaymentLogModel } = await import('../../models/payment-log.model.js');
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

      await sendAutoTopUpNotification(db, userId, 'failed', amountCents);
    }
  } catch (err: unknown) {
    logger.error('[triggerAutoTopUpIfEnabled] Unexpected error during auto top-up', {
      error: err,
      userId,
    });
  } finally {
    // Always release the lock — whether success, failure, or unexpected error
    await releaseAutoTopUpLock(docRef).catch((err: unknown) => {
      logger.error('[triggerAutoTopUpIfEnabled] Failed to release lock', { error: err, userId });
    });
  }
}

/** Release the `autoTopUpInProgress` lock on a BillingContext document. */
async function releaseAutoTopUpLock(docRef: FirebaseFirestore.DocumentReference): Promise<void> {
  await docRef.update({
    autoTopUpInProgress: false,
    autoTopUpLockedAt: FieldValue.delete(),
    updatedAt: FieldValue.serverTimestamp(),
  });
}

/** Send an auto top-up push notification to the user. */
async function sendAutoTopUpNotification(
  db: Firestore,
  userId: string,
  outcome: 'success' | 'failed' | 'no_payment_method',
  amountCents: number
): Promise<void> {
  const { dispatch } = await import('../../services/notification.service.js');
  const amountStr = `$${(amountCents / 100).toFixed(2)}`;

  const messages: Record<
    typeof outcome,
    { title: string; body: string; type: NotificationType; priority: 'high' | 'normal' }
  > = {
    success: {
      title: 'Wallet Auto-Reloaded',
      body: `Your wallet was automatically reloaded with ${amountStr}. You're good to go.`,
      type: NOTIFICATION_TYPES.PAYMENT_RECEIVED,
      priority: 'normal',
    },
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
    logger.error('[sendAutoTopUpNotification] Failed to send notification', {
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
  source: 'stripe_checkout' | 'invoice_payment' | 'manual_credit' = 'stripe_checkout'
): Promise<{ newBalance: number }> {
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new Error(
      `[addFundsToOrgWallet] amountCents must be a positive integer, got ${amountCents}`
    );
  }

  const docRef = getBillingContextRef(db, `org:${organizationId}`);
  let snapshot = await docRef.get();

  if (!snapshot.exists) {
    await createOrgBillingContext(db, organizationId);
    snapshot = await docRef.get();
  }

  if (!snapshot.exists) {
    throw new Error(
      `[addFundsToOrgWallet] No org billing context found for organizationId=${organizationId}`
    );
  }

  const currentData = snapshot.data() as BillingContext;
  const newBalance = (currentData.walletBalanceCents ?? 0) + amountCents;

  await docRef.update({
    walletBalanceCents: FieldValue.increment(amountCents),
    paymentProvider: 'stripe',
    // Reset low-balance flag so the org sees fresh alerts at the new balance
    iapLowBalanceNotified: false,
    creditsAlertBaselineCents: newBalance,
    creditsNotified80: false,
    creditsNotified50: false,
    creditsNotified25: false,
    updatedAt: FieldValue.serverTimestamp(),
  });

  logger.info('[addFundsToOrgWallet] Org wallet funded', {
    organizationId,
    amountCents,
    newBalance,
    source,
  });

  const adminIds = await getOrganizationAdminIds(db, organizationId);
  if (adminIds.length > 0) {
    const { dispatch } = await import('../../services/notification.service.js');
    await Promise.allSettled(
      adminIds.map((adminId) =>
        dispatch(db, {
          userId: adminId,
          type: NOTIFICATION_TYPES.CREDITS_ADDED,
          title: 'Organization Credits Added',
          body:
            `$${(amountCents / 100).toFixed(2)} was added to your organization's wallet. ` +
            `New balance: $${(newBalance / 100).toFixed(2)}.`,
          deepLink: '/usage?section=overview',
          source: { userName: 'NXT1 Billing' },
          data: { organizationId },
        })
      )
    );
  }

  return { newBalance };
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

  const record = await getBillingContextRecord(db, userId);

  if (!record) {
    logger.warn('[processWalletRefund] Billing context not found — nothing to deduct', {
      userId,
      amountCents,
    });
    return; // Graceful no-op — user may have been deleted
  }

  const docRef = record.ref;

  await db.runTransaction(async (txn) => {
    const doc = await txn.get(docRef);
    const data = doc.data() as BillingContext;
    const currentBalance = data.walletBalanceCents ?? 0;
    // Cap deduction at current balance — wallet cannot go negative on a refund
    const deduction = Math.min(amountCents, currentBalance);

    txn.update(docRef, {
      walletBalanceCents: FieldValue.increment(-deduction),
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
  provider: PaymentProvider = 'iap'
): Promise<{ newBalance: number }> {
  if (amountCents <= 0) {
    throw new Error('Top-up amount must be positive');
  }

  // getOrCreateBillingContext is safe to call concurrently — it does an
  // existence check and returns early if one already exists.
  await getOrCreateBillingContext(db, userId);

  const record = await getBillingContextRecord(db, userId);

  if (!record) {
    throw new Error(`Failed to find or create billing context for user ${userId}`);
  }

  const docRef = record.ref;
  const data = record.data;
  const newBalance = (data.walletBalanceCents ?? 0) + amountCents;

  await docRef.update({
    walletBalanceCents: FieldValue.increment(amountCents),
    paymentProvider: provider,
    // Reset ALL notification flags so the user sees fresh alerts at the new balance
    notified50: false,
    notified80: false,
    notified100: false,
    iapLowBalanceNotified: false,
    creditsAlertBaselineCents: newBalance,
    creditsNotified80: false,
    creditsNotified50: false,
    creditsNotified25: false,
    updatedAt: FieldValue.serverTimestamp(),
  });

  logger.info('[addWalletTopUp] Wallet topped up', { userId, amountCents, newBalance });

  await dispatchCreditsAddedNotification(db, userId, amountCents, newBalance);

  return { newBalance };
}

/**
 * Increment current period spend for an organization master budget and check thresholds.
 */
async function updateOrgSpend(
  db: Firestore,
  organizationId: string,
  costCents: number
): Promise<void> {
  let record = await getBillingContextRecord(db, `org:${organizationId}`);

  if (!record) {
    // Auto-create and then re-query to record the spend
    await createOrgBillingContext(db, organizationId);
    record = await getBillingContextRecord(db, `org:${organizationId}`);

    if (!record) {
      logger.error('[updateOrgSpend] Failed to find org context after creation', {
        organizationId,
      });
      return;
    }

    await record.ref.update({
      currentPeriodSpend: FieldValue.increment(costCents),
      orgCurrentPeriodSpend: FieldValue.increment(costCents),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return;
  }

  const docRef = record.ref;
  const data = record.data;

  const newSpend = data.currentPeriodSpend + costCents;
  const updates: Record<string, unknown> = {
    currentPeriodSpend: FieldValue.increment(costCents),
    orgCurrentPeriodSpend: FieldValue.increment(costCents),
    updatedAt: FieldValue.serverTimestamp(),
  };

  const pct = data.monthlyBudget > 0 ? Math.round((newSpend / data.monthlyBudget) * 100) : 0;

  // Notify org admins
  await checkAndNotifyOrg(db, organizationId, pct, data, updates);

  await docRef.update(updates);
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
    .collection(COLLECTIONS.TEAM_BUDGET_ALLOCATIONS)
    .where('teamId', '==', teamId)
    .limit(1)
    .get();

  // If no allocation exists, nothing to track at team level
  if (snapshot.empty) return;

  const docRef = snapshot.docs[0]!.ref;
  const data = snapshot.docs[0]!.data() as TeamBudgetAllocation;

  const newSpend = data.currentPeriodSpend + costCents;
  const updates: Record<string, unknown> = {
    currentPeriodSpend: FieldValue.increment(costCents),
    updatedAt: FieldValue.serverTimestamp(),
  };

  // Only alert if there's an actual sub-limit set
  if (data.monthlyLimit > 0) {
    const pct = Math.round((newSpend / data.monthlyLimit) * 100);
    await checkAndNotifyTeam(db, teamId, pct, data, updates);
  }

  await docRef.update(updates);
}

// ============================================
// ALERT DISPATCH HELPERS
// ============================================

/**
 * Check threshold percentages and notify organization admins.
 */
async function checkAndNotifyOrg(
  db: Firestore,
  organizationId: string,
  pct: number,
  ctx: BillingContext,
  updates: Record<string, unknown>
): Promise<void> {
  if (!areBudgetAlertsEnabled(ctx)) return;

  const { dispatch } = await import('../../services/notification.service.js');

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

  if (pct >= 100 && !ctx.notified100) {
    title = 'Organization Budget Reached';
    body = `Your organization has reached its monthly budget of $${(ctx.monthlyBudget / 100).toFixed(2)}. Increase the limit to continue.`;
    priority = 'high';
    flagKey = 'notified100';
  } else if (pct >= 80 && !ctx.notified80) {
    title = 'Organization Budget — 80%';
    body = `Your organization has used 80% of the $${(ctx.monthlyBudget / 100).toFixed(2)} monthly budget.`;
    flagKey = 'notified80';
  } else if (pct >= 50 && !ctx.notified50) {
    title = 'Organization Budget — 50%';
    body = `Your organization has used 50% of the $${(ctx.monthlyBudget / 100).toFixed(2)} monthly budget.`;
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
  const { dispatch } = await import('../../services/notification.service.js');

  const teamDoc = await db.collection('Teams').doc(teamId).get();
  const teamData = teamDoc.data();
  const adminIds: string[] = Array.isArray(teamData?.['adminIds'])
    ? (teamData!['adminIds'] as string[])
    : teamData?.['createdBy']
      ? [teamData['createdBy'] as string]
      : [];

  if (adminIds.length === 0) return;

  const limitStr = `$${(allocation.monthlyLimit / 100).toFixed(2)}`;
  let title = '';
  let body = '';
  let priority: 'high' | 'normal' = 'normal';
  let flagKey = '';

  if (pct >= 100 && !allocation.notified100) {
    title = 'Team Budget Allocation Reached';
    body = `Your team has reached its monthly allocation of ${limitStr}. Contact your Athletic Director for more.`;
    priority = 'high';
    flagKey = 'notified100';
  } else if (pct >= 80 && !allocation.notified80) {
    title = 'Team Budget — 80%';
    body = `Your team has used 80% of its ${limitStr} monthly allocation.`;
    flagKey = 'notified80';
  } else if (pct >= 50 && !allocation.notified50) {
    title = 'Team Budget — 50%';
    body = `Your team has used 50% of its ${limitStr} monthly allocation.`;
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
  context: BillingContext;
  /** Organization ID (only for type === 'organization') */
  organizationId?: string;
  /** Team IDs belonging to the organization (only for type === 'organization') */
  teamIds?: string[];
}

/**
 * Cached resolution mapping — lightweight, does NOT include the BillingContext
 * itself. The context is fetched fresh on every call to avoid showing stale
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
// Only caches the mapping (role → org/individual), NOT the live BillingContext.
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
  options?: { usePersonalBilling?: boolean }
): Promise<ResolvedBillingTarget> {
  // ── Determine effective usePersonalBilling flag ──
  // If the caller explicitly passes the option, use it.
  // Otherwise, auto-read from the user's stored billing context so ALL callers
  // (agent workers, routes, etc.) automatically respect the stored preference.
  let effectiveUsePersonalBilling = options?.usePersonalBilling;
  if (effectiveUsePersonalBilling === undefined) {
    const personalCtx = await getBillingContext(db, userId);
    if (personalCtx) {
      effectiveUsePersonalBilling =
        (personalCtx.usePersonalBilling as boolean | undefined) ?? false;
    }
  }

  // ── Personal billing override: org member explicitly chose to pay from their own wallet ──
  if (effectiveUsePersonalBilling) {
    billingResolutionCache.delete(userId); // Evict so next call re-resolves naturally
    const ctx = await getOrCreateBillingContext(db, userId);
    return {
      type: 'individual',
      billingUserId: userId,
      context: { ...ctx, usePersonalBilling: true },
    };
  }

  // ── Check resolution cache (mapping only, NOT the live context) ──
  const cached = billingResolutionCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) {
    // Always fetch fresh context to get current spend/wallet balance
    const freshCtx =
      cached.type === 'organization' && cached.organizationId
        ? ((await getOrgBillingContext(db, cached.organizationId)) ??
          (await getOrCreateBillingContext(db, userId)))
        : await getOrCreateBillingContext(db, userId);

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
  if (orgTarget) {
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
    if (athleteTarget) {
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
  const ctx = await getOrCreateBillingContext(db, userId);
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
 *   2. Look up the team's organizationId and check for org billing.
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

  // Step 2: check if the team's org has billing enabled
  const teamDoc = await db.collection('Teams').doc(teamId).get();
  const teamData = teamDoc.data();

  const orgId = organizationId ?? (teamData?.['organizationId'] as string | undefined);

  if (!orgId) return null;

  let orgHasBilling = false;
  if (orgId) {
    const orgDoc = await db.collection('Organizations').doc(orgId).get();
    const orgData = orgDoc.data();
    orgHasBilling = !!orgData?.['billing']?.['subscriptionId'];
  }

  if (!orgHasBilling) return null;

  // Step 3: ensure athlete's billing context has teamId and billingEntity='organization'
  // getOrCreateBillingContext with teamId will either return the existing context
  // (if already properly set up) or create a new one with org billing.
  const athleteCtx = await getOrCreateBillingContext(db, userId, teamId);

  // If the existing context is individual (created before the team joined org billing),
  // update it to reflect the organization billing.
  if (athleteCtx.billingEntity === 'individual' && orgId) {
    const ctxRecord = await getBillingContextRecord(db, userId);
    if (ctxRecord) {
      await ctxRecord.ref.update({
        billingEntity: 'organization' as BillingEntity,
        teamId,
        organizationId: orgId,
        paymentProvider: 'stripe' as PaymentProvider,
        updatedAt: FieldValue.serverTimestamp(),
      });
      // Refresh the context so callers see the updated values
      athleteCtx.billingEntity = 'organization';
      athleteCtx.teamId = teamId;
      athleteCtx.organizationId = orgId;
      athleteCtx.paymentProvider = 'stripe';
    }
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

  // Strategy 2: Fallback for directors and coaches — check organizations.ownerId
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

  // Fetch all teams for this organization
  const teamsSnap = await db
    .collection('Teams')
    .where('organizationId', '==', organizationId)
    .get();
  const teamIds = teamsSnap.docs.map((doc) => doc.id);

  // Fetch or create the org billing context
  let orgCtx = await getOrgBillingContext(db, organizationId);
  if (!orgCtx) {
    await createOrgBillingContext(db, organizationId);
    orgCtx = await getOrgBillingContext(db, organizationId);
  }

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
async function getOrgBillingContext(
  db: Firestore,
  organizationId: string
): Promise<BillingContext | null> {
  const record = await getBillingContextRecord(db, `org:${organizationId}`);
  return record?.data ?? null;
}

/**
 * Get a team allocation by teamId.
 */
async function getTeamAllocation(
  db: Firestore,
  teamId: string
): Promise<TeamBudgetAllocation | null> {
  const snapshot = await db
    .collection(COLLECTIONS.TEAM_BUDGET_ALLOCATIONS)
    .where('teamId', '==', teamId)
    .limit(1)
    .get();

  if (snapshot.empty) return null;
  return snapshot.docs[0]!.data() as TeamBudgetAllocation;
}

// ============================================
// CONTEXT CREATION HELPERS
// ============================================

/**
 * Create an organization-level master billing context.
 */
async function createOrgBillingContext(db: Firestore, organizationId: string): Promise<void> {
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();
  const starterWalletConfig = await getStarterWalletConfig(db);
  const billingOwnerUid = await getOrganizationBillingOwnerUid(db, organizationId);
  const billingUserId = `org:${organizationId}`;
  const docRef = getBillingContextRef(db, billingUserId);

  if ((await docRef.get()).exists) return;

  const ts = FieldValue.serverTimestamp();
  await docRef.set({
    billingOwnerUid,
    organizationId,
    billingEntity: 'organization',
    paymentProvider: 'stripe',
    monthlyBudget: DEFAULT_ORGANIZATION_BUDGET,
    budgetName: undefined,
    currentPeriodSpend: 0,
    personalCurrentPeriodSpend: 0,
    orgCurrentPeriodSpend: 0,
    walletBalanceCents: starterWalletConfig.organizationAmountCents,
    pendingHoldsCents: 0,
    periodStart,
    periodEnd,
    notified50: false,
    notified80: false,
    notified100: false,
    iapLowBalanceNotified: false,
    budgetAlertsEnabled: false,
    creditsAlertBaselineCents: starterWalletConfig.organizationAmountCents,
    creditsNotified80: false,
    creditsNotified50: false,
    creditsNotified25: false,
    hardStop: true,
    createdAt: ts,
    updatedAt: ts,
  });

  logger.info('[createOrgBillingContext] Created org billing context', {
    organizationId,
    billingOwnerUid,
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
  newBudgetCents: number
): Promise<void> {
  if (newBudgetCents < 0) {
    throw new Error('Budget cannot be negative');
  }

  // Ensure a billing context exists (creates one with defaults if missing)
  const ctx = await getOrCreateBillingContext(db, userId);

  if (ctx.billingEntity === 'individual') {
    throw new Error('Individual budgets are not supported');
  }

  const record = await getBillingContextRecord(db, userId);

  if (!record) {
    throw new Error('Billing context not found after upsert');
  }

  await record.ref.update({
    monthlyBudget: newBudgetCents,
    budgetName: FieldValue.delete(),
    // Reset notification flags if the budget is increased past current thresholds
    notified50: false,
    notified80: false,
    notified100: false,
    updatedAt: FieldValue.serverTimestamp(),
  });

  logger.info('[updateBudget] Budget updated', {
    userId,
    newBudgetCents,
    billingEntity: ctx.billingEntity,
  });
}

/**
 * Update an organization's master monthly budget.
 * Only org admins can call this.
 */
export async function updateOrgBudget(
  db: Firestore,
  organizationId: string,
  newBudgetCents: number
): Promise<void> {
  if (newBudgetCents < 0) {
    throw new Error('Budget cannot be negative');
  }

  const docRef = getBillingContextRef(db, `org:${organizationId}`);
  let snapshot = await docRef.get();

  if (!snapshot.exists) {
    // Create one if it doesn't exist
    await createOrgBillingContext(db, organizationId);
    snapshot = await docRef.get();
  }

  if (!snapshot.exists) {
    throw new Error('Organization billing context not found');
  }

  await docRef.update({
    monthlyBudget: newBudgetCents,
    budgetName: FieldValue.delete(),
    budgetAlertsEnabled: newBudgetCents > 0,
    notified50: false,
    notified80: false,
    notified100: false,
    updatedAt: FieldValue.serverTimestamp(),
  });

  logger.info('[updateOrgBudget] Org budget updated', { organizationId, newBudgetCents });
}

/**
 * Update a team's sub-allocation within an organization.
 * Only org admins can call this.
 */
export async function updateTeamAllocation(
  db: Firestore,
  teamId: string,
  organizationId: string,
  newLimitCents: number
): Promise<void> {
  if (newLimitCents < 0) {
    throw new Error('Team allocation cannot be negative');
  }

  const snapshot = await db
    .collection(COLLECTIONS.TEAM_BUDGET_ALLOCATIONS)
    .where('teamId', '==', teamId)
    .limit(1)
    .get();

  if (snapshot.empty) {
    // Create a new allocation
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();
    const ts = FieldValue.serverTimestamp();

    await db.collection(COLLECTIONS.TEAM_BUDGET_ALLOCATIONS).add({
      teamId,
      organizationId,
      monthlyLimit: newLimitCents,
      currentPeriodSpend: 0,
      periodStart,
      periodEnd,
      notified50: false,
      notified80: false,
      notified100: false,
      createdAt: ts,
      updatedAt: ts,
    });

    logger.info('[updateTeamAllocation] Created team allocation', {
      teamId,
      organizationId,
      newLimitCents,
    });
    return;
  }

  await snapshot.docs[0]!.ref.update({
    monthlyLimit: newLimitCents,
    notified50: false,
    notified80: false,
    notified100: false,
    updatedAt: FieldValue.serverTimestamp(),
  });

  logger.info('[updateTeamAllocation] Team allocation updated', { teamId, newLimitCents });
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
  const snapshot = await db
    .collection(COLLECTIONS.TEAM_BUDGET_ALLOCATIONS)
    .where('organizationId', '==', organizationId)
    .get();

  return snapshot.docs.map((doc) => doc.data() as TeamBudgetAllocation);
}

// ============================================
// PERIOD RESET (Called by scheduled function)
// ============================================

/**
 * Reset all billing contexts and team allocations for a new monthly period.
 * Should be called by a Cloud Function on the 1st of each month.
 */
export async function resetMonthlyBudgets(db: Firestore): Promise<number> {
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();

  let totalCount = 0;

  // Reset billing contexts
  const billingSnap = await db.collection(COLLECTIONS.BILLING_CONTEXTS).get();
  let batch = db.batch();
  let batchCount = 0;

  for (const doc of billingSnap.docs) {
    const data = doc.data() as BillingContext;

    // IAP wallet users: only reset period tracking, NOT wallet balance (money rolls over)
    if (data.paymentProvider === 'iap') {
      batch.update(doc.ref, {
        currentPeriodSpend: 0,
        personalCurrentPeriodSpend: 0,
        orgCurrentPeriodSpend: 0,
        periodStart,
        periodEnd,
        // Keep notified flags so we don't spam; they reset on next top-up
        updatedAt: FieldValue.serverTimestamp(),
      });
    } else {
      batch.update(doc.ref, {
        currentPeriodSpend: 0,
        personalCurrentPeriodSpend: 0,
        orgCurrentPeriodSpend: 0,
        periodStart,
        periodEnd,
        notified50: false,
        notified80: false,
        notified100: false,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
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

  try {
    await db.runTransaction(async (txn) => {
      const billingRecord = await getBillingContextRecordForTransaction(txn, db, userId);

      if (!billingRecord) {
        throw new Error('Billing context not found');
      }

      const docRef = billingRecord.ref;
      const data = billingRecord.data;

      const walletBalance = data.walletBalanceCents ?? 0;
      const pendingHolds = data.pendingHoldsCents ?? 0;
      const currentSpend = data.currentPeriodSpend ?? 0;
      const monthlyBudget = data.monthlyBudget ?? 0;

      let orgMasterRef: FirebaseFirestore.DocumentReference | null = null;
      let orgMasterData: BillingContext | null;
      if (data.billingEntity === 'organization') {
        // For org users, budget enforcement must be done against the org master
        // context (userId = 'org:<orgId>') to prevent concurrent job overdrafts.
        const orgUserId = data.organizationId ? `org:${data.organizationId}` : null;
        if (!orgUserId) {
          throw new Error('Org user has no organizationId in billing context');
        }

        const orgRecord = await getBillingContextRecordForTransaction(txn, db, orgUserId);
        if (!orgRecord) {
          throw new Error(`Org master billing context not found for ${orgUserId}`);
        }
        orgMasterRef = orgRecord.ref;
        orgMasterData = orgRecord.data;

        const orgWalletBalance = orgMasterData.walletBalanceCents ?? 0;
        const orgPendingHolds = orgMasterData.pendingHoldsCents ?? 0;
        const availableCredits = orgWalletBalance - orgPendingHolds;
        if (availableCredits < estimatedCostCents) {
          throw new Error(
            `Insufficient organization wallet balance: $${(availableCredits / 100).toFixed(2)} (available) < $${(estimatedCostCents / 100).toFixed(2)} (estimated)`
          );
        }
        availableBalance = availableCredits;
      } else if (data.billingEntity === 'individual') {
        // Individual usage always reserves against wallet balance.
        availableBalance = walletBalance - pendingHolds;
        if (availableBalance < estimatedCostCents) {
          throw new Error(
            `Insufficient available balance: $${(availableBalance / 100).toFixed(2)} < $${(estimatedCostCents / 100).toFixed(2)}`
          );
        }
      } else {
        // Other types like individual stripe, default to available budget check
        const availableBudget = monthlyBudget - currentSpend - pendingHolds;
        availableBalance = availableBudget;
      }

      // Create hold document — store org context so capture/release can update it
      const holdRef = db.collection(COLLECTIONS.WALLET_HOLDS).doc();
      holdId = holdRef.id;

      txn.set(holdRef, {
        userId,
        ...(data.organizationId ? { organizationId: data.organizationId } : {}),
        ...(data.teamId ? { teamId: data.teamId } : {}),
        amountCents: estimatedCostCents,
        status: 'active',
        jobId,
        feature,
        createdAt: FieldValue.serverTimestamp(),
      });

      // Atomically increase pending holds on the user's billing context
      txn.update(docRef, {
        pendingHoldsCents: FieldValue.increment(estimatedCostCents),
        updatedAt: FieldValue.serverTimestamp(),
      });

      // For org users: also reserve budget on the org master context
      if (orgMasterRef) {
        txn.update(orgMasterRef, {
          pendingHoldsCents: FieldValue.increment(estimatedCostCents),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
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
  let organizationId: string | undefined;
  let teamId: string | undefined;

  await db.runTransaction(async (txn) => {
    const holdDoc = await txn.get(holdRef);

    if (!holdDoc.exists) {
      throw new Error(`Wallet hold ${holdId} not found`);
    }

    const hold = holdDoc.data() as WalletHold;
    organizationId = hold.organizationId;
    teamId = hold.teamId;

    if (hold.status !== 'active') {
      throw new Error(`Wallet hold ${holdId} is already ${hold.status}`);
    }

    // Find the user's billing context
    const ctxRecord = await getBillingContextRecordForTransaction(txn, db, hold.userId);

    if (!ctxRecord) {
      throw new Error(`Billing context not found for user ${hold.userId}`);
    }

    const ctxRef = ctxRecord.ref;
    const ctxData = ctxRecord.data;

    // Release the full hold and record the actual cost on the user's context
    const updates: Record<string, unknown> = {
      pendingHoldsCents: FieldValue.increment(-hold.amountCents),
      currentPeriodSpend: FieldValue.increment(actualCostCents),
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (ctxData.billingEntity === 'organization') {
      updates['orgCurrentPeriodSpend'] = FieldValue.increment(actualCostCents);
    } else {
      updates['personalCurrentPeriodSpend'] = FieldValue.increment(actualCostCents);
    }

    if (ctxData.billingEntity === 'individual' && ctxData.paymentProvider === 'iap') {
      updates['walletBalanceCents'] = FieldValue.increment(-actualCostCents);
    } else if (ctxData.billingEntity === 'individual' && (ctxData.walletBalanceCents ?? 0) > 0) {
      // Stripe wallet user: also decrement the pre-paid balance
      updates['walletBalanceCents'] = FieldValue.increment(-actualCostCents);
    }

    txn.update(ctxRef, updates);

    // For org users: also release the pending hold reservation on the org master context
    if (hold.organizationId) {
      const orgUserId = `org:${hold.organizationId}`;
      const orgRecord = await getBillingContextRecordForTransaction(txn, db, orgUserId);
      if (orgRecord) {
        txn.update(orgRecord.ref, {
          pendingHoldsCents: FieldValue.increment(-hold.amountCents),
          walletBalanceCents: FieldValue.increment(-actualCostCents),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
    }

    // Mark hold as captured
    txn.update(holdRef, {
      status: 'captured',
      capturedAmountCents: actualCostCents,
      resolvedAt: FieldValue.serverTimestamp(),
    });
  });

  // For org users: update the org master's currentPeriodSpend (with threshold notifications)
  // and the team sub-allocation. This mirrors what recordSpend() does.
  if (organizationId && actualCostCents > 0) {
    await updateOrgSpend(db, organizationId, actualCostCents);
    if (teamId) {
      await updateTeamAllocationSpend(db, teamId, actualCostCents);
    }
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

    // Find the user's billing context
    const ctxRecord = await getBillingContextRecordForTransaction(txn, db, hold.userId);

    if (!ctxRecord) {
      throw new Error(`Billing context not found for user ${hold.userId}`);
    }

    const ctxRef = ctxRecord.ref;

    // Release the hold — no deduction
    txn.update(ctxRef, {
      pendingHoldsCents: FieldValue.increment(-hold.amountCents),
      updatedAt: FieldValue.serverTimestamp(),
    });

    // For org users: also release the pending hold on the org master context
    if (hold.organizationId) {
      const orgUserId = `org:${hold.organizationId}`;
      const orgRecord = await getBillingContextRecordForTransaction(txn, db, orgUserId);
      if (orgRecord) {
        txn.update(orgRecord.ref, {
          pendingHoldsCents: FieldValue.increment(-hold.amountCents),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
    }

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

  const snapshot = await db
    .collection(COLLECTIONS.WALLET_HOLDS)
    .where('status', '==', 'active')
    .where('createdAt', '<', cutoff)
    .limit(200)
    .get();

  if (snapshot.empty) return 0;

  let expiredCount = 0;
  const batch = db.batch();

  // Group holds by userId to batch-update billing contexts
  const holdsByUser = new Map<string, number>();
  // Group holds by orgId to batch-update org master contexts
  const holdsByOrg = new Map<string, number>();

  for (const doc of snapshot.docs) {
    const hold = doc.data() as WalletHold;

    batch.update(doc.ref, {
      status: 'expired',
      resolvedAt: FieldValue.serverTimestamp(),
    });

    const existing = holdsByUser.get(hold.userId) ?? 0;
    holdsByUser.set(hold.userId, existing + hold.amountCents);

    if (hold.organizationId) {
      const orgExisting = holdsByOrg.get(hold.organizationId) ?? 0;
      holdsByOrg.set(hold.organizationId, orgExisting + hold.amountCents);
    }

    expiredCount++;
  }

  await batch.commit();

  // Release pending holds on each affected user's billing context
  for (const [userId, totalHeldCents] of holdsByUser) {
    const ctxRecord = await getBillingContextRecord(db, userId);

    if (ctxRecord) {
      await ctxRecord.ref.update({
        pendingHoldsCents: FieldValue.increment(-totalHeldCents),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
  }

  // Release pending holds on each affected org master context
  for (const [organizationId, totalHeldCents] of holdsByOrg) {
    const orgUserId = `org:${organizationId}`;
    const orgRecord = await getBillingContextRecord(db, orgUserId);

    if (orgRecord) {
      await orgRecord.ref.update({
        pendingHoldsCents: FieldValue.increment(-totalHeldCents),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
  }

  logger.info('[expireStaleHolds] Expired stale holds', { expiredCount });
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
  newBalance: number
): Promise<void> {
  const { dispatch } = await import('../../services/notification.service.js');
  await dispatch(db, {
    userId,
    type: NOTIFICATION_TYPES.CREDITS_ADDED,
    title: 'Credits Added',
    body:
      `$${(amountCents / 100).toFixed(2)} was added to your wallet. ` +
      `New balance: $${(newBalance / 100).toFixed(2)}.`,
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
 * Writes to `BillingContexts.walletBalanceCents` (the single source of truth)
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
    await getOrCreateBillingContext(db, referrerId);
    const billingRecord = await getBillingContextRecord(db, referrerId);

    if (!billingRecord) {
      return {
        success: false,
        newBalanceCents: 0,
        error: `Billing context not found for referrer ${referrerId}`,
      };
    }

    let result: WalletTopUpResult = {
      success: false,
      newBalanceCents: billingRecord.data.walletBalanceCents ?? 0,
      error: 'Referral reward transaction did not complete',
    };
    let credited = false;

    await db.runTransaction(async (txn) => {
      const rewardSnap = await txn.get(rewardRef);
      const billingSnap = await txn.get(billingRecord.ref);

      if (!billingSnap.exists) {
        throw new Error(`Billing context not found for referrer ${referrerId}`);
      }

      const billingData = billingSnap.data() as BillingContext;
      const currentBalance = billingData.walletBalanceCents ?? 0;

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

      const totalReferralRewards = billingData.totalReferralRewards ?? 0;
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

      txn.update(billingRecord.ref, {
        walletBalanceCents: FieldValue.increment(amountCents),
        paymentProvider: 'stripe',
        notified50: false,
        notified80: false,
        notified100: false,
        iapLowBalanceNotified: false,
        creditsAlertBaselineCents: newBalance,
        creditsNotified80: false,
        creditsNotified50: false,
        creditsNotified25: false,
        totalReferralRewards: FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp(),
      });

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
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
