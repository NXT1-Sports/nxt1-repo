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

import type { Firestore } from 'firebase-admin/firestore';
import { getAndClearJobCost } from '../agent/queue/job-cost-tracker.js';
import { calculateChargeAmount } from './pricing.service.js';
import {
  recordSpend,
  deductOrgWallet,
  captureWalletHold,
  releaseWalletHold,
  resolveBillingTarget,
} from './budget.service.js';
import { recordUsageEvent } from './usage.service.js';
import { UsageFeature } from './types/index.js';
import { logger } from '../../utils/logger.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface BillingDeductionInput {
  /** Firestore instance for billing reads/writes */
  db: Firestore;
  /** The authenticated user being billed */
  userId: string;
  /** Operation ID used as the job-cost-tracker key (must match telemetryContext.operationId) */
  operationId: string;
  /** Feature label for the usage event */
  feature: UsageFeature;
  /** Environment tag passed to recordUsageEvent */
  environment?: 'production' | 'staging';
  /**
   * If present, we capture/release an existing IAP wallet hold (background job mode).
   * If absent, we use direct `recordSpend()` (synchronous route mode).
   */
  iapHoldId?: string;
  /** Team ID for the usage event (required for org dashboard queries). When omitted, the pipeline resolves it via resolveBillingTarget. */
  teamId?: string;
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
  const { db, userId, operationId, feature, environment, iapHoldId, metadata, knownCostUsd } =
    input;
  let resolvedTeamId = input.teamId;
  let resolvedOrgId: string | undefined;

  try {
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
      feature,
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

    // Step 3: Apply platform markup
    const { chargeAmountCents } = await calculateChargeAmount(db, totalCostUsd, feature);

    if (chargeAmountCents <= 0) {
      // Edge case: markup rounds to zero — release hold
      if (iapHoldId) {
        await releaseWalletHold(db, iapHoldId);
      }
      return { charged: false, rawCostUsd: totalCostUsd, chargeAmountCents: 0 };
    }

    // Step 4: Resolve billing target before any direct debit so org-billed users
    // always debit the org wallet, even when the caller already passed a teamId.
    if (!iapHoldId || !resolvedTeamId) {
      try {
        const target = await resolveBillingTarget(db, userId);
        resolvedTeamId = resolvedTeamId ?? target.context.teamId ?? target.teamIds?.[0] ?? userId;
        if (target.type === 'organization') {
          resolvedOrgId = target.organizationId;
        }
      } catch {
        resolvedTeamId = resolvedTeamId ?? userId;
      }
    }

    const effectiveTeamId =
      resolvedTeamId && resolvedTeamId !== userId ? resolvedTeamId : undefined;

    // Step 4b: Deduct funds
    if (iapHoldId) {
      // Background job mode: capture the pre-authorized hold
      await captureWalletHold(db, iapHoldId, chargeAmountCents);
    } else if (resolvedOrgId) {
      // Org billing: debit the org wallet and mirror spend onto user/team trackers.
      await deductOrgWallet(db, resolvedOrgId, userId, effectiveTeamId, chargeAmountCents);
    } else {
      // Individual / IAP wallet billing
      await recordSpend(db, userId, chargeAmountCents, effectiveTeamId);
    }

    // Step 5: Write audit trail usage event
    recordUsageEvent(
      {
        userId,
        teamId: resolvedTeamId,
        feature,
        quantity: 1,
        unitCostSnapshot: chargeAmountCents,
        currency: 'usd',
        stripePriceId: '',
        jobId: operationId,
        dynamicCostCents: chargeAmountCents,
        rawProviderCostUsd: totalCostUsd,
        metadata: { operationId, ...metadata },
      },
      environment ?? 'production'
    ).catch((e: unknown) => {
      logger.warn(
        '[billing] Failed to write usage event audit trail — spend was already recorded',
        {
          operationId,
          error: e instanceof Error ? e.message : String(e),
        }
      );
    });

    logger.info('[billing] Deduction completed', {
      operationId,
      userId,
      rawCostUsd: totalCostUsd,
      chargeAmountCents,
      feature,
      via: iapHoldId ? 'captureWalletHold' : resolvedOrgId ? 'deductOrgWallet' : 'recordSpend',
    });

    return { charged: true, rawCostUsd: totalCostUsd, chargeAmountCents };
  } catch (billingErr) {
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
