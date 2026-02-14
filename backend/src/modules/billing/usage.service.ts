/**
 * @fileoverview Usage Service
 * @module @nxt1/backend/modules/billing
 *
 * Service for recording and managing usage events
 * This is the entry point for all usage-based billing
 */

import type { Firestore } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import { createHash } from 'crypto';
import { logger } from '../../utils/logger.js';
import { type UsageEvent, type CreateUsageEventInput, UsageEventStatus } from './types/index.js';
import { COLLECTIONS, getStripePriceId, getUnitCost } from './config.js';
import { publishUsageEvent } from './pubsub.service.js';

// Re-export types for external use
export { UsageEventStatus };

/**
 * Generate idempotency key for usage event
 * Prevents duplicate billing for the same AI job
 */
export function generateIdempotencyKey(userId: string, feature: string, jobId: string): string {
  const hash = createHash('sha256');
  hash.update(`${userId}:${feature}:${jobId}`);
  return hash.digest('hex');
}

/**
 * Check if usage event already exists
 */
export async function checkUsageEventExists(
  db: Firestore,
  idempotencyKey: string
): Promise<boolean> {
  const snapshot = await db
    .collection(COLLECTIONS.USAGE_EVENTS)
    .where('idempotencyKey', '==', idempotencyKey)
    .limit(1)
    .get();

  return !snapshot.empty;
}

/**
 * Create a new usage event
 * This is the main entry point for recording billable usage
 *
 * @param db Firestore instance
 * @param input Usage event input
 * @param environment Current environment
 * @returns Created usage event ID
 */
export async function recordUsageEvent(
  db: Firestore,
  input: CreateUsageEventInput,
  environment: 'staging' | 'production'
): Promise<string> {
  try {
    // Generate idempotency key
    const jobId = input.jobId || `${Date.now()}-${Math.random()}`;
    const idempotencyKey = generateIdempotencyKey(input.userId, input.feature, jobId);

    // Check if already exists
    const exists = await checkUsageEventExists(db, idempotencyKey);
    if (exists) {
      logger.info('[recordUsageEvent] Event already exists, skipping', {
        idempotencyKey,
        userId: input.userId,
        feature: input.feature,
      });
      // Get existing event ID
      const snapshot = await db
        .collection(COLLECTIONS.USAGE_EVENTS)
        .where('idempotencyKey', '==', idempotencyKey)
        .limit(1)
        .get();

      return snapshot.docs[0]?.id || '';
    }

    // Get Stripe Price ID
    const stripePriceId = getStripePriceId(input.feature, environment);

    // Create usage event
    const now = FieldValue.serverTimestamp();
    const usageEvent: Omit<UsageEvent, 'id' | 'createdAt' | 'updatedAt'> = {
      userId: input.userId,
      teamId: input.teamId,
      feature: input.feature,
      quantity: input.quantity,
      unitCostSnapshot: input.unitCostSnapshot || getUnitCost(input.feature),
      currency: input.currency || 'usd',
      stripePriceId,
      idempotencyKey,
      status: UsageEventStatus.PENDING,
      retryCount: 0,
      metadata: input.metadata,
    };

    const docRef = await db.collection(COLLECTIONS.USAGE_EVENTS).add({
      ...usageEvent,
      createdAt: now,
      updatedAt: now,
    });

    logger.info('[recordUsageEvent] Usage event created', {
      eventId: docRef.id,
      userId: input.userId,
      feature: input.feature,
      quantity: input.quantity,
    });

    // Publish to Pub/Sub for async processing
    try {
      await publishUsageEvent(docRef.id, environment);
      logger.info('[recordUsageEvent] Published to Pub/Sub', {
        eventId: docRef.id,
      });
    } catch (pubsubError) {
      logger.error('[recordUsageEvent] Failed to publish to Pub/Sub', {
        error: pubsubError,
        eventId: docRef.id,
      });
      // Don't fail the request - event is recorded and can be reconciled later
    }

    return docRef.id;
  } catch (error) {
    logger.error('[recordUsageEvent] Failed to create usage event', {
      error,
      input,
    });
    throw error;
  }
}

/**
 * Get usage event by ID
 */
export async function getUsageEvent(db: Firestore, eventId: string): Promise<UsageEvent | null> {
  try {
    const doc = await db.collection(COLLECTIONS.USAGE_EVENTS).doc(eventId).get();

    if (!doc.exists) {
      return null;
    }

    return {
      id: doc.id,
      ...doc.data(),
    } as UsageEvent;
  } catch (error) {
    logger.error('[getUsageEvent] Failed to get usage event', {
      error,
      eventId,
    });
    throw error;
  }
}

/**
 * Update usage event status
 */
export async function updateUsageEventStatus(
  db: Firestore,
  eventId: string,
  status: UsageEventStatus,
  updates: Partial<UsageEvent> = {}
): Promise<void> {
  try {
    await db
      .collection(COLLECTIONS.USAGE_EVENTS)
      .doc(eventId)
      .update({
        status,
        ...updates,
        updatedAt: FieldValue.serverTimestamp(),
      });

    logger.info('[updateUsageEventStatus] Status updated', {
      eventId,
      status,
    });
  } catch (error) {
    logger.error('[updateUsageEventStatus] Failed to update status', {
      error,
      eventId,
      status,
    });
    throw error;
  }
}

/**
 * Try to acquire lock on usage event for processing
 * Prevents double processing from Pub/Sub retries
 *
 * @returns true if lock acquired, false otherwise
 */
export async function tryAcquireEventLock(db: Firestore, eventId: string): Promise<boolean> {
  try {
    const result = await db.runTransaction(async (transaction) => {
      const docRef = db.collection(COLLECTIONS.USAGE_EVENTS).doc(eventId);
      const doc = await transaction.get(docRef);

      if (!doc.exists) {
        throw new Error(`Usage event ${eventId} not found`);
      }

      const data = doc.data() as UsageEvent;

      // Only acquire lock if status is PENDING
      if (data.status !== UsageEventStatus.PENDING) {
        return false;
      }

      // Set status to PROCESSING
      transaction.update(docRef, {
        status: UsageEventStatus.PROCESSING,
        updatedAt: FieldValue.serverTimestamp(),
      });

      return true;
    });

    logger.info('[tryAcquireEventLock] Lock result', {
      eventId,
      acquired: result,
    });

    return result;
  } catch (error) {
    logger.error('[tryAcquireEventLock] Failed to acquire lock', {
      error,
      eventId,
    });
    return false;
  }
}

/**
 * Get pending or failed usage events for reconciliation
 */
export async function getPendingUsageEvents(
  db: Firestore,
  limit: number = 100
): Promise<UsageEvent[]> {
  try {
    const snapshot = await db
      .collection(COLLECTIONS.USAGE_EVENTS)
      .where('status', 'in', [UsageEventStatus.PENDING, UsageEventStatus.FAILED])
      .orderBy('createdAt', 'asc')
      .limit(limit)
      .get();

    return snapshot.docs.map(
      (doc) =>
        ({
          id: doc.id,
          ...doc.data(),
        }) as UsageEvent
    );
  } catch (error) {
    logger.error('[getPendingUsageEvents] Failed to get pending events', {
      error,
    });
    throw error;
  }
}

/**
 * Get usage events by user
 */
export async function getUserUsageEvents(
  db: Firestore,
  userId: string,
  limit: number = 50
): Promise<UsageEvent[]> {
  try {
    const snapshot = await db
      .collection(COLLECTIONS.USAGE_EVENTS)
      .where('userId', '==', userId)
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();

    return snapshot.docs.map(
      (doc) =>
        ({
          id: doc.id,
          ...doc.data(),
        }) as UsageEvent
    );
  } catch (error) {
    logger.error('[getUserUsageEvents] Failed to get user usage events', {
      error,
      userId,
    });
    throw error;
  }
}

/**
 * Get usage events by team
 */
export async function getTeamUsageEvents(
  db: Firestore,
  teamId: string,
  limit: number = 100
): Promise<UsageEvent[]> {
  try {
    const snapshot = await db
      .collection(COLLECTIONS.USAGE_EVENTS)
      .where('teamId', '==', teamId)
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();

    return snapshot.docs.map(
      (doc) =>
        ({
          id: doc.id,
          ...doc.data(),
        }) as UsageEvent
    );
  } catch (error) {
    logger.error('[getTeamUsageEvents] Failed to get team usage events', {
      error,
      teamId,
    });
    throw error;
  }
}

// Export CreateUsageEventInput type
export type { CreateUsageEventInput };
