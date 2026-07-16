import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';

const {
  mockEnqueueIndividualPurchaseClosedWonMarketingOutboxEvent,
  mockEnqueueIndividualPurchaseExpansionMarketingOutboxEvent,
  mockEnqueueOrgPurchaseClosedWonMarketingOutboxEvent,
  mockEnqueueOrgPurchaseExpansionMarketingOutboxEvent,
} = vi.hoisted(() => ({
  mockEnqueueIndividualPurchaseClosedWonMarketingOutboxEvent: vi.fn(),
  mockEnqueueIndividualPurchaseExpansionMarketingOutboxEvent: vi.fn(),
  mockEnqueueOrgPurchaseClosedWonMarketingOutboxEvent: vi.fn(),
  mockEnqueueOrgPurchaseExpansionMarketingOutboxEvent: vi.fn(),
}));

vi.mock('../../outbox/marketing-outbox.service.js', () => ({
  enqueueIndividualPurchaseClosedWonMarketingOutboxEvent:
    mockEnqueueIndividualPurchaseClosedWonMarketingOutboxEvent,
  enqueueIndividualPurchaseExpansionMarketingOutboxEvent:
    mockEnqueueIndividualPurchaseExpansionMarketingOutboxEvent,
  enqueueOrgPurchaseClosedWonMarketingOutboxEvent:
    mockEnqueueOrgPurchaseClosedWonMarketingOutboxEvent,
  enqueueOrgPurchaseExpansionMarketingOutboxEvent:
    mockEnqueueOrgPurchaseExpansionMarketingOutboxEvent,
  enqueueOrgSubscriptionChurnedMarketingOutboxEvent: vi.fn(),
  enqueueSignupCompletedMarketingOutboxEvent: vi.fn(),
  enqueueTrialCreditsFinishedMarketingOutboxEvent: vi.fn(),
  enqueueUsageStartedMarketingOutboxEvent: vi.fn(),
}));

import { projectWalletFundedDomainEventToMarketing } from '../marketing-domain-event.projector.js';

describe('projectWalletFundedDomainEventToMarketing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnqueueIndividualPurchaseClosedWonMarketingOutboxEvent.mockResolvedValue({
      eventKey: 'b2c-closed-won',
      eventType: 'billing.purchase.closed_won.individual',
      deduplicated: false,
    });
    mockEnqueueIndividualPurchaseExpansionMarketingOutboxEvent.mockResolvedValue({
      eventKey: 'b2c-expansion',
      eventType: 'billing.purchase.expansion.individual',
      deduplicated: false,
    });
    mockEnqueueOrgPurchaseClosedWonMarketingOutboxEvent.mockResolvedValue({
      eventKey: 'b2b-closed-won',
      eventType: 'billing.purchase.closed_won.organization',
      deduplicated: false,
    });
    mockEnqueueOrgPurchaseExpansionMarketingOutboxEvent.mockResolvedValue({
      eventKey: 'b2b-expansion',
      eventType: 'billing.purchase.expansion.organization',
      deduplicated: false,
    });
  });

  it('skips marketing projections for manual org credits', async () => {
    const projections = await projectWalletFundedDomainEventToMarketing({
      db: {} as Firestore,
      environment: 'production',
      billingOwnerType: 'organization',
      organizationId: 'org_123',
      amountCents: 5000,
      source: 'manual_credit',
    });

    expect(projections).toEqual([]);
    expect(mockEnqueueOrgPurchaseClosedWonMarketingOutboxEvent).not.toHaveBeenCalled();
    expect(mockEnqueueOrgPurchaseExpansionMarketingOutboxEvent).not.toHaveBeenCalled();
  });

  it('publishes closed-won only for org auto top-ups', async () => {
    const projections = await projectWalletFundedDomainEventToMarketing({
      db: {} as Firestore,
      environment: 'production',
      billingOwnerType: 'organization',
      organizationId: 'org_123',
      amountCents: 5000,
      source: 'auto_topup',
      initiatedByUserId: 'admin_123',
    });

    expect(projections).toHaveLength(1);
    expect(projections[0]).toMatchObject({
      projector: 'marketing',
      eventKey: 'b2b-closed-won',
    });
    expect(mockEnqueueOrgPurchaseClosedWonMarketingOutboxEvent).toHaveBeenCalledTimes(1);
    expect(mockEnqueueOrgPurchaseExpansionMarketingOutboxEvent).not.toHaveBeenCalled();
  });

  it('publishes closed-won and expansion for individual wallet funding', async () => {
    const projections = await projectWalletFundedDomainEventToMarketing({
      db: {} as Firestore,
      environment: 'production',
      billingOwnerType: 'individual',
      userId: 'user_123',
      amountCents: 1500,
      source: 'stripe_checkout',
    });

    expect(projections).toHaveLength(2);
    expect(projections.map((projection) => projection.eventKey)).toEqual([
      'b2c-closed-won',
      'b2c-expansion',
    ]);
    expect(mockEnqueueIndividualPurchaseClosedWonMarketingOutboxEvent).toHaveBeenCalledTimes(1);
    expect(mockEnqueueIndividualPurchaseExpansionMarketingOutboxEvent).toHaveBeenCalledTimes(1);
  });
});
