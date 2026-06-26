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
import { getAndClearJobCostBreakdown } from '../agent/queue/job-cost-tracker.js';
import { calculateChargeAmount } from './pricing.service.js';
import { resolveBillableFeature, resolveBillableFeatures } from './feature-resolution.service.js';
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
   * Best-effort charge in cents when telemetry cost is unavailable after a
   * completed wallet-held job. This should come from the pre-authorized hold
   * estimate so we never charge more than the user already approved.
   */
  fallbackChargeAmountCents?: number;
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

interface BillingFeatureChargeLine {
  readonly feature: string;
  readonly rawCostUsd: number;
  readonly chargeAmountCents: number;
  readonly quantity: number;
  readonly multiplier: number;
  readonly overrideSource: 'coordinator' | 'feature' | 'default';
}

function splitRemainingAcrossFeatures(
  remainingUsd: number,
  features: readonly string[]
): Map<string, number> {
  const distribution = new Map<string, number>();
  if (remainingUsd <= 0 || features.length === 0) {
    return distribution;
  }

  const baseShare = remainingUsd / features.length;
  for (let index = 0; index < features.length; index++) {
    const feature = features[index]!;
    const allocated =
      index === features.length - 1 ? remainingUsd - baseShare * (features.length - 1) : baseShare;
    distribution.set(feature, allocated);
  }

  return distribution;
}

function buildFeatureRawCostMap(params: {
  totalCostUsd: number;
  telemetryByFeatureUsd: Record<string, number>;
  resolvedFeatures: readonly string[];
  primaryFeature: string;
}): { byFeatureUsd: Map<string, number>; usedFallbackSplit: boolean } {
  const { totalCostUsd, telemetryByFeatureUsd, resolvedFeatures, primaryFeature } = params;
  const byFeatureUsd = new Map<string, number>();
  const targetFeatures = resolvedFeatures.length > 0 ? resolvedFeatures : [primaryFeature];

  let attributedUsd = 0;
  for (const [feature, costUsd] of Object.entries(telemetryByFeatureUsd)) {
    if (!Number.isFinite(costUsd) || costUsd <= 0) continue;
    if (targetFeatures.includes(feature)) {
      byFeatureUsd.set(feature, (byFeatureUsd.get(feature) ?? 0) + costUsd);
      attributedUsd += costUsd;
    }
  }

  const unallocatedUsd = Math.max(0, totalCostUsd - attributedUsd);

  if (byFeatureUsd.size === 0) {
    const fallbackSplit = splitRemainingAcrossFeatures(totalCostUsd, targetFeatures);
    return {
      byFeatureUsd: fallbackSplit,
      usedFallbackSplit: fallbackSplit.size > 1,
    };
  }

  if (unallocatedUsd > 0) {
    const splitTargets = Array.from(byFeatureUsd.keys());
    const fallbackSplit = splitRemainingAcrossFeatures(unallocatedUsd, splitTargets);
    for (const [feature, allocated] of fallbackSplit.entries()) {
      byFeatureUsd.set(feature, (byFeatureUsd.get(feature) ?? 0) + allocated);
    }
  }

  return { byFeatureUsd, usedFallbackSplit: false };
}

function supportsFirestoreLock(db: Firestore): boolean {
  const maybeDb = db as Partial<Pick<Firestore, 'collection' | 'runTransaction'>>;
  return typeof maybeDb.collection === 'function' && typeof maybeDb.runTransaction === 'function';
}

function supportsFirestoreCollection(db: Firestore): boolean {
  const maybeDb = db as Partial<Pick<Firestore, 'collection'>>;
  return typeof maybeDb.collection === 'function';
}

function getMetadataTeamHint(
  metadata: Record<string, unknown> | undefined,
  allowedTeamIds: readonly string[]
): string | undefined {
  const allowed = new Set(allowedTeamIds);
  const keys = ['teamId', 'activeTeamId', 'sourceTeamId'] as const;

  for (const key of keys) {
    const value = metadata?.[key];
    if (typeof value === 'string' && value.length > 0) {
      if (allowed.size === 0 || allowed.has(value)) {
        return value;
      }
    }
  }

  return undefined;
}

async function resolveOrgTeamIdFromRoster(
  db: Firestore,
  userId: string,
  teamIds: readonly string[]
): Promise<string | undefined> {
  if (!supportsFirestoreCollection(db) || teamIds.length === 0) {
    return undefined;
  }

  const matchedTeamIds = new Set<string>();

  for (let index = 0; index < teamIds.length; index += 30) {
    const chunk = teamIds.slice(index, index + 30);
    if (chunk.length === 0) continue;

    const snap = await db.collection('RosterEntries').where('teamId', 'in', chunk).get();
    for (const doc of snap.docs) {
      const data = doc.data();
      if (data['status'] !== 'active') continue;
      if (data['userId'] !== userId) continue;

      const teamId = typeof data['teamId'] === 'string' ? data['teamId'] : undefined;
      if (teamId) {
        matchedTeamIds.add(teamId);
      }
    }
  }

  if (matchedTeamIds.size === 1) {
    return Array.from(matchedTeamIds)[0];
  }

  return undefined;
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
 * 2. Builds feature-level cost slices and applies markup per slice.
 * 3. Captures/debits the total cents once for wallet consistency.
 * 4. Writes per-feature audit-trail usage events.
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
    fallbackChargeAmountCents,
  } = input;
  let resolvedTeamId = input.teamId;
  let resolvedOrgId: string | undefined = input.organizationId;
  let billingOrgId: string | undefined;
  let deductionLockAcquired = false;
  let moneyMoved = false;

  try {
    const resolvedFeatures = resolveBillableFeatures({
      feature,
      coordinatorId,
      agentTools,
      successfulTools,
    });
    const primaryFeature = resolveBillableFeature({
      feature,
      coordinatorId,
      agentTools,
      successfulTools,
    });

    // Step 1: Resolve raw cost
    let totalCostUsd: number;
    let telemetryByFeatureUsd: Record<string, number> = {};
    let telemetryByFeatureCount: Record<string, number> = {};
    if (knownCostUsd != null && knownCostUsd > 0) {
      // Caller provided cost — still clear tracker to avoid stale entries
      getAndClearJobCostBreakdown(operationId);
      totalCostUsd = knownCostUsd;
      telemetryByFeatureUsd = { [primaryFeature]: knownCostUsd };
      telemetryByFeatureCount = { [primaryFeature]: 1 };
    } else {
      const telemetryBreakdown = getAndClearJobCostBreakdown(operationId);
      totalCostUsd = telemetryBreakdown.totalUsd;
      telemetryByFeatureUsd = telemetryBreakdown.byFeatureUsd;
      telemetryByFeatureCount = telemetryBreakdown.byFeatureCount;
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

    // Step 2: Zero cost — for completed wallet-held jobs, fall back to the
    // pre-authorized estimate when telemetry was unavailable. Otherwise release
    // any hold and bail.
    const fallbackChargeCents = Number.isInteger(fallbackChargeAmountCents)
      ? Math.max(0, fallbackChargeAmountCents ?? 0)
      : 0;
    const shouldUseFallbackCharge = totalCostUsd <= 0 && iapHoldId && fallbackChargeCents > 0;

    if (totalCostUsd <= 0 && !shouldUseFallbackCharge) {
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

    // Step 3: Apply markup per resolved feature/tool cost slice.
    const costSlices = shouldUseFallbackCharge
      ? { byFeatureUsd: new Map<string, number>([[primaryFeature, 0]]), usedFallbackSplit: false }
      : buildFeatureRawCostMap({
          totalCostUsd,
          telemetryByFeatureUsd,
          resolvedFeatures,
          primaryFeature,
        });
    const chargeLines: BillingFeatureChargeLine[] = [];

    if (shouldUseFallbackCharge) {
      chargeLines.push({
        feature: primaryFeature,
        rawCostUsd: 0,
        chargeAmountCents: fallbackChargeCents,
        quantity: 1,
        multiplier: 0,
        overrideSource: 'default',
      });
      logger.warn('[billing] Using wallet hold estimate because telemetry cost was zero', {
        operationId,
        userId,
        feature: primaryFeature,
        fallbackChargeCents,
      });
    } else {
      for (const [featureKey, rawCostUsd] of costSlices.byFeatureUsd.entries()) {
        if (rawCostUsd <= 0) continue;
        const lineCharge = await calculateChargeAmount(db, rawCostUsd, featureKey, coordinatorId);
        chargeLines.push({
          feature: featureKey,
          rawCostUsd,
          chargeAmountCents: lineCharge.chargeAmountCents,
          quantity: Math.max(1, telemetryByFeatureCount[featureKey] ?? 1),
          multiplier: lineCharge.multiplier,
          overrideSource: lineCharge.overrideSource,
        });
      }
    }

    const chargeAmountCents = chargeLines.reduce((sum, line) => sum + line.chargeAmountCents, 0);
    const uncappedChargeAmountCents = chargeAmountCents;
    let heldAmountCents: number | undefined;
    let overageChargeAmountCents = 0;

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

    // Step 4: Resolve billing target before any direct debit. Caller-supplied
    // organization/team IDs are attribution hints; the resolved target decides
    // who actually pays. This preserves personal billing for org admins/members
    // while still tagging usage to the active team/org.
    try {
      const target = await resolveBillingTarget(db, userId);
      resolvedTeamId = resolvedTeamId ?? target.context.teamId;
      resolvedOrgId = resolvedOrgId ?? target.context.organizationId ?? target.organizationId;

      if (target.type === 'organization') {
        billingOrgId = target.organizationId;
        resolvedOrgId = target.organizationId ?? resolvedOrgId;

        if (!resolvedTeamId) {
          resolvedTeamId =
            getMetadataTeamHint(metadata, target.teamIds ?? []) ??
            (await resolveOrgTeamIdFromRoster(db, userId, target.teamIds ?? [])) ??
            (target.teamIds?.length === 1 ? target.teamIds[0] : undefined);
        }

        if (!resolvedTeamId) {
          logger.warn('[billing] Missing canonical org team attribution for usage event', {
            operationId,
            userId,
            organizationId: target.organizationId,
            availableTeamIds: target.teamIds ?? [],
          });
        }
      }
    } catch {
      // Keep the legacy first-run fallback for onboarding paths where the org
      // billing target may not resolve yet but the caller supplied the org.
      billingOrgId = input.organizationId;
      resolvedTeamId = resolvedTeamId ?? undefined;
    }

    const effectiveTeamId =
      resolvedTeamId && resolvedTeamId !== userId ? resolvedTeamId : undefined;

    // Step 4b: Deduct funds
    if (iapHoldId && billingOrgId) {
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
      await deductOrgWallet(db, billingOrgId, userId, effectiveTeamId, chargeAmountCents);
    } else if (iapHoldId) {
      // Background job mode (individual billing): capture the pre-authorised hold
      const captureResult = await captureWalletHold(db, iapHoldId, chargeAmountCents);
      if (captureResult) {
        heldAmountCents = captureResult.heldAmountCents;
        overageChargeAmountCents = captureResult.overageChargeAmountCents;
      }
    } else if (billingOrgId) {
      // Org billing: debit the org wallet and mirror spend onto user/team trackers.
      await deductOrgWallet(db, billingOrgId, userId, effectiveTeamId, chargeAmountCents);
    } else {
      // Individual / IAP wallet billing
      await recordSpend(db, userId, chargeAmountCents, effectiveTeamId);
    }
    moneyMoved = true;

    await markBillingDeductionLock(db, operationId, 'charged', {
      userId,
      chargedAt: FieldValue.serverTimestamp(),
      chargeAmountCents,
      rawCostUsd: totalCostUsd,
      primaryFeature,
      billableFeatures: [...resolvedFeatures],
      billedOwnerType: billingOrgId ? 'organization' : 'individual',
      billedOwnerId: billingOrgId ? `org:${billingOrgId}` : userId,
      ...(effectiveTeamId ? { teamId: effectiveTeamId } : {}),
      ...(resolvedOrgId ? { organizationId: resolvedOrgId } : {}),
      chargeBreakdown: chargeLines.map((line) => ({
        feature: line.feature,
        rawCostUsd: line.rawCostUsd,
        chargeAmountCents: line.chargeAmountCents,
        quantity: line.quantity,
        ...(Number.isFinite(line.multiplier) ? { multiplier: line.multiplier } : {}),
        ...(line.overrideSource ? { overrideSource: line.overrideSource } : {}),
      })),
      ...(heldAmountCents !== undefined ? { heldAmountCents } : {}),
      ...(overageChargeAmountCents > 0
        ? { uncappedChargeAmountCents, overageChargeAmountCents }
        : {}),
      via: iapHoldId ? 'captureWalletHold' : billingOrgId ? 'deductOrgWallet' : 'recordSpend',
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
      ...(resolvedOrgId ? { teamAttributionStatus: effectiveTeamId ? 'resolved' : 'missing' } : {}),
      primaryFeature,
      billableFeatures: [...resolvedFeatures],
      // Canonical trail used by usage breakdown routes to keep labels
      // tool-first and avoid generic execution fallbacks.
      toolTrail: [...resolvedFeatures],
      ...(resolvedFeatures.length > 1 ? { subTools: resolvedFeatures.slice(1) } : {}),
      ...(metadata?.['agentTools'] === undefined && agentTools
        ? { agentTools: [...agentTools] }
        : {}),
      ...(metadata?.['successfulTools'] === undefined && successfulTools
        ? { successfulTools: [...successfulTools] }
        : {}),
      chargeBreakdown: chargeLines.map((line) => ({
        feature: line.feature,
        rawCostUsd: line.rawCostUsd,
        chargeAmountCents: line.chargeAmountCents,
        quantity: line.quantity,
        ...(Number.isFinite(line.multiplier) ? { multiplier: line.multiplier } : {}),
        ...(line.overrideSource ? { overrideSource: line.overrideSource } : {}),
      })),
      ...(heldAmountCents !== undefined ? { heldAmountCents } : {}),
      ...(overageChargeAmountCents > 0
        ? { uncappedChargeAmountCents, overageChargeAmountCents }
        : {}),
      fallbackSplitApplied: costSlices.usedFallbackSplit,
      fallbackChargeApplied: shouldUseFallbackCharge,
    };

    // Step 5: Write per-feature audit trail usage events.
    try {
      const billedOwnerType = billingOrgId ? 'organization' : 'individual';
      const billedOwnerId = billingOrgId ? `org:${billingOrgId}` : userId;
      const usageLines = chargeLines.length > 0 ? chargeLines : [];

      for (let index = 0; index < usageLines.length; index++) {
        const line = usageLines[index]!;
        const usageJobId =
          usageLines.length === 1 ? operationId : `${operationId}:${line.feature}:${index + 1}`;
        await recordUsageEvent(
          {
            userId,
            ...(effectiveTeamId ? { teamId: effectiveTeamId } : {}),
            ...(resolvedOrgId ? { organizationId: resolvedOrgId } : {}),
            billedOwnerType,
            billedOwnerId,
            feature: line.feature,
            quantity: 1,
            unitCostSnapshot: line.chargeAmountCents,
            currency: 'usd',
            stripePriceId: '',
            jobId: usageJobId,
            dynamicCostCents: line.chargeAmountCents,
            rawProviderCostUsd: line.rawCostUsd,
            status: UsageEventStatus.SENT,
            publish: false,
            metadata: {
              ...usageMetadata,
              primaryFeature,
              lineFeature: line.feature,
              lineIndex: index + 1,
              lineCount: usageLines.length,
              lineQuantity: line.quantity,
              settlementPath: iapHoldId
                ? overageChargeAmountCents > 0
                  ? 'wallet-hold-plus-overage'
                  : 'wallet-hold-capture'
                : billingOrgId
                  ? 'org-wallet-debit'
                  : 'wallet-or-spend-record',
              alreadySettled: true,
            },
          },
          environment ?? 'production'
        );
      }
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
      chargeBreakdown: chargeLines,
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

    const billingErrorMessage =
      billingErr instanceof Error ? billingErr.message : String(billingErr);
    const billingFailureCode = billingErrorMessage.toLowerCase().includes('insufficient')
      ? 'insufficient_balance'
      : 'charge_failed';

    logger.warn('[billing] Charge collection failed after operation completion', {
      operationId,
      userId,
      billingFailureCode,
      error: billingErrorMessage,
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
