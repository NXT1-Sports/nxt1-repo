/**
 * @fileoverview Usage Service
 * @module @nxt1/backend/modules/billing
 *
 * Service for recording and managing usage events.
 * This is the entry point for all usage-based billing.
 *
 * Backed by MongoDB (via Mongoose) — migrated from Firestore.
 * No Firestore `db` parameter needed; Mongoose models are singletons.
 */

import { createHash } from 'crypto';
import { Types } from 'mongoose';
import { logger } from '../../utils/logger.js';
import {
  type UsageEvent,
  type CreateUsageEventInput,
  type UsageCostType,
  UsageEventStatus,
} from './types/index.js';
import { getStripePriceId, getUnitCost } from './config.js';
import { publishUsageEvent } from './pubsub.service.js';
import { UsageEventModel, type UsageEventDocument } from '../../models/usage-event.model.js';

// Re-export types for external use
export { UsageEventStatus };

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Map a Mongoose lean document to the canonical UsageEvent interface.
 * The `id` field is the MongoDB ObjectId stringified.
 */
function toUsageEvent(doc: UsageEventDocument): UsageEvent {
  return {
    id: (doc._id as Types.ObjectId).toString(),
    userId: doc.userId,
    teamId: doc.teamId,
    feature: doc.feature as UsageEvent['feature'],
    quantity: doc.quantity,
    unitCostSnapshot: doc.unitCostSnapshot,
    costType: doc.costType as UsageEvent['costType'],
    rawProviderCostUsd: doc.rawProviderCostUsd,
    currency: doc.currency,
    stripePriceId: doc.stripePriceId,
    idempotencyKey: doc.idempotencyKey,
    status: doc.status as UsageEventStatus,
    stripeUsageId: doc.stripeUsageId,
    stripeInvoiceItemId: doc.stripeInvoiceItemId,
    errorMessage: doc.errorMessage,
    retryCount: doc.retryCount,
    lastRetryAt: doc.lastRetryAt as unknown as UsageEvent['lastRetryAt'],
    metadata: doc.metadata,
    createdAt: doc.createdAt as unknown as UsageEvent['createdAt'],
    updatedAt: doc.updatedAt as unknown as UsageEvent['updatedAt'],
  };
}

// ─── Exported Functions ───────────────────────────────────────────────────────

/**
 * Generate idempotency key for usage event.
 * Prevents duplicate billing for the same AI job.
 */
export function generateIdempotencyKey(userId: string, feature: string, jobId: string): string {
  const hash = createHash('sha256');
  hash.update(`${userId}:${feature}:${jobId}`);
  return hash.digest('hex');
}

/**
 * Create a new usage event.
 * Idempotency is enforced via a unique index on `idempotencyKey`; duplicate
 * writes (MongoDB E11000) are silently swallowed and the existing event ID is
 * returned. This replaces the old Firestore pre-check query.
 *
 * @returns Created (or existing) usage event ID
 */
export async function recordUsageEvent(
  input: CreateUsageEventInput,
  environment: 'staging' | 'production'
): Promise<string> {
  // Generate idempotency key
  const jobId = input.jobId || `${Date.now()}-${Math.random()}`;
  const idempotencyKey = generateIdempotencyKey(input.userId, input.feature, jobId);

  // Prefer caller-supplied stripePriceId; fall back to config lookup for static-price features.
  const stripePriceId = input.stripePriceId || getStripePriceId(input.feature, environment);

  // Determine cost type and final unit cost snapshot
  const isDynamic = typeof input.dynamicCostCents === 'number' && input.dynamicCostCents > 0;
  const costType: UsageCostType = isDynamic ? 'dynamic' : 'static';
  const unitCostSnapshot: number = isDynamic
    ? (input.dynamicCostCents as number)
    : input.unitCostSnapshot || getUnitCost(input.feature);

  const now = new Date();

  try {
    const doc = await UsageEventModel.create({
      userId: input.userId,
      teamId: input.teamId,
      feature: input.feature,
      quantity: input.quantity,
      unitCostSnapshot,
      costType,
      ...(isDynamic && input.rawProviderCostUsd != null
        ? { rawProviderCostUsd: input.rawProviderCostUsd }
        : {}),
      currency: input.currency || 'usd',
      stripePriceId,
      idempotencyKey,
      status: UsageEventStatus.PENDING,
      retryCount: 0,
      metadata: input.metadata,
      createdAt: now,
      updatedAt: now,
    });

    const eventId = doc._id.toString();

    logger.info('[recordUsageEvent] Usage event created', {
      eventId,
      userId: input.userId,
      feature: input.feature,
      quantity: input.quantity,
    });

    // Publish to Pub/Sub for async processing
    try {
      await publishUsageEvent(eventId, environment);
      logger.info('[recordUsageEvent] Published to Pub/Sub', { eventId });
    } catch (pubsubError) {
      logger.error('[recordUsageEvent] Failed to publish to Pub/Sub', {
        error: pubsubError,
        eventId,
      });
      // Don't fail the request — event is recorded and can be reconciled later
    }

    return eventId;
  } catch (err) {
    // E11000: duplicate idempotency key — event already exists, return existing ID
    if ((err as { code?: number }).code === 11000) {
      logger.info('[recordUsageEvent] Duplicate idempotency key — returning existing event ID', {
        idempotencyKey,
        userId: input.userId,
        feature: input.feature,
      });
      const existing = await UsageEventModel.findOne({ idempotencyKey }).lean();
      return existing ? (existing._id as Types.ObjectId).toString() : '';
    }

    logger.error('[recordUsageEvent] Failed to create usage event', { error: err, input });
    throw err;
  }
}

/**
 * Get usage event by ID.
 */
export async function getUsageEvent(eventId: string): Promise<UsageEvent | null> {
  try {
    const doc = await UsageEventModel.findById(eventId).lean();
    if (!doc) return null;
    return toUsageEvent(doc as UsageEventDocument);
  } catch (error) {
    logger.error('[getUsageEvent] Failed to get usage event', { error, eventId });
    throw error;
  }
}

/**
 * Update usage event status and optional fields.
 */
export async function updateUsageEventStatus(
  eventId: string,
  status: UsageEventStatus,
  updates: Partial<UsageEvent> = {}
): Promise<void> {
  try {
    // Strip immutable fields from updates
    const { id: _id, createdAt: _c, ...safeUpdates } = updates as Record<string, unknown>;
    void _id;
    void _c;

    await UsageEventModel.findByIdAndUpdate(eventId, {
      $set: { status, ...safeUpdates, updatedAt: new Date() },
    });

    logger.info('[updateUsageEventStatus] Status updated', { eventId, status });
  } catch (error) {
    logger.error('[updateUsageEventStatus] Failed to update status', { error, eventId, status });
    throw error;
  }
}

/**
 * Try to acquire lock on usage event for processing.
 * Prevents double processing from Pub/Sub retries.
 *
 * Uses atomic findOneAndUpdate — the filter requires `status: PENDING`,
 * so if another worker instance already picked this up the filter does
 * not match and null is returned.
 *
 * @returns true if lock acquired, false otherwise
 */
export async function tryAcquireEventLock(eventId: string): Promise<boolean> {
  try {
    const previous = await UsageEventModel.findOneAndUpdate(
      { _id: eventId, status: UsageEventStatus.PENDING },
      { $set: { status: UsageEventStatus.PROCESSING, updatedAt: new Date() } },
      { new: false } // return OLD doc (null = filter didn't match = already locked)
    );

    const acquired = previous !== null;
    logger.info('[tryAcquireEventLock] Lock result', { eventId, acquired });
    return acquired;
  } catch (error) {
    logger.error('[tryAcquireEventLock] Failed to acquire lock', { error, eventId });
    return false;
  }
}

/**
 * Get pending or failed usage events for reconciliation.
 */
export async function getPendingUsageEvents(limit: number = 100): Promise<UsageEvent[]> {
  try {
    const docs = await UsageEventModel.find({
      status: { $in: [UsageEventStatus.PENDING, UsageEventStatus.FAILED] },
    })
      .sort({ createdAt: 1 })
      .limit(limit)
      .lean();

    return (docs as UsageEventDocument[]).map(toUsageEvent);
  } catch (error) {
    logger.error('[getPendingUsageEvents] Failed to get pending events', { error });
    throw error;
  }
}

/**
 * Get usage events by user.
 */
export async function getUserUsageEvents(
  userId: string,
  limit: number = 50
): Promise<UsageEvent[]> {
  try {
    const docs = await UsageEventModel.find({ userId }).sort({ createdAt: -1 }).limit(limit).lean();

    return (docs as UsageEventDocument[]).map(toUsageEvent);
  } catch (error) {
    logger.error('[getUserUsageEvents] Failed to get user usage events', { error, userId });
    throw error;
  }
}

/**
 * Get usage events by team.
 */
export async function getTeamUsageEvents(
  teamId: string,
  limit: number = 100
): Promise<UsageEvent[]> {
  try {
    const docs = await UsageEventModel.find({ teamId }).sort({ createdAt: -1 }).limit(limit).lean();

    return (docs as UsageEventDocument[]).map(toUsageEvent);
  } catch (error) {
    logger.error('[getTeamUsageEvents] Failed to get team usage events', { error, teamId });
    throw error;
  }
}

// Export CreateUsageEventInput type
export type { CreateUsageEventInput };
