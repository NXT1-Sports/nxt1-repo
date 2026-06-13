import { Types } from 'mongoose';
import type { UsageEventDocument } from '../../models/analytics/usage-event.model.js';

export interface BillingDeductionFallbackLine {
  readonly feature?: string;
  readonly rawCostUsd?: number;
  readonly chargeAmountCents: number;
  readonly quantity?: number;
  readonly multiplier?: number;
  readonly overrideSource?: string;
}

export interface BillingDeductionFallbackLock {
  readonly operationId: string;
  readonly userId: string;
  readonly holdId?: string;
  readonly teamId?: string;
  readonly organizationId?: string;
  readonly billedOwnerType?: 'individual' | 'organization';
  readonly billedOwnerId?: string;
  readonly chargedAt: Date;
  readonly chargeAmountCents: number;
  readonly rawCostUsd?: number;
  readonly primaryFeature?: string;
  readonly billableFeatures?: readonly string[];
  readonly chargeBreakdown?: readonly BillingDeductionFallbackLine[];
  readonly via?: string;
}

interface BillingDeductionResolvedFallbackLine {
  readonly feature: string;
  readonly rawCostUsd?: number;
  readonly chargeAmountCents: number;
  readonly quantity: number;
}

function firstUsableFeature(lock: BillingDeductionFallbackLock): string | undefined {
  if (lock.primaryFeature?.trim()) {
    return lock.primaryFeature;
  }

  return lock.billableFeatures?.find((feature) => feature.trim().length > 0);
}

function buildFallbackLines(
  lock: BillingDeductionFallbackLock
): readonly BillingDeductionResolvedFallbackLine[] {
  const fallbackFeature = firstUsableFeature(lock);
  const explicitLines = lock.chargeBreakdown
    ?.map((line, index) => {
      const feature =
        line.feature?.trim() || lock.billableFeatures?.[index]?.trim() || fallbackFeature;
      return {
        feature: feature ?? '',
        ...(line.rawCostUsd !== undefined ? { rawCostUsd: line.rawCostUsd } : {}),
        chargeAmountCents: line.chargeAmountCents,
        quantity:
          Number.isInteger(line.quantity) && line.quantity && line.quantity > 0 ? line.quantity : 1,
      };
    })
    .filter(
      (line): line is BillingDeductionResolvedFallbackLine =>
        Boolean(line.feature) &&
        Number.isFinite(line.chargeAmountCents) &&
        line.chargeAmountCents > 0
    );

  if (explicitLines && explicitLines.length > 0) {
    return explicitLines;
  }

  if (!fallbackFeature || lock.chargeAmountCents <= 0) {
    return [];
  }

  return [{ feature: fallbackFeature, chargeAmountCents: lock.chargeAmountCents, quantity: 1 }];
}

export function getUsageEventOperationIds(
  eventsDocs: readonly UsageEventDocument[]
): ReadonlySet<string> {
  const operationIds = new Set<string>();

  for (const doc of eventsDocs) {
    const operationId = doc.metadata?.['operationId'];
    if (typeof operationId === 'string' && operationId.trim().length > 0) {
      operationIds.add(operationId);
    }
  }

  return operationIds;
}

export function getUsageEventLineKey(doc: UsageEventDocument): string | null {
  const metadata = doc.metadata as Record<string, unknown> | undefined;
  const operationId = metadata?.['operationId'];
  const lineFeature = metadata?.['lineFeature'];
  const lineIndex = metadata?.['lineIndex'];

  if (
    typeof operationId !== 'string' ||
    operationId.trim().length === 0 ||
    typeof lineFeature !== 'string' ||
    lineFeature.trim().length === 0 ||
    typeof lineIndex !== 'number' ||
    !Number.isFinite(lineIndex)
  ) {
    return null;
  }

  return `${operationId}::${lineFeature}::${lineIndex}`;
}

export function getUsageEventLineKeys(
  eventsDocs: readonly UsageEventDocument[]
): ReadonlySet<string> {
  const lineKeys = new Set<string>();

  for (const doc of eventsDocs) {
    const lineKey = getUsageEventLineKey(doc);
    if (lineKey) {
      lineKeys.add(lineKey);
    }
  }

  return lineKeys;
}

export function getOpaqueUsageEventOperationIds(
  eventsDocs: readonly UsageEventDocument[]
): ReadonlySet<string> {
  const operationIds = new Set<string>();

  for (const doc of eventsDocs) {
    const operationId = doc.metadata?.['operationId'];
    if (
      typeof operationId === 'string' &&
      operationId.trim().length > 0 &&
      getUsageEventLineKey(doc) === null
    ) {
      operationIds.add(operationId);
    }
  }

  return operationIds;
}

export function buildBillingDeductionUsageEventDocuments(
  lock: BillingDeductionFallbackLock
): UsageEventDocument[] {
  const lines = buildFallbackLines(lock);
  const billedOwnerType =
    lock.billedOwnerType ?? (lock.organizationId ? 'organization' : 'individual');
  const billedOwnerId =
    lock.billedOwnerId ?? (lock.organizationId ? `org:${lock.organizationId}` : lock.userId);

  return lines.map((line, index) => ({
    _id: new Types.ObjectId(),
    userId: lock.userId,
    ...(lock.teamId ? { teamId: lock.teamId } : {}),
    ...(lock.organizationId ? { organizationId: lock.organizationId } : {}),
    billedOwnerType,
    billedOwnerId,
    feature: line.feature,
    quantity: 1,
    unitCostSnapshot: line.chargeAmountCents,
    costType: 'dynamic',
    rawProviderCostUsd: line.rawCostUsd ?? lock.rawCostUsd,
    currency: 'usd',
    stripePriceId: '',
    idempotencyKey: `billing-deduction-fallback:${lock.operationId}:${line.feature}:${index + 1}`,
    status: 'SENT',
    retryCount: 0,
    metadata: {
      operationId: lock.operationId,
      billingDeductionFallback: true,
      primaryFeature: lock.primaryFeature ?? line.feature,
      billableFeatures: lock.billableFeatures ? [...lock.billableFeatures] : [line.feature],
      lineFeature: line.feature,
      lineIndex: index + 1,
      lineCount: lines.length,
      lineQuantity: line.quantity,
      settlementPath: lock.via,
    },
    createdAt: lock.chargedAt,
    updatedAt: lock.chargedAt,
  }));
}
