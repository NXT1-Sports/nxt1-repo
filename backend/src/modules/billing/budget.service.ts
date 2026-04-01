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
import {
  type BillingContext,
  type BillingEntity,
  type PaymentProvider,
  type TeamBudgetAllocation,
  type WalletHold,
  type WalletHoldResult,
  DEFAULT_INDIVIDUAL_BUDGET,
  DEFAULT_ORGANIZATION_BUDGET,
  BUDGET_ALERT_THRESHOLDS,
} from './types/index.js';
import { NOTIFICATION_TYPES } from '@nxt1/core';

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
  const snapshot = await db
    .collection(COLLECTIONS.BILLING_CONTEXTS)
    .where('userId', '==', userId)
    .limit(1)
    .get();

  if (snapshot.empty) return null;

  return snapshot.docs[0]!.data() as BillingContext;
}

/**
 * Get or create a billing context for a user.
 *
 * Resolution order:
 *   1. If a teamId is provided, look up the team's organizationId.
 *   2. If the organization exists and has billing enabled → billingEntity = 'organization'.
 *   3. Otherwise → billingEntity = 'individual'.
 *
 * The legacy `orgBillingEnabled` flag on the team doc is still respected as a
 * fallback, but the preferred path is organization.billing.subscriptionId being set.
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

      // Organization billing is enabled if it has a billing subscription OR
      // the legacy orgBillingEnabled flag is set on the team
      const orgHasBilling =
        !!orgData?.['billing']?.['subscriptionId'] || !!teamData?.['orgBillingEnabled'];

      if (orgHasBilling) {
        billingEntity = 'organization';
        organizationId = orgId;
      }
    } else if (teamData?.['orgBillingEnabled']) {
      // Legacy fallback: team has orgBillingEnabled but no organizationId
      // Treat as 'organization' with the teamId acting as the billing anchor
      billingEntity = 'organization';
    }
  }

  const budget =
    billingEntity === 'organization' ? DEFAULT_ORGANIZATION_BUDGET : DEFAULT_INDIVIDUAL_BUDGET;

  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();

  const context: Omit<BillingContext, 'createdAt' | 'updatedAt'> = {
    userId,
    teamId: effectiveTeamId,
    organizationId,
    billingEntity,
    monthlyBudget: budget,
    currentPeriodSpend: 0,
    periodStart,
    periodEnd,
    notified50: false,
    notified80: false,
    notified100: false,
    iapLowBalanceNotified: false,
    hardStop: true,
    paymentProvider: 'stripe',
    walletBalanceCents: 0,
    pendingHoldsCents: 0,
  };

  const ts = FieldValue.serverTimestamp();
  await db.collection(COLLECTIONS.BILLING_CONTEXTS).add({
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

  // ── IAP wallet billing: check prepaid balance ──
  if (ctx.billingEntity === 'individual' && ctx.paymentProvider === 'iap') {
    return checkWalletBudget(ctx, costCents);
  }

  // ── Individual billing: simple single-tier check ──
  if (ctx.billingEntity === 'individual') {
    return checkSingleTierBudget(ctx, costCents);
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

  // Tier 2: Check organization master budget
  const orgCtx = orgId
    ? await getOrgBillingContext(db, orgId)
    : effectiveTeamId
      ? await getTeamBillingContext(db, effectiveTeamId)
      : null;

  const masterCtx = orgCtx ?? ctx;
  return checkSingleTierBudget(masterCtx, costCents);
}

/**
 * Single-tier budget check (shared by individual and org master).
 */
function checkSingleTierBudget(ctx: BillingContext, costCents: number): BudgetCheckResult {
  const projectedSpend = ctx.currentPeriodSpend + costCents;
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
function checkWalletBudget(ctx: BillingContext, costCents: number): BudgetCheckResult {
  const walletBalance = ctx.walletBalanceCents ?? 0;
  const pendingHolds = ctx.pendingHoldsCents ?? 0;
  const availableBalance = walletBalance - pendingHolds;

  if (availableBalance < costCents) {
    return {
      allowed: false,
      reason:
        `Wallet balance of $${(availableBalance / 100).toFixed(2)} (available) is insufficient. ` +
        'Add funds in Settings → Usage to continue.',
      currentSpend: 0,
      budget: availableBalance,
      percentUsed: 100,
      billingEntity: 'individual',
    };
  }

  return {
    allowed: true,
    currentSpend: 0,
    budget: availableBalance,
    percentUsed: 0,
    billingEntity: 'individual',
  };
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

  // ── IAP wallet: deduct from wallet balance instead of incrementing spend ──
  if (ctx.billingEntity === 'individual' && ctx.paymentProvider === 'iap') {
    await deductWallet(db, userId, costCents);
    return;
  }

  // Always update the user's own context (for per-user tracking)
  await updateSpend(db, userId, costCents);

  if (ctx.billingEntity === 'organization') {
    const effectiveTeamId = ctx.teamId;

    // Update team sub-allocation spend
    if (effectiveTeamId) {
      await updateTeamAllocationSpend(db, effectiveTeamId, costCents);
    }

    // Update organization master budget
    if (ctx.organizationId) {
      await updateOrgSpend(db, ctx.organizationId, costCents);
    } else if (effectiveTeamId) {
      // Legacy fallback: no organizationId, use team-level billing context
      await updateTeamSpend(db, effectiveTeamId, costCents);
    }
  }
}

/**
 * Increment current period spend for a user and check thresholds.
 */
async function updateSpend(db: Firestore, userId: string, costCents: number): Promise<void> {
  const snapshot = await db
    .collection(COLLECTIONS.BILLING_CONTEXTS)
    .where('userId', '==', userId)
    .limit(1)
    .get();

  if (snapshot.empty) return;

  const docRef = snapshot.docs[0]!.ref;
  const data = snapshot.docs[0]!.data() as BillingContext;

  const newSpend = data.currentPeriodSpend + costCents;
  const updates: Record<string, unknown> = {
    currentPeriodSpend: FieldValue.increment(costCents),
    updatedAt: FieldValue.serverTimestamp(),
  };

  // Only send individual alerts if this is an individual billing context
  if (data.billingEntity === 'individual') {
    const pct = data.monthlyBudget > 0 ? Math.round((newSpend / data.monthlyBudget) * 100) : 0;
    await checkAndNotify(db, data, pct, updates, userId);
  }

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
 * (default $2.00, via `platformConfig/billing.lowBalanceThresholdCents`).
 * Uses a separate `iapLowBalanceNotified` flag — distinct from Stripe's notified100.
 */
async function deductWallet(db: Firestore, userId: string, costCents: number): Promise<void> {
  const config = await getPlatformConfig(db);
  const collRef = db.collection(COLLECTIONS.BILLING_CONTEXTS);
  const snapshot = await collRef.where('userId', '==', userId).limit(1).get();

  if (snapshot.empty) {
    logger.error('[deductWallet] Billing context not found', { userId, costCents });
    throw new Error(`Billing context not found for user ${userId}`);
  }

  const docRef = snapshot.docs[0]!.ref;
  let newBalance = 0;
  let shouldNotifyLow = false;

  await db.runTransaction(async (txn) => {
    const doc = await txn.get(docRef);
    const data = doc.data() as BillingContext;
    const currentBalance = data.walletBalanceCents ?? 0;

    if (currentBalance < costCents) {
      throw new Error(
        `Insufficient wallet balance: $${(currentBalance / 100).toFixed(2)} < $${(costCents / 100).toFixed(2)}`
      );
    }

    newBalance = currentBalance - costCents;
    shouldNotifyLow = newBalance < config.lowBalanceThresholdCents && !data.iapLowBalanceNotified;

    const updates: Record<string, unknown> = {
      walletBalanceCents: FieldValue.increment(-costCents),
      currentPeriodSpend: FieldValue.increment(costCents),
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (shouldNotifyLow) {
      updates['iapLowBalanceNotified'] = true;
    }

    txn.update(docRef, updates);
  });

  logger.info('[deductWallet] Wallet deducted', { userId, costCents, newBalance });

  if (shouldNotifyLow) {
    const { dispatch } = await import('../../services/notification.service.js');
    await dispatch(db, {
      userId,
      type: NOTIFICATION_TYPES.BUDGET_WARNING,
      title: 'Wallet Balance Low',
      body: `Your wallet balance is $${(Math.max(0, newBalance) / 100).toFixed(2)}. Add funds in Settings → Usage to continue using Agent X.`,
      deepLink: '/usage',
      priority: 'high',
      source: { userName: 'NXT1 Billing' },
    }).catch((err: unknown) => {
      logger.error('[deductWallet] Failed to send low-balance alert', { error: err, userId });
    });
  }
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

  const collRef = db.collection(COLLECTIONS.BILLING_CONTEXTS);
  const snapshot = await collRef.where('userId', '==', userId).limit(1).get();

  if (snapshot.empty) {
    logger.warn('[processWalletRefund] Billing context not found — nothing to deduct', {
      userId,
      amountCents,
    });
    return; // Graceful no-op — user may have been deleted
  }

  const docRef = snapshot.docs[0]!.ref;

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
 * Called after a verified Apple IAP consumable purchase.
 *
 * - Atomically increments `walletBalanceCents`.
 * - Sets `paymentProvider` to 'iap' if not already set.
 * - Resets budget notification flags so the user doesn't see stale "low balance" alerts.
 */
export async function addWalletTopUp(
  db: Firestore,
  userId: string,
  amountCents: number
): Promise<{ newBalance: number }> {
  if (amountCents <= 0) {
    throw new Error('Top-up amount must be positive');
  }

  // getOrCreateBillingContext is safe to call concurrently — it does an
  // existence check and returns early if one already exists.
  await getOrCreateBillingContext(db, userId);

  const snapshot = await db
    .collection(COLLECTIONS.BILLING_CONTEXTS)
    .where('userId', '==', userId)
    .limit(1)
    .get();

  if (snapshot.empty) {
    throw new Error(`Failed to find or create billing context for user ${userId}`);
  }

  const docRef = snapshot.docs[0]!.ref;
  const data = snapshot.docs[0]!.data() as BillingContext;

  await docRef.update({
    walletBalanceCents: FieldValue.increment(amountCents),
    paymentProvider: 'iap' as PaymentProvider,
    // Reset ALL notification flags so the user sees fresh alerts at the new balance
    notified50: false,
    notified80: false,
    notified100: false,
    iapLowBalanceNotified: false,
    updatedAt: FieldValue.serverTimestamp(),
  });

  const newBalance = (data.walletBalanceCents ?? 0) + amountCents;

  logger.info('[addWalletTopUp] Wallet topped up', { userId, amountCents, newBalance });

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
  const snapshot = await db
    .collection(COLLECTIONS.BILLING_CONTEXTS)
    .where('organizationId', '==', organizationId)
    .where('billingEntity', '==', 'organization')
    .where('userId', '>=', 'org:')
    .where('userId', '<', 'org:\uf8ff')
    .limit(1)
    .get();

  if (snapshot.empty) {
    // Auto-create and then re-query to record the spend
    await createOrgBillingContext(db, organizationId);
    const retrySnap = await db
      .collection(COLLECTIONS.BILLING_CONTEXTS)
      .where('organizationId', '==', organizationId)
      .where('billingEntity', '==', 'organization')
      .limit(1)
      .get();

    if (retrySnap.empty) {
      logger.error('[updateOrgSpend] Failed to find org context after creation', {
        organizationId,
      });
      return;
    }

    await retrySnap.docs[0]!.ref.update({
      currentPeriodSpend: FieldValue.increment(costCents),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return;
  }

  const docRef = snapshot.docs[0]!.ref;
  const data = snapshot.docs[0]!.data() as BillingContext;

  const newSpend = data.currentPeriodSpend + costCents;
  const updates: Record<string, unknown> = {
    currentPeriodSpend: FieldValue.increment(costCents),
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

/**
 * Legacy: Increment current period spend for a team aggregate and check thresholds.
 * Used when there is no organizationId (legacy orgBillingEnabled teams).
 */
async function updateTeamSpend(db: Firestore, teamId: string, costCents: number): Promise<void> {
  const snapshot = await db
    .collection(COLLECTIONS.BILLING_CONTEXTS)
    .where('teamId', '==', teamId)
    .where('billingEntity', '==', 'organization')
    .limit(1)
    .get();

  if (snapshot.empty) {
    // Try legacy 'team' entity
    const legacySnap = await db
      .collection(COLLECTIONS.BILLING_CONTEXTS)
      .where('teamId', '==', teamId)
      .where('billingEntity', '==', 'team')
      .limit(1)
      .get();

    if (legacySnap.empty) {
      await createTeamBillingContext(db, teamId);
      return;
    }

    const docRef = legacySnap.docs[0]!.ref;
    const data = legacySnap.docs[0]!.data() as BillingContext;
    const newSpend = data.currentPeriodSpend + costCents;
    const updates: Record<string, unknown> = {
      currentPeriodSpend: FieldValue.increment(costCents),
      updatedAt: FieldValue.serverTimestamp(),
    };
    const pct = data.monthlyBudget > 0 ? Math.round((newSpend / data.monthlyBudget) * 100) : 0;
    await checkAndNotifyTeamLegacy(db, teamId, pct, data, updates);
    await docRef.update(updates);
    return;
  }

  const docRef = snapshot.docs[0]!.ref;
  const data = snapshot.docs[0]!.data() as BillingContext;

  const newSpend = data.currentPeriodSpend + costCents;
  const updates: Record<string, unknown> = {
    currentPeriodSpend: FieldValue.increment(costCents),
    updatedAt: FieldValue.serverTimestamp(),
  };

  const pct = data.monthlyBudget > 0 ? Math.round((newSpend / data.monthlyBudget) * 100) : 0;
  await checkAndNotifyTeamLegacy(db, teamId, pct, data, updates);
  await docRef.update(updates);
}

// ============================================
// ALERT DISPATCH HELPERS
// ============================================

/**
 * Check threshold percentages and dispatch push notifications for individual.
 */
async function checkAndNotify(
  db: Firestore,
  ctx: BillingContext,
  pct: number,
  updates: Record<string, unknown>,
  userId: string
): Promise<void> {
  const { dispatch } = await import('../../services/notification.service.js');

  if (pct >= BUDGET_ALERT_THRESHOLDS[2] && !ctx.notified100) {
    updates['notified100'] = true;
    await dispatch(db, {
      userId,
      type: NOTIFICATION_TYPES.BUDGET_REACHED,
      title: 'Budget Limit Reached',
      body: `You've reached your monthly budget of $${(ctx.monthlyBudget / 100).toFixed(2)}. Increase your budget to continue using Agent X.`,
      deepLink: '/usage',
      priority: 'high',
      source: { userName: 'NXT1 Billing' },
    }).catch((err: unknown) => {
      logger.error('[checkAndNotify] Failed to send 100% alert', { error: err, userId });
    });
  } else if (pct >= BUDGET_ALERT_THRESHOLDS[1] && !ctx.notified80) {
    updates['notified80'] = true;
    await dispatch(db, {
      userId,
      type: NOTIFICATION_TYPES.BUDGET_WARNING,
      title: 'Budget Warning — 80%',
      body: `You've used 80% of your monthly budget ($${(ctx.monthlyBudget / 100).toFixed(2)}). Consider increasing your limit.`,
      deepLink: '/usage',
      priority: 'normal',
      source: { userName: 'NXT1 Billing' },
    }).catch((err: unknown) => {
      logger.error('[checkAndNotify] Failed to send 80% alert', { error: err, userId });
    });
  } else if (pct >= BUDGET_ALERT_THRESHOLDS[0] && !ctx.notified50) {
    updates['notified50'] = true;
    await dispatch(db, {
      userId,
      type: NOTIFICATION_TYPES.BUDGET_WARNING,
      title: 'Budget Update — 50%',
      body: `You've used 50% of your monthly budget ($${(ctx.monthlyBudget / 100).toFixed(2)}).`,
      deepLink: '/usage',
      priority: 'normal',
      source: { userName: 'NXT1 Billing' },
    }).catch((err: unknown) => {
      logger.error('[checkAndNotify] Failed to send 50% alert', { error: err, userId });
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
  ctx: BillingContext,
  updates: Record<string, unknown>
): Promise<void> {
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

/**
 * Legacy: Check threshold percentages and notify team admins (old billing model).
 */
async function checkAndNotifyTeamLegacy(
  db: Firestore,
  teamId: string,
  pct: number,
  ctx: BillingContext,
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
      logger.error('[checkAndNotifyTeamLegacy] Failed to send team alert', {
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
const BILLING_RESOLUTION_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const BILLING_RESOLUTION_CACHE_MAX_SIZE = 10_000; // Prevent unbounded growth

/**
 * Resolve the correct billing target for a user.
 *
 * For directors/admins of an organization, this returns the **organization's**
 * billing context (userId = `org:{orgId}`) so that usage dashboards, payment
 * history, and Stripe customer lookups show org-level data instead of a
 * zeroed-out individual view.
 *
 * Resolution order:
 *   1. Check in-memory cache (5 min TTL).
 *   2. Read the user doc from `Users` to check their `role`.
 *   3. If role is `director`:
 *      a. Query `RosterEntries` for any active membership → `organizationId`.
 *      b. Fallback: query `Organizations` where `ownerId == userId`.
 *      c. If an org is found, fetch all team IDs from `Teams`.
 *      d. Fetch or create the org billing context (`org:{orgId}`).
 *      e. Return type 'organization' with the org context.
 *   4. Otherwise, fallback to the user's personal billing context.
 */
export async function resolveBillingTarget(
  db: Firestore,
  userId: string
): Promise<ResolvedBillingTarget> {
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

  if (role === 'director') {
    const target = await resolveDirectorTarget(db, userId);
    if (target) {
      // Cache the lightweight resolution mapping (NOT the context)
      billingResolutionCache.set(userId, {
        type: target.type,
        billingUserId: target.billingUserId,
        organizationId: target.organizationId,
        teamIds: target.teamIds,
        expiresAt: Date.now() + BILLING_RESOLUTION_CACHE_TTL_MS,
      });
      return target;
    }
    // Director without an active org — fall through to individual
    logger.warn(
      '[resolveBillingTarget] Director has no active organization, falling back to individual',
      { userId }
    );
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
 * Internal: Resolve a director's organization target.
 * Returns null if the director has no active organization.
 */
async function resolveDirectorTarget(
  db: Firestore,
  userId: string
): Promise<ResolvedBillingTarget | null> {
  // Strategy 1: Look up via RosterEntries — find any org-level role for this user.
  // Note: roster `role` uses membership roles (owner, admin, director, coach)
  // while the user doc `role` is the account type. We already verified the
  // account type is 'director', so find any active org membership.
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

  // Strategy 2: Fallback — check organizations.ownerId
  if (!organizationId) {
    const orgSnap = await db
      .collection('Organizations')
      .where('ownerId', '==', userId)
      .limit(1)
      .get();

    if (!orgSnap.empty) {
      organizationId = orgSnap.docs[0]!.id;
    }
  }

  if (!organizationId) {
    logger.warn('[resolveDirectorTarget] No org found for director', { userId });
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
    logger.error('[resolveDirectorTarget] Failed to create org billing context', {
      organizationId,
      userId,
    });
    return null;
  }

  logger.info('[resolveBillingTarget] Resolved director to organization', {
    userId,
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
  const snapshot = await db
    .collection(COLLECTIONS.BILLING_CONTEXTS)
    .where('userId', '==', `org:${organizationId}`)
    .limit(1)
    .get();

  if (snapshot.empty) return null;
  return snapshot.docs[0]!.data() as BillingContext;
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

/**
 * Get the team-level billing context (legacy model).
 */
async function getTeamBillingContext(
  db: Firestore,
  teamId: string
): Promise<BillingContext | null> {
  const snapshot = await db
    .collection(COLLECTIONS.BILLING_CONTEXTS)
    .where('userId', '==', `team:${teamId}`)
    .limit(1)
    .get();

  if (snapshot.empty) return null;
  return snapshot.docs[0]!.data() as BillingContext;
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

  const ts = FieldValue.serverTimestamp();
  await db.collection(COLLECTIONS.BILLING_CONTEXTS).add({
    userId: `org:${organizationId}`,
    organizationId,
    billingEntity: 'organization',
    paymentProvider: 'stripe',
    monthlyBudget: DEFAULT_ORGANIZATION_BUDGET,
    currentPeriodSpend: 0,
    walletBalanceCents: 0,
    pendingHoldsCents: 0,
    periodStart,
    periodEnd,
    notified50: false,
    notified80: false,
    notified100: false,
    iapLowBalanceNotified: false,
    hardStop: true,
    createdAt: ts,
    updatedAt: ts,
  });

  logger.info('[createOrgBillingContext] Created org billing context', { organizationId });
}

/**
 * Legacy: Create a team-level billing context for aggregate tracking.
 */
async function createTeamBillingContext(db: Firestore, teamId: string): Promise<void> {
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();

  const ts = FieldValue.serverTimestamp();
  await db.collection(COLLECTIONS.BILLING_CONTEXTS).add({
    userId: `team:${teamId}`,
    teamId,
    billingEntity: 'team',
    paymentProvider: 'stripe',
    monthlyBudget: DEFAULT_ORGANIZATION_BUDGET,
    currentPeriodSpend: 0,
    walletBalanceCents: 0,
    pendingHoldsCents: 0,
    periodStart,
    periodEnd,
    iapLowBalanceNotified: false,
    notified50: false,
    notified80: false,
    notified100: false,
    hardStop: true,
    createdAt: ts,
    updatedAt: ts,
  });

  logger.info('[createTeamBillingContext] Created team billing context', { teamId });
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

  const snapshot = await db
    .collection(COLLECTIONS.BILLING_CONTEXTS)
    .where('userId', '==', userId)
    .limit(1)
    .get();

  if (snapshot.empty) {
    throw new Error('Billing context not found');
  }

  await snapshot.docs[0]!.ref.update({
    monthlyBudget: newBudgetCents,
    // Reset notification flags if the budget is increased past current thresholds
    notified50: false,
    notified80: false,
    notified100: false,
    updatedAt: FieldValue.serverTimestamp(),
  });

  logger.info('[updateBudget] Budget updated', { userId, newBudgetCents });
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

  // First try to find by organizationId
  let snapshot = await db
    .collection(COLLECTIONS.BILLING_CONTEXTS)
    .where('organizationId', '==', organizationId)
    .where('billingEntity', '==', 'organization')
    .where('userId', '>=', 'org:')
    .where('userId', '<', 'org:\uf8ff')
    .limit(1)
    .get();

  if (snapshot.empty) {
    // Create one if it doesn't exist
    await createOrgBillingContext(db, organizationId);
    snapshot = await db
      .collection(COLLECTIONS.BILLING_CONTEXTS)
      .where('organizationId', '==', organizationId)
      .where('billingEntity', '==', 'organization')
      .where('userId', '>=', 'org:')
      .where('userId', '<', 'org:\uf8ff')
      .limit(1)
      .get();
  }

  if (snapshot.empty) {
    throw new Error('Organization billing context not found');
  }

  await snapshot.docs[0]!.ref.update({
    monthlyBudget: newBudgetCents,
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

/**
 * Legacy: Update a team's monthly budget limit.
 * Only team admins can call this.
 */
export async function updateTeamBudget(
  db: Firestore,
  teamId: string,
  newBudgetCents: number
): Promise<void> {
  if (newBudgetCents < 0) {
    throw new Error('Budget cannot be negative');
  }

  const snapshot = await db
    .collection(COLLECTIONS.BILLING_CONTEXTS)
    .where('teamId', '==', teamId)
    .where('billingEntity', '==', 'team')
    .limit(1)
    .get();

  if (snapshot.empty) {
    throw new Error('Team billing context not found');
  }

  await snapshot.docs[0]!.ref.update({
    monthlyBudget: newBudgetCents,
    notified50: false,
    notified80: false,
    notified100: false,
    updatedAt: FieldValue.serverTimestamp(),
  });

  logger.info('[updateTeamBudget] Team budget updated', { teamId, newBudgetCents });
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
        periodStart,
        periodEnd,
        // Keep notified flags so we don't spam; they reset on next top-up
        updatedAt: FieldValue.serverTimestamp(),
      });
    } else {
      batch.update(doc.ref, {
        currentPeriodSpend: 0,
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
 * on the billing context and creates a `walletHolds` document for tracking.
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

  const collRef = db.collection(COLLECTIONS.BILLING_CONTEXTS);
  const snapshot = await collRef.where('userId', '==', userId).limit(1).get();

  if (snapshot.empty) {
    return { success: false, reason: 'Billing context not found' };
  }

  const docRef = snapshot.docs[0]!.ref;
  let holdId = '';
  let availableBalance = 0;

  try {
    await db.runTransaction(async (txn) => {
      const doc = await txn.get(docRef);
      const data = doc.data() as BillingContext;

      const walletBalance = data.walletBalanceCents ?? 0;
      const pendingHolds = data.pendingHoldsCents ?? 0;
      availableBalance = walletBalance - pendingHolds;

      if (availableBalance < estimatedCostCents) {
        throw new Error(
          `Insufficient available balance: $${(availableBalance / 100).toFixed(2)} < $${(estimatedCostCents / 100).toFixed(2)}`
        );
      }

      // Create hold document
      const holdRef = db.collection(COLLECTIONS.WALLET_HOLDS).doc();
      holdId = holdRef.id;

      txn.set(holdRef, {
        userId,
        amountCents: estimatedCostCents,
        status: 'active',
        jobId,
        feature,
        createdAt: FieldValue.serverTimestamp(),
      });

      // Atomically increase pending holds on the billing context
      txn.update(docRef, {
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

  await db.runTransaction(async (txn) => {
    const holdDoc = await txn.get(holdRef);

    if (!holdDoc.exists) {
      throw new Error(`Wallet hold ${holdId} not found`);
    }

    const hold = holdDoc.data() as WalletHold;

    if (hold.status !== 'active') {
      throw new Error(`Wallet hold ${holdId} is already ${hold.status}`);
    }

    // Find the user's billing context
    const ctxSnap = await txn.get(
      db.collection(COLLECTIONS.BILLING_CONTEXTS).where('userId', '==', hold.userId).limit(1)
    );

    if (ctxSnap.empty) {
      throw new Error(`Billing context not found for user ${hold.userId}`);
    }

    const ctxRef = ctxSnap.docs[0]!.ref;

    // Release the full hold and deduct the actual cost
    txn.update(ctxRef, {
      pendingHoldsCents: FieldValue.increment(-hold.amountCents),
      walletBalanceCents: FieldValue.increment(-actualCostCents),
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
    const ctxSnap = await txn.get(
      db.collection(COLLECTIONS.BILLING_CONTEXTS).where('userId', '==', hold.userId).limit(1)
    );

    if (ctxSnap.empty) {
      throw new Error(`Billing context not found for user ${hold.userId}`);
    }

    const ctxRef = ctxSnap.docs[0]!.ref;

    // Release the hold — no deduction
    txn.update(ctxRef, {
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

  for (const doc of snapshot.docs) {
    const hold = doc.data() as WalletHold;

    batch.update(doc.ref, {
      status: 'expired',
      resolvedAt: FieldValue.serverTimestamp(),
    });

    const existing = holdsByUser.get(hold.userId) ?? 0;
    holdsByUser.set(hold.userId, existing + hold.amountCents);
    expiredCount++;
  }

  await batch.commit();

  // Release pending holds on each affected user's billing context
  for (const [userId, totalHeldCents] of holdsByUser) {
    const ctxSnap = await db
      .collection(COLLECTIONS.BILLING_CONTEXTS)
      .where('userId', '==', userId)
      .limit(1)
      .get();

    if (!ctxSnap.empty) {
      await ctxSnap.docs[0]!.ref.update({
        pendingHoldsCents: FieldValue.increment(-totalHeldCents),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
  }

  logger.info('[expireStaleHolds] Expired stale holds', { expiredCount });
  return expiredCount;
}
