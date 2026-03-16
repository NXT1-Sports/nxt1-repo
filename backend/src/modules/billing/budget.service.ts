/**
 * @fileoverview Budget Service
 * @module @nxt1/backend/modules/billing
 *
 * Manages per-user and per-team spending budgets, spend aggregation,
 * threshold alerts (50% / 80% / 100%), and hard-stop enforcement.
 */

import type { Firestore } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import { logger } from '../../utils/logger.js';
import { COLLECTIONS } from './config.js';
import {
  type BillingContext,
  type BillingEntity,
  DEFAULT_INDIVIDUAL_BUDGET,
  DEFAULT_TEAM_BUDGET,
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
 * If the user belongs to a team that pays, billingEntity = 'team'.
 * Otherwise billingEntity = 'individual'.
 */
export async function getOrCreateBillingContext(
  db: Firestore,
  userId: string,
  teamId?: string
): Promise<BillingContext> {
  const existing = await getBillingContext(db, userId);
  if (existing) return existing;

  // Determine billing entity
  let billingEntity: BillingEntity = 'individual';
  let effectiveTeamId = teamId;

  if (teamId) {
    // Check if the team has org-level billing enabled
    const teamDoc = await db.collection('teams').doc(teamId).get();
    const teamData = teamDoc.data();
    if (teamData?.['orgBillingEnabled']) {
      billingEntity = 'team';
    }
    effectiveTeamId = teamId;
  }

  const budget = billingEntity === 'team' ? DEFAULT_TEAM_BUDGET : DEFAULT_INDIVIDUAL_BUDGET;

  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();

  const context: Omit<BillingContext, 'createdAt' | 'updatedAt'> = {
    userId,
    teamId: effectiveTeamId,
    billingEntity,
    monthlyBudget: budget,
    currentPeriodSpend: 0,
    periodStart,
    periodEnd,
    notified50: false,
    notified80: false,
    notified100: false,
    hardStop: true,
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
    monthlyBudget: budget,
  });

  return context as BillingContext;
}

// ============================================
// BUDGET CHECK (PRE-TASK GATE)
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
 * Called BEFORE recording a usage event. If the hard-stop is enabled
 * and the user/team has hit 100%, the task is rejected.
 */
export async function checkBudget(
  db: Firestore,
  userId: string,
  costCents: number,
  teamId?: string
): Promise<BudgetCheckResult> {
  const ctx = await getOrCreateBillingContext(db, userId, teamId);

  // If the user belongs to a team, look up the team's aggregate context
  let effectiveCtx = ctx;
  if (ctx.billingEntity === 'team' && ctx.teamId) {
    const teamCtx = await getTeamBillingContext(db, ctx.teamId);
    if (teamCtx) effectiveCtx = teamCtx;
  }

  const projectedSpend = effectiveCtx.currentPeriodSpend + costCents;
  const percentUsed =
    effectiveCtx.monthlyBudget > 0
      ? Math.round((projectedSpend / effectiveCtx.monthlyBudget) * 100)
      : 0;

  if (effectiveCtx.hardStop && projectedSpend > effectiveCtx.monthlyBudget) {
    return {
      allowed: false,
      reason:
        `Monthly budget of $${(effectiveCtx.monthlyBudget / 100).toFixed(2)} reached. ` +
        'Increase your budget in Settings → Usage to continue.',
      currentSpend: effectiveCtx.currentPeriodSpend,
      budget: effectiveCtx.monthlyBudget,
      percentUsed,
      billingEntity: effectiveCtx.billingEntity,
    };
  }

  return {
    allowed: true,
    currentSpend: effectiveCtx.currentPeriodSpend,
    budget: effectiveCtx.monthlyBudget,
    percentUsed,
    billingEntity: effectiveCtx.billingEntity,
  };
}

// ============================================
// SPEND RECORDING & ALERT DISPATCH
// ============================================

/**
 * Record spend against a user's billing context and fire threshold alerts.
 * Called AFTER a usage event is successfully queued / billed.
 */
export async function recordSpend(
  db: Firestore,
  userId: string,
  costCents: number,
  teamId?: string
): Promise<void> {
  const ctx = await getOrCreateBillingContext(db, userId, teamId);

  // Update individual context
  await updateSpend(db, userId, costCents);

  // If team billing, also update the team aggregate
  if (ctx.billingEntity === 'team' && ctx.teamId) {
    await updateTeamSpend(db, ctx.teamId, costCents);
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

  // Check alert thresholds
  const pct = data.monthlyBudget > 0 ? Math.round((newSpend / data.monthlyBudget) * 100) : 0;

  await checkAndNotify(db, data, pct, updates, userId);

  await docRef.update(updates);
}

/**
 * Increment current period spend for a team aggregate and check thresholds.
 */
async function updateTeamSpend(db: Firestore, teamId: string, costCents: number): Promise<void> {
  const snapshot = await db
    .collection(COLLECTIONS.BILLING_CONTEXTS)
    .where('teamId', '==', teamId)
    .where('billingEntity', '==', 'team')
    .limit(1)
    .get();

  if (snapshot.empty) {
    // Create a team-level context for aggregation
    await createTeamBillingContext(db, teamId);
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

  // Notify team admins
  await checkAndNotifyTeam(db, teamId, pct, data, updates);

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
 * Check threshold percentages and notify team admins.
 */
async function checkAndNotifyTeam(
  db: Firestore,
  teamId: string,
  pct: number,
  ctx: BillingContext,
  updates: Record<string, unknown>
): Promise<void> {
  const { dispatch } = await import('../../services/notification.service.js');

  // Get team admins
  const teamDoc = await db.collection('teams').doc(teamId).get();
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
      logger.error('[checkAndNotifyTeam] Failed to send team alert', {
        error: err,
        adminId,
        teamId,
      });
    });
  }
}

// ============================================
// TEAM BILLING CONTEXT HELPERS
// ============================================

/**
 * Get the team-level billing context (aggregated for org).
 */
async function getTeamBillingContext(
  db: Firestore,
  teamId: string
): Promise<BillingContext | null> {
  const snapshot = await db
    .collection(COLLECTIONS.BILLING_CONTEXTS)
    .where('teamId', '==', teamId)
    .where('billingEntity', '==', 'team')
    .limit(1)
    .get();

  if (snapshot.empty) return null;
  return snapshot.docs[0]!.data() as BillingContext;
}

/**
 * Create a team-level billing context for org aggregate tracking.
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
    monthlyBudget: DEFAULT_TEAM_BUDGET,
    currentPeriodSpend: 0,
    periodStart,
    periodEnd,
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
 * Only the account owner (or team admin for org) can call this.
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
 * Update a team's monthly budget limit.
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
// PERIOD RESET (Called by scheduled function)
// ============================================

/**
 * Reset all billing contexts for a new monthly period.
 * Should be called by a Cloud Function on the 1st of each month.
 */
export async function resetMonthlyBudgets(db: Firestore): Promise<number> {
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();

  const snapshot = await db.collection(COLLECTIONS.BILLING_CONTEXTS).get();

  let batch = db.batch();
  let count = 0;
  let batchCount = 0;

  for (const doc of snapshot.docs) {
    batch.update(doc.ref, {
      currentPeriodSpend: 0,
      periodStart,
      periodEnd,
      notified50: false,
      notified80: false,
      notified100: false,
      updatedAt: FieldValue.serverTimestamp(),
    });
    count++;
    batchCount++;

    // Firestore batch limit is 500 — commit and start a fresh batch
    if (batchCount >= 450) {
      await batch.commit();
      batch = db.batch();
      batchCount = 0;
    }
  }

  if (batchCount > 0) {
    await batch.commit();
  }

  logger.info('[resetMonthlyBudgets] Reset complete', { count });
  return count;
}
