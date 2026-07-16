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
import { APP_EVENTS } from '@nxt1/core/analytics';

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

function readTrackingDisplayName(value: unknown): string | null {
  const raw = readTrackingString(value, 200);
  if (!raw) return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    decoded = raw;
  }
  const sanitized = decoded
    .replace(/<[^>]*>/g, '') // strip HTML tags
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1F\x7F]/g, '') // strip control characters
    .trim()
    .slice(0, 200);
  return sanitized || null;
}

async function resolveUserDisplayName(
  db: FirebaseFirestore.Firestore,
  userId: string,
  fallbackDisplayName?: string | null
): Promise<string | null> {
  const directFallback = readTrackingDisplayName(fallbackDisplayName);
  if (directFallback) {
    return directFallback;
  }

  try {
    const userDoc = await db.collection('Users').doc(userId).get();
    if (!userDoc.exists) {
      return null;
    }

    const data = userDoc.data() ?? {};
    const displayName = readTrackingDisplayName(data['displayName']);
    if (displayName) {
      return displayName;
    }

    const firstName = readTrackingDisplayName(data['firstName']);
    const lastName = readTrackingDisplayName(data['lastName']);
    const combinedName = [firstName, lastName].filter(Boolean).join(' ').trim();
    return combinedName || null;
  } catch {
    return null;
  }
}

const RECIPIENT_KIND_VALUES = new Set(['coach', 'college', 'person', 'organization', 'unknown']);

function parseRecipientKind(value: unknown): string | null {
  const parsed = readTrackingString(value, 40)?.toLowerCase() ?? null;
  return parsed && RECIPIENT_KIND_VALUES.has(parsed) ? parsed : null;
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
  readonly recipientName: string | null;
  readonly recipientEmailHash: string | null;
}): 'verified' | 'known-recipient' | 'anonymous' {
  if (input.viewerUserId) return 'verified';
  if (input.recipientName || input.recipientEmailHash) return 'known-recipient';
  return 'anonymous';
}

function buildTrackingRecipientKey(input: {
  readonly viewerUserId: string | null;
  readonly recipientEmailHash: string | null;
  readonly recipientName: string | null;
}): string {
  return input.viewerUserId ?? input.recipientEmailHash ?? input.recipientName ?? 'anonymous';
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

  // Debounce notifications per recipient/event per 1 hour to prevent push spam
  // and ensure repeated opens over consecutive days trigger new notifications.
  const timeBucket = Math.floor(Date.now() / (60 * 60 * 1000));

  return [
    'email-engagement',
    input.eventType,
    input.subjectId,
    input.sourceRecordId,
    input.recipientKey,
    urlDigest,
    timeBucket,
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
  readonly recipientName: string | null;
  readonly recipientKind: string | null;
  readonly recipientOrgName: string | null;
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
    recipientEmailHash: input.recipientEmailHash,
    recipientName: input.recipientName,
  });
  const type =
    input.eventType === 'email_opened'
      ? NOTIFICATION_TYPES.EMAIL_OPENED
      : NOTIFICATION_TYPES.LINK_CLICKED;

  const body =
    input.eventType === 'email_opened'
      ? input.recipientName
        ? `${input.recipientName} opened your email.`
        : 'A recipient opened your email.'
      : input.recipientName
        ? `${input.recipientName} clicked a link in your email.`
        : 'A recipient clicked a link in your email.';

  const sourceLabel =
    input.recipientName && input.recipientOrgName
      ? `${input.recipientName} \u00b7 ${input.recipientOrgName}`
      : (input.recipientName ?? input.recipientOrgName ?? undefined);

  return {
    userId: input.subjectId,
    type,
    title: input.eventType === 'email_opened' ? 'Email opened' : 'Link clicked',
    body,
    deepLink: '/activity',
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
      recipientName: input.recipientName ?? '',
      recipientKind: input.recipientKind ?? '',
      recipientOrgName: input.recipientOrgName ?? '',
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
      recipientName: input.recipientName,
      recipientKind: input.recipientKind,
      recipientOrgName: input.recipientOrgName,
      recipientEmailHash: input.recipientEmailHash,
      attributionConfidence: input.attributionConfidence,
    },
    source: {
      userName: sourceLabel,
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
  const dispatchId = readTrackingString(req.query['dispatchId'], 120) ?? sourceRecordId;
  const campaignKey = readTrackingString(req.query['campaignKey'], 180);
  const campaignFamily = readTrackingString(req.query['campaignFamily'], 80);
  const provider = readTrackingString(req.query['provider'], 40);
  const emailOrigin = readTrackingString(req.query['emailOrigin'], 40);
  const sessionId = readTrackingString(req.query['sessionId'], 120);
  const recipientName = readTrackingDisplayName(req.query['recipientName']);
  const recipientKind = parseRecipientKind(req.query['recipientKind']);
  const recipientOrgName = readTrackingDisplayName(req.query['recipientOrgName']);
  const recipientEmailHash = readTrackingHash(req.query['recipientEmailHash']);
  const attributionConfidence = determineTrackingConfidence({
    viewerUserId: viewerUserId ?? null,
    recipientName,
    recipientEmailHash,
  });

  const domain = surface === 'email' || surface === 'message' ? 'communication' : 'engagement';
  const canonicalEventName =
    eventType === 'email_opened' ? APP_EVENTS.EMAIL_OPENED : APP_EVENTS.LINK_CLICKED;
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
    tags: [surface, attributionConfidence, canonicalEventName, campaignKey, campaignFamily].filter(
      (tag): tag is string => typeof tag === 'string' && tag.length > 0
    ),
    payload: {
      eventName: canonicalEventName,
      surface,
      messageId,
      threadId,
      postId,
      dispatchId,
      sourceRecordId,
      campaignKey,
      campaignFamily,
      provider,
      emailOrigin,
      destinationUrl: destination?.toString() ?? null,
      normalizedUrl,
      host: destination?.host ?? null,
      path: destination?.pathname ?? null,
    },
    metadata: {
      attributionConfidence,
      recipientName,
      recipientKind,
      recipientOrgName,
      recipientEmailHash,
      dispatchId,
      campaignKey,
      campaignFamily,
      provider,
      emailOrigin,
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
    recipientName,
    recipientKind,
    recipientOrgName,
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
 * Query params: subjectId, subjectType, messageId, threadId, recipientName,
 * recipientKind, recipientOrgName, recipientEmailHash, surface
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
 * threadId, postId, recipientName, recipientKind, recipientOrgName, recipientEmailHash
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
    const viewerDisplayName = req.user?.displayName ?? null;
    const { viewedUserId } = req.body as { viewedUserId?: string };

    logger.info('POST /profile-view received', {
      viewedUserId,
      viewerUserId,
      hasToken: !!req.user?.uid,
    });

    if (!viewedUserId || typeof viewedUserId !== 'string') {
      res.status(400).json({ success: false, error: 'viewedUserId is required' });
      return;
    }

    // Don't track self-views
    if (viewerUserId === viewedUserId) {
      logger.info('Blocked self-view', { userId: viewedUserId });
      res.json({ success: true, tracked: false });
      return;
    }

    // Respect activity tracking opt-out for authenticated viewers
    if (viewerUserId && !(await isActivityTrackingEnabled(viewerUserId))) {
      logger.info('Blocked by opt-out', { viewerUserId, viewedUserId });
      res.json({ success: true, tracked: false });
      return;
    }

    // Don't notify users who haven't completed onboarding — they are still
    // setting up their account and any profile view at this stage is incidental.
    const viewedUserDoc = await db.collection('Users').doc(viewedUserId).get();
    const viewedUserData = viewedUserDoc.data();
    if (!viewedUserData?.['onboardingCompletedAt'] && !viewedUserData?.['onboardingCompleted']) {
      logger.info('Blocked by viewed user not completed onboarding', {
        viewedUserId,
        hasOnboardingCompletedAt: !!viewedUserData?.['onboardingCompletedAt'],
        hasOnboardingCompleted: !!viewedUserData?.['onboardingCompleted'],
      });
      res.json({ success: true, tracked: false });
      return;
    }

    // Block anonymous profile-view for newly-created accounts (first 5 minutes).
    // When a user completes signup/onboarding, their browser may fire a profile-view
    // request before auth signals have fully hydrated — this request arrives anonymous
    // (no token) and creates a spurious "Someone viewed your profile" self-notification.
    // Legitimate anonymous views (public profiles of established users) are unaffected
    // because their accounts are older than 5 minutes.
    if (!viewerUserId) {
      const createdAt = viewedUserData?.['createdAt'];
      if (createdAt) {
        const createdMillis = createdAt.toMillis?.() ?? new Date(createdAt).getTime();
        const accountAgeMs = Date.now() - createdMillis;
        const FIVE_MINUTES = 5 * 60 * 1000;
        if (accountAgeMs < FIVE_MINUTES) {
          logger.info('Blocked by account age guard', {
            viewedUserId,
            accountAgeMs,
            fiveMinutes: FIVE_MINUTES,
          });
          res.json({ success: true, tracked: false });
          return;
        }
      }
    }

    const resolvedViewerName = viewerUserId
      ? await resolveUserDisplayName(db, viewerUserId, viewerDisplayName)
      : null;

    await recordProfileView(db, viewedUserId, viewerUserId);

    const profileViewNotification: DispatchNotificationInput = {
      userId: viewedUserId,
      type: NOTIFICATION_TYPES.PROFILE_VIEW,
      title: 'Profile viewed',
      body: resolvedViewerName
        ? `${resolvedViewerName} viewed your profile.`
        : 'Someone viewed your profile.',
      deepLink: '/activity',
      data: {
        entityId: viewedUserId,
        viewerUserId: viewerUserId ?? '',
        viewerName: resolvedViewerName ?? '',
      },
      metadata: {
        viewerUserId,
        viewerName: resolvedViewerName,
        trackedBy: 'analytics/profile-view',
      },
      source: resolvedViewerName
        ? {
            userId: viewerUserId ?? undefined,
            userName: resolvedViewerName,
          }
        : undefined,
      idempotencyKey: `profile_view:${viewedUserId}:${viewerUserId ?? 'anonymous'}:${Math.floor(
        Date.now() / (5 * 60 * 1000)
      )}`,
    };

    await dispatch(db, profileViewNotification);
    res.json({ success: true, tracked: true });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('Failed to track profile view', { error: error.message, stack: error.stack });
    // Non-critical — always return success
    res.json({ success: true, tracked: false });
  }
});

export default router;
