import { beforeEach, describe, expect, it, vi } from 'vitest';
import type Stripe from 'stripe';
import type { Firestore } from 'firebase-admin/firestore';

const {
  mockAddWalletTopUp,
  mockAddFundsToOrgWallet,
  mockPaymentLogFindOneAndUpdate,
  mockGetStripeClient,
} = vi.hoisted(() => ({
  mockAddWalletTopUp: vi.fn(),
  mockAddFundsToOrgWallet: vi.fn(),
  mockPaymentLogFindOneAndUpdate: vi.fn().mockResolvedValue(null),
  mockGetStripeClient: vi.fn(),
}));

vi.mock('../budget.service.js', () => ({
  addWalletTopUp: mockAddWalletTopUp,
  addFundsToOrgWallet: mockAddFundsToOrgWallet,
  getBillingState: vi.fn(),
}));

vi.mock('../stripe.service.js', () => ({
  getStripeClient: mockGetStripeClient,
}));

vi.mock('../../../models/payment-log.model.js', () => ({
  PaymentLogModel: {
    findOneAndUpdate: mockPaymentLogFindOneAndUpdate,
  },
}));

vi.mock('../../../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../../services/notification.service.js', () => ({
  dispatch: vi.fn().mockResolvedValue(undefined),
}));

import { finalizeWalletCheckoutSession } from '../webhook.service.js';

function makeCheckoutSession(
  overrides: Partial<Stripe.Checkout.Session> & {
    metadata: Record<string, string>;
  }
): Stripe.Checkout.Session {
  return {
    id: 'cs_test_checkout_123',
    object: 'checkout.session',
    metadata: overrides.metadata,
    payment_status: 'paid',
    currency: 'usd',
    customer: null,
    payment_intent: null,
    ...overrides,
  } as unknown as Stripe.Checkout.Session;
}

describe('finalizeWalletCheckoutSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPaymentLogFindOneAndUpdate.mockResolvedValue(null);
    mockGetStripeClient.mockReturnValue({
      paymentIntents: { retrieve: vi.fn() },
      customers: { update: vi.fn() },
    });
  });

  it('writes individual checkout PaymentLog updates without duplicating finalizationSource', async () => {
    mockAddWalletTopUp.mockResolvedValue({ newBalance: 2500, alreadyFinalized: false });

    const session = makeCheckoutSession({
      metadata: {
        type: 'wallet_topup',
        userId: 'user_123',
        amountCents: '1000',
      },
    });

    const result = await finalizeWalletCheckoutSession(
      {} as Firestore,
      session,
      'staging',
      'client_return'
    );

    expect(result).toMatchObject({
      kind: 'wallet_topup',
      userId: 'user_123',
      newBalance: 2500,
    });
    expect(mockAddWalletTopUp).toHaveBeenCalledWith(expect.anything(), 'user_123', 1000, 'stripe', {
      checkoutSessionId: 'cs_test_checkout_123',
      initiatedByUserId: 'user_123',
    });

    const update = mockPaymentLogFindOneAndUpdate.mock.calls[0]?.[1] as {
      $set: Record<string, unknown>;
      $setOnInsert: Record<string, unknown>;
    };

    expect(update.$set).toMatchObject({ finalizationSource: 'client_return' });
    expect(update.$setOnInsert).toMatchObject({
      invoiceId: 'cs_test_checkout_123',
      userId: 'user_123',
      type: 'wallet_topup',
    });
    expect(update.$setOnInsert).not.toHaveProperty('finalizationSource');
    expect(mockGetStripeClient).not.toHaveBeenCalled();
  });

  it('writes org checkout PaymentLog updates without duplicating finalizationSource', async () => {
    mockAddFundsToOrgWallet.mockResolvedValue({ newBalance: 5400, alreadyFinalized: true });

    const session = makeCheckoutSession({
      customer: 'cus_org_123',
      metadata: {
        type: 'org_wallet_topup',
        userId: 'admin_123',
        organizationId: 'org_123',
        amountCents: '1000',
      },
    });

    const result = await finalizeWalletCheckoutSession(
      {} as Firestore,
      session,
      'staging',
      'webhook'
    );

    expect(result).toMatchObject({
      kind: 'org_wallet_topup',
      userId: 'admin_123',
      organizationId: 'org_123',
      newBalance: 5400,
    });
    expect(mockAddFundsToOrgWallet).toHaveBeenCalledWith(
      expect.anything(),
      'org_123',
      1000,
      'stripe_checkout',
      {
        checkoutSessionId: 'cs_test_checkout_123',
        initiatedByUserId: 'admin_123',
      }
    );

    const update = mockPaymentLogFindOneAndUpdate.mock.calls[0]?.[1] as {
      $set: Record<string, unknown>;
      $setOnInsert: Record<string, unknown>;
    };

    expect(update.$set).toMatchObject({ finalizationSource: 'webhook' });
    expect(update.$setOnInsert).toMatchObject({
      invoiceId: 'cs_test_checkout_123',
      userId: 'org:org_123',
      organizationId: 'org_123',
      type: 'org_wallet_topup',
    });
    expect(update.$setOnInsert).not.toHaveProperty('finalizationSource');
  });
});
