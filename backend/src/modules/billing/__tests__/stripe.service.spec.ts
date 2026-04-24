/**
 * @fileoverview Unit tests for Stripe Service
 * @module @nxt1/backend/modules/billing
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import Stripe from 'stripe';
import {
  getOrCreateCustomer,
  createInvoiceItem,
  attachPaymentMethod,
  chargeOffSession,
  getDefaultCardPaymentMethodId,
  _clearStripeClientCacheForTesting,
} from '../stripe.service.js';

// Mock Stripe
vi.mock('stripe', () => {
  function createStripeClient() {
    return {
      customers: {
        create: vi.fn().mockResolvedValue({
          id: 'cus_test123',
          email: 'test@example.com',
        }),
        retrieve: vi.fn().mockResolvedValue({
          id: 'cus_existing',
          email: 'test@example.com',
          deleted: false,
        }),
        update: vi.fn().mockResolvedValue({}),
      },
      invoiceItems: {
        create: vi.fn().mockResolvedValue({
          id: 'ii_test123',
          customer: 'cus_test123',
        }),
      },
      paymentMethods: {
        attach: vi.fn().mockResolvedValue({}),
        retrieve: vi.fn().mockResolvedValue({ id: 'pm_card_visa', type: 'card' }),
      },
      invoices: {
        create: vi.fn().mockResolvedValue({
          id: 'in_test123',
        }),
        finalizeInvoice: vi.fn().mockResolvedValue({
          id: 'in_test123',
          status: 'open',
        }),
        list: vi.fn().mockResolvedValue({
          data: [],
        }),
      },
      subscriptions: {
        list: vi.fn().mockResolvedValue({
          data: [
            { id: 'sub_active', status: 'active' },
            { id: 'sub_canceled', status: 'canceled' },
          ],
        }),
        cancel: vi.fn().mockResolvedValue({ id: 'sub_active', status: 'canceled' }),
      },
    };
  }

  const MockStripe = vi.fn(function MockStripe() {
    return createStripeClient();
  });

  return { default: MockStripe };
});

// Mock Firestore
const createMockFirestore = () => {
  const mockDoc = {
    id: 'test-customer-id',
    data: vi.fn().mockReturnValue({
      userId: 'user123',
      stripeCustomerId: 'cus_existing',
      email: 'test@example.com',
    }),
  };

  const mockSnapshot = {
    empty: false,
    docs: [mockDoc],
  };

  const mockQuery = {
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    get: vi.fn().mockResolvedValue(mockSnapshot),
  };

  const mockCollection = {
    add: vi.fn().mockResolvedValue(mockDoc),
    where: vi.fn().mockReturnValue(mockQuery),
  };

  const mockDb = {
    collection: vi.fn().mockReturnValue(mockCollection),
  } as unknown as Firestore;

  return { mockDb, mockDoc, mockSnapshot, mockCollection };
};

describe('Stripe Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env['STRIPE_ENABLED'] = 'true';
    process.env['STRIPE_SECRET_KEY'] = 'sk_test_mocked';
    process.env['STRIPE_TEST_SECRET_KEY'] = 'sk_test_mocked';
  });

  describe('getOrCreateCustomer', () => {
    it('should return existing customer from cache', async () => {
      const { mockDb, mockSnapshot } = createMockFirestore();
      mockSnapshot.empty = false;

      const result = await getOrCreateCustomer(
        mockDb,
        'user123',
        'test@example.com',
        'team456',
        'production'
      );

      expect(result.customerId).toBe('cus_existing');
      expect(result.isNew).toBe(false);
    });

    it('should create new customer when not cached', async () => {
      const { mockDb, mockSnapshot } = createMockFirestore();
      mockSnapshot.empty = true;

      const result = await getOrCreateCustomer(
        mockDb,
        'user123',
        'test@example.com',
        'team456',
        'production'
      );

      expect(result.customerId).toBe('cus_test123');
      expect(result.isNew).toBe(true);
    });
  });

  describe('createInvoiceItem', () => {
    it('should create invoice item successfully', async () => {
      const result = await createInvoiceItem(
        'cus_test123',
        'price_test123',
        1,
        'idempotency-key-123',
        'production',
        'Test description'
      );

      expect(result.success).toBe(true);
      expect(result.invoiceItemId).toBe('ii_test123');
    });

    it('should handle errors gracefully', async () => {
      // Mock error - Stripe constructor throws
      const mockStripeError = vi.fn(function MockStripeError() {
        throw new Error('Stripe API error');
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(Stripe).mockImplementationOnce(mockStripeError as any);

      const result = await createInvoiceItem(
        'cus_test123',
        'price_test123',
        1,
        'idempotency-key-123',
        'staging'
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('attachPaymentMethod', () => {
    it('should attach payment method to customer', async () => {
      await expect(
        attachPaymentMethod('cus_test123', 'pm_test123', 'production')
      ).resolves.not.toThrow();
    });

    it('should handle attachment errors', async () => {
      // Mock error
      vi.mocked(Stripe).mockImplementationOnce(function MockStripeFailure() {
        return {
          paymentMethods: {
            attach: vi.fn().mockRejectedValue(new Error('Invalid payment method')),
          },
        } as unknown as Stripe;
      });

      await expect(attachPaymentMethod('cus_test123', 'invalid_pm', 'staging')).rejects.toThrow();
    });
  });

  describe('chargeOffSession', () => {
    beforeEach(() => {
      // Clear the module-level Stripe client cache so each test gets a fresh client
      // created from whatever vi.mocked(Stripe).mockImplementationOnce provides.
      _clearStripeClientCacheForTesting();
    });

    it('should succeed when PaymentIntent status is succeeded', async () => {
      vi.mocked(Stripe).mockImplementationOnce(function MockStripeSuccess() {
        return {
          customers: {
            retrieve: vi.fn().mockResolvedValue({ id: 'cus_test123', deleted: false }),
            update: vi.fn().mockResolvedValue({}),
          },
          paymentIntents: {
            create: vi.fn().mockResolvedValue({
              id: 'pi_test_success',
              status: 'succeeded',
            }),
          },
        } as unknown as Stripe;
      });

      const result = await chargeOffSession(
        'cus_test123',
        'pm_card_visa',
        2000,
        'NXT1 Wallet Auto Top-Up ($20.00)',
        'auto-topup-user123-1234567890',
        'staging'
      );

      expect(result.success).toBe(true);
      expect(result.paymentIntentId).toBe('pi_test_success');
      expect(result.error).toBeUndefined();
    });

    it('should return failure when PaymentIntent requires_action (3DS)', async () => {
      vi.mocked(Stripe).mockImplementationOnce(function MockStripe3DS() {
        return {
          customers: {
            retrieve: vi.fn().mockResolvedValue({ id: 'cus_test123', deleted: false }),
          },
          paymentIntents: {
            create: vi.fn().mockResolvedValue({
              id: 'pi_test_3ds',
              status: 'requires_action',
            }),
          },
        } as unknown as Stripe;
      });

      const result = await chargeOffSession(
        'cus_test123',
        'pm_card_3ds',
        2000,
        'NXT1 Wallet Auto Top-Up',
        'auto-topup-user123-9999',
        'staging'
      );

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('requires_action');
      expect(result.paymentIntentId).toBe('pi_test_3ds');
    });

    it('should return failure when Stripe throws a card_declined error', async () => {
      vi.mocked(Stripe).mockImplementationOnce(function MockStripeDeclined() {
        return {
          customers: {
            retrieve: vi.fn().mockResolvedValue({ id: 'cus_test123', deleted: false }),
          },
          paymentIntents: {
            create: vi
              .fn()
              .mockRejectedValue({ code: 'card_declined', message: 'Your card was declined.' }),
          },
        } as unknown as Stripe;
      });

      const result = await chargeOffSession(
        'cus_test123',
        'pm_card_declined',
        2000,
        'NXT1 Wallet Auto Top-Up',
        'auto-topup-user123-declined',
        'staging'
      );

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('card_declined');
      expect(result.error).toBe('Your card was declined.');
    });

    it('should reject invalid amountCents', async () => {
      const result = await chargeOffSession(
        'cus_test123',
        'pm_card_visa',
        0,
        'NXT1 Wallet Auto Top-Up',
        'key',
        'staging'
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid amountCents');
    });

    it('should reject non-integer amountCents', async () => {
      const result = await chargeOffSession(
        'cus_test123',
        'pm_card_visa',
        19.99,
        'NXT1 Wallet Auto Top-Up',
        'key',
        'staging'
      );

      expect(result.success).toBe(false);
    });
  });

  describe('getDefaultCardPaymentMethodId', () => {
    beforeEach(() => {
      _clearStripeClientCacheForTesting();
    });

    it('should return the default payment method when it is a card', async () => {
      vi.mocked(Stripe).mockImplementationOnce(function MockStripeDefaultCard() {
        return {
          customers: {
            retrieve: vi.fn().mockResolvedValue({
              id: 'cus_test123',
              deleted: false,
              invoice_settings: { default_payment_method: 'pm_card_visa' },
            }),
          },
          paymentMethods: {
            retrieve: vi.fn().mockResolvedValue({ id: 'pm_card_visa', type: 'card' }),
          },
        } as unknown as Stripe;
      });

      await expect(getDefaultCardPaymentMethodId('cus_test123', 'staging')).resolves.toBe(
        'pm_card_visa'
      );
    });

    it('should return null when the default payment method is not a card', async () => {
      vi.mocked(Stripe).mockImplementationOnce(function MockStripeBankDefault() {
        return {
          customers: {
            retrieve: vi.fn().mockResolvedValue({
              id: 'cus_test123',
              deleted: false,
              invoice_settings: { default_payment_method: 'pm_bank_123' },
            }),
          },
          paymentMethods: {
            retrieve: vi.fn().mockResolvedValue({ id: 'pm_bank_123', type: 'us_bank_account' }),
          },
        } as unknown as Stripe;
      });

      await expect(getDefaultCardPaymentMethodId('cus_test123', 'staging')).resolves.toBeNull();
    });
  });
});
