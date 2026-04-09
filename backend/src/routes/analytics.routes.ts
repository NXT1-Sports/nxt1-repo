/**
 * @fileoverview Analytics Dashboard Routes
 * @module @nxt1/backend/routes/analytics
 *
 * Document-based analytics dashboard feature routes.
 * Matches ANALYTICS_API_ENDPOINTS from @nxt1/core/analytics-dashboard/constants.
 */

import { Router, type Router as ExpressRouter, Request, Response } from 'express';
import { appGuard, optionalAuth } from '../middleware/auth.middleware.js';
import { logger } from '../utils/logger.js';
import { getCacheService, CACHE_TTL } from '../services/cache.service.js';
import { ExportService, type ExportColumn } from '../modules/agent/services/export.service.js';
import {
  buildAthleteReport,
  buildCoachReport,
  buildOverviewMetrics,
  recordProfileView,
} from '../services/analytics.service.js';
import type { AnalyticsPeriod, VideoAnalytics } from '@nxt1/core';

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
      ['Total Profile Views', report.overview.profileViews.value ?? 0],
      ['Video Views', report.overview.videoViews.value ?? 0],
      ['College Coach Views', report.overview.collegeCoachViews.value ?? 0],
      ['Followers', report.overview.followers.value ?? 0],
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
