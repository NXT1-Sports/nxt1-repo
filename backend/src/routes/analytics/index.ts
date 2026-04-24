/**
 * @fileoverview Analytics Routes
 * @module @nxt1/backend/routes/analytics
 *
 * Mongo rollup-backed analytics and tracking routes.
 * Matches the shared analytics API contracts in @nxt1/core.
 */

import { createHash } from 'node:crypto';
import { Router, type Router as ExpressRouter, Request, Response } from 'express';
import type { Firestore } from 'firebase-admin/firestore';
import { optionalAuth } from '../../middleware/auth/auth.middleware.js';
import { logger } from '../../utils/logger.js';
import { getAnalyticsLoggerService } from '../../services/core/analytics-logger.service.js';
import { getCacheService } from '../../services/core/cache.service.js';
import { recordProfileView } from '../../services/core/analytics.service.js';
import { getDefaultAnalyticsEventType, type AnalyticsDomain } from '@nxt1/core/models';
import type { UserPreferences } from '@nxt1/core';

const USERS_COLLECTION = 'Users';

/** Cache key matches the pattern used by settings.routes.ts */
const buildPrefsCacheKey = (uid: string) => `user:prefs:${uid}`;

/**
 * Check whether a user has activity tracking enabled.
 *
 * Reads from the shared preferences cache first (populated by settings routes
 * on every GET/PATCH) to avoid a cold Firestore read on every profile view.
 * Falls back to a direct Firestore read on cache miss.
 * Returns true (tracking allowed) when the preference is missing or explicitly true.
 * Fails open — if any read fails, tracking proceeds.
 */
async function isActivityTrackingEnabled(db: Firestore, userId: string): Promise<boolean> {
  try {
    // 1. Check the shared preferences cache (5-min TTL, maintained by settings routes)
    const cached = await getCacheService().get<UserPreferences>(buildPrefsCacheKey(userId));
    if (cached !== null && cached !== undefined) {
      return cached.activityTracking !== false;
    }

    // 2. Cache miss — read directly from Firestore
    const doc = await db.collection(USERS_COLLECTION).doc(userId).get();
    if (!doc.exists) return true;
    const prefs = doc.data()?.['preferences'] as { activityTracking?: boolean } | undefined;
    return prefs?.activityTracking !== false;
  } catch {
    return true; // Fail-open: never block tracking due to a read error
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

function hashTrackingIdentity(value: string | null): string | null {
  if (!value) return null;
  return createHash('sha256').update(value.toLowerCase()).digest('hex');
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
    const db = req.firebase?.db;
    if (db && !(await isActivityTrackingEnabled(db, authenticatedActorId))) {
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
  const recipientEmailHash = hashTrackingIdentity(
    readTrackingString(req.query['recipientEmail'], 320)
  );
  const attributionConfidence = determineTrackingConfidence({
    viewerUserId: viewerUserId ?? null,
    recipientCoachId,
    recipientCollegeId,
    recipientEmailHash,
  });

  const domain = surface === 'email' || surface === 'message' ? 'communication' : 'engagement';
  const normalizedUrl = destination ? `${destination.origin}${destination.pathname}` : null;

  void getAnalyticsLoggerService().safeTrack({
    subjectId,
    subjectType,
    domain,
    eventType,
    source: viewerUserId ? 'user' : 'system',
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
}

function parseClientAnalyticsDomain(eventName: string, value: unknown): AnalyticsDomain {
  if (
    value === 'recruiting' ||
    value === 'nil' ||
    value === 'performance' ||
    value === 'engagement' ||
    value === 'communication' ||
    value === 'system' ||
    value === 'custom'
  ) {
    return value;
  }

  const normalized = eventName.toLowerCase();

  if (normalized.includes('email') || normalized.includes('message')) {
    return 'communication';
  }
  if (
    normalized.includes('offer') ||
    normalized.includes('visit') ||
    normalized.includes('commit') ||
    normalized.includes('recruit')
  ) {
    return 'recruiting';
  }
  if (
    normalized.includes('payment') ||
    normalized.includes('purchase') ||
    normalized.includes('deal') ||
    normalized.includes('checkout')
  ) {
    return 'nil';
  }
  if (
    normalized.includes('metric') ||
    normalized.includes('workout') ||
    normalized.includes('recovery') ||
    normalized.includes('vital')
  ) {
    return 'performance';
  }
  if (normalized.includes('sync') || normalized.includes('agent') || normalized.includes('tool')) {
    return 'system';
  }
  if (normalized.includes('error') || normalized.includes('exception')) {
    return 'custom';
  }

  return 'engagement';
}

function parseClientAnalyticsEventType(domain: AnalyticsDomain, eventName: string): string {
  const normalized = eventName.toLowerCase();

  switch (domain) {
    case 'communication':
      if (normalized.includes('open')) return 'email_opened';
      if (normalized.includes('reply')) return 'email_replied';
      if (normalized.includes('message')) return 'message_sent';
      if (normalized.includes('click')) return 'link_clicked';
      return 'email_sent';
    case 'recruiting':
      if (normalized.includes('offer')) return 'offer_recorded';
      if (normalized.includes('visit')) return 'visit_recorded';
      if (normalized.includes('commit')) return 'commitment_recorded';
      if (normalized.includes('contact')) return 'coach_contact_recorded';
      return 'activity_recorded';
    case 'nil':
      if (normalized.includes('payment') || normalized.includes('purchase'))
        return 'payment_recorded';
      if (normalized.includes('campaign')) return 'campaign_recorded';
      return 'deal_recorded';
    case 'performance':
      if (normalized.includes('workout')) return 'workout_recorded';
      if (normalized.includes('recovery')) return 'recovery_recorded';
      if (normalized.includes('milestone')) return 'milestone_recorded';
      return 'metric_recorded';
    case 'system':
      if (normalized.includes('sync')) return 'sync_completed';
      if (normalized.includes('tool')) return 'tool_write_completed';
      return 'agent_task_completed';
    case 'engagement':
      if (normalized.includes('search')) return 'search_appeared';
      if (normalized.includes('click')) return 'link_clicked';
      if (normalized.includes('profile')) return 'profile_viewed';
      return 'content_viewed';
    case 'custom':
    default:
      return getDefaultAnalyticsEventType('custom');
  }
}

// ============================================
// POST /events — Backend-owned browser analytics relay
// ============================================

router.post('/events', optionalAuth, async (req: Request, res: Response) => {
  try {
    const rawBody = (req.body ?? {}) as Record<string, unknown>;
    const eventName = readTrackingString(rawBody['eventName'], 120);

    if (!eventName) {
      res.status(400).json({ success: false, error: 'eventName is required' });
      return;
    }

    const properties =
      rawBody['properties'] && typeof rawBody['properties'] === 'object'
        ? (rawBody['properties'] as Record<string, unknown>)
        : {};

    const userProperties =
      rawBody['userProperties'] && typeof rawBody['userProperties'] === 'object'
        ? (rawBody['userProperties'] as Record<string, unknown>)
        : {};

    const subjectId =
      req.user?.uid ??
      readTrackingString(rawBody['subjectId'], 120) ??
      readTrackingString(rawBody['userId'], 120) ??
      readTrackingString(rawBody['sessionId'], 120) ??
      'web-anonymous';

    const subjectType = parseTrackingSubjectType(rawBody['subjectType']);
    const domain = parseClientAnalyticsDomain(eventName, rawBody['domain']);
    const eventType = parseClientAnalyticsEventType(domain, eventName);
    const pagePath =
      readTrackingString(rawBody['pagePath'], 500) ??
      readTrackingString(properties['page_path'], 500);
    const pageTitle =
      readTrackingString(rawBody['pageTitle'], 250) ??
      readTrackingString(properties['page_title'], 250);

    const rawTags = Array.isArray(rawBody['tags'])
      ? rawBody['tags'].filter((tag): tag is string => typeof tag === 'string')
      : [];

    void getAnalyticsLoggerService().safeTrack({
      subjectId,
      subjectType,
      domain,
      eventType,
      source: req.user?.uid ? 'user' : 'system',
      actorUserId: req.user?.uid ?? null,
      sessionId: readTrackingString(rawBody['sessionId'], 120),
      tags: [...new Set([domain, eventName, pagePath ?? '', ...rawTags].filter(Boolean))].slice(
        0,
        15
      ),
      payload: {
        pagePath,
        pageTitle,
        properties,
        userProperties,
      },
      metadata: {
        originalEventName: eventName,
        platform: 'web',
        referer: readTrackingString(req.get('referer'), 500),
        userAgent: readTrackingString(req.get('user-agent'), 500),
      },
    });

    res.status(200).json({ success: true, tracked: true, domain, eventType });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.warn('Failed to record relayed web analytics event', { error: error.message });
    res.status(200).json({ success: true, tracked: false });
  }
});

// ============================================
// GET /track/open — Public email open tracking pixel
// ============================================

/**
 * Track email open events.
 * GET /api/v1/analytics/track/open
 * Query params: subjectId, subjectType, messageId, threadId, recipientCoachId,
 * recipientCollegeId, recipientEmail, surface
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
 * threadId, postId, recipientCoachId, recipientCollegeId, recipientEmail
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
    if (viewerUserId && !(await isActivityTrackingEnabled(db, viewerUserId))) {
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
