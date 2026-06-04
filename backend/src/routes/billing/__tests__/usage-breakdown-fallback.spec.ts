import { describe, expect, it } from 'vitest';
import { Types } from 'mongoose';
import type { UsageEventDocument } from '../../../models/analytics/usage-event.model.js';
import {
  buildBillingDeductionUsageEventDocuments,
  getOpaqueUsageEventOperationIds,
  getUsageEventLineKey,
  getUsageEventLineKeys,
  getUsageEventOperationIds,
} from '../usage-breakdown-fallback.js';

describe('usage breakdown BillingDeductions fallback', () => {
  it('extracts operation IDs from existing usage event metadata for de-duping', () => {
    const events = [
      {
        _id: new Types.ObjectId(),
        userId: 'user_1',
        feature: 'film-breakdown',
        quantity: 1,
        unitCostSnapshot: 120,
        costType: 'dynamic',
        currency: 'usd',
        stripePriceId: '',
        idempotencyKey: 'key_1',
        status: 'SENT',
        retryCount: 0,
        metadata: { operationId: 'op_existing' },
        createdAt: new Date('2026-06-04T10:00:00.000Z'),
        updatedAt: new Date('2026-06-04T10:00:00.000Z'),
      },
    ] as UsageEventDocument[];

    expect(getUsageEventOperationIds(events)).toEqual(new Set(['op_existing']));
  });

  it('separates opaque operation rows from line-level rows for partial fallback recovery', () => {
    const lineEvent = {
      _id: new Types.ObjectId(),
      userId: 'user_1',
      feature: 'film-breakdown',
      quantity: 1,
      unitCostSnapshot: 120,
      costType: 'dynamic',
      currency: 'usd',
      stripePriceId: '',
      idempotencyKey: 'key_1',
      status: 'SENT',
      retryCount: 0,
      metadata: { operationId: 'op_partial', lineFeature: 'film-breakdown', lineIndex: 1 },
      createdAt: new Date('2026-06-04T10:00:00.000Z'),
      updatedAt: new Date('2026-06-04T10:00:00.000Z'),
    } as UsageEventDocument;
    const opaqueEvent = {
      ...lineEvent,
      _id: new Types.ObjectId(),
      idempotencyKey: 'key_2',
      metadata: { operationId: 'op_opaque' },
    } as UsageEventDocument;

    expect(getUsageEventLineKey(lineEvent)).toBe('op_partial::film-breakdown::1');
    expect(getUsageEventLineKeys([lineEvent, opaqueEvent])).toEqual(
      new Set(['op_partial::film-breakdown::1'])
    );
    expect(getOpaqueUsageEventOperationIds([lineEvent, opaqueEvent])).toEqual(
      new Set(['op_opaque'])
    );
  });

  it('turns charged deduction lock line items into usage-event-like documents', () => {
    const chargedAt = new Date('2026-06-04T15:30:00.000Z');

    const docs = buildBillingDeductionUsageEventDocuments({
      operationId: 'op_missing',
      userId: 'user_2',
      teamId: 'team_2',
      organizationId: 'org_2',
      billedOwnerType: 'organization',
      billedOwnerId: 'org:org_2',
      chargedAt,
      chargeAmountCents: 250,
      rawCostUsd: 0.42,
      primaryFeature: 'agent-x',
      billableFeatures: ['film-breakdown', 'generate-graphic'],
      via: 'deductOrgWallet',
      chargeBreakdown: [
        { feature: 'film-breakdown', rawCostUsd: 0.2, chargeAmountCents: 100, quantity: 2 },
        { feature: 'generate-graphic', rawCostUsd: 0.22, chargeAmountCents: 150, quantity: 3 },
      ],
    });

    expect(docs).toHaveLength(2);
    expect(docs).toEqual([
      expect.objectContaining({
        userId: 'user_2',
        teamId: 'team_2',
        organizationId: 'org_2',
        billedOwnerType: 'organization',
        billedOwnerId: 'org:org_2',
        feature: 'film-breakdown',
        quantity: 1,
        unitCostSnapshot: 100,
        rawProviderCostUsd: 0.2,
        createdAt: chargedAt,
        metadata: expect.objectContaining({
          operationId: 'op_missing',
          billingDeductionFallback: true,
          lineFeature: 'film-breakdown',
          lineIndex: 1,
          lineCount: 2,
          lineQuantity: 2,
          settlementPath: 'deductOrgWallet',
        }),
      }),
      expect.objectContaining({
        userId: 'user_2',
        teamId: 'team_2',
        organizationId: 'org_2',
        feature: 'generate-graphic',
        unitCostSnapshot: 150,
        rawProviderCostUsd: 0.22,
        createdAt: chargedAt,
        metadata: expect.objectContaining({
          operationId: 'op_missing',
          billingDeductionFallback: true,
          lineFeature: 'generate-graphic',
          lineIndex: 2,
          lineCount: 2,
          lineQuantity: 3,
        }),
      }),
    ]);
  });
});
