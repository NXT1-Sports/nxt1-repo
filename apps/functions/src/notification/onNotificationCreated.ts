/**
 * @fileoverview On Notification Created — Unified Push Processor
 * @module @nxt1/functions/notification/onNotificationCreated
 *
 * The SINGLE Cloud Function responsible for all push delivery on the platform.
 * Triggered when ANY feature writes a document to the `Notifications` collection
 * via the backend's unified `NotificationService.dispatch()`.
 *
 * Processing pipeline:
 *  1. Read notification payload (userId, type, category, title, body, data)
 *  2. Fetch user's FCM tokens from `FcmTokens/{userId}`
 *  3. Check user preferences: global kill-switch + per-category opt-out
 *  4. Build platform-specific FCM message (APNS badge/sound, Android channel)
 *  5. Send via `sendEachForMulticast`
 *  6. Clean up invalid tokens automatically
 *  7. Update notification doc with delivery status
 */

import * as admin from 'firebase-admin';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';

const db = admin.firestore();
const messaging = admin.messaging();

// Keep functions self-contained because workspace packages are unavailable in Cloud Build / Cloud Run.
const DEFAULT_NOTIFICATION_CADENCE_CAPS = {
  maxPushesPerDay: 6,
  minIntervalMinutes: 120,
  maxMarketingPushesPerDay: 2,
} as const;

interface TokenData {
  token: string;
  platform: string;
  addedAt: admin.firestore.Timestamp;
}

/**
 * Notification preferences stored on the User document at
 * `Users/{userId}.preferences.notifications`.
 *
 * This is the canonical source of truth — the legacy
 * `notification_preferences/{userId}` collection is deprecated.
 */
interface UserNotificationPreferences {
  /** Global push kill-switch */
  push?: boolean;
  /** Global email kill-switch */
  email?: boolean;
  /** SMS opt-in (reserved) */
  sms?: boolean;
  /** Marketing/promotional email opt-in */
  marketing?: boolean;
  categoryPreferences?: Partial<
    Record<
      string,
      {
        push?: boolean;
        email?: boolean;
        sms?: boolean;
      }
    >
  >;
  quietHours?: {
    enabled?: boolean;
    startHour?: number;
    endHour?: number;
    timezone?: string;
  };
  cadenceCaps?: {
    maxPushesPerDay?: number;
    minIntervalMinutes?: number;
    maxMarketingPushesPerDay?: number;
  };
}

interface PushDeliveryPolicy {
  respectQuietHours?: boolean;
  respectCadenceCap?: boolean;
  treatAsMarketing?: boolean;
}

interface PushDeliveryStats {
  dayKey?: string;
  dailyCount?: number;
  marketingDayKey?: string;
  marketingDailyCount?: number;
  lastSentAt?: admin.firestore.Timestamp;
  lastMarketingSentAt?: admin.firestore.Timestamp;
}

function toTimestamp(value: unknown): admin.firestore.Timestamp | null {
  if (!value) return null;
  if (value instanceof admin.firestore.Timestamp) return value;
  if (typeof value === 'object' && value !== null) {
    const candidate = value as { seconds?: number; nanoseconds?: number; _seconds?: number };
    if (typeof candidate.seconds === 'number') {
      return new admin.firestore.Timestamp(candidate.seconds, candidate.nanoseconds ?? 0);
    }
    if (typeof candidate._seconds === 'number') {
      return new admin.firestore.Timestamp(candidate._seconds, 0);
    }
  }
  return null;
}

function isQuietHours(preferences: UserNotificationPreferences, now: Date = new Date()): boolean {
  const quietHours = preferences.quietHours;
  if (!quietHours?.enabled) return false;
  if (
    typeof quietHours.startHour !== 'number' ||
    typeof quietHours.endHour !== 'number' ||
    typeof quietHours.timezone !== 'string'
  ) {
    return false;
  }

  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      hour12: false,
      timeZone: quietHours.timezone,
    });
    const userHour = parseInt(formatter.format(now), 10);

    if (quietHours.startHour < quietHours.endHour) {
      return userHour >= quietHours.startHour && userHour < quietHours.endHour;
    }
    return userHour >= quietHours.startHour || userHour < quietHours.endHour;
  } catch {
    return false;
  }
}

function getDayKey(timezone?: string, now: Date = new Date()): string {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone || 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return formatter.format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

function exceedsCadenceCap(
  preferences: UserNotificationPreferences,
  stats: PushDeliveryStats | undefined,
  treatAsMarketing: boolean,
  now: Date = new Date()
): boolean {
  if (!stats) {
    return false;
  }

  const caps = preferences.cadenceCaps ?? DEFAULT_NOTIFICATION_CADENCE_CAPS;
  const lastSentAt = treatAsMarketing ? stats.lastMarketingSentAt : stats.lastSentAt;
  if (
    typeof caps.minIntervalMinutes === 'number' &&
    lastSentAt &&
    now.getTime() - lastSentAt.toDate().getTime() < caps.minIntervalMinutes * 60 * 1000
  ) {
    return true;
  }

  const dayKey = getDayKey(preferences.quietHours?.timezone, now);
  if (
    typeof caps.maxPushesPerDay === 'number' &&
    stats.dayKey === dayKey &&
    (stats.dailyCount ?? 0) >= caps.maxPushesPerDay
  ) {
    return true;
  }

  if (
    treatAsMarketing &&
    typeof caps.maxMarketingPushesPerDay === 'number' &&
    stats.marketingDayKey === dayKey &&
    (stats.marketingDailyCount ?? 0) >= caps.maxMarketingPushesPerDay
  ) {
    return true;
  }

  return false;
}

async function updatePushDeliveryStats(
  userId: string,
  preferences: UserNotificationPreferences,
  currentStats: PushDeliveryStats | undefined,
  treatAsMarketing: boolean
): Promise<void> {
  const now = admin.firestore.Timestamp.now();
  const dayKey = getDayKey(preferences.quietHours?.timezone);

  const nextStats = {
    dayKey,
    dailyCount: currentStats?.dayKey === dayKey ? (currentStats.dailyCount ?? 0) + 1 : 1,
    marketingDayKey: treatAsMarketing ? dayKey : (currentStats?.marketingDayKey ?? dayKey),
    marketingDailyCount: treatAsMarketing
      ? currentStats?.marketingDayKey === dayKey
        ? (currentStats.marketingDailyCount ?? 0) + 1
        : 1
      : currentStats?.marketingDayKey === dayKey
        ? (currentStats.marketingDailyCount ?? 0)
        : 0,
    lastSentAt: now,
    lastMarketingSentAt: treatAsMarketing ? now : (currentStats?.lastMarketingSentAt ?? null),
  };

  await db
    .collection('Users')
    .doc(userId)
    .set(
      {
        lifecycle: {
          push: {
            delivery: nextStats,
          },
        },
      },
      { merge: true }
    );
}

/**
 * On notification created — unified push processor.
 *
 * Every push notification on the entire NXT1 platform flows through this
 * single function. Features never call FCM directly.
 */
export const onNotificationCreatedV3 = onDocumentCreated(
  'Notifications/{notificationId}',
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;

    const notification = snapshot.data();
    const notificationId = event.params.notificationId;
    const userId = notification['userId'] as string;
    const type = notification['type'] as string;
    const category = notification['category'] as string | undefined;
    const priority = notification['priority'] as string | undefined;
    const title = notification['title'] as string;
    const body = notification['body'] as string;
    const data = notification['data'] as Record<string, string> | undefined;
    const deliveryPolicy = (notification['deliveryPolicy'] ?? {}) as PushDeliveryPolicy;

    logger.info('Processing notification', { notificationId, userId, type, category });

    try {
      // ─── 1. Fetch FCM tokens ──────────────────────────────────────
      const tokensDoc = await db.collection('FcmTokens').doc(userId).get();
      if (!tokensDoc.exists) {
        logger.info('No FCM tokens registered', { userId });
        await updateStatus(notificationId, 'skipped', 'No FCM tokens');
        return;
      }

      const tokenData = tokensDoc.data();
      const tokenObjects = tokenData?.['tokens'] as (string | TokenData)[] | undefined;

      if (!tokenObjects || tokenObjects.length === 0) {
        logger.info('Empty FCM tokens array', { userId });
        await updateStatus(notificationId, 'skipped', 'Empty token array');
        return;
      }

      // Extract token strings (support both old string format and new object format)
      const tokens = tokenObjects.map((t) => (typeof t === 'string' ? t : t.token));

      // ─── 2. Check notification preferences ────────────────────────
      // Read from the canonical Users document (not legacy notification_preferences)
      const userDoc = await db.collection('Users').doc(userId).get();
      if (userDoc.exists) {
        const userData = userDoc.data();
        const prefs = userData?.['preferences']?.['notifications'] as
          | UserNotificationPreferences
          | undefined;
        const pushDeliveryStats = userData?.['lifecycle']?.['push']?.['delivery'] as
          | PushDeliveryStats
          | undefined;
        const treatAsMarketing =
          deliveryPolicy.treatAsMarketing === true || category === 'marketing';

        // Global push kill-switch
        if (prefs?.push === false) {
          logger.info('Push disabled globally for user', { userId });
          await updateStatus(notificationId, 'skipped', 'Push disabled globally');
          return;
        }

        if (treatAsMarketing && prefs?.marketing === false) {
          logger.info('Marketing push disabled for user', { userId, notificationId });
          await updateStatus(notificationId, 'skipped', 'Marketing push disabled');
          return;
        }

        const categoryPushEnabled =
          category && prefs?.categoryPreferences?.[category]?.push === false ? false : undefined;
        if (categoryPushEnabled === false) {
          logger.info('Category push disabled for user', { userId, category, notificationId });
          await updateStatus(notificationId, 'skipped', `Category push disabled: ${category}`);
          return;
        }

        if (deliveryPolicy.respectQuietHours !== false && prefs && isQuietHours(prefs)) {
          logger.info('Push skipped due to quiet hours', { userId, notificationId });
          await updateStatus(notificationId, 'skipped', 'Quiet hours');
          return;
        }

        if (
          deliveryPolicy.respectCadenceCap !== false &&
          prefs &&
          exceedsCadenceCap(
            prefs,
            {
              dayKey: pushDeliveryStats?.dayKey,
              dailyCount: pushDeliveryStats?.dailyCount,
              marketingDayKey: pushDeliveryStats?.marketingDayKey,
              marketingDailyCount: pushDeliveryStats?.marketingDailyCount,
              lastSentAt: toTimestamp(pushDeliveryStats?.lastSentAt) ?? undefined,
              lastMarketingSentAt: toTimestamp(pushDeliveryStats?.lastMarketingSentAt) ?? undefined,
            },
            treatAsMarketing
          )
        ) {
          logger.info('Push skipped due to cadence cap', { userId, notificationId });
          await updateStatus(notificationId, 'skipped', 'Cadence cap');
          return;
        }
      }

      // ─── 3. Build FCM message ─────────────────────────────────────
      const isHighPriority = priority === 'high' || priority === 'urgent';
      const imageUrl = data?.['imageUrl'] as string | undefined;

      // ─── 3a. Compute real unread count for native app icon badge ──
      // Query the user's activity feed for unread, non-archived items.
      // This is the same data model the backend's GET /activity/badges uses:
      //   users/{userId}/activity where isRead === false && isArchived === false
      let unreadCount = 1; // Fallback if query fails
      try {
        const activitySnapshot = await db
          .collection('Users')
          .doc(userId)
          .collection('activity')
          .where('isRead', '==', false)
          .where('isArchived', '==', false)
          .count()
          .get();
        unreadCount = activitySnapshot.data().count;
        logger.info('Computed unread badge count', { userId, unreadCount });
      } catch (badgeError) {
        logger.warn('Failed to compute badge count, using fallback', { userId, badgeError });
      }

      const message: admin.messaging.MulticastMessage = {
        tokens,
        notification: {
          title,
          body,
          ...(imageUrl ? { imageUrl } : {}),
        },
        data: {
          notificationId,
          type: type || 'general',
          ...(data ?? {}),
        },
        apns: {
          payload: {
            aps: {
              badge: unreadCount,
              sound: isHighPriority ? 'default' : 'default',
              'thread-id': category || 'general',
            },
          },
        },
        android: {
          priority: isHighPriority ? 'high' : 'normal',
          notification: {
            sound: 'default',
            channelId: isHighPriority ? 'high_priority' : 'default',
            notificationCount: unreadCount,
          },
        },
      };

      // ─── 4. Send push ─────────────────────────────────────────────
      const response = await messaging.sendEachForMulticast(message);

      logger.info('Push notification delivered', {
        notificationId,
        userId,
        type,
        category,
        successCount: response.successCount,
        failureCount: response.failureCount,
      });

      // ─── 5. Clean up invalid tokens ───────────────────────────────
      if (response.failureCount > 0) {
        const invalidTokenObjects: (string | TokenData)[] = [];
        response.responses.forEach((resp, idx) => {
          if (!resp.success) {
            const errorCode = resp.error?.code;
            if (
              errorCode === 'messaging/invalid-registration-token' ||
              errorCode === 'messaging/registration-token-not-registered'
            ) {
              invalidTokenObjects.push(tokenObjects[idx]);
            }
          }
        });

        if (invalidTokenObjects.length > 0) {
          await db
            .collection('FcmTokens')
            .doc(userId)
            .update({
              tokens: admin.firestore.FieldValue.arrayRemove(...invalidTokenObjects),
            });
          logger.info('Removed invalid FCM tokens', {
            userId,
            count: invalidTokenObjects.length,
          });
        }
      }

      // ─── 6. Update delivery status ────────────────────────────────
      await updateStatus(
        notificationId,
        response.successCount > 0 ? 'sent' : 'failed',
        response.failureCount > 0
          ? `${response.failureCount}/${tokens.length} devices failed`
          : undefined
      );

      if (response.successCount > 0 && userDoc.exists) {
        const userData = userDoc.data();
        const prefs = userData?.['preferences']?.['notifications'] as
          | UserNotificationPreferences
          | undefined;
        const pushDeliveryStats = userData?.['lifecycle']?.['push']?.['delivery'] as
          | PushDeliveryStats
          | undefined;

        if (prefs) {
          await updatePushDeliveryStats(
            userId,
            prefs,
            {
              dayKey: pushDeliveryStats?.dayKey,
              dailyCount: pushDeliveryStats?.dailyCount,
              marketingDayKey: pushDeliveryStats?.marketingDayKey,
              marketingDailyCount: pushDeliveryStats?.marketingDailyCount,
              lastSentAt: toTimestamp(pushDeliveryStats?.lastSentAt) ?? undefined,
              lastMarketingSentAt: toTimestamp(pushDeliveryStats?.lastMarketingSentAt) ?? undefined,
            },
            deliveryPolicy.treatAsMarketing === true || category === 'marketing'
          );
        }
      }
    } catch (error) {
      logger.error('Error processing push notification', {
        notificationId,
        userId,
        error,
      });
      await updateStatus(notificationId, 'failed', String(error));
    }
  }
);

/**
 * Update the notification document with delivery status.
 * Never throws — logging only. Status tracking is best-effort.
 */
async function updateStatus(
  notificationId: string,
  status: string,
  statusDetail?: string
): Promise<void> {
  try {
    await db
      .collection('Notifications')
      .doc(notificationId)
      .update({
        status,
        ...(statusDetail ? { statusDetail } : {}),
        processedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
  } catch {
    // Status update is non-critical — just log
    logger.warn('Failed to update notification status', { notificationId, status });
  }
}
