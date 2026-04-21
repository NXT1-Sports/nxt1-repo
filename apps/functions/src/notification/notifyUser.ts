/**
 * @fileoverview Shared notification helper for Cloud Functions
 * @module @nxt1/functions/notification/notifyUser
 *
 * Atomic batch writer for the functions package — mirrors what
 * backend/src/services/notification.service.ts dispatch() does,
 * but without @nxt1/core or backend package dependencies.
 *
 * Used by:
 *   - sendNotification  (admin callable)
 *   - subscriptionCheck (scheduled function)
 *
 * If dispatch() data shape changes, update this file to match.
 *
 * Deduplication:
 *   Deterministic doc IDs provide a 5-minute dedup window. If the same
 *   event fires twice (e.g. Cloud Function retry), the second batch.set()
 *   overwrites the existing doc without re-triggering onNotificationCreated
 *   (Firestore onCreate triggers only fire on document creation, not updates).
 */

import * as admin from 'firebase-admin';

/** 45-day TTL — Firestore auto-deletes expired docs when a TTL policy is enabled. */
const NOTIFICATION_TTL_MS = 45 * 24 * 60 * 60 * 1000;

export interface FunctionNotifyInput {
  readonly userId: string;
  readonly type: string;
  readonly category: string;
  readonly priority: 'normal' | 'high';
  readonly title: string;
  readonly body: string;
  readonly deepLink: string;
  readonly data?: Record<string, unknown>;
  readonly metadata?: Record<string, unknown> | null;
  readonly source?: {
    readonly userName: string | null;
    readonly userId: string | null;
    readonly avatarUrl: string | null;
    readonly teamName: string | null;
  } | null;
}

export interface FunctionNotifyResult {
  readonly notificationId: string;
  readonly activityId: string;
}

/**
 * Write both the push queue doc and activity feed doc atomically.
 *
 * @param db  - Firestore instance from firebase-admin
 * @param input - Notification payload
 * @returns Doc IDs of the notification and activity documents written
 */
export async function notifyUser(
  db: admin.firestore.Firestore,
  input: FunctionNotifyInput
): Promise<FunctionNotifyResult> {
  const now = admin.firestore.FieldValue.serverTimestamp();

  // Deterministic 5-minute dedup ID — prevents re-delivery on Cloud Function retries
  const timeBucket = Math.floor(Date.now() / (5 * 60 * 1000));
  const entityPart = (input.data?.['entityId'] ?? input.data?.['teamId'] ?? '') as string;
  const rawKey = `${input.userId}_${input.type}_${entityPart}_${timeBucket}`;
  const dedupId = rawKey.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 100);
  const activityDedupId = `${dedupId}_a`;

  const notificationRef = db.collection('Notifications').doc(dedupId);
  const activityRef = db
    .collection('Users')
    .doc(input.userId)
    .collection('activity')
    .doc(activityDedupId);

  const batch = db.batch();

  // 1. Push queue doc — triggers onNotificationCreated Cloud Function
  batch.set(notificationRef, {
    userId: input.userId,
    type: input.type,
    category: input.category,
    priority: input.priority,
    title: input.title,
    body: input.body,
    data: {
      type: input.type,
      deepLink: input.deepLink,
      ...(input.data ?? {}),
    },
    status: 'pending',
    createdAt: now,
    expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + NOTIFICATION_TTL_MS),
  });

  // 2. Activity feed doc — user-visible in the /activity inbox tab
  batch.set(activityRef, {
    type: mapToActivityType(input.type),
    tab: 'alerts',
    priority: input.priority,
    title: input.title,
    body: input.body,
    timestamp: now,
    isRead: false,
    isArchived: false,
    deepLink: input.deepLink,
    metadata: input.metadata ?? null,
    source: input.source ?? null,
    expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + NOTIFICATION_TTL_MS),
  });

  await batch.commit();

  return { notificationId: dedupId, activityId: activityDedupId };
}

// ============================================
// HELPERS
// ============================================

/**
 * Simplified activity-type mapping for billing/system notification types
 * handled in the functions package. The full mapping lives in
 * backend/src/services/notification.service.ts for all other types.
 */
function mapToActivityType(type: string): string {
  const map: Record<string, string> = {
    payment_failed: 'update',
    payment_succeeded: 'update',
    credits_low: 'update',
    credits_added: 'update',
    account_created: 'system',
    security_alert: 'system',
  };
  return map[type] ?? 'update';
}
