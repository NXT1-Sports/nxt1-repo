/**
 * @fileoverview Unit tests for Usage Service
 * @module @nxt1/backend/modules/billing
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  generateIdempotencyKey,
  recordUsageEvent,
  tryAcquireEventLock,
  type CreateUsageEventInput,
} from '../usage.service.js';
import { UsageEventStatus } from '../types/index.js';

// vi.hoisted ensures variables are available before the hoisted vi.mock() factory runs
const { mockUsageEventModel } = vi.hoisted(() => {
  const mockUsageEventDoc = {
    _id: { toString: () => 'test-event-id' },
    userId: 'user123',
    teamId: 'team456',
    quantity: 1,
    status: 'PENDING',
  };

  const mockUsageEventModel = {
    create: vi.fn().mockResolvedValue(mockUsageEventDoc),
    findOne: vi.fn(),
    findOneAndUpdate: vi.fn(),
  };

  return { mockUsageEventDoc, mockUsageEventModel };
});

// Mock config to avoid env-var dependency for Stripe price IDs
vi.mock('../config.js', () => ({
  COLLECTIONS: { USAGE_EVENTS: 'UsageEvents' },
  getStripePriceId: vi.fn().mockReturnValue('price_test123'),
  getUnitCost: vi.fn().mockReturnValue(0.5),
}));

// Mock pubsub
vi.mock('../pubsub.service.js', () => ({
  publishUsageEvent: vi.fn().mockResolvedValue(undefined),
}));

// Mock UsageEventModel (MongoDB)
vi.mock('../../../models/analytics/usage-event.model.js', () => ({
  UsageEventModel: mockUsageEventModel,
}));

const BASE_DOC = {
  _id: { toString: () => 'test-event-id' },
  userId: 'user123',
  teamId: 'team456',
  quantity: 1,
  status: UsageEventStatus.PENDING,
};

describe('Usage Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUsageEventModel.create.mockResolvedValue(BASE_DOC);
    mockUsageEventModel.findOne.mockResolvedValue(null);
    mockUsageEventModel.findOneAndUpdate.mockResolvedValue(null);
  });

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

  describe('recordUsageEvent', () => {
    const input: CreateUsageEventInput = {
      userId: 'user123',
      teamId: 'team456',
      feature: 'highlights',
      quantity: 1,
      unitCostSnapshot: 0.5,
      currency: 'usd',
      stripePriceId: 'price_test123',
      jobId: 'job789',
    };

    it('should create usage event when not exists', async () => {
      const eventId = await recordUsageEvent(input, 'production');

      expect(eventId).toBe('test-event-id');
      expect(mockUsageEventModel.create).toHaveBeenCalledOnce();
    });

    it('should omit teamId when usage is user-scoped', async () => {
      const userScopedInput: CreateUsageEventInput = {
        userId: 'user123',
        feature: 'highlights',
        quantity: 1,
        unitCostSnapshot: 0.5,
        currency: 'usd',
        stripePriceId: 'price_test123',
        jobId: 'job-no-team',
      };

      await recordUsageEvent(userScopedInput, 'production');

      expect(mockUsageEventModel.create).toHaveBeenCalledWith(
        expect.not.objectContaining({ teamId: expect.anything() })
      );
    });

    it('should not create duplicate event with same idempotency key', async () => {
      // Simulate E11000 duplicate key error from MongoDB
      const dupError = Object.assign(new Error('duplicate key'), { code: 11000 });
      mockUsageEventModel.create.mockRejectedValueOnce(dupError);
      mockUsageEventModel.findOne.mockReturnValueOnce({
        lean: () => Promise.resolve({ _id: { toString: () => 'existing-event-id' } }),
      });

      const eventId = await recordUsageEvent(input, 'production');

      expect(eventId).toBe('existing-event-id');
      expect(mockUsageEventModel.findOne).toHaveBeenCalledOnce();
    });
  });

  describe('tryAcquireEventLock', () => {
    it('should acquire lock when status is PENDING', async () => {
      mockUsageEventModel.findOneAndUpdate.mockResolvedValueOnce(BASE_DOC);

      const result = await tryAcquireEventLock('event123');

      expect(result).toBe(true);
      expect(mockUsageEventModel.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: 'event123', status: UsageEventStatus.PENDING },
        expect.objectContaining({
          $set: expect.objectContaining({ status: UsageEventStatus.PROCESSING }),
        }),
        { new: false }
      );
    });

    it('should not acquire lock when status is not PENDING', async () => {
      // findOneAndUpdate returns null => filter didn't match => already locked
      mockUsageEventModel.findOneAndUpdate.mockResolvedValueOnce(null);

      const result = await tryAcquireEventLock('event123');

      expect(result).toBe(false);
    });

    it('should return false when event does not exist', async () => {
      mockUsageEventModel.findOneAndUpdate.mockResolvedValueOnce(null);

      const result = await tryAcquireEventLock('nonexistent');

      expect(result).toBe(false);
    });
  });
});
