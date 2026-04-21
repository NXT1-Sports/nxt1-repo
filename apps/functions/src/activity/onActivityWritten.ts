/**
 * @fileoverview Activity Counter Projection Trigger
 * @module @nxt1/functions/activity/onActivityWritten
 *
 * Maintains the per-user unread activity badge document at:
 *   Users/{userId}/stats/activity_badges
 *
 * This keeps badge reads O(1) while preserving the activity collection as the
 * source of truth. Only unread, non-archived items contribute to the counter.
 */

import * as admin from 'firebase-admin';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';
// ─── Inlined from @nxt1/core/activity (workspace packages are not available in Cloud Run) ───
type ActivityTabId = 'alerts';
const ACTIVITY_DEFAULT_TAB: ActivityTabId = 'alerts';

const ACTIVITY_STATS_COLLECTION = 'stats';
const ACTIVITY_BADGES_DOC_ID = 'activity_badges';
const ACTIVITY_BADGE_SCHEMA_VERSION = 1;

type BadgeCounts = Record<ActivityTabId, number>;

interface ActivityCounterShape {
  readonly tab?: unknown;
  readonly isRead?: unknown;
  readonly isArchived?: unknown;
}

function emptyBadgeCounts(): BadgeCounts {
  return {
    alerts: 0,
  };
}

function normalizeTab(value: unknown): ActivityTabId {
  return value === ACTIVITY_DEFAULT_TAB ? ACTIVITY_DEFAULT_TAB : ACTIVITY_DEFAULT_TAB;
}

function resolveUnreadBadgeTab(data?: ActivityCounterShape | null): ActivityTabId | null {
  if (!data) {
    return null;
  }

  if (data.isArchived === true || data.isRead === true) {
    return null;
  }

  return normalizeTab(data.tab);
}

function computeBadgeDelta(
  beforeData?: ActivityCounterShape | null,
  afterData?: ActivityCounterShape | null
): BadgeCounts {
  const delta = emptyBadgeCounts();

  const beforeTab = resolveUnreadBadgeTab(beforeData);
  const afterTab = resolveUnreadBadgeTab(afterData);

  if (beforeTab) {
    delta[beforeTab] -= 1;
  }

  if (afterTab) {
    delta[afterTab] += 1;
  }

  return delta;
}

function hasNonZeroDelta(delta: BadgeCounts): boolean {
  return Object.values(delta).some((value) => value !== 0);
}

export const onActivityWrittenV3 = onDocumentWritten(
  'Users/{userId}/activity/{activityId}',
  async (event) => {
    const db = admin.firestore();
    const userId = event.params.userId;
    const beforeData = event.data?.before.exists
      ? (event.data.before.data() as ActivityCounterShape)
      : null;
    const afterData = event.data?.after.exists
      ? (event.data.after.data() as ActivityCounterShape)
      : null;

    const delta = computeBadgeDelta(beforeData, afterData);
    if (!hasNonZeroDelta(delta)) {
      return;
    }

    const statsRef = db
      .collection('Users')
      .doc(userId)
      .collection(ACTIVITY_STATS_COLLECTION)
      .doc(ACTIVITY_BADGES_DOC_ID);

    try {
      await statsRef.set(
        {
          schemaVersion: ACTIVITY_BADGE_SCHEMA_VERSION,
          badges: {
            alerts: admin.firestore.FieldValue.increment(delta['alerts']),
          },
          totalUnread: admin.firestore.FieldValue.increment(delta['alerts']),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      logger.info('Activity badge projection updated', {
        userId,
        activityId: event.params.activityId,
        delta: delta['alerts'],
      });
    } catch (error) {
      logger.error('Failed to update activity badge projection', {
        userId,
        activityId: event.params.activityId,
        error,
      });
    }
  }
);
