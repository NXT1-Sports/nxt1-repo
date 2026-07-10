import { beforeEach, describe, expect, it, vi } from 'vitest';
import type Stripe from 'stripe';
import type { Firestore } from 'firebase-admin/firestore';

const {
  mockAddWalletTopUp,
  mockAddFundsToOrgWallet,
  mockPublishInvoicePaidDomainEvent,
  mockPublishSubscriptionCanceledDomainEvent,
  mockPaymentLogFindOne,
  mockPaymentLogFindOneAndUpdate,
  mockGetStripeClient,
  mockSendSlackAlert,
} = vi.hoisted(() => ({
  mockAddWalletTopUp: vi.fn(),
  mockAddFundsToOrgWallet: vi.fn(),
  mockPublishInvoicePaidDomainEvent: vi.fn().mockResolvedValue({
    domainEventType: 'billing.invoice_paid',
    projections: [
      {
        projector: 'marketing',
        eventKey: 'closed-won',
        eventType: 'billing.purchase.closed_won.organization',
        deduplicated: false,
      },
    ],
  }),
  mockPublishSubscriptionCanceledDomainEvent: vi.fn().mockResolvedValue({
    domainEventType: 'billing.subscription_canceled',
    projections: [
      {
        projector: 'marketing',
        eventKey: 'churned',
        eventType: 'billing.subscription.churned.organization',
        deduplicated: false,
      },
    ],
  }),
  mockPaymentLogFindOne: vi.fn().mockResolvedValue(null),
  mockPaymentLogFindOneAndUpdate: vi.fn().mockResolvedValue(null),
  mockGetStripeClient: vi.fn(),
  mockSendSlackAlert: vi.fn().mockResolvedValue(true),
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
    findOne: mockPaymentLogFindOne,
    findOneAndUpdate: mockPaymentLogFindOneAndUpdate,
  },
}));

vi.mock('../../../services/domain-events/domain-events.service.js', () => ({
  publishInvoicePaidDomainEvent: mockPublishInvoicePaidDomainEvent,
  publishSubscriptionCanceledDomainEvent: mockPublishSubscriptionCanceledDomainEvent,
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
    mockPaymentLogFindOne.mockResolvedValue(null);
    mockPaymentLogFindOneAndUpdate.mockResolvedValue(null);
    mockSendSlackAlert.mockResolvedValue(true);
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
  });

  it('enqueues churned marketing outbox work for org subscription deletions', async () => {
    const lastPaidAt = new Date('2026-06-15T12:00:00.000Z');
    mockPaymentLogFindOne.mockResolvedValue({ createdAt: lastPaidAt });

    const organizationDoc = {
      id: 'org_123',
      data: () => ({
        admins: [{ userId: 'admin_123' }],
        email: 'org@example.com',
      }),
      ref: {
        update: vi.fn().mockResolvedValue(undefined),
      },
    };

    const organizationsCollection = {
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      get: vi.fn().mockResolvedValue({
        empty: false,
        docs: [organizationDoc],
      }),
    };

    const db = {
      collection: vi.fn().mockImplementation((name: string) => {
        if (name === 'Organizations') {
          return organizationsCollection;
        }
        throw new Error(`Unexpected collection: ${name}`);
      }),
    } as unknown as Firestore;

    await handleWebhookEvent(
      db,
      {
        id: 'evt_subscription_deleted_123',
        type: 'customer.subscription.deleted',
        data: {
          object: {
            id: 'sub_123',
            object: 'subscription',
            customer: 'cus_org_123',
          },
        },
      } as unknown as Stripe.Event,
      'production'
    );

    expect(mockPublishSubscriptionCanceledDomainEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        db,
        environment: 'production',
        organizationId: 'org_123',
        userId: 'admin_123',
        email: 'org@example.com',
        lastPaidAt,
        balanceCents: 0,
        subscriptionId: 'sub_123',
      })
    );
    expect(organizationDoc.ref.update).toHaveBeenCalledTimes(1);
  });
});
