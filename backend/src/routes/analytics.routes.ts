/**
 * @fileoverview Analytics Routes
 * @module @nxt1/backend/routes/analytics
 *
 * Mongo rollup-backed analytics and tracking routes.
 * Matches the shared analytics API contracts in @nxt1/core.
 */

import { createHash } from 'node:crypto';
import { Router, type Router as ExpressRouter, Request, Response } from 'express';
import { appGuard, optionalAuth } from '../middleware/auth.middleware.js';
import { logger } from '../utils/logger.js';
import { getCacheService, CACHE_TTL } from '../services/cache.service.js';
import { getAnalyticsLoggerService } from '../services/analytics-logger.service.js';
import { ExportService, type ExportColumn } from '../modules/agent/services/export.service.js';
import {
  buildAthleteReport,
  buildCoachReport,
  buildOverviewMetrics,
  recordProfileView,
} from '../services/analytics.service.js';
import type { AnalyticsPeriod, VideoAnalytics } from '@nxt1/core';
import { getDefaultAnalyticsEventType, type AnalyticsDomain } from '@nxt1/core/models';

const router: ExpressRouter = Router();
const exportService = new ExportService();

// ============================================
// HELPERS
// ============================================

const VALID_PERIODS: readonly AnalyticsPeriod[] = [
  'day',
  'week',
  'month',
  'quarter',
  'year',
  'all-time',
];

function parsePeriod(value: unknown): AnalyticsPeriod {
  if (typeof value === 'string' && VALID_PERIODS.includes(value as AnalyticsPeriod)) {
    return value as AnalyticsPeriod;
  }
  return 'week';
}

function parseRole(value: unknown): 'athlete' | 'coach' {
  if (value === 'coach') return 'coach';
  return 'athlete';
}

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

function trackCommunicationOrEngagementEvent(
  req: Request,
  eventType: 'email_opened' | 'link_clicked',
  destination?: URL
): void {
  const subjectId = readTrackingString(req.query['subjectId'], 120);
  if (!subjectId) return;

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
// GET /report — Full analytics report
// ============================================

/**
 * Get analytics report
 * GET /api/v1/analytics/report
 * Query params: role, period
 */
router.get('/report', appGuard, async (req: Request, res: Response) => {
  try {
    const uid = req.user!.uid;
    const db = req.firebase.db;
    const period = parsePeriod(req.query['period']);
    const role = parseRole(req.query['role']);

    const cacheKey = `analytics:report:${uid}:${role}:${period}`;
    const cache = getCacheService();
    const cached = await cache.get(cacheKey);

    if (cached) {
      res.setHeader('X-Cache', 'HIT');
      res.json({
        success: true,
        data: JSON.parse(cached as string),
        cache: { hit: true, ttl: CACHE_TTL.PROFILES, timestamp: new Date().toISOString() },
      });
      return;
    }

    const report =
      role === 'coach'
        ? await buildCoachReport(db, uid, period)
        : await buildAthleteReport(db, uid, period);

    await cache.set(cacheKey, JSON.stringify(report), { ttl: CACHE_TTL.PROFILES });

    res.setHeader('X-Cache', 'MISS');
    res.json({
      success: true,
      data: report,
      cache: { hit: false, ttl: CACHE_TTL.PROFILES, timestamp: new Date().toISOString() },
    });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('Failed to fetch analytics report', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: 'Failed to fetch analytics report' });
  }
});

// ============================================
// GET /overview — Overview metrics only
// ============================================

/**
 * Get analytics overview
 * GET /api/v1/analytics/overview
 * Query params: role, period
 */
router.get('/overview', appGuard, async (req: Request, res: Response) => {
  try {
    const uid = req.user!.uid;
    const db = req.firebase.db;
    const period = parsePeriod(req.query['period']);
    const role = parseRole(req.query['role']);

    const cacheKey = `analytics:overview:${uid}:${role}:${period}`;
    const cache = getCacheService();
    const cached = await cache.get(cacheKey);

    if (cached) {
      res.setHeader('X-Cache', 'HIT');
      res.json({ success: true, data: JSON.parse(cached as string) });
      return;
    }

    const result = await buildOverviewMetrics(db, uid, role, period);

    await cache.set(cacheKey, JSON.stringify(result), { ttl: CACHE_TTL.STATS });
    res.setHeader('X-Cache', 'MISS');
    res.json({ success: true, data: result });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('Failed to fetch analytics overview', {
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({ success: false, error: 'Failed to fetch analytics overview' });
  }
});

// ============================================
// GET /engagement — Engagement breakdown
// ============================================

/**
 * Get engagement metrics
 * GET /api/v1/analytics/engagement
 * Query params: period
 */
router.get('/engagement', appGuard, async (req: Request, res: Response) => {
  try {
    const uid = req.user!.uid;
    const db = req.firebase.db;
    const period = parsePeriod(req.query['period']);

    const cacheKey = `analytics:engagement:${uid}:${period}`;
    const cache = getCacheService();
    const cached = await cache.get(cacheKey);

    if (cached) {
      res.setHeader('X-Cache', 'HIT');
      res.json({ success: true, data: JSON.parse(cached as string) });
      return;
    }

    const report = await buildAthleteReport(db, uid, period);
    const result = {
      viewsBySource: report.engagement.viewsBySource,
      viewsByTime: report.engagement.viewsByTime,
      geoDistribution: report.engagement.geoDistribution,
      viewerTypes: report.engagement.viewerTypes,
    };

    await cache.set(cacheKey, JSON.stringify(result), { ttl: CACHE_TTL.PROFILES });
    res.setHeader('X-Cache', 'MISS');
    res.json({ success: true, data: result });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('Failed to fetch engagement analytics', {
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({ success: false, error: 'Failed to fetch engagement analytics' });
  }
});

// ============================================
// GET /content — Content performance
// ============================================

/**
 * Get content analytics
 * GET /api/v1/analytics/content
 * Query params: period
 */
router.get('/content', appGuard, async (req: Request, res: Response) => {
  try {
    const uid = req.user!.uid;
    const db = req.firebase.db;
    const period = parsePeriod(req.query['period']);

    const cacheKey = `analytics:content:${uid}:${period}`;
    const cache = getCacheService();
    const cached = await cache.get(cacheKey);

    if (cached) {
      res.setHeader('X-Cache', 'HIT');
      res.json({ success: true, data: JSON.parse(cached as string) });
      return;
    }

    const report = await buildAthleteReport(db, uid, period);
    const result = {
      videos: report.content.videos,
      topContent: report.content.topContent,
      totalViews: report.content.videos.reduce(
        (acc: number, v: VideoAnalytics) => acc + v.views,
        0
      ),
      totalWatchTime: report.content.videos.reduce(
        (acc: number, v: VideoAnalytics) => acc + v.totalWatchTime,
        0
      ),
    };

    await cache.set(cacheKey, JSON.stringify(result), { ttl: CACHE_TTL.PROFILES });
    res.setHeader('X-Cache', 'MISS');
    res.json({ success: true, data: result });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('Failed to fetch content analytics', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: 'Failed to fetch content analytics' });
  }
});

// ============================================
// GET /recruiting — Recruiting analytics (athlete)
// ============================================

/**
 * Get recruiting analytics
 * GET /api/v1/analytics/recruiting
 * Query params: userId, period
 */
router.get('/recruiting', appGuard, async (req: Request, res: Response) => {
  try {
    const uid = req.user!.uid;
    const db = req.firebase.db;
    const period = parsePeriod(req.query['period']);

    const cacheKey = `analytics:recruiting:${uid}:${period}`;
    const cache = getCacheService();
    const cached = await cache.get(cacheKey);

    if (cached) {
      res.setHeader('X-Cache', 'HIT');
      res.json({ success: true, data: JSON.parse(cached as string) });
      return;
    }

    const report = await buildAthleteReport(db, uid, period);
    const result = {
      collegeInterests: report.recruiting.collegeInterests,
      milestones: report.recruiting.milestones,
      stats: {
        offers: report.recruiting.offersReceived,
        visits: report.recruiting.collegeVisits,
        camps: report.recruiting.campAttendance,
      },
    };

    await cache.set(cacheKey, JSON.stringify(result), { ttl: CACHE_TTL.PROFILES });
    res.setHeader('X-Cache', 'MISS');
    res.json({ success: true, data: result });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('Failed to fetch recruiting analytics', {
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({ success: false, error: 'Failed to fetch recruiting analytics' });
  }
});

// ============================================
// GET /roster — Roster analytics (coach)
// ============================================

/**
 * Get roster analytics
 * GET /api/v1/analytics/roster
 * Query params: teamCodeId, period, sortBy, limit
 */
router.get('/roster', appGuard, async (req: Request, res: Response) => {
  try {
    const uid = req.user!.uid;
    const db = req.firebase.db;
    const period = parsePeriod(req.query['period']);
    const sortBy = (req.query['sortBy'] as string) || 'engagement';
    const limit = Math.min(Number(req.query['limit']) || 20, 50);

    const cacheKey = `analytics:roster:${uid}:${period}:${sortBy}:${limit}`;
    const cache = getCacheService();
    const cached = await cache.get(cacheKey);

    if (cached) {
      res.setHeader('X-Cache', 'HIT');
      res.json({ success: true, data: JSON.parse(cached as string) });
      return;
    }

    const report = await buildCoachReport(db, uid, period);

    const sortedAthletes = [...report.roster];
    if (sortBy === 'engagement') {
      sortedAthletes.sort((a, b) => b.totalEngagement - a.totalEngagement);
    } else if (sortBy === 'views') {
      sortedAthletes.sort(
        (a, b) => b.profileViews + b.videoViews - (a.profileViews + a.videoViews)
      );
    } else if (sortBy === 'name') {
      sortedAthletes.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortBy === 'classOf') {
      sortedAthletes.sort((a, b) => (a.classOf ?? 9999) - (b.classOf ?? 9999));
    }

    const result = {
      athletes: sortedAthletes.slice(0, limit),
      totalAthletes: report.roster.length,
      activeAthletes: report.overview.activeAthletes,
    };

    await cache.set(cacheKey, JSON.stringify(result), { ttl: CACHE_TTL.PROFILES });
    res.setHeader('X-Cache', 'MISS');
    res.json({ success: true, data: result });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('Failed to fetch roster analytics', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: 'Failed to fetch roster analytics' });
  }
});

// ============================================
// GET /insights — AI insights and recommendations
// ============================================

/**
 * Get insights
 * GET /api/v1/analytics/insights
 * Query params: role, period
 */
router.get('/insights', appGuard, async (req: Request, res: Response) => {
  try {
    const uid = req.user!.uid;
    const db = req.firebase.db;
    const period = parsePeriod(req.query['period']);
    const role = parseRole(req.query['role']);

    const cacheKey = `analytics:insights:${uid}:${role}:${period}`;
    const cache = getCacheService();
    const cached = await cache.get(cacheKey);

    if (cached) {
      res.setHeader('X-Cache', 'HIT');
      res.json({ success: true, data: JSON.parse(cached as string) });
      return;
    }

    const report =
      role === 'coach'
        ? await buildCoachReport(db, uid, period)
        : await buildAthleteReport(db, uid, period);

    const result = { insights: report.insights, recommendations: report.recommendations };

    await cache.set(cacheKey, JSON.stringify(result), { ttl: CACHE_TTL.RANKINGS });
    res.setHeader('X-Cache', 'MISS');
    res.json({ success: true, data: result });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('Failed to fetch insights', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: 'Failed to fetch insights' });
  }
});

// ============================================
// POST /export — Export analytics
// ============================================

/**
 * Export analytics report as PDF or CSV.
 * POST /api/v1/analytics/export
 *
 * Body: { format: 'pdf' | 'csv', period?: AnalyticsPeriod }
 *
 * Returns the generated document as a downloadable response with correct
 * Content-Type and Content-Disposition headers so browsers trigger a file save.
 */
router.post('/export', appGuard, async (req: Request, res: Response) => {
  try {
    const uid = req.user!.uid;
    const { format, period: rawPeriod } = req.body as { format?: string; period?: string };

    if (!format || (format !== 'pdf' && format !== 'csv')) {
      res.status(400).json({ success: false, error: 'format must be "pdf" or "csv"' });
      return;
    }

    const period = parsePeriod(rawPeriod);
    const db = req.firebase.db;

    // Fetch the user's analytics report (reuses existing service)
    const report = await buildAthleteReport(db, uid, period);

    // Build column/row data from the analytics report
    const columns: ExportColumn[] = [
      { key: 'metric', label: 'Metric' },
      { key: 'value', label: 'Value' },
    ];

    const rows: (string | number)[][] = [
      ['Total Profile Views', report.overview['profileViews']?.value ?? 0],
      ['Video Views', report.overview['videoViews']?.value ?? 0],
      ['College Coach Views', report.overview['collegeCoachViews']?.value ?? 0],
      ['Followers', report.overview['followers']?.value ?? 0],
      ['Period', period],
    ];

    // Append per-time-period views if available
    if (report.engagement.viewsByTime?.length) {
      for (const entry of report.engagement.viewsByTime) {
        rows.push([`Views — ${entry.label}`, entry.count]);
      }
    }

    const fileName = `NXT1-Analytics-${period}-${new Date().toISOString().slice(0, 10)}`;

    if (format === 'csv') {
      const buffer = exportService.generateCsv({ columns, rows });
      res
        .setHeader('Content-Type', 'text/csv; charset=utf-8')
        .setHeader('Content-Disposition', `attachment; filename="${fileName}.csv"`)
        .send(buffer);
    } else {
      const buffer = await exportService.generatePdf({
        title: 'NXT1 Analytics Report',
        description: `Performance summary for the last ${period}.`,
        includeTable: true,
        columns,
        rows,
      });
      res
        .setHeader('Content-Type', 'application/pdf')
        .setHeader('Content-Disposition', `attachment; filename="${fileName}.pdf"`)
        .send(buffer);
    }
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('Failed to export analytics', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: 'Failed to export analytics report' });
  }
});

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
  try {
    trackCommunicationOrEngagementEvent(req, 'email_opened');
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.warn('Failed to record email open analytics', { error: error.message });
  }

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

  try {
    trackCommunicationOrEngagementEvent(req, 'link_clicked', destination);
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.warn('Failed to record link click analytics', {
      error: error.message,
      destination: destination.toString(),
    });
  }

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

    await recordProfileView(db, viewedUserId, viewerUserId);
    res.json({ success: true, tracked: true });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('Failed to track profile view', { error: error.message, stack: error.stack });
    // Non-critical — always return success
    res.json({ success: true, tracked: false });
  }
});

// ============================================
// GET /:userId — Profile analytics for a specific user
// ============================================

/**
 * Get profile analytics for user
 * GET /api/v1/analytics/:userId
 */
router.get('/:userId', appGuard, async (req: Request, res: Response) => {
  try {
    const uid = req.user!.uid;
    const targetUserId = req.params['userId'] as string;
    const db = req.firebase.db;
    const period = parsePeriod(req.query['period']);

    // Users can only view their own analytics
    if (uid !== targetUserId) {
      res.status(403).json({ success: false, error: 'Access denied' });
      return;
    }

    const report = await buildAthleteReport(db, uid, period);
    res.json({ success: true, data: report });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('Failed to fetch user analytics', {
      error: error.message,
      stack: error.stack,
      userId: req.params['userId'],
    });
    res.status(500).json({ success: false, error: 'Failed to fetch user analytics' });
  }
});

export default router;
