import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import { UsageFeature } from '../types/index.js';

const mockGetAndClearJobCost = vi.fn();
const mockCalculateChargeAmount = vi.fn();
const mockRecordSpend = vi.fn();
const mockDeductOrgWallet = vi.fn();
const mockCaptureWalletHold = vi.fn();
const mockReleaseWalletHold = vi.fn();
const mockResolveBillingTarget = vi.fn();
const mockRecordUsageEvent = vi.fn();

vi.mock('../agent/queue/job-cost-tracker.js', () => ({
  getAndClearJobCost: mockGetAndClearJobCost,
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

    mockGetAndClearJobCost.mockReturnValue(0);
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
      feature: UsageFeature.ACTIVITY_USAGE,
      teamId: 'team_supplied',
      knownCostUsd: 1.25,
    });

    expect(result).toEqual({ charged: true, rawCostUsd: 1.25, chargeAmountCents: 175 });
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
        dynamicCostCents: 175,
        rawProviderCostUsd: 1.25,
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
      feature: UsageFeature.BRIEFING_GENERATION,
      knownCostUsd: 0.75,
      environment: 'staging',
    });

    expect(mockDeductOrgWallet).toHaveBeenCalledWith(db, 'org_456', 'user_456', 'team_ctx', 175);
    expect(mockRecordUsageEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user_456',
        teamId: 'team_ctx',
      }),
      'staging'
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
      feature: UsageFeature.TEAM_INTEL,
      knownCostUsd: 0.5,
    });

    expect(mockRecordSpend).toHaveBeenCalledWith(db, 'user_789', 175, undefined);
    expect(mockRecordUsageEvent).toHaveBeenCalledWith(
      expect.not.objectContaining({ teamId: expect.anything() }),
      'production'
    );
  });
});
