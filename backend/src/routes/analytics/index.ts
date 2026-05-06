/**
 * @fileoverview Analytics Routes
 * @module @nxt1/backend/routes/analytics
 *
 * Mongo rollup-backed analytics and tracking routes.
 * Matches the shared analytics API contracts in @nxt1/core.
 */

import { Router, type Router as ExpressRouter, Request, Response } from 'express';
import { createHash } from 'node:crypto';
import { optionalAuth } from '../../middleware/auth/auth.middleware.js';
import { logger } from '../../utils/logger.js';
import { getAnalyticsLoggerService } from '../../services/core/analytics-logger.service.js';
import { getCacheService } from '../../services/core/cache.service.js';
import { dispatch } from '../../services/communications/notification.service.js';
import { recordProfileView } from '../../services/core/analytics.service.js';
import {
  NOTIFICATION_TYPES,
  type DispatchNotificationInput,
  type UserPreferences,
} from '@nxt1/core';

/** Cache key matches the pattern used by settings.routes.ts */
const buildPrefsCacheKey = (uid: string) => `user:prefs:${uid}`;

/**
 * Check whether a user has activity tracking enabled.
 *
 * Reads exclusively from the shared preferences cache (5-min TTL, maintained
 * by settings routes on every GET/PATCH). No Firestore reads here — analytics
 * is pure MongoDB and must not depend on Firebase at runtime.
 *
 * Fails open: if the cache has no entry (cold start before first GET/PATCH),
 * tracking proceeds. The settings routes populate the cache on login/GET.
 * Returns true (tracking allowed) when the preference is missing or explicitly true.
 */
async function isActivityTrackingEnabled(userId: string): Promise<boolean> {
  try {
    const cached = await getCacheService().get<UserPreferences>(buildPrefsCacheKey(userId));
    if (cached !== null && cached !== undefined) {
      return cached.activityTracking !== false;
    }
    // Cache miss → fail-open. Settings routes write the cache on every GET/PATCH.
    return true;
  } catch {
    return true; // Fail-open: never block tracking due to a cache read error
  }
}

const router: ExpressRouter = Router();

// ============================================
// HELPERS
// ============================================

type TrackingSubjectType = 'user' | 'team' | 'organization';
type TrackingSurface = 'email' | 'post' | 'profile' | 'message' | 'page' | 'unknown';

const TRACKING_PIXEL_GIF = Buffer.from(
  'R0lGODlhAQABAPAAAP///wAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==',
  'base64'
);

function readTrackingString(value: unknown, maxLength = 250): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

function parseTrackingSubjectType(value: unknown): TrackingSubjectType {
  const parsed = readTrackingString(value, 24);
  if (parsed === 'team' || parsed === 'organization') return parsed;
  return 'user';
}

function parseTrackingSurface(value: unknown): TrackingSurface {
  const parsed = readTrackingString(value, 32)?.toLowerCase();
  switch (parsed) {
    case 'email':
    case 'post':
    case 'profile':
    case 'message':
    case 'page':
      return parsed;
    default:
      return 'unknown';
  }
}

function readTrackingHash(value: unknown): string | null {
  const parsed = readTrackingString(value, 128)?.toLowerCase() ?? null;
  if (!parsed) return null;
  return /^[a-f0-9]{64}$/.test(parsed) ? parsed : null;
}

function parseRedirectDestination(value: unknown): URL | null {
  const parsed = readTrackingString(value, 2_000);
  if (!parsed) return null;

  try {
    const url = new URL(parsed);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

function determineTrackingConfidence(input: {
  readonly viewerUserId: string | null;
  readonly recipientCoachId: string | null;
  readonly recipientCollegeId: string | null;
  readonly recipientEmailHash: string | null;
}): 'verified' | 'known-recipient' | 'anonymous' {
  if (input.viewerUserId) return 'verified';
  if (input.recipientCoachId || input.recipientCollegeId || input.recipientEmailHash) {
    return 'known-recipient';
  }
  return 'anonymous';
}

function buildTrackingRecipientKey(input: {
  readonly viewerUserId: string | null;
  readonly recipientCoachId: string | null;
  readonly recipientCollegeId: string | null;
  readonly recipientEmailHash: string | null;
}): string {
  return (
    input.viewerUserId ??
    input.recipientCoachId ??
    input.recipientCollegeId ??
    input.recipientEmailHash ??
    'anonymous'
  );
}

function buildTrackingNotificationIdempotencyKey(input: {
  readonly eventType: 'email_opened' | 'link_clicked';
  readonly subjectId: string;
  readonly sourceRecordId: string;
  readonly recipientKey: string;
  readonly normalizedUrl: string | null;
}): string {
  const urlDigest = input.normalizedUrl
    ? createHash('sha256').update(input.normalizedUrl).digest('hex').slice(0, 16)
    : 'none';

  return [
    'email-engagement',
    input.eventType,
    input.subjectId,
    input.sourceRecordId,
    input.recipientKey,
    urlDigest,
  ].join(':');
}

function buildTrackingNotification(input: {
  readonly eventType: 'email_opened' | 'link_clicked';
  readonly subjectId: string;
  readonly subjectType: TrackingSubjectType;
  readonly surface: TrackingSurface;
  readonly viewerUserId: string | null;
  readonly sourceRecordId: string | null;
  readonly messageId: string | null;
  readonly threadId: string | null;
  readonly sessionId: string | null;
  readonly destination: URL | undefined;
  readonly normalizedUrl: string | null;
  readonly recipientCoachId: string | null;
  readonly recipientCollegeId: string | null;
  readonly recipientEmailHash: string | null;
  readonly attributionConfidence: 'verified' | 'known-recipient' | 'anonymous';
}): DispatchNotificationInput | null {
  if (input.subjectType !== 'user' || input.surface !== 'email' || !input.sourceRecordId) {
    return null;
  }

  if (input.viewerUserId && input.viewerUserId === input.subjectId) {
    return null;
  }

  const recipientKey = buildTrackingRecipientKey({
    viewerUserId: input.viewerUserId,
    recipientCoachId: input.recipientCoachId,
    recipientCollegeId: input.recipientCollegeId,
    recipientEmailHash: input.recipientEmailHash,
  });
  const type =
    input.eventType === 'email_opened'
      ? NOTIFICATION_TYPES.EMAIL_OPENED
      : NOTIFICATION_TYPES.LINK_CLICKED;
  const body =
    input.eventType === 'email_opened'
      ? 'A recipient opened an email you sent.'
      : 'A recipient clicked a link in your email.';

  return {
    userId: input.subjectId,
    type,
    title: input.eventType === 'email_opened' ? 'Email opened' : 'Link clicked',
    body,
    deepLink: '/analytics',
    data: {
      entityId: input.sourceRecordId,
      sourceRecordId: input.sourceRecordId,
      eventType: input.eventType,
      surface: input.surface,
      destinationUrl: input.destination?.toString() ?? '',
      normalizedUrl: input.normalizedUrl ?? '',
      messageId: input.messageId ?? '',
      threadId: input.threadId ?? '',
      sessionId: input.sessionId ?? '',
      recipientCoachId: input.recipientCoachId ?? '',
      recipientCollegeId: input.recipientCollegeId ?? '',
      recipientEmailHash: input.recipientEmailHash ?? '',
      attributionConfidence: input.attributionConfidence,
    },
    metadata: {
      eventType: input.eventType,
      surface: input.surface,
      sourceRecordId: input.sourceRecordId,
      messageId: input.messageId,
      threadId: input.threadId,
      sessionId: input.sessionId,
      destinationUrl: input.destination?.toString() ?? null,
      normalizedUrl: input.normalizedUrl,
      host: input.destination?.host ?? null,
      path: input.destination?.pathname ?? null,
      recipientCoachId: input.recipientCoachId,
      recipientCollegeId: input.recipientCollegeId,
      recipientEmailHash: input.recipientEmailHash,
      attributionConfidence: input.attributionConfidence,
    },
    source: {
      userName: 'Email analytics',
    },
    idempotencyKey: buildTrackingNotificationIdempotencyKey({
      eventType: input.eventType,
      subjectId: input.subjectId,
      sourceRecordId: input.sourceRecordId,
      recipientKey,
      normalizedUrl: input.normalizedUrl,
    }),
  };
}

async function trackCommunicationOrEngagementEvent(
  req: Request,
  eventType: 'email_opened' | 'link_clicked',
  destination?: URL
): Promise<void> {
  const subjectId = readTrackingString(req.query['subjectId'], 120);
  if (!subjectId) return;

  // Respect activity tracking opt-out for verified, authenticated actors
  const authenticatedActorId = req.user?.uid;
  if (authenticatedActorId) {
    if (!(await isActivityTrackingEnabled(authenticatedActorId))) {
      return;
    }
  }

  const subjectType = parseTrackingSubjectType(req.query['subjectType']);
  const surface = parseTrackingSurface(
    req.query['surface'] ?? (eventType === 'email_opened' ? 'email' : 'unknown')
  );
  const viewerUserId = req.user?.uid ?? readTrackingString(req.query['viewerUserId'], 120);
  const messageId = readTrackingString(req.query['messageId'], 250);
  const threadId = readTrackingString(req.query['threadId'], 250);
  const postId = readTrackingString(req.query['postId'], 120);
  const sourceRecordId = readTrackingString(req.query['sourceRecordId'], 120);
  const sessionId = readTrackingString(req.query['sessionId'], 120);
  const recipientCoachId = readTrackingString(req.query['recipientCoachId'], 120);
  const recipientCollegeId = readTrackingString(req.query['recipientCollegeId'], 120);
  const recipientEmailHash = readTrackingHash(req.query['recipientEmailHash']);
  const attributionConfidence = determineTrackingConfidence({
    viewerUserId: viewerUserId ?? null,
    recipientCoachId,
    recipientCollegeId,
    recipientEmailHash,
  });

  const domain = surface === 'email' || surface === 'message' ? 'communication' : 'engagement';
  const normalizedUrl = destination ? `${destination.origin}${destination.pathname}` : null;
  const db = req.firebase?.db;

  void getAnalyticsLoggerService().safeTrack({
    subjectId,
    subjectType,
    domain,
    eventType,
    source: 'user',
    actorUserId: viewerUserId ?? null,
    sessionId: sessionId ?? null,
    threadId: threadId ?? null,
    tags: [surface, attributionConfidence, eventType].filter(Boolean),
    payload: {
      surface,
      messageId,
      threadId,
      postId,
      sourceRecordId,
      destinationUrl: destination?.toString() ?? null,
      normalizedUrl,
      host: destination?.host ?? null,
      path: destination?.pathname ?? null,
    },
    metadata: {
      attributionConfidence,
      recipientCoachId,
      recipientCollegeId,
      recipientEmailHash,
      referer: readTrackingString(req.get('referer'), 500),
      userAgent: readTrackingString(req.get('user-agent'), 500),
    },
  });

  const notificationInput = buildTrackingNotification({
    eventType,
    subjectId,
    subjectType,
    surface,
    viewerUserId: viewerUserId ?? null,
    sourceRecordId,
    messageId,
    threadId,
    sessionId,
    destination,
    normalizedUrl,
    recipientCoachId,
    recipientCollegeId,
    recipientEmailHash,
    attributionConfidence,
  });

  if (!db || !notificationInput) {
    return;
  }

  await dispatch(db, notificationInput);
}

// ============================================
// POST /events — Browser analytics relay (ack only, not persisted to MongoDB)
// Web UX telemetry belongs in Firebase Analytics / GA4, not the agent analytics store.
// ============================================

router.post('/events', optionalAuth, (req: Request, res: Response) => {
  const rawBody = (req.body ?? {}) as Record<string, unknown>;
  const eventName = readTrackingString(rawBody['eventName'], 120);

  if (!eventName) {
    res.status(400).json({ success: false, error: 'eventName is required' });
    return;
  }

  // Browser UX telemetry is not persisted to MongoDB — use Firebase Analytics / GA4.
  // Anonymous relay is still rejected to prevent endpoint abuse.
  if (!req.user?.uid) {
    res.status(200).json({ success: true, tracked: false, reason: 'anonymous_relay_blocked' });
    return;
  }

  res.status(200).json({ success: true, tracked: false });
});

// ============================================
// GET /track/open — Public email open tracking pixel
// ============================================

/**
 * Track email open events.
 * GET /api/v1/analytics/track/open
 * Query params: subjectId, subjectType, messageId, threadId, recipientCoachId,
 * recipientCollegeId, recipientEmailHash, surface
 */
router.get('/track/open', optionalAuth, async (req: Request, res: Response) => {
  void trackCommunicationOrEngagementEvent(req, 'email_opened').catch((err: unknown) => {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.warn('Failed to record email open analytics', { error: error.message });
  });

  res
    .status(200)
    .setHeader('Content-Type', 'image/gif')
    .setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private')
    .send(TRACKING_PIXEL_GIF);
});

// ============================================
// GET /track/click — Public outbound link tracker
// ============================================

/**
 * Track outbound link clicks and safely redirect.
 * GET /api/v1/analytics/track/click
 * Query params: destination, subjectId, subjectType, surface, messageId,
 * threadId, postId, recipientCoachId, recipientCollegeId, recipientEmailHash
 */
router.get('/track/click', optionalAuth, async (req: Request, res: Response) => {
  const destination = parseRedirectDestination(req.query['destination']);
  if (!destination) {
    res.status(400).json({ success: false, error: 'A valid http(s) destination is required' });
    return;
  }

  void trackCommunicationOrEngagementEvent(req, 'link_clicked', destination).catch(
    (err: unknown) => {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.warn('Failed to record link click analytics', {
        error: error.message,
        destination: destination.toString(),
      });
    }
  );

  res.redirect(302, destination.toString());
});

// ============================================
// POST /profile-view — Track profile view
// ============================================

/**
 * Track profile view
 * POST /api/v1/analytics/profile-view
 * Body: { viewedUserId: string }
 */
router.post('/profile-view', optionalAuth, async (req: Request, res: Response) => {
  try {
    const db = req.firebase.db;
    const viewerUserId = req.user?.uid ?? null;
    const { viewedUserId } = req.body as { viewedUserId?: string };

    if (!viewedUserId || typeof viewedUserId !== 'string') {
      res.status(400).json({ success: false, error: 'viewedUserId is required' });
      return;
    }

    // Don't track self-views
    if (viewerUserId === viewedUserId) {
      res.json({ success: true, tracked: false });
      return;
    }

    // Respect activity tracking opt-out for authenticated viewers
    if (viewerUserId && !(await isActivityTrackingEnabled(viewerUserId))) {
      res.json({ success: true, tracked: false });
      return;
    }

    await recordProfileView(db, viewedUserId, viewerUserId);
    res.json({ success: true, tracked: true });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('Failed to track profile view', { error: error.message, stack: error.stack });
    // Non-critical — always return success
    res.json({ success: true, tracked: false });
  }
});

export default router;
