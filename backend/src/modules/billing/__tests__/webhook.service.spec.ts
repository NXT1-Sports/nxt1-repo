import { beforeEach, describe, expect, it, vi } from 'vitest';
import type Stripe from 'stripe';
import type { Firestore } from 'firebase-admin/firestore';

const {
  mockAddWalletTopUp,
  mockAddFundsToOrgWallet,
  mockPaymentLogFindOneAndUpdate,
  mockGetStripeClient,
  mockSendSlackAlert,
  mockTrackBillingPurchaseEvent,
} = vi.hoisted(() => ({
  mockAddWalletTopUp: vi.fn(),
  mockAddFundsToOrgWallet: vi.fn(),
  mockPaymentLogFindOneAndUpdate: vi.fn().mockResolvedValue(null),
  mockGetStripeClient: vi.fn(),
  mockSendSlackAlert: vi.fn().mockResolvedValue(true),
  mockTrackBillingPurchaseEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../budget.service.js', () => ({
  addWalletTopUp: mockAddWalletTopUp,
  addFundsToOrgWallet: mockAddFundsToOrgWallet,
  getBillingState: vi.fn(),
}));

vi.mock('../stripe.service.js', () => ({
  getStripeClient: mockGetStripeClient,
}));

vi.mock('../../../models/billing/payment-log.model.js', () => ({
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

vi.mock('../../../services/communications/notification.service.js', () => ({
  dispatch: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../services/platform/alert.service.js', () => ({
  sendSlackAlert: mockSendSlackAlert,
}));

vi.mock('../ga4-revenue.service.js', () => ({
  trackBillingPurchaseEvent: mockTrackBillingPurchaseEvent,
}));

import { finalizeWalletCheckoutSession, handleWebhookEvent } from '../webhook.service.js';

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
    mockSendSlackAlert.mockResolvedValue(true);
    mockTrackBillingPurchaseEvent.mockResolvedValue(undefined);
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
    expect(mockSendSlackAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        target: 'sales',
        environment: 'staging',
        title: 'Wallet Top-Up Completed',
      })
    );
    expect(mockTrackBillingPurchaseEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        transactionId: 'cs_test_checkout_123',
        source: 'stripe_checkout',
      })
    );
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
    expect(mockSendSlackAlert).not.toHaveBeenCalled();
    expect(mockTrackBillingPurchaseEvent).not.toHaveBeenCalled();
  });

  it('sends a sales alert for org invoice top-ups', async () => {
    const usersCollection = {
      where: vi.fn().mockReturnThis(),
      get: vi.fn().mockResolvedValue({ empty: true, docs: [], size: 0 }),
    };
    const db = {
      collection: vi.fn().mockImplementation((name: string) => {
        if (name === 'Users') {
          return usersCollection;
        }
        throw new Error(`Unexpected collection: ${name}`);
      }),
    } as unknown as Firestore;

    mockAddFundsToOrgWallet.mockResolvedValue({ newBalance: 8400 });

    await handleWebhookEvent(
      db,
      {
        id: 'evt_invoice_paid_123',
        type: 'invoice.paid',
        data: {
          object: {
            id: 'in_org_123',
            object: 'invoice',
            customer: 'cus_org_123',
            currency: 'usd',
            hosted_invoice_url: 'https://stripe.test/invoices/in_org_123',
            invoice_pdf: 'https://stripe.test/invoices/in_org_123.pdf',
            metadata: {
              type: 'org_invoice_topup',
              organizationId: 'org_123',
              userId: 'admin_123',
              amountCents: '2500',
            },
          },
        },
      } as unknown as Stripe.Event,
      'production'
    );

    expect(mockSendSlackAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        target: 'sales',
        environment: 'production',
        title: 'Organization Invoice Payment Received',
      })
    );
    expect(mockTrackBillingPurchaseEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'admin_123',
        transactionId: 'in_org_123',
        valueCents: 2500,
        billingEntity: 'organization',
        source: 'stripe_invoice',
      })
    );
  });

  it('tracks GA4 purchases for non-org invoice payments', async () => {
    await handleWebhookEvent(
      {} as Firestore,
      {
        id: 'evt_invoice_payment_succeeded_123',
        type: 'invoice.payment_succeeded',
        data: {
          object: {
            id: 'in_wallet_123',
            object: 'invoice',
            customer: 'cus_wallet_123',
            currency: 'usd',
            amount_due: 1500,
            amount_paid: 1500,
            hosted_invoice_url: 'https://stripe.test/invoices/in_wallet_123',
            metadata: {
              type: 'wallet_topup',
              userId: 'user_123',
            },
          },
        },
      } as unknown as Stripe.Event,
      'staging'
    );

    expect(mockTrackBillingPurchaseEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user_123',
        transactionId: 'in_wallet_123',
        valueCents: 1500,
        itemName: 'NXT1 Wallet Credits',
        itemCategory: 'wallet_topup',
        source: 'stripe_invoice',
      })
    );
  });

  it('does not track GA4 purchases for zero-amount invoice payments', async () => {
    await handleWebhookEvent(
      {} as Firestore,
      {
        id: 'evt_invoice_payment_succeeded_zero',
        type: 'invoice.payment_succeeded',
        data: {
          object: {
            id: 'in_zero_123',
            object: 'invoice',
            customer: 'cus_zero_123',
            currency: 'usd',
            amount_due: 0,
            amount_paid: 0,
            metadata: {
              userId: 'user_zero',
            },
          },
        },
      } as unknown as Stripe.Event,
      'staging'
    );

    expect(mockTrackBillingPurchaseEvent).not.toHaveBeenCalled();
  });
});
