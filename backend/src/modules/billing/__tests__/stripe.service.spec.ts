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
  cancelActiveSubscriptionsForUser,
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

  describe('cancelActiveSubscriptionsForUser', () => {
    it('should cancel active subscriptions for cached Stripe customers', async () => {
      const { mockDb } = createMockFirestore();

      const result = await cancelActiveSubscriptionsForUser(mockDb, 'user123', 'production');

      expect(result.customerIds).toEqual(['cus_existing']);
      expect(result.canceledSubscriptionIds).toEqual(['sub_active']);
    });
  });
});
