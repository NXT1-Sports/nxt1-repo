/**
 * @fileoverview Helicone Webhook Service
 * @module @nxt1/backend/modules/billing
 *
 * Handles async cost reconciliation from Helicone's webhook callbacks.
 * When an AI operation completes, Helicone sends the exact downstream cost.
 * This service compares that with the initially charged amount and issues
 * a "true-up" or "true-down" ledger adjustment if they differ.
 *
 * This ensures users are never over- or under-charged, especially for
 * aborted streams where client-side token counting is inaccurate.
 */

import type { Firestore } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import { createHmac, timingSafeEqual } from 'crypto';
import { Types } from 'mongoose';
import { logger } from '../../utils/logger.js';
import { COLLECTIONS } from './config.js';
import { resolveAICost } from './cost-resolver.service.js';
import { getBillingContext } from './budget.service.js';
import type { UsageEvent } from './types/index.js';
import { UsageEventModel } from '../../models/usage-event.model.js';

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * Helicone webhook payload — the fields we care about.
 * Helicone sends a JSON body with request/response metadata.
 */
export interface HeliconeWebhookPayload {
  /** Unique request ID from Helicone */
  request_id: string;
  /** User-provided session ID (we set this to our jobId / idempotencyKey) */
  user_id?: string;
  /** The model used (e.g. 'anthropic/claude-sonnet-4') */
  model?: string;
  /** Total cost in USD as reported by Helicone */
  total_cost?: number;
  /** Prompt tokens */
  prompt_tokens?: number;
  /** Completion tokens */
  completion_tokens?: number;
  /** Total tokens */
  total_tokens?: number;
  /** HTTP status code of the LLM response */
  status?: number;
  /** Custom properties we set via Helicone headers */
  properties?: Record<string, string>;
  /** Timestamp of the request */
  created_at?: string;
}

/**
 * Result of processing a Helicone webhook event.
 */
export interface HeliconeReconciliationResult {
  /** Whether reconciliation was performed */
  reconciled: boolean;
  /** The usage event ID matched */
  usageEventId?: string;
  /** Original charged amount in cents */
  originalCostCents?: number;
  /** Helicone-verified cost in cents (after margin) */
  verifiedCostCents?: number;
  /** Adjustment applied in cents (positive = credit, negative = additional charge) */
  adjustmentCents?: number;
  /** Reason if reconciliation was skipped */
  reason?: string;
}

// ─── Webhook Signature Verification ─────────────────────────────────────────

/**
 * Verify Helicone webhook signature.
 * Helicone signs payloads with HMAC-SHA256 using the webhook signing secret.
 *
 * @param payload Raw request body as string
 * @param signature The `helicone-signature` header value
 * @returns true if signature is valid
 */
export function verifyHeliconeSignature(payload: string, signature: string): boolean {
  const secret = process.env['HELICONE_WEBHOOK_SECRET'];

  if (!secret) {
    logger.warn('[helicone-webhook] No HELICONE_WEBHOOK_SECRET configured, skipping verification');
    return false;
  }

  try {
    const expected = createHmac('sha256', secret).update(payload).digest('hex');
    const sigBuffer = Buffer.from(signature, 'hex');
    const expectedBuffer = Buffer.from(expected, 'hex');

    if (sigBuffer.length !== expectedBuffer.length) return false;

    return timingSafeEqual(sigBuffer, expectedBuffer);
  } catch {
    logger.error('[helicone-webhook] Signature verification failed');
    return false;
  }
}

// ─── Reconciliation Logic ───────────────────────────────────────────────────

/**
 * Process a Helicone webhook event and reconcile costs.
 *
 * Flow:
 *   1. Extract the Helicone-verified raw cost in USD
 *   2. Find the corresponding usage event by matching the user_id (our jobId)
 *      or custom properties.helicone_session_id
 *   3. Compare the verified cost (after margin) vs. the originally charged amount
 *   4. If they differ beyond a 1-cent tolerance, issue a ledger adjustment
 *
 * @param db Firestore instance
 * @param payload The Helicone webhook payload
 * @returns Reconciliation result
 */
export async function processHeliconeWebhook(
  db: Firestore,
  payload: HeliconeWebhookPayload
): Promise<HeliconeReconciliationResult> {
  const { request_id, total_cost, properties, user_id } = payload;

  if (total_cost == null || total_cost < 0) {
    return { reconciled: false, reason: 'No valid cost in Helicone payload' };
  }

  // Resolve the Helicone-verified cost into business-priced cents
  const verifiedCostCents = resolveAICost(total_cost);

  // Find the matching usage event
  // We correlate via the custom property or user_id field (set in Helicone headers)
  const jobId = properties?.['nxt1_job_id'] || user_id;

  if (!jobId) {
    return { reconciled: false, reason: 'No job ID in Helicone payload to correlate' };
  }

  // Look up usage event by metadata.heliconeRequestId or by metadata.jobId
  let usageEvent: UsageEvent | null = null;
  let usageEventId: string | null = null;

  // Strategy 1: Match by metadata.heliconeRequestId
  if (request_id) {
    const doc = await UsageEventModel.findOne({
      'metadata.heliconeRequestId': request_id,
    }).lean();

    if (doc) {
      usageEventId = (doc._id as Types.ObjectId).toString();
      usageEvent = { id: usageEventId, ...(doc as unknown as Omit<UsageEvent, 'id'>) };
    }
  }

  // Strategy 2: Match by metadata.jobId
  if (!usageEvent) {
    const doc = await UsageEventModel.findOne({
      'metadata.jobId': jobId,
    }).lean();

    if (doc) {
      usageEventId = (doc._id as Types.ObjectId).toString();
      usageEvent = { id: usageEventId, ...(doc as unknown as Omit<UsageEvent, 'id'>) };
    }
  }

  if (!usageEvent || !usageEventId) {
    logger.info('[helicone-webhook] No matching usage event found', {
      request_id,
      jobId,
    });
    return { reconciled: false, reason: `No matching usage event for jobId: ${jobId}` };
  }

  // Compare original charged cost vs. Helicone-verified cost
  const originalCostCents = usageEvent.unitCostSnapshot * usageEvent.quantity;

  // Tolerance: don't reconcile if the difference is ≤ 1 cent
  const diffCents = verifiedCostCents - originalCostCents;

  if (Math.abs(diffCents) <= 1) {
    logger.info('[helicone-webhook] Costs match within tolerance', {
      usageEventId: usageEvent.id,
      originalCostCents,
      verifiedCostCents,
    });

    // Still update the event with the verified cost for audit trail
    await UsageEventModel.findByIdAndUpdate(usageEventId, {
      $set: {
        'metadata.heliconeVerifiedCostUsd': total_cost,
        'metadata.heliconeVerifiedCostCents': verifiedCostCents,
        'metadata.heliconeRequestId': request_id,
        'metadata.heliconeReconciled': true,
        'metadata.heliconeReconciledAt': new Date().toISOString(),
        updatedAt: new Date(),
      },
    });

    return {
      reconciled: true,
      usageEventId: usageEvent.id,
      originalCostCents,
      verifiedCostCents,
      adjustmentCents: 0,
      reason: 'Within tolerance — no adjustment needed',
    };
  }

  // Apply the adjustment
  const adjustmentCents = -diffCents; // positive = credit to user, negative = additional charge

  logger.info('[helicone-webhook] Cost mismatch — applying adjustment', {
    usageEventId: usageEvent.id,
    originalCostCents,
    verifiedCostCents,
    adjustmentCents,
    userId: usageEvent.userId,
  });

  // Update the usage event with reconciliation data
  await UsageEventModel.findByIdAndUpdate(usageEventId, {
    $set: {
      unitCostSnapshot: verifiedCostCents,
      'metadata.heliconeVerifiedCostUsd': total_cost,
      'metadata.heliconeVerifiedCostCents': verifiedCostCents,
      'metadata.heliconeRequestId': request_id,
      'metadata.heliconeReconciled': true,
      'metadata.heliconeReconciledAt': new Date().toISOString(),
      'metadata.heliconeAdjustmentCents': adjustmentCents,
      'metadata.originalCostCents': originalCostCents,
      updatedAt: new Date(),
    },
  });

  // Apply the adjustment to the user's billing context
  await applyReconciliationAdjustment(db, usageEvent.userId, adjustmentCents, usageEvent.id);

  return {
    reconciled: true,
    usageEventId: usageEvent.id,
    originalCostCents,
    verifiedCostCents,
    adjustmentCents,
  };
}

/**
 * Apply a reconciliation adjustment to the user's billing context.
 *
 * If adjustmentCents > 0 → credit (we overcharged, give money back)
 * If adjustmentCents < 0 → additional charge (we undercharged)
 *
 * For IAP wallet users: adjust walletBalanceCents
 * For Stripe users: adjust currentPeriodSpend
 */
async function applyReconciliationAdjustment(
  db: Firestore,
  userId: string,
  adjustmentCents: number,
  usageEventId: string
): Promise<void> {
  const billingContext = await getBillingContext(db, userId);

  if (!billingContext) {
    logger.warn('[helicone-webhook] No billing context for adjustment', {
      userId,
      adjustmentCents,
      usageEventId,
    });
    return;
  }

  const docRef = db.collection(COLLECTIONS.BILLING_CONTEXTS).doc(userId);
  const splitField =
    billingContext.billingEntity === 'organization'
      ? 'orgCurrentPeriodSpend'
      : 'personalCurrentPeriodSpend';
  const updates: Record<string, unknown> = {
    currentPeriodSpend: FieldValue.increment(-adjustmentCents),
    [splitField]: FieldValue.increment(-adjustmentCents),
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (billingContext.paymentProvider === 'iap') {
    // IAP wallet: credit positive adjustments back to wallet, debit negative ones
    // Positive adjustment = we overcharged → add back to wallet, reduce spend
    // Negative adjustment = we undercharged → deduct from wallet, increase spend
    updates['walletBalanceCents'] = FieldValue.increment(adjustmentCents);
  } else {
    // Stripe billing: just adjust the spend tracking
    // The actual Stripe invoice is handled separately
  }

  await docRef.update(updates);

  logger.info('[helicone-webhook] Reconciliation adjustment applied', {
    userId,
    adjustmentCents,
    usageEventId,
    provider: billingContext.paymentProvider,
    splitField,
  });
}
