/**
 * @fileoverview Centralized Billing Deduction Service
 * @module @nxt1/backend/modules/billing
 *
 * Extracts the billing deduction pipeline from agent.worker.ts into a
 * reusable function that ALL LLM entry points (background jobs, SSE chat,
 * playbook, briefing, intel, etc.) call after an AI operation completes.
 *
 * Supports two billing modes:
 * - **Hold-based** (background jobs): Pre-authorized IAP hold is captured/released.
 * - **Direct debit** (sync routes): Immediate spend recording via recordSpend().
 */

import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { getAndClearJobCost } from '../agent/queue/job-cost-tracker.js';
import { calculateChargeAmount } from './pricing.service.js';
import { resolveBillableFeatures } from './feature-resolution.service.js';
import {
  recordSpend,
  deductOrgWallet,
  captureWalletHold,
  releaseWalletHold,
  resolveBillingTarget,
} from './budget.service.js';
import { recordUsageEvent, UsageEventStatus } from './usage.service.js';
import { logger } from '../../utils/logger.js';

const BILLING_DEDUCTION_LOCK_COLLECTION = 'BillingDeductions';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface BillingDeductionInput {
  /** Firestore instance for billing reads/writes */
  db: Firestore;
  /** The authenticated user being billed */
  userId: string;
  /** Operation ID used as the job-cost-tracker key (must match telemetryContext.operationId) */
  operationId: string;
  /** Optional fixed-flow feature label when the caller already knows the exact product. */
  feature?: string;
  /** Optional coordinator or agent ID used to resolve multiplier overrides */
  coordinatorId?: string;
  /** All tools invoked during the operation, in execution order. */
  agentTools?: readonly string[];
  /** Successful tools completed during the operation, in execution order. */
  successfulTools?: readonly string[];
  /** Environment tag passed to recordUsageEvent */
  environment?: 'production' | 'staging';
  /**
   * If present, we capture/release an existing IAP wallet hold (background job mode).
   * If absent, we use direct `recordSpend()` (synchronous route mode).
   */
  iapHoldId?: string;
  /** Team ID for the usage event (required for org dashboard queries). When omitted, the pipeline resolves it via resolveBillingTarget. */
  teamId?: string;
  /**
   * Optional org ID hint for onboarding/first-run scenarios.
   * When resolveBillingTarget cannot find an org (e.g. billing docs not yet
   * initialized), this fallback ensures charges are routed to the correct
   * organization wallet instead of the user's personal wallet.
   */
  organizationId?: string;
  /** Optional metadata attached to the usage event for audit */
  metadata?: Record<string, unknown>;
  /**
   * When the caller already knows the raw USD cost (e.g. from LLMCompletionResult.costUsd),
   * pass it here to skip the job-cost-tracker lookup.  The tracker is still cleared for
   * the operationId to prevent stale accumulation.
   */
  knownCostUsd?: number;
}

export interface BillingDeductionResult {
  /** Whether a charge was actually applied */
  charged: boolean;
  /** Raw LLM provider cost in USD */
  rawCostUsd: number;
  /** Final charge after markup, in cents */
  chargeAmountCents: number;
}

function supportsFirestoreLock(db: Firestore): boolean {
  const maybeDb = db as Partial<Pick<Firestore, 'collection' | 'runTransaction'>>;
  return typeof maybeDb.collection === 'function' && typeof maybeDb.runTransaction === 'function';
}

interface BillingDeductionLockResult {
  readonly acquired: boolean;
  readonly existingStatus?: string;
  readonly existingHoldId?: string;
}

async function acquireBillingDeductionLock(
  db: Firestore,
  operationId: string,
  userId: string,
  chargeAmountCents: number,
  billableFeatures: readonly string[],
  holdId?: string
): Promise<BillingDeductionLockResult> {
  if (!supportsFirestoreLock(db)) {
    return { acquired: true };
  }

  const lockRef = db.collection(BILLING_DEDUCTION_LOCK_COLLECTION).doc(operationId);

  return db.runTransaction(async (txn) => {
    const snap = await txn.get(lockRef);
    if (snap.exists) {
      const data = snap.data();
      const status = data?.['status'];
      if (status === 'charged' || status === 'processing') {
        return {
          acquired: false,
          existingStatus: typeof status === 'string' ? status : undefined,
          existingHoldId: typeof data?.['holdId'] === 'string' ? data['holdId'] : undefined,
        };
      }
    }

    txn.set(
      lockRef,
      {
        operationId,
        userId,
        status: 'processing',
        chargeAmountCents,
        billableFeatures: [...billableFeatures],
        ...(holdId ? { holdId } : {}),
        attemptCount: FieldValue.increment(1),
        startedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        createdAt: snap.exists
          ? (snap.data()?.['createdAt'] ?? FieldValue.serverTimestamp())
          : FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return { acquired: true };
  });
}

async function markBillingDeductionLock(
  db: Firestore,
  operationId: string,
  status: 'charged' | 'failed',
  metadata: Record<string, unknown>
): Promise<void> {
  if (!supportsFirestoreLock(db)) {
    return;
  }

  await db
    .collection(BILLING_DEDUCTION_LOCK_COLLECTION)
    .doc(operationId)
    .set(
      {
        status,
        ...metadata,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
}

// ─── Core Function ──────────────────────────────────────────────────────────

/**
 * Execute the full billing deduction pipeline for any AI operation.
 *
 * 1. Retrieves accumulated LLM cost from the in-memory tracker (or uses `knownCostUsd`).
 * 2. Applies the platform markup via `calculateChargeAmount()`.
 * 3. Either captures a wallet hold or directly records spend.
 * 4. Writes an audit-trail usage event.
 *
 * Designed to be called in a fire-and-forget `void (async () => { ... })()` wrapper
 * OR awaited if the caller needs the result.  All errors are caught internally —
 * this function never throws.
 */
export async function executeBillingDeduction(
  input: BillingDeductionInput
): Promise<BillingDeductionResult> {
  const {
    db,
    userId,
    operationId,
    feature,
    coordinatorId,
    agentTools,
    successfulTools,
    environment,
    iapHoldId,
    metadata,
    knownCostUsd,
  } = input;
  let resolvedTeamId = input.teamId;
  // Seed resolvedOrgId from the caller-supplied hint. This covers first-run
  // scenarios (e.g. onboarding link scrape) where resolveBillingTarget may
  // not yet have the org billing docs ready.
  let resolvedOrgId: string | undefined = input.organizationId;
  let deductionLockAcquired = false;
  let moneyMoved = false;

  try {
    const resolvedFeatures = resolveBillableFeatures({
      feature,
      coordinatorId,
      agentTools,
      successfulTools,
    });
    const primaryFeature = resolvedFeatures[0] ?? 'agent-execution';

    // Step 1: Resolve raw cost
    let totalCostUsd: number;
    if (knownCostUsd != null && knownCostUsd > 0) {
      // Caller provided cost — still clear tracker to avoid stale entries
      getAndClearJobCost(operationId);
      totalCostUsd = knownCostUsd;
    } else {
      totalCostUsd = getAndClearJobCost(operationId);
    }

    logger.info('[billing] Deduction pipeline start', {
      operationId,
      userId,
      feature: primaryFeature,
      billableFeatures: resolvedFeatures,
      coordinatorId,
      totalCostUsd,
      mode: iapHoldId ? 'hold-capture' : 'direct-debit',
    });

    // Step 2: Zero cost — release any hold and bail
    if (totalCostUsd <= 0) {
      if (iapHoldId) {
        releaseWalletHold(db, iapHoldId).catch((e: unknown) => {
          logger.warn('[billing] Failed to release IAP hold on zero cost', {
            holdId: iapHoldId,
            error: e instanceof Error ? e.message : String(e),
          });
        });
      }
      return { charged: false, rawCostUsd: 0, chargeAmountCents: 0 };
    }

    // Step 3: Apply platform markup to the whole operation once. Tool-level
    // cost is not available from provider telemetry, so tools are recorded as
    // metadata for transparency instead of fake-priced ledger rows.
    const chargeCalculation = await calculateChargeAmount(
      db,
      totalCostUsd,
      primaryFeature,
      coordinatorId
    );
    const chargeAmountCents = chargeCalculation.chargeAmountCents;

    if (chargeAmountCents <= 0) {
      // Edge case: markup rounds to zero — release hold
      if (iapHoldId) {
        await releaseWalletHold(db, iapHoldId);
      }
      return { charged: false, rawCostUsd: totalCostUsd, chargeAmountCents: 0 };
    }

    const deductionLockResult = await acquireBillingDeductionLock(
      db,
      operationId,
      userId,
      chargeAmountCents,
      resolvedFeatures,
      iapHoldId ?? undefined
    );
    deductionLockAcquired = deductionLockResult.acquired;

    if (!deductionLockAcquired) {
      logger.info('[billing] Deduction already processed or in progress — skipping wallet debit', {
        operationId,
        userId,
        chargeAmountCents,
        billableFeatures: resolvedFeatures,
        existingStatus: deductionLockResult.existingStatus,
      });

      const canReleaseDuplicateHold =
        iapHoldId &&
        (deductionLockResult.existingStatus === 'charged' ||
          (deductionLockResult.existingStatus === 'processing' &&
            deductionLockResult.existingHoldId !== undefined &&
            deductionLockResult.existingHoldId !== iapHoldId));

      if (canReleaseDuplicateHold) {
        await releaseWalletHold(db, iapHoldId).catch((releaseErr: unknown) => {
          logger.warn('[billing] Failed to release duplicate hold after deduction skip', {
            operationId,
            holdId: iapHoldId,
            existingHoldId: deductionLockResult.existingHoldId,
            existingStatus: deductionLockResult.existingStatus,
            error: releaseErr instanceof Error ? releaseErr.message : String(releaseErr),
          });
        });
      }

      return { charged: false, rawCostUsd: totalCostUsd, chargeAmountCents: 0 };
    }

    // Step 4: Resolve billing target before any direct debit so org-billed users
    // always debit the org wallet, even when the caller already passed a teamId.
    if (!iapHoldId || !resolvedTeamId) {
      try {
        const target = await resolveBillingTarget(db, userId);
        resolvedTeamId = resolvedTeamId ?? target.context.teamId ?? target.teamIds?.[0];
        if (target.type === 'organization') {
          resolvedOrgId = target.organizationId;
        }
      } catch {
        resolvedTeamId = resolvedTeamId ?? undefined;
      }
    }

    const effectiveTeamId =
      resolvedTeamId && resolvedTeamId !== userId ? resolvedTeamId : undefined;

    // Step 4b: Deduct funds
    if (iapHoldId && resolvedOrgId) {
      // An IAP hold was pre-created but the resolved billing target is the org.
      // This happens when the hold was created while the billing cache still had
      // a stale 'individual' entry (e.g. athlete just joined a team).  Release
      // the personal hold and charge the org wallet instead so the athlete is
      // never double-billed across personal and team accounts.
      await releaseWalletHold(db, iapHoldId).catch((e: unknown) => {
        logger.warn('[billing] Failed to release IAP hold for org-billed user', {
          holdId: iapHoldId,
          error: e instanceof Error ? e.message : String(e),
        });
      });
      await deductOrgWallet(db, resolvedOrgId, userId, effectiveTeamId, chargeAmountCents);
    } else if (iapHoldId) {
      // Background job mode (individual billing): capture the pre-authorised hold
      await captureWalletHold(db, iapHoldId, chargeAmountCents);
    } else if (resolvedOrgId) {
      // Org billing: debit the org wallet and mirror spend onto user/team trackers.
      await deductOrgWallet(db, resolvedOrgId, userId, effectiveTeamId, chargeAmountCents);
    } else {
      // Individual / IAP wallet billing
      await recordSpend(db, userId, chargeAmountCents, effectiveTeamId);
    }
    moneyMoved = true;

    await markBillingDeductionLock(db, operationId, 'charged', {
      chargedAt: FieldValue.serverTimestamp(),
      chargeAmountCents,
      rawCostUsd: totalCostUsd,
      primaryFeature,
      billableFeatures: [...resolvedFeatures],
      via: iapHoldId ? 'captureWalletHold' : resolvedOrgId ? 'deductOrgWallet' : 'recordSpend',
    }).catch((lockErr: unknown) => {
      logger.warn('[billing] Failed to mark deduction lock as charged after money movement', {
        operationId,
        userId,
        error: lockErr instanceof Error ? lockErr.message : String(lockErr),
      });
    });

    const usageMetadata = {
      operationId,
      ...(coordinatorId ? { coordinatorId } : {}),
      ...metadata,
      primaryFeature,
      billableFeatures: [...resolvedFeatures],
      ...(metadata?.['agentTools'] === undefined && agentTools
        ? { agentTools: [...agentTools] }
        : {}),
      ...(metadata?.['successfulTools'] === undefined && successfulTools
        ? { successfulTools: [...successfulTools] }
        : {}),
    };

    // Step 5: Write one audit trail usage event for the actual operation.
    try {
      await recordUsageEvent(
        {
          userId,
          ...(effectiveTeamId ? { teamId: effectiveTeamId } : {}),
          ...(resolvedOrgId ? { organizationId: resolvedOrgId } : {}),
          feature: primaryFeature,
          quantity: 1,
          unitCostSnapshot: chargeAmountCents,
          currency: 'usd',
          stripePriceId: '',
          jobId: operationId,
          dynamicCostCents: chargeAmountCents,
          rawProviderCostUsd: totalCostUsd,
          status: UsageEventStatus.SENT,
          publish: false,
          metadata: {
            ...usageMetadata,
            settlementPath: iapHoldId
              ? 'wallet-hold-capture'
              : resolvedOrgId
                ? 'org-wallet-debit'
                : 'wallet-or-spend-record',
            alreadySettled: true,
          },
        },
        environment ?? 'production'
      );
    } catch (usageEventErr) {
      logger.warn(
        '[billing] Failed to write usage event audit trail — spend was already recorded',
        {
          operationId,
          feature: primaryFeature,
          billableFeatures: resolvedFeatures,
          error: usageEventErr instanceof Error ? usageEventErr.message : String(usageEventErr),
        }
      );
    }

    logger.info('[billing] Deduction completed', {
      operationId,
      userId,
      rawCostUsd: totalCostUsd,
      chargeAmountCents,
      feature: primaryFeature,
      billableFeatures: resolvedFeatures,
      coordinatorId,
      via: iapHoldId ? 'captureWalletHold' : resolvedOrgId ? 'deductOrgWallet' : 'recordSpend',
    });

    return { charged: true, rawCostUsd: totalCostUsd, chargeAmountCents };
  } catch (billingErr) {
    if (deductionLockAcquired && !moneyMoved) {
      await markBillingDeductionLock(db, operationId, 'failed', {
        failedAt: FieldValue.serverTimestamp(),
        error: billingErr instanceof Error ? billingErr.message : String(billingErr),
      }).catch((lockErr: unknown) => {
        logger.warn('[billing] Failed to mark deduction lock as failed', {
          operationId,
          error: lockErr instanceof Error ? lockErr.message : String(lockErr),
        });
      });
    }

    logger.warn('[billing] Deduction failed — operation result unaffected', {
      operationId,
      userId,
      error: billingErr instanceof Error ? billingErr.message : String(billingErr),
    });

    // Best-effort: release IAP hold to avoid permanently locked funds
    if (iapHoldId) {
      releaseWalletHold(db, iapHoldId).catch((e: unknown) => {
        logger.warn('[billing] Failed to release IAP hold after billing error', {
          holdId: iapHoldId,
          error: e instanceof Error ? e.message : String(e),
        });
      });
    }

    return { charged: false, rawCostUsd: 0, chargeAmountCents: 0 };
  }
}
