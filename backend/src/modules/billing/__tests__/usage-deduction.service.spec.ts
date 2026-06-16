import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';

const mockGetAndClearJobCostBreakdown = vi.fn();
const mockCalculateChargeAmount = vi.fn();
const mockRecordSpend = vi.fn();
const mockDeductOrgWallet = vi.fn();
const mockCaptureWalletHold = vi.fn();
const mockReleaseWalletHold = vi.fn();
const mockResolveBillingTarget = vi.fn();
const mockRecordUsageEvent = vi.fn();

vi.mock('../../agent/queue/job-cost-tracker.js', () => ({
  getAndClearJobCostBreakdown: mockGetAndClearJobCostBreakdown,
}));

vi.mock('../pricing.service.js', () => ({
  calculateChargeAmount: mockCalculateChargeAmount,
}));

vi.mock('../budget.service.js', () => ({
  recordSpend: mockRecordSpend,
  deductOrgWallet: mockDeductOrgWallet,
  captureWalletHold: mockCaptureWalletHold,
  releaseWalletHold: mockReleaseWalletHold,
  resolveBillingTarget: mockResolveBillingTarget,
}));

vi.mock('../usage.service.js', () => ({
  recordUsageEvent: mockRecordUsageEvent,
  UsageEventStatus: {
    PENDING: 'PENDING',
    PROCESSING: 'PROCESSING',
    SENT: 'SENT',
    FAILED: 'FAILED',
  },
}));

vi.mock('../../../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

describe('executeBillingDeduction', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockGetAndClearJobCostBreakdown.mockReturnValue({
      totalUsd: 0,
      byFeatureUsd: {},
      byFeatureCount: {},
    });
    mockCalculateChargeAmount.mockResolvedValue({ chargeAmountCents: 175 });
    mockRecordSpend.mockResolvedValue(undefined);
    mockDeductOrgWallet.mockResolvedValue(undefined);
    mockCaptureWalletHold.mockResolvedValue(undefined);
    mockReleaseWalletHold.mockResolvedValue(undefined);
    mockRecordUsageEvent.mockResolvedValue(undefined);
  });

  it('deducts the org wallet for direct billing even when teamId is already provided', async () => {
    const db = {} as Firestore;

    mockResolveBillingTarget.mockResolvedValue({
      type: 'organization',
      billingUserId: 'org:org_123',
      organizationId: 'org_123',
      teamIds: ['team_resolved'],
      context: { teamId: 'team_ctx' },
    });

    const { executeBillingDeduction } = await import('../usage-deduction.service.js');

    const result = await executeBillingDeduction({
      db,
      userId: 'user_123',
      operationId: 'op_123',
      feature: 'activity-usage',
      coordinatorId: 'brand_coordinator',
      teamId: 'team_supplied',
      knownCostUsd: 1.25,
    });

    expect(result).toEqual({ charged: true, rawCostUsd: 1.25, chargeAmountCents: 175 });
    expect(mockCalculateChargeAmount).toHaveBeenCalledWith(
      db,
      1.25,
      'activity-usage',
      'brand_coordinator'
    );
    expect(mockResolveBillingTarget).toHaveBeenCalledWith(db, 'user_123');
    expect(mockDeductOrgWallet).toHaveBeenCalledWith(
      db,
      'org_123',
      'user_123',
      'team_supplied',
      175
    );
    expect(mockRecordSpend).not.toHaveBeenCalled();
    expect(mockRecordUsageEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user_123',
        teamId: 'team_supplied',
        jobId: 'op_123',
        dynamicCostCents: 175,
        rawProviderCostUsd: 1.25,
        metadata: expect.not.objectContaining({
          billingLineItemCount: expect.any(Number),
        }),
      }),
      'production'
    );
  });

  it('records one usage event with every successful billable onboarding action in metadata', async () => {
    const db = {} as Firestore;

    mockCalculateChargeAmount.mockResolvedValueOnce({ chargeAmountCents: 103 });
    mockResolveBillingTarget.mockResolvedValue({
      type: 'individual',
      billingUserId: 'user_multi',
      context: { teamId: undefined },
      teamIds: [],
    });

    const { executeBillingDeduction } = await import('../usage-deduction.service.js');

    const result = await executeBillingDeduction({
      db,
      userId: 'user_multi',
      operationId: 'op_multi',
      coordinatorId: 'data_coordinator',
      agentTools: [
        'delegate_to_coordinator',
        'search_colleges',
        'write_season_stats',
        'write_recruiting_activity',
        'write_intel',
      ],
      successfulTools: [
        'delegate_to_coordinator',
        'search_colleges',
        'write_season_stats',
        'write_recruiting_activity',
        'write_intel',
      ],
      knownCostUsd: 0.99,
    });

    expect(result).toEqual({ charged: true, rawCostUsd: 0.99, chargeAmountCents: 103 });
    expect(mockCalculateChargeAmount).toHaveBeenCalledTimes(1);
    expect(mockCalculateChargeAmount).toHaveBeenCalledWith(
      db,
      0.99,
      'write-season-stats',
      'data_coordinator'
    );
    expect(mockRecordSpend).toHaveBeenCalledTimes(1);
    expect(mockRecordSpend).toHaveBeenCalledWith(db, 'user_multi', 103, undefined);
    expect(mockDeductOrgWallet).not.toHaveBeenCalled();
    expect(mockCaptureWalletHold).not.toHaveBeenCalled();
    expect(mockRecordUsageEvent).toHaveBeenCalledTimes(1);
    expect(mockRecordUsageEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user_multi',
        feature: 'write-season-stats',
        jobId: 'op_multi',
        dynamicCostCents: 103,
        rawProviderCostUsd: 0.99,
        metadata: expect.objectContaining({
          operationId: 'op_multi',
          coordinatorId: 'data_coordinator',
          primaryFeature: 'write-season-stats',
          billableFeatures: ['write-season-stats', 'write-recruiting-activity', 'write-intel'],
          successfulTools: [
            'delegate_to_coordinator',
            'search_colleges',
            'write_season_stats',
            'write_recruiting_activity',
            'write_intel',
          ],
        }),
      }),
      'production'
    );
    expect(mockRecordUsageEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.not.objectContaining({
          billingLineItemCount: expect.any(Number),
        }),
      }),
      'production'
    );
  });

  it('stores the per-feature telemetry call count as line quantity for multi-artifact diagram usage', async () => {
    const db = {} as Firestore;

    mockGetAndClearJobCostBreakdown.mockReturnValueOnce({
      totalUsd: 0.27510219,
      byFeatureUsd: { 'create-play-diagram': 0.27510219 },
      byFeatureCount: { 'create-play-diagram': 3 },
    });
    mockCalculateChargeAmount.mockResolvedValueOnce({
      chargeAmountCents: 83,
      multiplier: 3,
      overrideSource: 'default',
    });
    mockResolveBillingTarget.mockResolvedValue({
      type: 'organization',
      billingUserId: 'org:org_diagram',
      organizationId: 'org_diagram',
      context: { teamId: 'team_diagram' },
      teamIds: ['team_diagram'],
    });

    const { executeBillingDeduction } = await import('../usage-deduction.service.js');

    const result = await executeBillingDeduction({
      db,
      userId: 'user_diagram',
      operationId: 'op_three_diagrams',
      feature: 'create-play-diagram',
    });

    expect(result).toEqual({ charged: true, rawCostUsd: 0.27510219, chargeAmountCents: 83 });
    expect(mockRecordUsageEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        feature: 'create-play-diagram',
        dynamicCostCents: 83,
        quantity: 1,
        metadata: expect.objectContaining({
          lineFeature: 'create-play-diagram',
          lineQuantity: 3,
          chargeBreakdown: [
            expect.objectContaining({
              feature: 'create-play-diagram',
              chargeAmountCents: 83,
              quantity: 3,
            }),
          ],
        }),
      }),
      'production'
    );
  });

  it('skips wallet mutation and releases the duplicate hold when the billing lock exists', async () => {
    const lockRef = { id: 'op_duplicate' };
    const transaction = {
      get: vi.fn().mockResolvedValue({
        exists: true,
        data: () => ({ status: 'charged' }),
      }),
      set: vi.fn(),
    };
    const db = {
      collection: vi.fn(() => ({ doc: vi.fn(() => lockRef) })),
      runTransaction: vi.fn(async (callback: (txn: typeof transaction) => Promise<boolean>) =>
        callback(transaction)
      ),
    } as unknown as Firestore;

    mockCalculateChargeAmount.mockResolvedValue({ chargeAmountCents: 50 });

    const { executeBillingDeduction } = await import('../usage-deduction.service.js');

    const result = await executeBillingDeduction({
      db,
      userId: 'user_duplicate',
      operationId: 'op_duplicate',
      successfulTools: ['write_intel'],
      knownCostUsd: 0.5,
      iapHoldId: 'hold_duplicate',
    });

    expect(result).toEqual({ charged: false, rawCostUsd: 0.5, chargeAmountCents: 0 });
    expect(mockResolveBillingTarget).not.toHaveBeenCalled();
    expect(mockRecordSpend).not.toHaveBeenCalled();
    expect(mockDeductOrgWallet).not.toHaveBeenCalled();
    expect(mockCaptureWalletHold).not.toHaveBeenCalled();
    expect(mockReleaseWalletHold).toHaveBeenCalledWith(db, 'hold_duplicate');
    expect(mockRecordUsageEvent).not.toHaveBeenCalled();
    expect(transaction.set).not.toHaveBeenCalled();
  });

  it('does not release the active primary hold when the existing lock is still processing it', async () => {
    const lockRef = { id: 'op_processing' };
    const transaction = {
      get: vi.fn().mockResolvedValue({
        exists: true,
        data: () => ({ status: 'processing', holdId: 'hold_primary' }),
      }),
      set: vi.fn(),
    };
    const db = {
      collection: vi.fn(() => ({ doc: vi.fn(() => lockRef) })),
      runTransaction: vi.fn(async (callback: (txn: typeof transaction) => Promise<boolean>) =>
        callback(transaction)
      ),
    } as unknown as Firestore;

    mockCalculateChargeAmount.mockResolvedValue({ chargeAmountCents: 50 });

    const { executeBillingDeduction } = await import('../usage-deduction.service.js');

    const result = await executeBillingDeduction({
      db,
      userId: 'user_processing',
      operationId: 'op_processing',
      successfulTools: ['write_intel'],
      knownCostUsd: 0.5,
      iapHoldId: 'hold_primary',
    });

    expect(result).toEqual({ charged: false, rawCostUsd: 0.5, chargeAmountCents: 0 });
    expect(mockReleaseWalletHold).not.toHaveBeenCalled();
    expect(mockCaptureWalletHold).not.toHaveBeenCalled();
    expect(mockRecordUsageEvent).not.toHaveBeenCalled();
  });

  it('still writes usage events when marking the lock charged fails after spend', async () => {
    const lockRef = {
      id: 'op_lock_mark_failed',
      set: vi.fn().mockRejectedValue(new Error('lock write failed')),
    };
    const transaction = {
      get: vi.fn().mockResolvedValue({
        exists: false,
        data: () => undefined,
      }),
      set: vi.fn(),
    };
    const db = {
      collection: vi.fn(() => ({ doc: vi.fn(() => lockRef) })),
      runTransaction: vi.fn(async (callback: (txn: typeof transaction) => Promise<boolean>) =>
        callback(transaction)
      ),
    } as unknown as Firestore;

    mockCalculateChargeAmount.mockResolvedValue({ chargeAmountCents: 50 });
    mockResolveBillingTarget.mockResolvedValue({
      type: 'individual',
      billingUserId: 'user_lock_mark_failed',
      context: { teamId: undefined },
      teamIds: [],
    });

    const { executeBillingDeduction } = await import('../usage-deduction.service.js');

    const result = await executeBillingDeduction({
      db,
      userId: 'user_lock_mark_failed',
      operationId: 'op_lock_mark_failed',
      successfulTools: ['write_intel'],
      knownCostUsd: 0.5,
    });

    expect(result).toEqual({ charged: true, rawCostUsd: 0.5, chargeAmountCents: 50 });
    expect(mockRecordSpend).toHaveBeenCalledWith(db, 'user_lock_mark_failed', 50, undefined);
    expect(lockRef.set).toHaveBeenCalled();
    expect(mockRecordUsageEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user_lock_mark_failed',
        feature: 'write-intel',
        dynamicCostCents: 50,
      }),
      'production'
    );
  });

  it('stores resolved org and team attribution on the charged deduction lock', async () => {
    const lockRef = {
      id: 'op_lock_attribution',
      set: vi.fn().mockResolvedValue(undefined),
    };
    const transaction = {
      get: vi.fn().mockResolvedValue({
        exists: false,
        data: () => undefined,
      }),
      set: vi.fn(),
    };
    const db = {
      collection: vi.fn(() => ({ doc: vi.fn(() => lockRef) })),
      runTransaction: vi.fn(async (callback: (txn: typeof transaction) => Promise<boolean>) =>
        callback(transaction)
      ),
    } as unknown as Firestore;

    mockCalculateChargeAmount.mockResolvedValue({ chargeAmountCents: 85 });
    mockResolveBillingTarget.mockResolvedValue({
      type: 'organization',
      billingUserId: 'org:org_lock',
      organizationId: 'org_lock',
      context: { teamId: 'team_lock' },
      teamIds: ['team_lock'],
    });

    const { executeBillingDeduction } = await import('../usage-deduction.service.js');

    const result = await executeBillingDeduction({
      db,
      userId: 'user_lock',
      operationId: 'op_lock_attribution',
      feature: 'film-breakdown',
      knownCostUsd: 0.35,
    });

    expect(result).toEqual({ charged: true, rawCostUsd: 0.35, chargeAmountCents: 85 });
    expect(lockRef.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'charged',
        userId: 'user_lock',
        chargeAmountCents: 85,
        primaryFeature: 'film-breakdown',
        billableFeatures: ['film-breakdown'],
        billedOwnerType: 'organization',
        billedOwnerId: 'org:org_lock',
        organizationId: 'org_lock',
        teamId: 'team_lock',
        via: 'deductOrgWallet',
        chargeBreakdown: [
          expect.objectContaining({
            feature: 'film-breakdown',
            rawCostUsd: 0.35,
            chargeAmountCents: 85,
          }),
        ],
      }),
      { merge: true }
    );
  });

  it('captures a wallet hold once for the operation charge', async () => {
    const db = {} as Firestore;

    mockCalculateChargeAmount.mockResolvedValueOnce({ chargeAmountCents: 60 });
    mockResolveBillingTarget.mockResolvedValue({
      type: 'individual',
      billingUserId: 'user_hold',
      context: { teamId: undefined },
      teamIds: [],
    });

    const { executeBillingDeduction } = await import('../usage-deduction.service.js');

    const result = await executeBillingDeduction({
      db,
      userId: 'user_hold',
      operationId: 'op_hold',
      coordinatorId: 'data_coordinator',
      successfulTools: ['write_season_stats', 'write_recruiting_activity', 'write_intel'],
      knownCostUsd: 0.6,
      iapHoldId: 'hold_123',
    });

    expect(result).toEqual({ charged: true, rawCostUsd: 0.6, chargeAmountCents: 60 });
    expect(mockCaptureWalletHold).toHaveBeenCalledTimes(1);
    expect(mockCaptureWalletHold).toHaveBeenCalledWith(db, 'hold_123', 60);
    expect(mockRecordSpend).not.toHaveBeenCalled();
    expect(mockDeductOrgWallet).not.toHaveBeenCalled();
    expect(mockRecordUsageEvent).toHaveBeenCalledTimes(1);
    expect(mockRecordUsageEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        feature: 'write-season-stats',
        dynamicCostCents: 60,
        metadata: expect.objectContaining({
          billableFeatures: ['write-season-stats', 'write-recruiting-activity', 'write-intel'],
        }),
      }),
      'production'
    );
  });

  it('resolves org billing before capturing a held job when the caller already supplied a teamId', async () => {
    const db = {} as Firestore;

    mockCalculateChargeAmount.mockResolvedValueOnce({ chargeAmountCents: 90 });
    mockResolveBillingTarget.mockResolvedValue({
      type: 'organization',
      billingUserId: 'org:org_held',
      organizationId: 'org_held',
      teamIds: ['team_held'],
      context: { teamId: 'team_held' },
    });

    const { executeBillingDeduction } = await import('../usage-deduction.service.js');

    const result = await executeBillingDeduction({
      db,
      userId: 'user_held',
      operationId: 'op_held_org',
      feature: 'generate-graphic',
      teamId: 'team_held',
      knownCostUsd: 0.9,
      iapHoldId: 'hold_personal_stale',
    });

    expect(result).toEqual({ charged: true, rawCostUsd: 0.9, chargeAmountCents: 90 });
    expect(mockResolveBillingTarget).toHaveBeenCalledWith(db, 'user_held');
    expect(mockReleaseWalletHold).toHaveBeenCalledWith(db, 'hold_personal_stale');
    expect(mockDeductOrgWallet).toHaveBeenCalledWith(db, 'org_held', 'user_held', 'team_held', 90);
    expect(mockCaptureWalletHold).not.toHaveBeenCalled();
    expect(mockRecordUsageEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user_held',
        teamId: 'team_held',
        organizationId: 'org_held',
        billedOwnerType: 'organization',
        billedOwnerId: 'org:org_held',
        metadata: expect.objectContaining({
          settlementPath: 'wallet-hold-capture',
          alreadySettled: true,
        }),
      }),
      'production'
    );
  });

  it('uses the resolved org teamId when the caller does not provide one', async () => {
    const db = {} as Firestore;

    mockResolveBillingTarget.mockResolvedValue({
      type: 'organization',
      billingUserId: 'org:org_456',
      organizationId: 'org_456',
      teamIds: ['team_fallback'],
      context: { teamId: 'team_ctx' },
    });

    const { executeBillingDeduction } = await import('../usage-deduction.service.js');

    await executeBillingDeduction({
      db,
      userId: 'user_456',
      operationId: 'op_456',
      feature: 'briefing-generation',
      knownCostUsd: 0.75,
      environment: 'staging',
    });

    expect(mockDeductOrgWallet).toHaveBeenCalledWith(db, 'org_456', 'user_456', 'team_ctx', 175);
    expect(mockRecordUsageEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user_456',
        teamId: 'team_ctx',
        metadata: expect.objectContaining({
          teamAttributionStatus: 'resolved',
        }),
      }),
      'staging'
    );
  });

  it('does not guess an org teamId when multiple org teams are possible', async () => {
    const db = {} as Firestore;

    mockResolveBillingTarget.mockResolvedValue({
      type: 'organization',
      billingUserId: 'org:org_missing_team',
      organizationId: 'org_missing_team',
      teamIds: ['team_a', 'team_b'],
      context: { teamId: undefined },
    });

    const { executeBillingDeduction } = await import('../usage-deduction.service.js');

    await executeBillingDeduction({
      db,
      userId: 'user_missing_team',
      operationId: 'op_missing_team',
      feature: 'briefing-generation',
      knownCostUsd: 0.75,
    });

    expect(mockDeductOrgWallet).toHaveBeenCalledWith(
      db,
      'org_missing_team',
      'user_missing_team',
      undefined,
      175
    );
    expect(mockRecordUsageEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user_missing_team',
        metadata: expect.objectContaining({
          teamAttributionStatus: 'missing',
        }),
      }),
      'production'
    );
    expect(mockRecordUsageEvent).toHaveBeenCalledWith(
      expect.not.objectContaining({ teamId: expect.anything() }),
      'production'
    );
  });

  it('uses the single org team when the billing context omits teamId', async () => {
    const db = {} as Firestore;

    mockResolveBillingTarget.mockResolvedValue({
      type: 'organization',
      billingUserId: 'org:org_single_team',
      organizationId: 'org_single_team',
      teamIds: ['team_only'],
      context: { teamId: undefined },
    });

    const { executeBillingDeduction } = await import('../usage-deduction.service.js');

    await executeBillingDeduction({
      db,
      userId: 'user_single_team',
      operationId: 'op_single_team',
      feature: 'briefing-generation',
      knownCostUsd: 0.75,
    });

    expect(mockDeductOrgWallet).toHaveBeenCalledWith(
      db,
      'org_single_team',
      'user_single_team',
      'team_only',
      175
    );
    expect(mockRecordUsageEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user_single_team',
        teamId: 'team_only',
        metadata: expect.objectContaining({
          teamAttributionStatus: 'resolved',
        }),
      }),
      'production'
    );
  });

  it('omits teamId when the billing target is individual and no team exists', async () => {
    const db = {} as Firestore;

    mockResolveBillingTarget.mockResolvedValue({
      type: 'individual',
      billingUserId: 'user_789',
      context: { teamId: undefined },
      teamIds: [],
    });

    const { executeBillingDeduction } = await import('../usage-deduction.service.js');

    await executeBillingDeduction({
      db,
      userId: 'user_789',
      operationId: 'op_789',
      feature: 'team-intel',
      knownCostUsd: 0.5,
    });

    expect(mockRecordSpend).toHaveBeenCalledWith(db, 'user_789', 175, undefined);
    expect(mockRecordUsageEvent).toHaveBeenCalledWith(
      expect.not.objectContaining({ teamId: expect.anything() }),
      'production'
    );
  });

  it('derives the billed feature from the only meaningful successful tool', async () => {
    const db = {} as Firestore;

    mockResolveBillingTarget.mockResolvedValue({
      type: 'individual',
      billingUserId: 'user_999',
      context: { teamId: undefined },
      teamIds: [],
    });

    const { executeBillingDeduction } = await import('../usage-deduction.service.js');

    await executeBillingDeduction({
      db,
      userId: 'user_999',
      operationId: 'op_999',
      coordinatorId: 'recruiting_coordinator',
      agentTools: ['search_colleges', 'send_email'],
      successfulTools: ['search_colleges', 'send_email'],
      knownCostUsd: 0.9,
    });

    expect(mockCalculateChargeAmount).toHaveBeenCalledWith(
      db,
      0.9,
      'send-email',
      'recruiting_coordinator'
    );
    expect(mockRecordUsageEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        feature: 'send-email',
        jobId: 'op_999',
        dynamicCostCents: 175,
        metadata: expect.objectContaining({
          agentTools: ['search_colleges', 'send_email'],
          successfulTools: ['search_colleges', 'send_email'],
        }),
      }),
      'production'
    );
  });

  it('releases an IAP hold and charges the org wallet when the resolved target is an org', async () => {
    // Regression test: an athlete with personal IAP wallet credits joins an
    // org-billed team.  The background worker may create an IAP hold before the
    // billing-resolution cache is evicted (race window).  When executeBillingDeduction
    // later resolves the org target, it must release the personal hold and charge
    // the org wallet — never both.
    const db = {} as Firestore;

    mockResolveBillingTarget.mockResolvedValue({
      type: 'organization',
      billingUserId: 'org:org_789',
      organizationId: 'org_789',
      teamIds: ['team_abc'],
      context: { teamId: 'team_abc' },
    });

    const { executeBillingDeduction } = await import('../usage-deduction.service.js');

    await executeBillingDeduction({
      db,
      userId: 'user_iap_org',
      operationId: 'op_iap_org',
      iapHoldId: 'hold_personal_123',
      knownCostUsd: 1.0,
    });

    // Personal hold must be released, never captured
    expect(mockCaptureWalletHold).not.toHaveBeenCalled();
    expect(mockReleaseWalletHold).toHaveBeenCalledWith(db, 'hold_personal_123');

    // Org wallet must be charged
    expect(mockDeductOrgWallet).toHaveBeenCalledWith(
      db,
      'org_789',
      'user_iap_org',
      'team_abc',
      175
    );

    // Personal spend must NOT be recorded
    expect(mockRecordSpend).not.toHaveBeenCalled();
  });

  it('captures IAP hold normally when billing target is individual (no org)', async () => {
    const db = {} as Firestore;

    mockResolveBillingTarget.mockResolvedValue({
      type: 'individual',
      billingUserId: 'user_iap_solo',
      context: { teamId: undefined },
      teamIds: [],
    });

    const { executeBillingDeduction } = await import('../usage-deduction.service.js');

    await executeBillingDeduction({
      db,
      userId: 'user_iap_solo',
      operationId: 'op_iap_solo',
      iapHoldId: 'hold_solo_456',
      knownCostUsd: 0.5,
    });

    // Hold should be captured against the personal wallet
    expect(mockCaptureWalletHold).toHaveBeenCalledWith(db, 'hold_solo_456', 175);
    expect(mockReleaseWalletHold).not.toHaveBeenCalled();
    expect(mockDeductOrgWallet).not.toHaveBeenCalled();
    expect(mockRecordSpend).not.toHaveBeenCalled();
  });

  it('captures the pre-authorized personal hold estimate when telemetry cost is missing', async () => {
    const db = {} as Firestore;

    mockResolveBillingTarget.mockResolvedValue({
      type: 'individual',
      billingUserId: 'user_iap_fallback',
      context: { teamId: undefined },
      teamIds: [],
    });

    const { executeBillingDeduction } = await import('../usage-deduction.service.js');

    const result = await executeBillingDeduction({
      db,
      userId: 'user_iap_fallback',
      operationId: 'op_iap_fallback',
      feature: 'agent-execution',
      iapHoldId: 'hold_fallback_789',
      fallbackChargeAmountCents: 30,
    });

    expect(result).toEqual({ charged: true, rawCostUsd: 0, chargeAmountCents: 30 });
    expect(mockCalculateChargeAmount).not.toHaveBeenCalled();
    expect(mockCaptureWalletHold).toHaveBeenCalledWith(db, 'hold_fallback_789', 30);
    expect(mockReleaseWalletHold).not.toHaveBeenCalled();
    expect(mockRecordUsageEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user_iap_fallback',
        billedOwnerType: 'individual',
        billedOwnerId: 'user_iap_fallback',
        feature: 'agent-execution',
        dynamicCostCents: 30,
        rawProviderCostUsd: 0,
        metadata: expect.objectContaining({
          fallbackChargeApplied: true,
          settlementPath: 'wallet-hold-capture',
        }),
      }),
      'production'
    );
  });

  it('keeps org/team-attributed jobs on personal billing when the resolved target is individual', async () => {
    const db = {} as Firestore;

    mockCalculateChargeAmount.mockResolvedValueOnce({ chargeAmountCents: 70 });
    mockResolveBillingTarget.mockResolvedValue({
      type: 'individual',
      billingUserId: 'admin_personal',
      organizationId: 'org_context',
      teamIds: ['team_context'],
      context: {
        billingEntity: 'individual',
        billingMode: 'personal',
        organizationId: 'org_context',
        teamId: 'team_context',
      },
    });

    const { executeBillingDeduction } = await import('../usage-deduction.service.js');

    const result = await executeBillingDeduction({
      db,
      userId: 'admin_personal',
      operationId: 'op_admin_personal_org_context',
      feature: 'agent-execution',
      teamId: 'team_context',
      organizationId: 'org_context',
      knownCostUsd: 0.7,
    });

    expect(result).toEqual({ charged: true, rawCostUsd: 0.7, chargeAmountCents: 70 });
    expect(mockRecordSpend).toHaveBeenCalledWith(db, 'admin_personal', 70, 'team_context');
    expect(mockDeductOrgWallet).not.toHaveBeenCalled();
    expect(mockRecordUsageEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'admin_personal',
        teamId: 'team_context',
        organizationId: 'org_context',
        billedOwnerType: 'individual',
        billedOwnerId: 'admin_personal',
        dynamicCostCents: 70,
        metadata: expect.objectContaining({
          settlementPath: 'wallet-or-spend-record',
          teamAttributionStatus: 'resolved',
        }),
      }),
      'production'
    );
  });

  it('caps IAP billing to the pre-authorized hold and records platform-absorbed overage', async () => {
    const db = {} as Firestore;

    mockCalculateChargeAmount.mockResolvedValueOnce({
      chargeAmountCents: 560,
      multiplier: 3,
      overrideSource: 'default',
    });
    mockCaptureWalletHold.mockResolvedValueOnce({
      capturedAmountCents: 300,
      heldAmountCents: 300,
      absorbedOverageCents: 260,
    });
    mockResolveBillingTarget.mockResolvedValue({
      type: 'individual',
      billingUserId: 'user_iap_solo',
      context: { teamId: undefined },
      teamIds: [],
    });

    const { executeBillingDeduction } = await import('../usage-deduction.service.js');

    const result = await executeBillingDeduction({
      db,
      userId: 'user_iap_solo',
      operationId: 'op_iap_overage',
      iapHoldId: 'hold_solo_quoted',
      knownCostUsd: 1.86,
    });

    expect(result).toEqual({ charged: true, rawCostUsd: 1.86, chargeAmountCents: 300 });
    expect(mockCaptureWalletHold).toHaveBeenCalledWith(db, 'hold_solo_quoted', 560);
    expect(mockRecordUsageEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        dynamicCostCents: 300,
        metadata: expect.objectContaining({
          heldAmountCents: 300,
          uncappedChargeAmountCents: 560,
          absorbedOverageCents: 260,
        }),
      }),
      'production'
    );
    expect(mockRecordSpend).not.toHaveBeenCalled();
    expect(mockDeductOrgWallet).not.toHaveBeenCalled();
  });
});
