/**
 * @fileoverview Unit tests for Usage Service
 * @module @nxt1/backend/modules/billing
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import {
  generateIdempotencyKey,
  checkUsageEventExists,
  recordUsageEvent,
  tryAcquireEventLock,
  type CreateUsageEventInput,
} from '../usage.service.js';
import { UsageFeature, UsageEventStatus } from '../types/index.js';

// Mock config to avoid env-var dependency for Stripe price IDs
vi.mock('../config.js', () => ({
  COLLECTIONS: { USAGE_EVENTS: 'usageEvents' },
  getStripePriceId: vi.fn().mockReturnValue('price_test123'),
  getUnitCost: vi.fn().mockReturnValue(0.5),
}));

// Mock Firestore
const createMockFirestore = () => {
  const mockDoc = {
    id: 'test-event-id',
    data: vi.fn(),
    get: vi.fn(),
    set: vi.fn(),
    update: vi.fn(),
  };

  const mockSnapshot = {
    empty: false,
    docs: [mockDoc],
  };

  const mockQuery = {
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    get: vi.fn().mockResolvedValue(mockSnapshot),
  };

  const mockCollection = {
    doc: vi.fn().mockReturnValue(mockDoc),
    add: vi.fn().mockResolvedValue(mockDoc),
    where: vi.fn().mockReturnValue(mockQuery),
  };

  const mockTransaction = {
    get: vi.fn(),
    update: vi.fn(),
  };

  const mockDb = {
    collection: vi.fn().mockReturnValue(mockCollection),
    runTransaction: vi.fn((callback) => callback(mockTransaction)),
  } as unknown as Firestore;

  return { mockDb, mockDoc, mockSnapshot, mockQuery, mockCollection, mockTransaction };
};

describe('Usage Service', () => {
  describe('generateIdempotencyKey', () => {
    it('should generate consistent hash for same inputs', () => {
      const key1 = generateIdempotencyKey('user123', 'AI_GRAPHIC', 'job456');
      const key2 = generateIdempotencyKey('user123', 'AI_GRAPHIC', 'job456');

      expect(key1).toBe(key2);
      expect(key1).toHaveLength(64); // SHA-256 hex string
    });

    it('should generate different hashes for different inputs', () => {
      const key1 = generateIdempotencyKey('user123', 'AI_GRAPHIC', 'job456');
      const key2 = generateIdempotencyKey('user123', 'AI_GRAPHIC', 'job789');
      const key3 = generateIdempotencyKey('user456', 'AI_GRAPHIC', 'job456');

      expect(key1).not.toBe(key2);
      expect(key1).not.toBe(key3);
      expect(key2).not.toBe(key3);
    });
  });

  describe('checkUsageEventExists', () => {
    it('should return true when event exists', async () => {
      const { mockDb, mockSnapshot } = createMockFirestore();
      mockSnapshot.empty = false;

      const result = await checkUsageEventExists(mockDb, 'test-key');

      expect(result).toBe(true);
    });

    it('should return false when event does not exist', async () => {
      const { mockDb, mockSnapshot } = createMockFirestore();
      mockSnapshot.empty = true;

      const result = await checkUsageEventExists(mockDb, 'test-key');

      expect(result).toBe(false);
    });
  });

  describe('recordUsageEvent', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should create usage event when not exists', async () => {
      const { mockDb, mockDoc: _mockDoc, mockSnapshot } = createMockFirestore();
      mockSnapshot.empty = true; // Event doesn't exist

      // Mock publishUsageEvent
      vi.mock('../pubsub.service.js', () => ({
        publishUsageEvent: vi.fn().mockResolvedValue(undefined),
      }));

      const input: CreateUsageEventInput = {
        userId: 'user123',
        teamId: 'team456',
        feature: UsageFeature.HIGHLIGHTS,
        quantity: 1,
        unitCostSnapshot: 0.5,
        currency: 'usd',
        stripePriceId: 'price_test123',
        jobId: 'job789',
      };

      const eventId = await recordUsageEvent(mockDb, input, 'production');

      expect(eventId).toBe('test-event-id');
      expect(mockDb.collection).toHaveBeenCalledWith('usageEvents');
    });

    it('should not create duplicate event with same idempotency key', async () => {
      const { mockDb, mockSnapshot } = createMockFirestore();
      mockSnapshot.empty = false; // Event already exists

      const input: CreateUsageEventInput = {
        userId: 'user123',
        teamId: 'team456',
        feature: UsageFeature.HIGHLIGHTS,
        quantity: 1,
        unitCostSnapshot: 0.5,
        currency: 'usd',
        stripePriceId: 'price_test123',
        jobId: 'job789',
      };

      const eventId = await recordUsageEvent(mockDb, input, 'production');

      expect(eventId).toBe('test-event-id');
      // Should not call add() since event exists
    });
  });

  describe('tryAcquireEventLock', () => {
    it('should acquire lock when status is PENDING', async () => {
      const { mockDb, mockTransaction, mockDoc } = createMockFirestore();

      mockDoc.data = vi.fn().mockReturnValue({
        status: UsageEventStatus.PENDING,
      });

      mockTransaction.get.mockResolvedValue({
        exists: true,
        data: () => ({ status: UsageEventStatus.PENDING }),
      });

      const result = await tryAcquireEventLock(mockDb, 'event123');

      expect(result).toBe(true);
      expect(mockTransaction.update).toHaveBeenCalled();
    });

    it('should not acquire lock when status is not PENDING', async () => {
      const { mockDb, mockTransaction } = createMockFirestore();

      mockTransaction.get.mockResolvedValue({
        exists: true,
        data: () => ({ status: UsageEventStatus.PROCESSING }),
      });

      const result = await tryAcquireEventLock(mockDb, 'event123');

      expect(result).toBe(false);
      expect(mockTransaction.update).not.toHaveBeenCalled();
    });

    it('should return false when event does not exist', async () => {
      const { mockDb, mockTransaction } = createMockFirestore();

      mockTransaction.get.mockResolvedValue({
        exists: false,
      });

      const result = await tryAcquireEventLock(mockDb, 'nonexistent');

      expect(result).toBe(false);
    });
  });
});
