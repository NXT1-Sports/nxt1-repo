/**
 * @fileoverview Unified Notification Service
 * @module @nxt1/backend/services/notification
 *
 * The SINGLE entry point for all push notifications across the platform.
 * Every feature (Agent X, Social, Billing, Team, Recruiting) dispatches
 * through this service — no feature should write directly to Firestore
 * notification collections.
 *
 * Architecture:
 * ┌──────────────────────────────────────────────────────────────────┐
 * │  Agent Worker │ Billing Webhook │ Social Routes │ Subscription  │
 * │               │                 │               │    Check      │
 * └──────┬────────┴────────┬────────┴───────┬───────┴───────┬───────┘
 *        │                 │                │               │
 *        ▼                 ▼                ▼               ▼
 * ┌──────────────────────────────────────────────────────────────────┐
 * │                NotificationService.dispatch()                    │
 * │   (THIS FILE — single atomic batch write for every feature)     │
 * │                                                                  │
 * │   1. Writes activity doc → users/{uid}/activity/{docId}          │
 * │   2. Writes push doc    → notifications/{docId}                  │
 * └──────────────────────────────────────────────┬───────────────────┘
 *                                                │
 *                                                ▼ (Firestore trigger)
 * ┌──────────────────────────────────────────────────────────────────┐
 * │           onNotificationCreatedV2 (Cloud Function)               │
 * │   Category-aware preference check → FCM multicast → cleanup     │
 * └──────────────────────────────────────────────────────────────────┘
 *
 * This guarantees:
 * - Zero duplication: One place writes to Firestore for push
 * - Atomic writes: Activity + push doc succeed or fail together
 * - Single preference gate: Cloud Function handles category filtering
 * - Easy auditing: Every push on the platform passes through dispatch()
 */

import type { Firestore } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import type { DispatchNotificationInput, NotificationType } from '@nxt1/core';
import {
  NOTIFICATION_COLLECTIONS,
  NOTIFICATION_TYPE_CATEGORY,
  NOTIFICATION_TYPE_TAB,
  PUSH_CONFIG,
  isHighPriorityNotification,
  resolveDeepLink,
} from '@nxt1/core';
import { logger } from '../utils/logger.js';

// ============================================
// TYPES
// ============================================

export interface DispatchResult {
  /** Firestore doc ID written to users/{uid}/activity */
  readonly activityId: string | null;
  /** Firestore doc ID written to the notifications push queue */
  readonly notificationId: string;
}

// ============================================
// SERVICE
// ============================================

/**
 * Dispatch a notification + activity item for any feature.
 *
 * This is the ONLY function in the entire backend that writes to the
 * `notifications` collection. All features delegate here.
 *
 * The activity write is the SSOT for the user's feed. The notification
 * doc triggers the `onNotificationCreated` Cloud Function which handles
 * FCM delivery, preference checks, and token cleanup.
 */
export async function dispatch(
  db: Firestore,
  input: DispatchNotificationInput
): Promise<DispatchResult> {
  const now = FieldValue.serverTimestamp();
  const {
    userId,
    type,
    title,
    body,
    deepLink,
    data,
    source,
    metadata,
    mediaUrl,
    mediaType,
    skipActivity,
  } = input;

  const category = NOTIFICATION_TYPE_CATEGORY[type];
  const tab = NOTIFICATION_TYPE_TAB[type];
  const priority = input.priority ?? (isHighPriorityNotification(type) ? 'high' : 'normal');

  // Resolve deep link: use caller-supplied link, or fall back to type-based template
  const resolvedDeepLink =
    deepLink ??
    resolveDeepLink(type, {
      sourceUserId: source?.userId ?? undefined,
      entityId: data?.['entityId'] ?? undefined,
      teamId: data?.['teamId'] ?? undefined,
      sessionId: data?.['sessionId'] ?? undefined,
    });

  // Truncate title/body per push config limits
  const safeTitle =
    title.length > PUSH_CONFIG.MAX_TITLE_LENGTH
      ? title.slice(0, PUSH_CONFIG.MAX_TITLE_LENGTH - 1) + '…'
      : title;
  const safeBody =
    body.length > PUSH_CONFIG.MAX_BODY_LENGTH
      ? body.slice(0, PUSH_CONFIG.MAX_BODY_LENGTH - 1) + '…'
      : body;

  // Deterministic 5-minute dedup ID — if the same event fires twice (e.g. network
  // retry, double-tap), the second batch.set() overwrites the existing doc without
  // re-triggering onNotificationCreated (onCreate only fires on document creation).
  const timeBucket = Math.floor(Date.now() / (5 * 60 * 1000));
  const entityPart = (data?.['entityId'] ?? data?.['teamId'] ?? '') as string;
  const rawKey = `${userId}_${type}_${entityPart}_${timeBucket}`;
  const dedupId = rawKey.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 100);

  // Prepare document references
  const notificationRef = db.collection(NOTIFICATION_COLLECTIONS.NOTIFICATIONS).doc(dedupId);
  let activityRef: FirebaseFirestore.DocumentReference | null = null;

  if (!skipActivity) {
    activityRef = db
      .collection('users')
      .doc(userId)
      .collection(NOTIFICATION_COLLECTIONS.USER_ACTIVITY)
      .doc(`${dedupId}_a`);
  }

  // Atomic batch — activity + notification succeed or fail together
  const batch = db.batch();

  // 1. Activity feed doc (user-visible in /activity)
  if (activityRef) {
    batch.set(activityRef, {
      type: mapNotificationTypeToActivityType(type),
      tab,
      priority,
      title: safeTitle,
      body: safeBody,
      timestamp: now,
      isRead: false,
      isArchived: false,
      deepLink: resolvedDeepLink,
      metadata: metadata ?? null,
      ...(mediaUrl ? { mediaUrl } : {}),
      ...(mediaType ? { mediaType } : {}),
      source: source
        ? {
            userName: source.userName ?? null,
            userId: source.userId ?? null,
            avatarUrl: source.avatarUrl ?? null,
            teamName: source.teamName ?? null,
          }
        : null,
    });
  }

  // 2. Push queue doc (triggers onNotificationCreated Cloud Function)
  batch.set(notificationRef, {
    userId,
    type,
    category,
    priority,
    title: safeTitle,
    body: safeBody,
    data: {
      type,
      deepLink: resolvedDeepLink ?? '',
      ...(data ?? {}),
    },
    status: 'pending',
    createdAt: now,
  });

  await batch.commit();

  logger.info('Notification dispatched', {
    userId,
    type,
    category,
    tab,
    activityId: activityRef?.id ?? null,
    notificationId: notificationRef.id,
  });

  return {
    activityId: activityRef?.id ?? null,
    notificationId: notificationRef.id,
  };
}

/**
 * Dispatch notifications to multiple users at once.
 * Useful for team announcements, broadcast alerts, etc.
 *
 * Each user gets their own activity + push doc pair.
 * Uses parallel dispatch (not a single batch) since Firestore
 * batches are limited to 500 operations.
 */
export async function dispatchToMany(
  db: Firestore,
  userIds: readonly string[],
  input: Omit<DispatchNotificationInput, 'userId'>
): Promise<readonly DispatchResult[]> {
  const results = await Promise.allSettled(
    userIds.map((userId) => dispatch(db, { ...input, userId }))
  );

  const dispatched: DispatchResult[] = [];
  for (const result of results) {
    if (result.status === 'fulfilled') {
      dispatched.push(result.value);
    } else {
      logger.error('Failed to dispatch notification to user', {
        error: result.reason,
        type: input.type,
      });
    }
  }

  return dispatched;
}

// ============================================
// HELPERS
// ============================================

/**
 * Map a NotificationType to an ActivityType string.
 * The ActivityType is a simplified enum used for UI styling.
 */
function mapNotificationTypeToActivityType(type: NotificationType): string {
  const map: Partial<Record<NotificationType, string>> = {
    new_follower: 'follow',
    post_like: 'like',
    post_mention: 'mention',
    message_from_coach: 'message',
    new_offer: 'offer',
    special_offer: 'deal',
    team_announcement: 'announcement',
    feature_announcement: 'announcement',
    camp_reminder: 'reminder',
    visit_reminder: 'reminder',
    ai_task_complete: 'agent_task',
    agent_welcome: 'agent_task',
    video_processed: 'agent_task',
    video_failed: 'agent_task',
    card_ready: 'agent_task',
    security_alert: 'system',
    password_changed: 'system',
    account_created: 'system',
    email_verified: 'system',
    profile_incomplete: 'system',
  };

  return map[type] ?? 'update';
}
